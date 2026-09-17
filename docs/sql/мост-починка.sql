-- Починка событийного моста: неоднозначные имена.
--
-- В первой версии выходные колонки функций назывались так же, как столбцы
-- таблиц: event_id, package_id. Внутри `insert ... on conflict (event_id)`
-- Postgres не может решить, что имеется в виду — столбец или выходная
-- переменная, — и отказывается выполнять функцию целиком:
--   column reference "event_id" is ambiguous
--
-- Вылезло на первом же живом вызове, а не на глаз: проверить мост до того,
-- как открылась схема, было нельзя.
--
-- Лечится переименованием выходных колонок. Имена с приставкой некрасивы, но
-- однозначны, а однозначность здесь дороже: эта функция держит гейт этапа.
--
-- Имена выходных колонок — часть сигнатуры, поэтому сначала drop, потом create.

begin;

drop function if exists content.record_verified(bigint, int, text, bigint, text, jsonb, text, text, text);
drop function if exists content.consume_verified(text, int);
drop function if exists content.reconcile_verified();

create function content.record_verified(
  p_article_id        bigint,
  p_version           int,
  p_content_hash      text,
  p_evidence_bundle_id bigint,
  p_verdict           text,
  p_findings          jsonb    default '[]'::jsonb,
  p_provider          text     default 'code',
  p_model             text     default 'code/v1',
  p_prompt_version    text     default null
) returns table (out_event_id uuid, out_emitted boolean)
language plpgsql as $$
declare
  v_event_id uuid;
  v_inserted int;
begin
  if p_content_hash is null or p_content_hash = '' then
    raise exception 'без хеша содержимого событие не имеет смысла: повтор нельзя отличить от новой версии';
  end if;

  v_event_id := md5('seo.article.verified|' || p_article_id || '|' || p_version || '|' || p_content_hash)::uuid;

  insert into content.reviews (
    target_type, target_id, target_version, target_hash,
    provider, model, prompt_version, verdict, findings_json
  ) values (
    'package_version', p_article_id, p_version, p_content_hash,
    p_provider, p_model, p_prompt_version, p_verdict, p_findings
  );

  if p_verdict not in ('supported', 'passed') then
    return query select v_event_id, false;
    return;
  end if;

  insert into content.outbox_events (event_id, topic, payload)
  values (v_event_id, 'seo.article.verified', jsonb_build_object(
    'article_id', p_article_id,
    'article_version', p_version,
    'content_hash', p_content_hash,
    'evidence_bundle_id', p_evidence_bundle_id
  ))
  on conflict (event_id) do nothing;

  get diagnostics v_inserted = row_count;
  return query select v_event_id, v_inserted > 0;
end $$;

comment on function content.record_verified is
  'Результат проверки и событие о нём — одной транзакцией. Идентификатор события '
  'считается из (статья, версия, хеш), поэтому повтор не создаёт второе событие.';

create function content.consume_verified(
  p_consumer text default 'package_builder',
  p_limit    int  default 20
) returns table (out_event_id uuid, out_package_id bigint, out_created boolean)
language plpgsql as $$
declare
  ev record;
  v_package_id bigint;
  v_version int;
  v_created boolean;
begin
  for ev in
    select e.event_id as eid, e.payload as payload
      from content.outbox_events e
     where e.topic = 'seo.article.verified'
       and not exists (
         select 1 from content.event_receipts r
          where r.consumer = p_consumer and r.event_id = e.event_id)
     order by e.created_at
     limit p_limit
     for update of e skip locked
  loop
    v_created := false;

    -- Блокировка пакета до вычисления номера версии. Без неё два обработчика
    -- считают max+1 одновременно, получают одинаковый номер, и один тихо
    -- теряет свою версию на уникальном индексе.
    select p.id into v_package_id
      from content.packages p
     where p.seo_article_id = (ev.payload->>'article_id')::bigint
     limit 1
     for update;

    if v_package_id is null then
      insert into content.packages (seo_article_id, status)
      values ((ev.payload->>'article_id')::bigint, 'verified')
      returning id into v_package_id;
      v_created := true;
    end if;

    select coalesce(max(pv.version), 0) + 1 into v_version
      from content.package_versions pv where pv.package_id = v_package_id;

    insert into content.package_versions (
      package_id, version, source_article_version, source_hash, evidence_bundle_id, content_hash
    ) values (
      v_package_id, v_version,
      (ev.payload->>'article_version')::int,
      ev.payload->>'content_hash',
      nullif(ev.payload->>'evidence_bundle_id', '')::bigint,
      ev.payload->>'content_hash'
    )
    on conflict do nothing;

    update content.packages
       set current_version_id = (
             select pv.id from content.package_versions pv
              where pv.package_id = v_package_id
              order by pv.version desc limit 1),
           status = 'verified',
           updated_at = now()
     where id = v_package_id;

    insert into content.event_receipts (consumer, event_id)
    values (p_consumer, ev.eid)
    on conflict do nothing;

    update content.outbox_events o set processed_at = now() where o.event_id = ev.eid;

    out_event_id := ev.eid;
    out_package_id := v_package_id;
    out_created := v_created;
    return next;
  end loop;
end $$;

comment on function content.consume_verified is
  'Создаёт пакет из события. Пакет, его версия и расписка об обработке пишутся '
  'одной транзакцией — иначе повторный проход сделает второй пакет.';

create function content.reconcile_verified()
returns table (out_article_id bigint, out_article_version int, out_restored boolean)
language plpgsql as $$
declare
  r record;
  v_event_id uuid;
  v_inserted int;
begin
  for r in
    select distinct rv.target_id as art, rv.target_version as ver, rv.target_hash as hash
      from content.reviews rv
     where rv.target_type = 'package_version'
       and rv.verdict in ('supported', 'passed')
       and rv.target_hash is not null
       and not exists (
         select 1 from content.outbox_events e
          where e.event_id = md5('seo.article.verified|' || rv.target_id || '|' || rv.target_version || '|' || rv.target_hash)::uuid)
  loop
    v_event_id := md5('seo.article.verified|' || r.art || '|' || r.ver || '|' || r.hash)::uuid;
    insert into content.outbox_events (event_id, topic, payload)
    values (v_event_id, 'seo.article.verified', jsonb_build_object(
      'article_id', r.art, 'article_version', r.ver, 'content_hash', r.hash, 'restored_by', 'reconciler'
    ))
    on conflict (event_id) do nothing;
    get diagnostics v_inserted = row_count;

    out_article_id := r.art; out_article_version := r.ver; out_restored := v_inserted > 0;
    return next;
  end loop;
end $$;

comment on function content.reconcile_verified is
  'Ищет проверенные версии без события и восстанавливает событие. Идемпотентен: '
  'идентификатор считается из содержимого, поэтому повторный запуск ничего не удваивает.';

grant execute on all functions in schema content to service_role;

commit;

-- Проверить:
--   select * from content.record_verified(-1, 1, 'проверка-моста', null, 'passed');
--   select * from content.record_verified(-1, 1, 'проверка-моста', null, 'passed');
--   ожидается: первый вызов out_emitted = true, второй false
--   прибрать:
--   delete from content.outbox_events where payload->>'content_hash' = 'проверка-моста';
--   delete from content.reviews where target_hash = 'проверка-моста';
