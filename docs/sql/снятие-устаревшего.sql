-- Правка статьи отменяет запланированное и поднимает вопрос по вышедшему (E4.5).
--
-- Что происходит сегодня без этого. Статью поправили, появилась новая версия
-- пакета — а в календаре стоят посты, собранные по старой. Они выйдут и скажут
-- то, что мы уже признали неверным. Это худший вид ошибки: не «мы не знали»,
-- а «мы знали и всё равно опубликовали».
--
-- Три разных случая, и путать их нельзя.
--
--   Запланировано — снимаем. Пост ещё не ушёл, снять его ничего не стоит.
--   Отправляется прямо сейчас — НЕ трогаем. Он может быть уже у площадки, и
--     пометить его снятым значит записать в базу неправду. Разберётся тот, кто
--     доведёт отправку до конца.
--   Уже вышло — снять нельзя, и делать вид, что сняли, нельзя тоже. Заводим
--     вопрос в очередь внимания: вот публикация, вот версия, на которой она
--     стоит, вот текущая. Что с этим делать — решает человек, и код не
--     притворяется, что может решить за него.

begin;

create or replace function content.supersede_older(
  p_package_id     bigint,
  p_new_version_id bigint
) returns table (out_superseded int, out_attention int)
language plpgsql as $$
declare
  v_superseded int := 0;
  v_attention  int := 0;
  v_new_version int;
begin
  select version into v_new_version from content.package_versions where id = p_new_version_id;

  -- Запланированное по старым версиям — снять.
  with старые as (
    select p.id
      from content.publications p
      join content.variant_versions vv on vv.id = p.variant_version_id
      join content.variants v on v.id = vv.variant_id
      join content.package_versions pv on pv.id = vv.package_version_id
     where v.package_id = p_package_id
       and pv.id is distinct from p_new_version_id
       and p.status = 'scheduled'
  )
  update content.publications p
     set status = 'superseded'
    from старые s
   where p.id = s.id;
  get diagnostics v_superseded = row_count;

  -- Уже вышедшее — вопрос человеку, а не тихая правка статуса.
  insert into content.attention_items (
    reason_code, severity, entity_type, entity_id, entity_version, suggested_action
  )
  select
    'published_on_superseded_version', 'high', 'publication', p.id, pv.version,
    format('Пост вышел по версии %s, сейчас актуальна %s. Решить: снять, поправить или оставить.',
           pv.version, v_new_version)
    from content.publications p
    join content.variant_versions vv on vv.id = p.variant_version_id
    join content.variants v on v.id = vv.variant_id
    join content.package_versions pv on pv.id = vv.package_version_id
   where v.package_id = p_package_id
     and pv.id is distinct from p_new_version_id
     and p.status = 'published'
     -- Повторный разбор события не заводит второй такой же вопрос.
     and not exists (
       select 1 from content.attention_items a
        where a.reason_code = 'published_on_superseded_version'
          and a.entity_type = 'publication'
          and a.entity_id = p.id
          and a.entity_version = pv.version
          and a.resolved_at is null);
  get diagnostics v_attention = row_count;

  return query select v_superseded, v_attention;
end $$;

comment on function content.supersede_older is
  'Снимает запланированное по устаревшим версиям пакета и заводит вопрос по уже '
  'вышедшему. Публикации в состоянии publishing не трогает: они могут быть уже '
  'у площадки, и пометить их снятыми значит записать неправду.';

-- Обработчик событий теперь вызывает это в той же транзакции, что и создание
-- версии: иначе между новой версией и снятием старых постов есть окно, в
-- которое старый пост успевает выйти.

-- Состав выходных колонок — часть сигнатуры, и `create or replace` его не
-- меняет: Postgres отвечает «cannot change return type of existing function».
-- Поэтому сначала drop. На данные это не влияет — функция их не хранит.
drop function if exists content.consume_verified(text, int);

create function content.consume_verified(
  p_consumer text default 'package_builder',
  p_limit    int  default 20
) returns table (out_event_id uuid, out_package_id bigint, out_created boolean,
                 out_superseded int, out_attention int)
language plpgsql as $$
declare
  ev record;
  v_package_id bigint;
  v_version int;
  v_version_id bigint;
  v_created boolean;
  v_sup int;
  v_att int;
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
    on conflict do nothing
    returning id into v_version_id;

    if v_version_id is null then
      select pv.id into v_version_id from content.package_versions pv
       where pv.package_id = v_package_id
         and pv.source_article_version = (ev.payload->>'article_version')::int
       limit 1;
    end if;

    update content.packages
       set current_version_id = (
             select pv.id from content.package_versions pv
              where pv.package_id = v_package_id
              order by pv.version desc limit 1),
           status = 'verified',
           updated_at = now()
     where id = v_package_id;

    -- В той же транзакции: новая версия и снятие старого — одно событие,
    -- а не два, между которыми старый пост успевает выйти.
    select s.out_superseded, s.out_attention into v_sup, v_att
      from content.supersede_older(v_package_id, v_version_id) s;

    insert into content.event_receipts (consumer, event_id)
    values (p_consumer, ev.eid)
    on conflict do nothing;

    update content.outbox_events o set processed_at = now() where o.event_id = ev.eid;

    out_event_id := ev.eid;
    out_package_id := v_package_id;
    out_created := v_created;
    out_superseded := coalesce(v_sup, 0);
    out_attention := coalesce(v_att, 0);
    return next;
  end loop;
end $$;

comment on function content.consume_verified is
  'Создаёт пакет из события и в той же транзакции снимает запланированное по '
  'устаревшим версиям. Повтор события ничего не удваивает.';

grant execute on all functions in schema content to service_role;

commit;

-- Проверить:
--   select reason_code, count(*) from content.attention_items group by 1;
--   ожидается: пусто — публикаций ещё нет
