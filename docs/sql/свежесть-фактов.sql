-- Свежесть фактов: расписание наблюдений и последствия изменения (E6.1, E6.2, E6.6).
--
-- Сегодня источник смотрят тогда, когда о нём вспомнят. Для страницы с
-- описанием вуза это нормально, для визовых правил и сроков подачи — нет:
-- между «правила изменились» и «мы заметили» лежит ровно столько статей,
-- сколько успеет выйти.
--
-- Отсюда две вещи. Первая — критичность источника задаётся явно, а не
-- угадывается по типу: страница визового центра и страница о студенческой
-- жизни того же вуза требуют разной частоты, хотя домен у них один. Вторая —
-- у наблюдения есть история, и по ней отличается «источник исчез» от
-- «сегодня не достучались»: одиночный 404 это не удаление, сайты переезжают.
--
-- И главное, ради чего этап существует: когда факт всё-таки изменился, надо
-- знать, что на нём стоит. Не «где-то в статьях», а поимённо: эти версии
-- пакетов, эти варианты, эти публикации. Без этого изменение факта в
-- источнике доходит до опубликованного материала случайно или никогда.

begin;

-- ── Критичность и расписание ────────────────────────────────────────────────

alter table seo.sources
  add column if not exists critical          boolean not null default false,
  add column if not exists recheck_hours     int,
  add column if not exists last_observed_at  timestamptz,
  add column if not exists last_outcome      text,
  add column if not exists consecutive_gaps  int not null default 0,
  add column if not exists etag              text,
  add column if not exists last_modified     text;

comment on column seo.sources.critical is
  'Ошибка в этом источнике стоит читателю отказа в визе, потерянного набора или '
  'денег: визовые правила, сроки подачи, стоимость конкретных программ. Ставится '
  'человеком, а не выводится из домена: у одного вуза есть и такие страницы, и '
  'страницы о студенческой жизни.';

comment on column seo.sources.recheck_hours is
  'Через сколько часов смотреть заново. Пусто — берётся по критичности: 6 для '
  'критичных, 168 для остальных. PRD допускает 6–24 в сезон; сезонность задаётся '
  'этим полем вручную, а не календарём в коде — сезоны у стран разные.';

comment on column seo.sources.consecutive_gaps is
  'Сколько наблюдений подряд не дали ответа. Один 404 — наблюдение, три подряд — '
  'вывод. Обнуляется любым успешным наблюдением.';

comment on column seo.sources.last_outcome is
  'впервые | изменилось | не_изменилось | не_найдено | запрещено_сервером | '
  'запрещено_robots | таймаут | недоступно. Последние пять — пробел наблюдения, '
  'а НЕ «изменений нет».';

comment on column seo.sources.etag is
  'Со значениями etag и last_modified следующий запрос идёт условным, и источник '
  'отвечает 304 вместо тела. Экономит не столько наш трафик, сколько чужой.';

create index if not exists sources_due
  on seo.sources (last_observed_at nulls first)
  where active = true and source_type = 'web';

create index if not exists sources_critical
  on seo.sources (critical) where critical = true;

/** Какие источники пора посмотреть. Критичные — первыми. */
create or replace function seo.sources_due(p_now timestamptz default now(), p_limit int default 50)
returns table (out_id bigint, out_url text, out_critical boolean, out_overdue_hours numeric)
language sql stable as $$
  select s.id, s.url, s.critical,
         round(extract(epoch from (p_now - coalesce(s.last_observed_at, 'epoch'::timestamptz))) / 3600.0, 1)
    from seo.sources s
   where s.active = true
     and s.source_type = 'web'
     and s.url is not null
     and (s.last_observed_at is null
          or s.last_observed_at < p_now - make_interval(hours => coalesce(s.recheck_hours, case when s.critical then 6 else 168 end)))
   order by s.critical desc, s.last_observed_at nulls first
   limit p_limit
$$;

comment on function seo.sources_due is
  'Источники, у которых вышел срок наблюдения. Критичные впереди: если в очереди '
  'стоят страница визовых правил и страница о столовой, смотреть надо первую.';

-- ── Что стоит на утверждении ────────────────────────────────────────────────

create or replace function content.affected_by_claim(p_claim_id bigint)
returns table (
  out_package_id        bigint,
  out_variant_version_id bigint,
  out_publication_id    bigint,
  out_publication_status text,
  out_channel_id        bigint,
  out_remote_url        text
)
language sql stable as $$
  select
    v.package_id,
    vv.id,
    p.id,
    p.status,
    p.channel_id,
    p.remote_url
  from content.variant_versions vv
  join content.variants v on v.id = vv.variant_id
  left join content.publications p on p.variant_version_id = vv.id
  where vv.claim_refs @> jsonb_build_array(jsonb_build_object('claim_id', p_claim_id))
     or exists (
       select 1 from jsonb_array_elements(coalesce(vv.claim_refs, '[]'::jsonb)) e
        where (e->>'claim_id')::bigint = p_claim_id)
$$;

comment on function content.affected_by_claim is
  'Что стоит на этом утверждении поимённо: версии вариантов, публикации, каналы. '
  'Без поимённого списка изменение факта доходит до опубликованного материала '
  'случайно или никогда.';

-- ── Факт изменился ──────────────────────────────────────────────────────────

alter table content.publications drop constraint if exists publications_status_check;
alter table content.publications add constraint publications_status_check
  check (status in ('scheduled', 'publishing', 'published', 'failed', 'superseded', 'cancelled', 'unknown', 'blocked'));

comment on column content.publications.status is
  'scheduled | publishing | published | failed | superseded | cancelled | unknown | blocked. '
  'blocked — под публикацией изменился факт: выпускать нельзя, пока текст не поправят. '
  'Это не cancelled: отменяет человек, а блокирует проверка.';

create or replace function content.claim_changed(
  p_claim_id bigint,
  p_reason   text
) returns table (out_blocked int, out_attention int)
language plpgsql as $$
declare
  v_blocked int := 0;
  v_attn    int := 0;
begin
  -- Запланированное блокируется: пост ещё не ушёл, и выпускать его с фактом,
  -- который мы только что признали изменившимся, нельзя.
  --
  -- Отправляющееся НЕ трогаем: оно может быть уже у площадки, и пометить его
  -- заблокированным значит записать неправду.
  update content.publications p
     set status = 'blocked'
   where p.status = 'scheduled'
     and exists (
       select 1 from content.affected_by_claim(p_claim_id) a
        where a.out_publication_id = p.id);
  get diagnostics v_blocked = row_count;

  -- Опубликованное снять нельзя. Заводим задачу правки — именно задачу, а не
  -- уведомление: у неё есть адрес поста, и по ней видно, что править.
  insert into content.attention_items (
    reason_code, severity, entity_type, entity_id, suggested_action
  )
  select distinct
    'claim_changed_after_publish', 'high', 'publication', a.out_publication_id,
    format('Под вышедшим постом изменился факт #%s (%s). Пост: %s. Решить: поправить текст, снять или оставить с оговоркой.',
           p_claim_id, p_reason, coalesce(a.out_remote_url, 'ссылки нет'))
    from content.affected_by_claim(p_claim_id) a
   where a.out_publication_status = 'published'
     and a.out_publication_id is not null
     and not exists (
       select 1 from content.attention_items x
        where x.reason_code = 'claim_changed_after_publish'
          and x.entity_type = 'publication' and x.entity_id = a.out_publication_id
          and x.resolved_at is null);
  get diagnostics v_attn = row_count;

  -- Отдельно: варианты без публикаций тоже затронуты — их просто ещё не
  -- планировали. Отмечать их нечем, но и молчать нельзя.
  insert into content.attention_items (reason_code, severity, entity_type, entity_id, suggested_action)
  select distinct
    'claim_changed_in_draft', 'medium', 'variant_version', a.out_variant_version_id,
    format('Изменился факт #%s (%s) в неопубликованном варианте. Поправить до планирования.', p_claim_id, p_reason)
    from content.affected_by_claim(p_claim_id) a
   where a.out_publication_id is null
     and not exists (
       select 1 from content.attention_items x
        where x.reason_code = 'claim_changed_in_draft'
          and x.entity_type = 'variant_version' and x.entity_id = a.out_variant_version_id
          and x.resolved_at is null);

  return query select v_blocked, v_attn;
end $$;

comment on function content.claim_changed is
  'Факт изменился: запланированное блокируется, по вышедшему заводится задача правки, '
  'черновики помечаются. Отправляющееся не трогается — оно может быть уже у площадки.';

-- ── История наблюдений ──────────────────────────────────────────────────────

-- Строка снимка пишется и при неудаче — это уже так. Не хватало имени исхода:
-- по http_status и fetch_error «нас не пустили» и «страницы нет» ещё различимы,
-- а «не изменилось по ответу 304» и «запрещено robots.txt» — нет. Без имени
-- история наблюдений не даёт отличить пробел от подтверждения, а именно на этом
-- различии держится весь этап.
alter table seo.source_snapshots
  add column if not exists outcome text;

comment on column seo.source_snapshots.outcome is
  'впервые | изменилось | не_изменилось | не_найдено | запрещено_сервером | '
  'запрещено_robots | таймаут | недоступно. Пусто у строк, снятых до этой миграции: '
  'у них исход выводится из http_status и fetch_error, и 304 там неотличим.';

-- ── Что стоит на источнике ──────────────────────────────────────────────────

/** Утверждения, подтверждённые этим источником. Цитата — из последнего снимка. */
create or replace function seo.claims_on_source(p_source_id bigint)
returns table (
  out_claim_id  bigint,
  out_kind      text,
  out_statement text,
  out_status    text,
  out_quote     text
)
language sql stable as $$
  select distinct on (c.id) c.id, c.kind, c.statement, c.status, cs.quote
    from seo.claim_sources cs
    join seo.source_snapshots sn on sn.id = cs.snapshot_id
    join seo.claims c on c.id = cs.claim_id
   where sn.source_id = p_source_id
     and cs.agreement = 'supports'
   order by c.id, sn.fetched_at desc
$$;

comment on function seo.claims_on_source is
  'Какие факты держатся на этом источнике. Нужна ровно в тот момент, когда '
  'страница изменилась: без неё изменение видно, а последствия — нет.';

grant execute on all functions in schema content to service_role;

-- Воркер ходит под своей ролью (E4.2): без явного grant функции для него нет,
-- и свежесть встанет молча — задача упадёт на «function does not exist».
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'content_worker') then
    grant execute on function seo.sources_due(timestamptz, int)      to content_worker;
    grant execute on function seo.claims_on_source(bigint)           to content_worker;
    grant execute on function content.affected_by_claim(bigint)      to content_worker;
    grant execute on function content.claim_changed(bigint, text)    to content_worker;
  end if;
end $$;

commit;

-- Проверить:
--   select * from seo.sources_due();
--   ожидается: один источник chula.ac.th — его не наблюдали ни разу
--   select * from seo.claims_on_source(1);
--   ожидается: семь цен Чулалонгкорна с цитатами
