-- ═══════════════════════════════════════════════════════════════════════════
-- СХЕМА seo ДЛЯ DEV-ПРОЕКТА
--
-- Куда:  Supabase → проект ekdnujgjoepjxhrdetjt (НЕ боевой!) → SQL Editor
--        Вставить всё, нажать Run.
--
-- Проверь дважды, что открыт именно dev-проект. В боевом эти миграции уже
-- применены, и повторный прогон там частью пройдёт вхолостую, а частью
-- упрётся в уже существующие объекты.
--
-- ⚠️ ВАЖНО ПРО РАСПИСАНИЕ
-- Файл создаёт функции планировщика, но НЕ включает их. Не вызывай
-- seo.schedule_all() на dev: dev-проект начнёт раз в минуту долбиться в
-- боевой /api/seo/tick, и в живой очереди появится второй исполнитель,
-- которого никто не ждал.
--
-- ПОСЛЕ ПРОГОНА: Settings → API → Exposed schemas → добавить `seo`.
-- Без этого схема будет невидима снаружи, и ошибка «Invalid schema: seo»
-- останется прежней.
-- ═══════════════════════════════════════════════════════════════════════════


-- ───────────────────────────────────────────────────────────────
-- 20260908000001_seo_schema.sql
-- ───────────────────────────────────────────────────────────────

-- ═══════════════════════════════════════════════════════════════════════════
-- SEO / Organic Content Engine — схема `seo` (PRD v1.2, раздел 7)
-- Изолировано от CRM: ничего в public не меняется. Модуль вырезается целиком.
-- Порядок таблиц — как в разделе 7; циклические FK добавляются ALTER в конце (7.12).
-- Размерность vector(1024) — под Voyage. При смене провайдера поменять ДО применения.
-- ═══════════════════════════════════════════════════════════════════════════

create extension if not exists vector;

create schema if not exists seo;

-- ── 7.1 Инвентарь сайта ─────────────────────────────────────────────────────

create table seo.settings (
  key   text primary key,
  value jsonb not null
);
-- autopilot_enabled, autopilot_daily_limit, autopilot_budget_limit,
-- similarity_threshold, max_topic_depth, auto_topic_daily_limit,
-- worker_concurrency_by_lane, embedding_model, tracker_consent_required

-- Откуда мы знаем, что URL существует (known-site universe, G1)
create table seo.url_universe (
  normalized_url text primary key,
  origins        text[] not null,   -- sitemap | wp_rest | gsc | crawl | manual
  first_seen_at  timestamptz default now(),
  page_id        bigint             -- FK добавляется в 7.12
);

create table seo.pages (
  id              bigserial primary key,
  normalized_url  text unique not null,   -- по правилам 7.1.1
  url             text not null,          -- как отдаёт сайт (после редиректов)
  platform        text not null,          -- wordpress | tilda | next | other
  wp_post_id      int unique,
  editable        boolean not null default false,   -- true только для WP
  http_status     int,
  indexable       boolean,                -- robots + noindex + canonical
  canonical_url   text,
  title           text,
  h1              text,
  meta_desc       text,
  word_count      int,
  content_hash    text,
  page_type       text,                   -- article | commercial | landing | service | other
  cluster         text,
  embedding       vector(1024),
  embedding_model text,
  first_seen_at   timestamptz default now(),
  last_crawled_at timestamptz,
  removed_at      timestamptz
);
-- HNSW, не IVFFlat: на сотнях строк IVFFlat даёт плохой recall
create index pages_embedding_hnsw on seo.pages using hnsw (embedding vector_cosine_ops);

-- Редактируемый контент (подмножество pages, только WP)
create table seo.topics (
  id              bigserial primary key,
  title           text not null,
  primary_keyword text,
  cluster         text,
  intent          text,            -- informational | commercial | navigational
  search_volume   int,
  difficulty      int,
  business_value  numeric,
  priority        numeric,
  status          text not null default 'new',
        -- new | rejected_duplicate | approved | queued | in_production | produced | rejected
  duplicate_of    bigint references seo.pages(id),
  origin          text not null,   -- gsc_gap | manual | provider | missing_link_target | finding
  requested_by    bigint,          -- FK на articles — 7.12
  depth           int not null default 0,
  embedding       vector(1024),
  created_at      timestamptz default now()
);

create table seo.articles (
  id                 bigserial primary key,
  page_id            bigint unique references seo.pages(id),
  topic_id           bigint references seo.topics(id),
  primary_keyword    text,
  status             text not null default 'draft',
      -- draft | in_production | ready_for_review | in_review | approved
      -- | published | rejected
  needs_update       boolean not null default false,   -- флаг, не статус
  current_version_id bigint,      -- FK — 7.12
  author_id          uuid,        -- эксперт-ревьюер
  published_at       timestamptz,
  indexed_at         timestamptz,
  created_at         timestamptz default now()
);

-- ── 7.2 Версии и аудит ──────────────────────────────────────────────────────

create table seo.article_versions (
  id             bigserial primary key,
  article_id     bigint not null references seo.articles(id) on delete cascade,
  version_no     int not null,
  origin         text not null,   -- generated | qa_fixed | human_edited | approved | published
  title          text,
  body           text,
  meta           jsonb,           -- description, schema, og
  prompt_version text,
  model          text,
  qa_version     text,
  qa_report      jsonb,
  created_by     uuid,            -- null = система
  created_at     timestamptz default now(),
  unique (article_id, version_no)
);

-- Какие claims и какие снапшоты стоят за версией (вместо bigint[])
create table seo.article_version_claims (
  version_id     bigint references seo.article_versions(id) on delete cascade,
  claim_id       bigint not null,          -- FK — 7.12 (claims ниже)
  snapshot_id    bigint,
  usage_context  text,                     -- в каком разделе/предложении
  primary key (version_id, claim_id)
);

create table seo.change_sets (
  id              bigserial primary key,
  article_id      bigint references seo.articles(id),
  page_id         bigint references seo.pages(id),   -- для правок не-статей (meta, redirect)
  kind            text not null,
      -- new_article | optimization | fact_update | link_insert | meta_update
      -- | redirect | merge | broken_link_fix
  from_version    bigint references seo.article_versions(id),
  to_version      bigint references seo.article_versions(id),
  diff            jsonb,
  reason          text not null,           -- почему система это предлагает
  finding_id      bigint,                  -- FK — 7.12
  idempotency_key text unique,
  status          text not null default 'proposed',
      -- proposed | approved | applied | verified | rejected | rolled_back | failed
  proposed_by     text not null default 'system',   -- system | autopilot | human
  approved_by     uuid,
  applied_at      timestamptz,
  verified_at     timestamptz,             -- post_publish_verify прошёл
  rollback_of     bigint references seo.change_sets(id)
);

-- ── 7.3 Источники, снапшоты, экспертный слой ────────────────────────────────

create table seo.sources (
  id           bigserial primary key,
  source_type  text not null,      -- web | internal_expert | internal_stats
  url          text,               -- только для web; unique где не null
  locator      text,               -- для не-web: expert_note:<id>, stats:<query>
  domain       text,
  kind         text,               -- official_gov | ministry | university_program
                                   -- | university_general | media | consultant_blog
                                   -- | internal_expert | internal_stats
  lang         text,
  active       boolean not null default true,
  added_by     text not null default 'system',   -- system | human
  allowlisted  boolean not null default false,   -- домен разрешён для автодобавления
  created_at   timestamptz default now(),
  check (source_type <> 'web' or url is not null),
  check (source_type = 'web' or locator is not null)
);
create unique index sources_url_uq on seo.sources (url) where url is not null;
create unique index sources_locator_uq on seo.sources (locator) where locator is not null;

create table seo.source_snapshots (
  id                   bigserial primary key,
  source_id            bigint not null references seo.sources(id),
  fetched_at           timestamptz default now(),
  http_status          int,
  etag                 text,
  last_modified        text,
  content_hash         text,
  changed              boolean,          -- отличается ли от предыдущего
  previous_snapshot_id bigint references seo.source_snapshots(id),
  raw_text             text,             -- только если changed; иначе null, см. previous
  storage_path         text              -- полный HTML/PDF в Supabase Storage
);

-- Экспертный слой как данные (11.3)
create table seo.expert_notes (
  id           bigserial primary key,
  author_id    uuid not null,           -- консультант из users
  note_type    text not null,           -- case | practice_vs_official | comment | checklist | stat
  country      text,
  subject      text,                    -- вуз / программа / процедура
  body         text not null,
  occurred_at  date,                    -- когда был кейс
  publishable  boolean not null default false,   -- разрешение на использование в тексте
  source_id    bigint references seo.sources(id),  -- создаётся автоматически
  created_at   timestamptz default now()
);

-- ── 7.4 Claims ──────────────────────────────────────────────────────────────

-- Политика доверия и срока жизни по типу утверждения
create table seo.claim_policy (
  kind            text primary key,     -- tuition_fee | deadline | language_req | ...
  required_kinds  text[],               -- типы источников, без которых claim не confirmed
  preferred_kinds text[],               -- предпочтительные при расхождении
  default_ttl     interval not null,    -- сколько живёт claim без перепроверки
  autopilot_ok    boolean not null default false
);

create table seo.claims (
  id            bigserial primary key,
  kind          text not null references seo.claim_policy(kind),
  subject       text not null,          -- как в источнике
  subject_key   text not null,          -- нормализованный: bocconi | it:ministry | ...
  statement     text not null,          -- человекочитаемая формулировка
  value         text,                   -- как в источнике
  value_num     numeric,                -- для сравнения: сумма, дни, баллы
  unit          text,                   -- eur | days | ielts_band | date | bool
  value_date    date,                   -- для дедлайнов
  qualifiers    jsonb not null default '{}',
      -- {citizenship, degree_level, program, intake, academic_year, applicant_category}
  confidence    text not null default 'single_source',
      -- confirmed | single_source | disputed
  valid_from    date,
  valid_to      date,
  expires_at    timestamptz not null,   -- по claim_policy.default_ttl или раньше
  status        text not null default 'active',
      -- active | stale | superseded | disputed
  superseded_by bigint references seo.claims(id),
  created_at    timestamptz default now()
);
create index claims_subject_kind_status on seo.claims (subject_key, kind, status);

create table seo.claim_sources (
  claim_id     bigint references seo.claims(id) on delete cascade,
  snapshot_id  bigint references seo.source_snapshots(id),
  quote        text not null,           -- фрагмент, подтверждающий claim
  agreement    text not null,           -- supports | contradicts
  primary key (claim_id, snapshot_id)
);

-- ── 7.5 Граф ссылок ─────────────────────────────────────────────────────────

-- Что реально есть на сайте, обнаружено обходом
create table seo.link_edges (
  id             bigserial primary key,
  from_page_id   bigint not null references seo.pages(id) on delete cascade,
  to_url         text not null,          -- нормализованный
  to_page_id     bigint references seo.pages(id),   -- null = внешняя или битая
  anchor         text,
  link_type      text not null,          -- internal | external | broken | redirect
  block          text,                   -- content | nav | footer | sidebar
  position       int,
  rel            text,
  http_status    int,
  first_seen_at  timestamptz default now(),
  last_seen_at   timestamptz,
  removed_at     timestamptz
);
create index link_edges_to_page on seo.link_edges (to_page_id) where removed_at is null;

-- Что предлагает система
create table seo.link_suggestions (
  id             bigserial primary key,
  from_page_id   bigint not null references seo.pages(id),
  to_page_id     bigint references seo.pages(id),
  to_topic_id    bigint references seo.topics(id),  -- цели ещё нет
  anchor         text,
  reason         text,
  score          numeric,
  status         text not null default 'proposed',
      -- proposed | approved | applied | rejected | waiting_target | manual_required
  change_set_id  bigint references seo.change_sets(id),
  created_at     timestamptz default now()
);

-- ── 7.6 Находки и их резолюция ──────────────────────────────────────────────

create table seo.findings (
  id            bigserial primary key,
  kind          text not null,
      -- cannibalization | striking_distance | orphan | broken_link
      -- | stale_content | ctr_opportunity | content_gap | duplicate_title
  confidence    text not null,          -- high | medium | low
  page_ids      bigint[] not null,      -- участники (1–2 страницы)
  evidence      jsonb not null,         -- запросы, позиции, overlap, окно — по разделу 8
  detected_at   timestamptz default now(),
  last_seen_at  timestamptz,
  status        text not null default 'open',
      -- open | triaged | in_progress | resolved | dismissed | expired
  resolution    text,                   -- merge | redirect | differentiate | link | update | ignore
  change_set_id bigint references seo.change_sets(id),
  assigned_to   uuid,
  resolved_at   timestamptz,
  note          text
);
create index findings_kind_status on seo.findings (kind, status);

-- Before/after для правок существующих страниц (9.2)
create table seo.optimization_events (
  id                 bigserial primary key,
  change_set_id      bigint not null references seo.change_sets(id),
  page_id            bigint not null references seo.pages(id),
  hypothesis         text not null,
  baseline_window    daterange not null,   -- 28 дней до
  baseline_metrics   jsonb not null,       -- clicks, impressions, avg_position по target-запросам
  target_queries     text[],
  observation_window daterange,            -- 28 дней после, начиная с applied_at + 7
  after_metrics      jsonb,
  control_page_ids   bigint[],             -- контрольная группа на момент правки
  control_delta      jsonb,
  outcome            text                  -- improved | neutral | degraded | inconclusive
);

-- ── 7.7 Производственные запуски ────────────────────────────────────────────

create table seo.production_runs (
  id             bigserial primary key,
  started_by     uuid not null,
  kind           text not null,          -- new_articles | optimization | fact_refresh
  article_limit  int,
  budget_limit   numeric not null,       -- USD по тарифам API
  model_config   jsonb not null,         -- модель по шагам
  prompt_version text not null,
  status         text not null default 'running',
      -- running | paused | done | cancelled
  pause_reason   text,                   -- budget | manual | error_rate
  started_at     timestamptz default now(),
  finished_at    timestamptz,
  total_cost     numeric not null default 0,
  tokens_in      bigint not null default 0,
  tokens_out     bigint not null default 0
);

create table seo.production_run_items (
  id           bigserial primary key,
  run_id       bigint not null references seo.production_runs(id),
  topic_id     bigint references seo.topics(id),
  article_id   bigint references seo.articles(id),
  status       text not null default 'pending',
      -- pending | running | awaiting_human | ready_for_review | rejected_duplicate
      -- | failed | cancelled
  current_step text,
  cost         numeric not null default 0,
  error        text,
  started_at   timestamptz,
  finished_at  timestamptz
);

-- ── 7.8 Очередь задач ───────────────────────────────────────────────────────

create table seo.jobs (
  id             bigserial primary key,
  run_id         bigint references seo.production_runs(id),
  run_item_id    bigint references seo.production_run_items(id),
  article_id     bigint references seo.articles(id),
  topic_id       bigint references seo.topics(id),
  step           text not null,
  lane           text not null default 'production',
      -- production | crawl | gsc | freshness | index | attribution | autopilot
  priority       int not null default 100,    -- меньше = раньше
  payload        jsonb not null default '{}',
  group_key      text,                   -- ключ веера: <run_item_id>:extract_claims
  expected_count int,
  status         text not null default 'pending',
      -- pending | waiting | running | awaiting_human | done | failed | cancelled
  attempts       int not null default 0,
  max_attempts   int not null default 5,
  next_run_at    timestamptz not null default now(),
  locked_at      timestamptz,
  locked_by      text,
  cost           numeric not null default 0,
  result         jsonb,
  last_error     text,
  dedup_key      text unique,
  created_at     timestamptz default now()
);
create index jobs_claim on seo.jobs (lane, status, priority, next_run_at) where status = 'pending';
create index jobs_group on seo.jobs (group_key) where status in ('pending','running','waiting');

-- ── 7.9 Аналитика GSC и индексация ──────────────────────────────────────────

create table seo.gsc_daily (            -- запросный срез: неполный, см. 4.3
  normalized_url text, query text, date date,
  clicks int, impressions int, position numeric, ctr numeric,
  primary key (normalized_url, query, date)
);
create table seo.gsc_page_daily (       -- честные итоги по странице
  normalized_url text, date date,
  clicks int, impressions int, position numeric, ctr numeric,
  primary key (normalized_url, date)
);
create table seo.index_status (
  page_id        bigint primary key references seo.pages(id),
  coverage_state text,
  verdict        text,
  last_crawl     timestamptz,
  checked_at     timestamptz,
  next_check_at  timestamptz,
  attempts       int not null default 0
);

-- ── 7.10 Атрибуция ──────────────────────────────────────────────────────────

create table seo.attribution_events (
  id          bigserial primary key,
  anon_id     text,                 -- null, если consent не дан
  session_id  text not null,
  event       text not null,        -- pageview | quiz_start | quiz_complete | form_submit | lead
  platform    text not null,        -- wordpress | tilda | next
  url         text not null,        -- нормализованный, без PII-параметров
  page_id     bigint references seo.pages(id),
  referrer    text,                 -- только origin + path, query удалён
  utm         jsonb,
  created_at  timestamptz default now()
);
create index attr_anon on seo.attribution_events (anon_id, created_at) where anon_id is not null;
create index attr_session on seo.attribution_events (session_id);

-- Мост между кукой и сущностями CRM
create table seo.lead_identities (
  id               bigserial primary key,
  anon_id          text,
  session_id       text,
  lead_source      text not null,   -- book | tilda_form
  external_lead_id text unique,     -- book: bookings.id; tilda: tranid формы
  lead_at          timestamptz not null,
  first_touch_page bigint references seo.pages(id),
  last_touch_page  bigint references seo.pages(id),
  deal_id          uuid,            -- public.deals.id (UUID), проставляется ночной сшивкой
  client_id        bigint,          -- public.clients.id (integer)
  matched_by       text,            -- custom_fields.anon_id | tranid | phone_time
  matched_at       timestamptz
);
create index lead_ident_anon on seo.lead_identities (anon_id);

-- ── 7.11 Кто и сколько времени тратит ───────────────────────────────────────

create table seo.review_sessions (
  id           bigserial primary key,
  article_id   bigint not null references seo.articles(id),
  user_id      uuid not null,
  started_at   timestamptz not null,
  ended_at     timestamptz,
  active_sec   int,                    -- по heartbeat вкладки ревью, не по разнице времени
  outcome      text                    -- approved | returned | rejected | continued
);

-- ── 7.12 Циклические FK и триггер целостности версии ────────────────────────

alter table seo.url_universe add foreign key (page_id) references seo.pages(id);
alter table seo.topics add foreign key (requested_by) references seo.articles(id);
alter table seo.articles add foreign key (current_version_id) references seo.article_versions(id);
alter table seo.article_version_claims add foreign key (claim_id) references seo.claims(id);
alter table seo.article_version_claims add foreign key (snapshot_id) references seo.source_snapshots(id);
alter table seo.change_sets add foreign key (finding_id) references seo.findings(id);

-- версия должна принадлежать своей статье
create or replace function seo.check_current_version() returns trigger as $$
begin
  if new.current_version_id is not null and not exists (
    select 1 from seo.article_versions v
    where v.id = new.current_version_id and v.article_id = new.id)
  then raise exception 'current_version_id belongs to another article'; end if;
  return new;
end $$ language plpgsql;

create trigger trg_articles_current_version before insert or update on seo.articles
  for each row execute function seo.check_current_version();


-- ───────────────────────────────────────────────────────────────
-- 20260908000001_seo_technical.sql
-- ───────────────────────────────────────────────────────────────

-- Технический аудит (порт чеклистов claude-seo: seo-technical / seo-schema).
-- 1) храним факт наличия JSON-LD на странице (для находки missing_schema и генерации схемы);
-- 2) таблица для будущей генерации/хранения schema.org разметки по странице (seo-schema).
-- Применяется вручную через Supabase SQL Editor (ref pxtwaxhmygnssyyowrgr).

alter table seo.pages add column if not exists has_schema boolean;

-- обнаруженные на странице типы schema.org (@type из JSON-LD) — для аудита покрытия
alter table seo.pages add column if not exists schema_types text[];

-- сгенерированная/предложенная разметка по странице (источник recommend|bridge)
create table if not exists seo.page_schema (
  id           bigserial primary key,
  page_id      bigint not null references seo.pages(id) on delete cascade,
  schema_type  text not null,               -- Article | Course | Organization | FAQPage ...
  jsonld       jsonb not null,              -- готовый объект JSON-LD
  source       text not null default 'recommend',  -- recommend | bridge
  status       text not null default 'proposed',   -- proposed | applied | dismissed
  created_at   timestamptz default now(),
  applied_at   timestamptz
);

create index if not exists page_schema_page_idx on seo.page_schema(page_id);
create unique index if not exists page_schema_page_type_uq on seo.page_schema(page_id, schema_type);

notify pgrst, 'reload schema';


-- ───────────────────────────────────────────────────────────────
-- 20260908000002_seo_functions.sql
-- ───────────────────────────────────────────────────────────────

-- ═══════════════════════════════════════════════════════════════════════════
-- SEO functions (PRD v1.2, 7.12 / 8.6 / 10.2): normalize_url, claim_jobs,
-- complete_job (fan-in), v_page_deals.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Нормализация URL (7.1.1). Postgres-эквивалент для сверки с TS-версией. ────
-- p_strip_query = true для page_type='article' (query удаляется целиком).
create or replace function seo.normalize_url(p_url text, p_strip_query boolean default false)
returns text
language plpgsql
immutable
as $$
declare
  v text := trim(p_url);
  v_scheme text; v_rest text; v_host text; v_path text; v_query text;
  v_pairs text[]; v_keep text[] := '{}'; kv text; k text;
  v_drop text[] := array['utm_source','utm_medium','utm_campaign','utm_content','utm_term','fbclid','gclid','yclid','_ga','ref'];
begin
  if v is null or v = '' then return null; end if;
  -- схема → https
  v_scheme := lower(coalesce(substring(v from '^([a-zA-Z][a-zA-Z0-9+.-]*)://'), 'https'));
  v_rest := regexp_replace(v, '^[a-zA-Z][a-zA-Z0-9+.-]*://', '');
  -- fragment
  v_rest := regexp_replace(v_rest, '#.*$', '');
  -- host / path / query
  v_host := lower(split_part(split_part(v_rest, '/', 1), '?', 1));
  v_host := regexp_replace(v_host, '^www\.', '');
  v_host := regexp_replace(v_host, ':(80|443)$', '');          -- дефолтные порты
  v_path := '/' || coalesce(nullif(split_part(split_part(v_rest, '?', 1), '/', 2), ''), '');
  -- восстановить полный путь (все сегменты после host)
  v_path := regexp_replace(v_rest, '^[^/?]*', '');             -- всё от первого / или ?
  v_path := split_part(v_path, '?', 1);
  if v_path = '' then v_path := '/'; end if;
  -- query
  v_query := substring(v_rest from '\?(.*)$');
  if p_strip_query then
    v_query := null;
  elsif v_query is not null and v_query <> '' then
    v_pairs := regexp_split_to_array(v_query, '&');
    foreach kv in array v_pairs loop
      k := lower(split_part(kv, '=', 1));
      if k <> '' and not (k = any(v_drop)) then
        v_keep := array_append(v_keep, kv);
      end if;
    end loop;
    if array_length(v_keep,1) is null then
      v_query := null;
    else
      v_query := array_to_string((select array(select unnest(v_keep) order by 1)), '&');
    end if;
  else
    v_query := null;
  end if;
  -- trailing slash, кроме корня
  if v_path <> '/' then v_path := regexp_replace(v_path, '/+$', ''); end if;
  if v_path = '' then v_path := '/'; end if;
  return 'https://' || v_host || v_path || case when v_query is not null then '?' || v_query else '' end;
end $$;

-- ── Атомарная выдача задач (7.8, 10.3): lanes, приоритеты, SKIP LOCKED ────────
create or replace function seo.claim_jobs(p_worker text, p_limit int default 5)
returns setof seo.jobs
language plpgsql
as $$
declare
  v_conc jsonb;
  v_ids  bigint[];
begin
  -- авторазблокировка зависших running (> 10 минут) → pending, attempts+1
  update seo.jobs
     set status='pending', locked_at=null, locked_by=null, attempts=attempts+1
   where status='running' and locked_at < now() - interval '10 minutes';

  select value into v_conc from seo.settings where key='worker_concurrency_by_lane';

  -- Фаза 1: кандидаты с учётом ОСТАВШЕГОСЯ бюджета lane (running + rank <= лимит).
  -- row_number() внутри lane гарантирует, что один вызов не возьмёт больше лимита.
  with running_by_lane as (
    select lane, count(*)::int c from seo.jobs where status='running' group by lane
  ),
  eligible as (
    select j.id, j.lane, j.priority, j.next_run_at,
           row_number() over (partition by j.lane order by j.priority, j.next_run_at, j.id) rn
      from seo.jobs j
     where j.status='pending'
       and j.next_run_at <= now()
       and (j.run_id is null or exists (
             select 1 from seo.production_runs pr
              where pr.id=j.run_id and pr.status='running'))        -- пауза run фильтрует задачи
  )
  select array_agg(e.id order by e.priority, e.next_run_at, e.id)
    into v_ids
    from eligible e
    left join running_by_lane r on r.lane = e.lane
   where e.rn <= greatest(coalesce((v_conc->>e.lane)::int, 999) - coalesce(r.c,0), 0);

  if v_ids is null then return; end if;

  -- Фаза 2: заблокировать (SKIP LOCKED, прямо по seo.jobs) и выдать.
  return query
  update seo.jobs j
     set status='running', locked_at=now(), locked_by=p_worker
   where j.id in (
     select id from seo.jobs
      where id = any(v_ids)
      order by priority, next_run_at, id
      for update skip locked
      limit p_limit
   )
   returning j.*;
end $$;

-- ── Завершение задачи + fan-in (10.2) ────────────────────────────────────────
-- p_outcome: done | retry | released | failed | awaiting_human
create or replace function seo.complete_job(p_job_id bigint, p_outcome text, p_result jsonb default '{}')
returns void
language plpgsql
as $$
declare
  j          seo.jobs;
  v_cost     numeric;
  v_assembler seo.jobs;
  v_done     int;
  v_failed   int;
  v_allowed  int;
begin
  select * into j from seo.jobs where id=p_job_id for update;
  if not found then return; end if;
  v_cost := coalesce((p_result->>'cost')::numeric, 0);

  if p_outcome = 'done' then
    update seo.jobs set status='done', result=p_result, cost=cost+v_cost,
           locked_at=null, locked_by=null where id=p_job_id;
  elsif p_outcome = 'awaiting_human' then
    update seo.jobs set status='awaiting_human', result=p_result,
           locked_at=null, locked_by=null where id=p_job_id;
  elsif p_outcome = 'released' then
    -- тик отдал задачу по времени; без штрафа, без прогресса fan-in
    update seo.jobs set status='pending', locked_at=null, locked_by=null where id=p_job_id;
    return;
  elsif p_outcome = 'retry' then
    if j.attempts + 1 >= j.max_attempts then
      update seo.jobs set status='failed', attempts=attempts+1,
             last_error=coalesce(p_result->>'error', last_error),
             locked_at=null, locked_by=null where id=p_job_id;
      -- падает в терминал → идёт в fan-in ниже
    else
      update seo.jobs set status='pending', attempts=attempts+1,
             next_run_at = now() + (power(2, attempts+1)::text || ' minutes')::interval,
             last_error=coalesce(p_result->>'error', last_error),
             locked_at=null, locked_by=null where id=p_job_id;
      return;  -- в ретрае — не терминально, сборщик ждёт
    end if;
  elsif p_outcome = 'failed' then
    update seo.jobs set status='failed', last_error=coalesce(p_result->>'error', last_error),
           locked_at=null, locked_by=null where id=p_job_id;
  else
    raise exception 'unknown outcome %', p_outcome;
  end if;

  -- стоимость → run и item; бюджет → пауза run (не отмена)
  if j.run_id is not null and v_cost > 0 then
    update seo.production_runs set total_cost = total_cost + v_cost where id=j.run_id;
    update seo.production_runs set status='paused', pause_reason='budget'
      where id=j.run_id and status='running' and total_cost >= budget_limit;
  end if;
  if j.run_item_id is not null and v_cost > 0 then
    update seo.production_run_items set cost = cost + v_cost where id=j.run_item_id;
  end if;

  -- fan-in: сначала блокируем сборщик, потом считаем детей (иначе гонка N-1)
  if j.group_key is not null then
    select * into v_assembler from seo.jobs
      where group_key = j.group_key and expected_count is not null and status='waiting'
      for update limit 1;
    if found then
      select count(*) filter (where status='done'),
             count(*) filter (where status='failed')
        into v_done, v_failed
        from seo.jobs
       where group_key = j.group_key and expected_count is null;  -- только дети
      v_allowed := coalesce((v_assembler.payload->>'allowed_failures')::int, 1);
      if v_done + v_failed = v_assembler.expected_count then
        if v_failed <= v_allowed then
          update seo.jobs set status='pending', next_run_at=now() where id=v_assembler.id;
        else
          update seo.jobs set status='failed', last_error='too many child failures' where id=v_assembler.id;
          if v_assembler.run_item_id is not null then
            update seo.production_run_items set status='failed', error='fan-in failed' where id=v_assembler.run_item_id;
          end if;
        end if;
      end if;
    end if;
  end if;
end $$;

-- ── Вьюха связи с CRM: страница → сделка (только чтение public.deals) ─────────
create or replace view seo.v_page_deals as
select li.first_touch_page, li.last_touch_page, li.deal_id, d.stage_id, d.budget, li.lead_at
from seo.lead_identities li
join public.deals d on d.id = li.deal_id;


-- ───────────────────────────────────────────────────────────────
-- 20260908000003_seo_cron.sql
-- ───────────────────────────────────────────────────────────────

-- ═══════════════════════════════════════════════════════════════════════════
-- SEO cron (PRD v1.2, 10.3). Расширения + функции планировщика.
-- ВАЖНО: сам тик НЕ планируется при применении миграции — включается вручную
-- вызовом `select seo.schedule_all();` ПОСЛЕ того как: (1) задеплоен /api/seo/tick,
-- (2) в Vault лежит секрет SEO_TICK_SECRET, (3) воркер проверен на job-echo.
-- Так применение схемы не начинает дёргать эндпоинты раньше времени.
-- ═══════════════════════════════════════════════════════════════════════════

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Куда стучимся тиком. Меняется через seo.settings (key='tick_url').
insert into seo.settings (key, value)
values ('tick_url', to_jsonb('https://crm.goandstudy.com/api/seo/tick'::text))
on conflict (key) do nothing;

-- Один тик: POST на /api/seo/tick с секретом из Vault (ответ не нужен — pg_net async).
create or replace function seo.dispatch_tick()
returns void
language plpgsql
security definer
as $$
declare
  v_url    text;
  v_secret text;
begin
  select (value #>> '{}') into v_url from seo.settings where key='tick_url';
  begin
    select decrypted_secret into v_secret from vault.decrypted_secrets where name='SEO_TICK_SECRET';
  exception when others then
    v_secret := null;   -- Vault недоступен/секрета нет — тик не шлём
  end;
  if v_url is null or v_secret is null then return; end if;
  perform net.http_post(
    url     := v_url,
    headers := jsonb_build_object('Content-Type','application/json','x-seo-tick-secret', v_secret),
    body    := '{}'::jsonb
  );
end $$;

-- Ночные джобы кладут задачи в свои lanes (тела реализуются в соответствующих M).
-- Пока — заглушки-функции, чтобы расписание ссылалось на существующие имена.
create or replace function seo.enqueue_nightly(p_lane text)
returns void language plpgsql as $$
begin
  -- реализуется в M1/M2/M5/M12/M3 (обход, gsc, находки, freshness, сшивка)
  -- placeholder: ничего не делает, пока модули не готовы
  perform 1;
end $$;

-- Включить всё расписание (идемпотентно). Вызывать вручную после проверки воркера.
create or replace function seo.schedule_all()
returns void language plpgsql as $$
begin
  perform cron.unschedule(jobname) from cron.job
    where jobname in ('seo_tick','seo_crawl','seo_gsc','seo_findings','seo_freshness','seo_attribution');
  perform cron.schedule('seo_tick',        '* * * * *',  $q$ select seo.dispatch_tick(); $q$);
  perform cron.schedule('seo_attribution', '0 1 * * *',  $q$ select seo.enqueue_nightly('attribution'); $q$);
  perform cron.schedule('seo_crawl',       '0 2 * * *',  $q$ select seo.enqueue_nightly('crawl'); $q$);
  perform cron.schedule('seo_freshness',   '0 3 * * *',  $q$ select seo.enqueue_nightly('freshness'); $q$);
  perform cron.schedule('seo_gsc',         '0 4 * * *',  $q$ select seo.enqueue_nightly('gsc'); $q$);
  perform cron.schedule('seo_findings',    '0 5 * * *',  $q$ select seo.enqueue_nightly('index'); $q$);
end $$;

create or replace function seo.unschedule_all()
returns void language plpgsql as $$
begin
  perform cron.unschedule(jobname) from cron.job
    where jobname in ('seo_tick','seo_crawl','seo_gsc','seo_findings','seo_freshness','seo_attribution');
end $$;


-- ───────────────────────────────────────────────────────────────
-- 20260908000004_seo_seed.sql
-- ───────────────────────────────────────────────────────────────

-- ═══════════════════════════════════════════════════════════════════════════
-- SEO seed (PRD v1.2, приложение D): settings по умолчанию, claim_policy, brand_terms.
-- Значения — стартовые, калибруются на этапе 1.
-- ═══════════════════════════════════════════════════════════════════════════

insert into seo.settings (key, value) values
  ('autopilot_enabled',          to_jsonb(false)),
  ('autopilot_daily_limit',      to_jsonb(20)),
  ('autopilot_budget_limit',     to_jsonb(20)),        -- USD/сутки
  ('similarity_threshold',       to_jsonb(0.86)),      -- калибруется на 50 парах, этап 1
  ('max_topic_depth',            to_jsonb(1)),
  ('auto_topic_daily_limit',     to_jsonb(10)),
  ('worker_concurrency_by_lane', '{"production":3,"crawl":2,"gsc":1,"freshness":2,"index":1,"attribution":1,"autopilot":1}'::jsonb),
  ('embedding_model',            to_jsonb('voyage-3'::text)),   -- vector(1024)
  ('tracker_consent_required',   to_jsonb(true)),
  ('brand_terms',                '["goandstudy","го энд стади","гоэндстади","go and study"]'::jsonb)
on conflict (key) do nothing;

-- Стартовая claim_policy (приложение D). required_kinds — «нужен хотя бы один
-- источник из списка» (см. 7.4 confirmed). autopilot_ok = false до конца этапа 5.
insert into seo.claim_policy (kind, required_kinds, preferred_kinds, default_ttl, autopilot_ok) values
  ('tuition_fee',          array['university_program'],                    array['university_program','university_general'], interval '180 days', false),
  ('deadline',             array['university_program'],                    array['university_program'],                     interval '30 days',  false),
  ('language_req',         array['university_program'],                    array['university_program','university_general'], interval '180 days', false),
  ('visa_requirement',     array['official_gov'],                          array['official_gov','ministry'],                interval '90 days',  false),
  ('eligibility',          array['university_program','official_gov'],     array['university_program'],                     interval '180 days', false),
  ('document_req',         array['university_program','official_gov'],     array['university_program'],                     interval '180 days', false),
  ('scholarship',          array['university_general','official_gov'],     array['university_program'],                     interval '180 days', false),
  ('practical_timeline',   array['internal_expert'],                       array['internal_expert'],                        interval '180 days', false),
  ('practice_vs_official', array['internal_expert'],                       array['internal_expert'],                        interval '180 days', false),
  ('system_basics',        array['official_gov','ministry'],               array['ministry'],                               interval '730 days', false),
  ('internal_stat',        array['internal_stats'],                        array['internal_stats'],                         interval '365 days', false)
on conflict (kind) do nothing;


-- ───────────────────────────────────────────────────────────────
-- 20260908000005_seo_grants.sql
-- ───────────────────────────────────────────────────────────────

-- Доступ service_role к схеме seo (воркер /api/seo/tick и панель /admin/seo ходят
-- под service_role через PostgREST). anon/authenticated НЕ получают доступ — модуль
-- серверный. Плюс схему seo нужно добавить в Exposed schemas (Settings → API).
grant usage on schema seo to service_role;
grant all privileges on all tables    in schema seo to service_role;
grant all privileges on all sequences in schema seo to service_role;
grant execute      on all functions   in schema seo to service_role;
alter default privileges in schema seo grant all on tables to service_role;
alter default privileges in schema seo grant all on sequences to service_role;
alter default privileges in schema seo grant execute on functions to service_role;


-- ───────────────────────────────────────────────────────────────
-- 20260909000001_seo_opportunities.sql
-- ───────────────────────────────────────────────────────────────

-- PRD v2.0 §7 — Opportunity Engine (этап 2). Персистентная приоритизированная очередь.
-- Пока не применена, /admin/seo/opportunities работает как вычисляемое представление
-- (lib/seo/opportunities.ts). Применение включает сохранение решений и калибровку.
-- Применяется вручную через Supabase SQL Editor (ref pxtwaxhmygnssyyowrgr).

create table if not exists seo.opportunities (
  id             bigserial primary key,
  kind           text not null,        -- ctr | striking_distance | cannibalization
                                       -- | orphan | broken_link | stale | schema
                                       -- | content_gap | technical
  page_ids       bigint[],             -- участники (1–3)
  topic_id       bigint references seo.topics(id),
  query_group    text[],               -- запросы, агрегированные до URL (§5.3)
  intent         text,                 -- informational | commercial | navigational
  funnel_stage   text,
  country        text,
  service        text,                 -- связанная услуга Go&Study
  decision       text,                 -- CREATE | UPDATE | EXPAND | MERGE
                                       -- | REPOSITION | REDIRECT | LINK_ONLY | IGNORE
  decision_reason text,
  risk           text not null default 'low',    -- low | medium | high
  confidence     numeric,              -- 0..1
  seo_score      numeric,
  business_value numeric,
  priority       numeric,
  forecast       jsonb,                -- {conservative, base, optimistic, basis}
  evidence       jsonb not null default '{}',    -- какие находки, сегменты, окна
  status         text not null default 'new',
      -- new | approved | queued | in_production | done | dismissed | expired
  assigned_to    uuid,
  created_at     timestamptz default now(),
  updated_at     timestamptz
);
create index if not exists opportunities_status_priority_idx on seo.opportunities (status, priority desc);

-- веса формулы приоритета (§7.3) — меняются без деплоя
insert into seo.settings (key, value) values
  ('priority_weights', '{"seo":1,"business":1,"product_fit":1,"ranking_prob":1,"seasonal":1,"conversion":1,"cost_divisor":1}')
on conflict (key) do nothing;

notify pgrst, 'reload schema';


-- ───────────────────────────────────────────────────────────────
-- 20260909000002_seo_experiments.sql
-- ───────────────────────────────────────────────────────────────

-- PRD v2.0 §16 — Эксперименты (этап 1). Каждое изменение страницы — эксперимент
-- с зафиксированным baseline, одной переменной и решением оставить/откатить.
-- Применяется вручную через Supabase SQL Editor (ref pxtwaxhmygnssyyowrgr).

create table if not exists seo.experiments (
  id bigserial primary key,
  page_id bigint not null references seo.pages(id),
  opportunity_id bigint references seo.opportunities(id),
  change_set_id bigint references seo.change_sets(id),
  hypothesis text not null,
  change_type text not null,        -- snippet | content_expand | internal_links
                                    -- | schema | url_migration | merge
  changed_fields text[],
  baseline jsonb not null,          -- дата, версия, 28/56/90 дн: клики/показы/CTR/позиции
  primary_metric text not null,     -- ctr | clicks | position | leads
  guardrail_metrics text[],         -- что не должно ухудшиться
  min_observation_days int not null default 28,
  control_page_ids bigint[],        -- контрольная группа на момент старта
  started_at timestamptz not null default now(),
  result jsonb,
  outcome text,                     -- improved | neutral | degraded | inconclusive
  decision text,                    -- keep | rollback | continue
  decided_at timestamptz, decided_by uuid
);
create index if not exists experiments_page_idx on seo.experiments (page_id, started_at desc);

notify pgrst, 'reload schema';


-- ───────────────────────────────────────────────────────────────
-- 20260910120000_index_first_indexed.sql
-- ───────────────────────────────────────────────────────────────

-- Дата, когда страница впервые оказалась в индексе.
-- Нужна, чтобы в конце месяца видеть: что вышло за месяц и сколько дней шло до индекса.
alter table seo.index_status add column if not exists first_indexed_at timestamptz;

-- Задним числом: у страниц, которые уже в индексе, считаем датой последний обход
-- Google. Это не точная дата попадания, но ближайшее честное приближение —
-- дальше значение проставляется в момент, когда статус меняется на «в индексе».
update seo.index_status
   set first_indexed_at = coalesce(last_crawl, checked_at)
 where verdict = 'PASS' and first_indexed_at is null;


-- ───────────────────────────────────────────────────────────────
-- 20260911120000_jobs_runner.sql
-- ───────────────────────────────────────────────────────────────

-- Маршрутизация задач по исполнителю.
--
-- Было: любой воркер брал любую задачу, и если она ему не по силам — возвращал
-- в очередь. Публикацию в тему первым забирал Vercel, ронял её на отсутствии
-- ssh, и статья не выходила, хотя рядом стоял агент, который умеет.
-- Возврат остаётся страховкой, но перестаёт быть способом маршрутизации.
--
-- 'any'    — может выполнить любой воркер
-- 'vercel' — только воркер CRM (нужны ключи моделей и внешних API)
-- 'agent'  — только агент на сервере WordPress (нужен доступ к файлам темы)

begin;

alter table seo.jobs
  add column if not exists runner text not null default 'any';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'jobs_runner_check') then
    alter table seo.jobs add constraint jobs_runner_check
      check (runner in ('any', 'vercel', 'agent'));
  end if;
end $$;

-- Задачам, которые уже стоят в очереди, проставим исполнителя по шагу
update seo.jobs
   set runner = 'agent'
 where runner = 'any'
   and step in ('article_publish_blog', 'link_insert_theme')
   and status in ('pending', 'waiting', 'running');

create index if not exists jobs_runner_status_idx on seo.jobs (runner, status, next_run_at);

-- ── Выдача задач с учётом исполнителя ───────────────────────────────────────
--
-- Важно: новая функция с третьим аргументом НЕ заменяет старую с двумя, а
-- становится второй перегрузкой. Третий аргумент со значением по умолчанию
-- делает вызов с двумя аргументами подходящим обеим — и Postgres откажется
-- выбирать: «function is not unique». Поэтому старую снимаем явно.
--
-- Порядок безопасен: выложенный код сначала пробует вызов с тремя аргументами,
-- и после этой миграции он сработает. Окно, в котором ни та ни другая не
-- отвечает, — доли секунды внутри транзакции; воркер в этом случае просто
-- пропустит один проход и придёт через минуту.
drop function if exists seo.claim_jobs(text, int);

create or replace function seo.claim_jobs(p_worker text, p_limit int default 5, p_runner text default null)
returns setof seo.jobs
language plpgsql
as $$
declare
  v_conc jsonb;
  v_ids  bigint[];
begin
  -- авторазблокировка зависших running (> 10 минут) → pending, attempts+1
  update seo.jobs
     set status='pending', locked_at=null, locked_by=null, attempts=attempts+1
   where status='running' and locked_at < now() - interval '10 minutes';

  select value into v_conc from seo.settings where key='worker_concurrency_by_lane';

  with running_by_lane as (
    select lane, count(*)::int c from seo.jobs where status='running' group by lane
  ),
  eligible as (
    select j.id, j.lane, j.priority, j.next_run_at,
           row_number() over (partition by j.lane order by j.priority, j.next_run_at, j.id) rn
      from seo.jobs j
     where j.status='pending'
       and j.next_run_at <= now()
       and (p_runner is null or j.runner = 'any' or j.runner = p_runner)
       and (j.run_id is null or exists (
             select 1 from seo.production_runs pr
              where pr.id=j.run_id and pr.status='running'))
  )
  select array_agg(e.id order by e.priority, e.next_run_at, e.id)
    into v_ids
    from eligible e
    left join running_by_lane r on r.lane = e.lane
   where e.rn <= greatest(coalesce((v_conc->>e.lane)::int, 999) - coalesce(r.c,0), 0);

  if v_ids is null then return; end if;

  return query
  update seo.jobs j
     set status='running', locked_at=now(), locked_by=p_worker
   where j.id in (
     select id from seo.jobs
      where id = any(v_ids)
      order by priority, next_run_at, id
      for update skip locked
      limit p_limit
   )
   returning j.*;
end $$;

commit;


-- ───────────────────────────────────────────────────────────────
-- 20260917000000_claim_jobs_no_double.sql
-- ───────────────────────────────────────────────────────────────

-- Двойная выдача одной задачи двум исполнителям.
--
-- Что происходило. Функция работает в две фазы: сначала отбирает кандидатов
-- (`status='pending'`), потом блокирует их и помечает `running`. Во второй фазе
-- внутренний SELECT фильтровал только по списку идентификаторов:
--
--     select id from seo.jobs
--      where id = any(v_ids)          -- и всё
--        for update skip locked
--
-- `FOR UPDATE SKIP LOCKED` защищает, только пока чужая транзакция держит строку.
-- Два тика пересекаются намеренно («Тики МОГУТ пересекаться» — комментарий в
-- app/api/seo/tick/route.ts). Если первый успел зафиксироваться раньше, чем
-- второй дошёл до второй фазы, строка уже не заблокирована, а её новый статус
-- `running` никто не проверяет — и второй исполнитель забирает ту же задачу.
--
-- Поймано selftest'ом «два исполнителя не возьмут одну задачу»: он падает не
-- каждый раз, а когда попадает в это окно. Примерно один прогон из трёх.
--
-- Починка в одну строку: вторая фаза тоже смотрит на статус. Если первый
-- исполнитель успел пометить задачу, второй её не увидит.

begin;

create or replace function seo.claim_jobs(p_worker text, p_limit int default 5, p_runner text default null)
returns setof seo.jobs
language plpgsql
as $$
declare
  v_conc jsonb;
  v_ids  bigint[];
begin
  -- авторазблокировка зависших running (> 10 минут) → pending, attempts+1
  -- ВРЕМЕННО: снимается в E1 вместе с приходом аренды и heartbeat (ADR-0002).
  update seo.jobs
     set status='pending', locked_at=null, locked_by=null, attempts=attempts+1
   where status='running' and locked_at < now() - interval '10 minutes';

  select value into v_conc from seo.settings where key='worker_concurrency_by_lane';

  with running_by_lane as (
    select lane, count(*)::int c from seo.jobs where status='running' group by lane
  ),
  eligible as (
    select j.id, j.lane, j.priority, j.next_run_at,
           row_number() over (partition by j.lane order by j.priority, j.next_run_at, j.id) rn
      from seo.jobs j
     where j.status='pending'
       and j.next_run_at <= now()
       and (p_runner is null or j.runner = 'any' or j.runner = p_runner)
       and (j.run_id is null or exists (
             select 1 from seo.production_runs pr
              where pr.id=j.run_id and pr.status='running'))
  )
  select array_agg(e.id order by e.priority, e.next_run_at, e.id)
    into v_ids
    from eligible e
    left join running_by_lane r on r.lane = e.lane
   where e.rn <= greatest(coalesce((v_conc->>e.lane)::int, 999) - coalesce(r.c,0), 0);

  if v_ids is null then return; end if;

  return query
  update seo.jobs j
     set status='running', locked_at=now(), locked_by=p_worker
   where j.id in (
     select id from seo.jobs
      where id = any(v_ids)
        and status = 'pending'      -- ← вот эта строка и есть вся починка
      order by priority, next_run_at, id
      for update skip locked
      limit p_limit
   )
   returning j.*;
end $$;

commit;


-- ───────────────────────────────────────────────────────────────
-- 20260917010000_job_lease_expand.sql
-- ───────────────────────────────────────────────────────────────

-- Аренда задачи, heartbeat и fencing. Фаза expand: только добавляем.
--
-- Зачем. Сейчас claim_jobs возвращает в очередь всё, что провисело в running
-- дольше десяти минут. База не может отличить «воркер умер» от «шаг идёт
-- дольше десяти минут», потому что исполнитель никак не сообщает, что жив.
-- Отсюда два следствия: долгая задача перезапускается, хотя работает, и пока
-- это так, долгие задачи в очередь добавлять нельзя.
--
-- Что здесь НЕ делается: правило возврата не меняется. Эта миграция только
-- заводит поля и начинает их заполнять, старая логика продолжает работать
-- ровно как раньше. Переключение — отдельным файлом 20260917020000, и только
-- после того, как видно, что heartbeat реально идёт.
--
-- ── Про состав колонок ──────────────────────────────────────────────────────
-- PRD E1.3 перечисляет семь полей и отдельно требует: «Если аналоги существуют
-- — использовать их, не дублировать». Три аналога есть, и они рабочие:
--
--   job_key         → dedup_key     (уже text unique, уже используется enqueue)
--   next_attempt_at → next_run_at   (уже not null, уже участвует в отборе)
--   lease_owner     → locked_by     (уже пишется при выдаче)
--
-- Заводить рядом вторые такие же поля значит держать два источника правды об
-- одном и том же. Поэтому добавляются только четыре, у которых аналога нет.

begin;

alter table seo.jobs
  add column if not exists lease_expires_at timestamptz,
  add column if not exists heartbeat_at     timestamptz,
  add column if not exists fencing_token    bigint,
  add column if not exists handler_version  text;

comment on column seo.jobs.lease_expires_at is
  'До какого момента выдача действительна. Продлевается heartbeat_job.';
comment on column seo.jobs.heartbeat_at is
  'Когда исполнитель в последний раз подтвердил, что жив.';
comment on column seo.jobs.fencing_token is
  'Номер выдачи. Растёт монотонно. Исполнитель со старым номером не может записать результат.';
comment on column seo.jobs.handler_version is
  'Версия обработчика, взявшего задачу. Нужна при расследовании: что именно её выполняло.';

-- Номер выдачи общий на всю очередь, а не на задачу: так он монотонен даже
-- если задачу пересоздали, и его нельзя подделать пересчётом.
create sequence if not exists seo.job_fencing_seq as bigint;

-- Отбор просроченных аренд: по этому индексу пойдёт восстановление в фазе enable.
create index if not exists jobs_lease_expiry_idx
  on seo.jobs (lease_expires_at)
  where status = 'running';

-- Сколько держится аренда и сколько ждать пропавший heartbeat. В settings,
-- чтобы менять без миграции: подобрать придётся по живым замерам.
insert into seo.settings (key, value)
values ('lease_seconds', to_jsonb(900)),          -- 15 минут: шаг статьи укладывается
       ('heartbeat_grace_seconds', to_jsonb(120)) -- пропуск двух ударов — ещё не смерть
on conflict (key) do nothing;

-- ── Выдача: те же правила, плюс заполнение полей аренды ─────────────────────
create or replace function seo.claim_jobs(p_worker text, p_limit int default 5, p_runner text default null)
returns setof seo.jobs
language plpgsql
as $$
declare
  v_conc  jsonb;
  v_ids   bigint[];
  v_lease int;
begin
  -- ВРЕМЕННО: старое правило возврата. Снимается в 20260917020000.
  update seo.jobs
     set status='pending', locked_at=null, locked_by=null, attempts=attempts+1
   where status='running' and locked_at < now() - interval '10 minutes';

  select value into v_conc from seo.settings where key='worker_concurrency_by_lane';
  select (value #>> '{}')::int into v_lease from seo.settings where key='lease_seconds';
  -- SELECT INTO без строки оставляет переменную NULL, и coalesce ВНУТРИ запроса
  -- этого не ловит: он применяется к значению, а не к отсутствию строки. Дальше
  -- make_interval(secs => NULL) дал бы аренду NULL — то есть задачу без срока,
  -- которую новое правило возврата никогда не тронет.
  v_lease := coalesce(v_lease, 900);

  with running_by_lane as (
    select lane, count(*)::int c from seo.jobs where status='running' group by lane
  ),
  eligible as (
    select j.id, j.lane, j.priority, j.next_run_at,
           row_number() over (partition by j.lane order by j.priority, j.next_run_at, j.id) rn
      from seo.jobs j
     where j.status='pending'
       and j.next_run_at <= now()
       and (p_runner is null or j.runner = 'any' or j.runner = p_runner)
       and (j.run_id is null or exists (
             select 1 from seo.production_runs pr
              where pr.id=j.run_id and pr.status='running'))
  )
  select array_agg(e.id order by e.priority, e.next_run_at, e.id)
    into v_ids
    from eligible e
    left join running_by_lane r on r.lane = e.lane
   where e.rn <= greatest(coalesce((v_conc->>e.lane)::int, 999) - coalesce(r.c,0), 0);

  if v_ids is null then return; end if;

  return query
  update seo.jobs j
     set status='running',
         locked_at=now(),
         locked_by=p_worker,
         heartbeat_at=now(),
         lease_expires_at = now() + make_interval(secs => v_lease),
         fencing_token = nextval('seo.job_fencing_seq')
   where j.id in (
     select id from seo.jobs
      where id = any(v_ids)
        and status = 'pending'      -- см. 20260917000000: без этого задачу выдавало дважды
      order by priority, next_run_at, id
      for update skip locked
      limit p_limit
   )
   returning j.*;
end $$;

-- ── Подтверждение жизни ─────────────────────────────────────────────────────
--
-- Возвращает false, если номер выдачи не совпал: значит аренда уже отобрана и
-- задачу ведёт кто-то другой. Исполнитель, получивший false, обязан прекратить
-- работу и ничего не записывать — иначе он затрёт чужой результат.
create or replace function seo.heartbeat_job(
  p_job_id          bigint,
  p_fencing_token   bigint,
  p_handler_version text default null
)
returns boolean
language plpgsql
as $$
declare
  v_lease int;
  v_rows  int;
begin
  select (value #>> '{}')::int into v_lease from seo.settings where key='lease_seconds';
  v_lease := coalesce(v_lease, 900);

  update seo.jobs
     set heartbeat_at = now(),
         lease_expires_at = now() + make_interval(secs => v_lease),
         handler_version = coalesce(p_handler_version, handler_version)
   where id = p_job_id
     and status = 'running'
     and fencing_token = p_fencing_token;

  get diagnostics v_rows = row_count;
  return v_rows > 0;
end $$;

-- ── Завершение: с проверкой номера выдачи ───────────────────────────────────
--
-- Тип результата меняется с void на boolean, а это CREATE OR REPLACE не умеет.
-- Снимаем старую явно. Вызов с тремя аргументами после этого попадёт в новую
-- функцию через значение по умолчанию — выложенный код продолжает работать.
drop function if exists seo.complete_job(bigint, text, jsonb);

create or replace function seo.complete_job(
  p_job_id        bigint,
  p_outcome       text,
  p_result        jsonb default '{}',
  p_fencing_token bigint default null
)
returns boolean
language plpgsql
as $$
declare
  j           seo.jobs;
  v_cost      numeric;
  v_assembler seo.jobs;
  v_done      int;
  v_failed    int;
  v_allowed   int;
begin
  select * into j from seo.jobs where id=p_job_id for update;
  if not found then return false; end if;

  -- Fencing. Воркер, чью аренду отобрали, мог доработать шаг и прийти с
  -- результатом — записывать его нельзя: задачу уже ведёт другой, и запись
  -- создала бы тот самый дубль, который MVP обязан исключить.
  -- p_fencing_token = null означает старого вызывающего: пропускаем, чтобы
  -- выложенный код не встал между двумя выкатками.
  if p_fencing_token is not null and j.fencing_token is distinct from p_fencing_token then
    return false;
  end if;

  v_cost := coalesce((p_result->>'cost')::numeric, 0);

  if p_outcome = 'done' then
    update seo.jobs set status='done', result=p_result, cost=cost+v_cost,
           locked_at=null, locked_by=null, lease_expires_at=null where id=p_job_id;
  elsif p_outcome = 'awaiting_human' then
    update seo.jobs set status='awaiting_human', result=p_result,
           locked_at=null, locked_by=null, lease_expires_at=null where id=p_job_id;
  elsif p_outcome = 'released' then
    -- тик отдал задачу по времени; без штрафа, без прогресса fan-in
    update seo.jobs set status='pending', locked_at=null, locked_by=null,
           lease_expires_at=null where id=p_job_id;
    return true;
  elsif p_outcome = 'retry' then
    if j.attempts + 1 >= j.max_attempts then
      update seo.jobs set status='failed', attempts=attempts+1,
             last_error=coalesce(p_result->>'error', last_error),
             locked_at=null, locked_by=null, lease_expires_at=null where id=p_job_id;
      -- падает в терминал → идёт в fan-in ниже
    else
      update seo.jobs set status='pending', attempts=attempts+1,
             next_run_at = now() + (power(2, attempts+1)::text || ' minutes')::interval,
             last_error=coalesce(p_result->>'error', last_error),
             locked_at=null, locked_by=null, lease_expires_at=null where id=p_job_id;
      return true;  -- в ретрае — не терминально, сборщик ждёт
    end if;
  elsif p_outcome = 'failed' then
    update seo.jobs set status='failed', last_error=coalesce(p_result->>'error', last_error),
           locked_at=null, locked_by=null, lease_expires_at=null where id=p_job_id;
  else
    raise exception 'unknown outcome %', p_outcome;
  end if;

  -- стоимость → run и item; бюджет → пауза run (не отмена)
  if j.run_id is not null and v_cost > 0 then
    update seo.production_runs set total_cost = total_cost + v_cost where id=j.run_id;
    update seo.production_runs set status='paused', pause_reason='budget'
      where id=j.run_id and status='running' and total_cost >= budget_limit;
  end if;
  if j.run_item_id is not null and v_cost > 0 then
    update seo.production_run_items set cost = cost + v_cost where id=j.run_item_id;
  end if;

  -- fan-in: сначала блокируем сборщик, потом считаем детей (иначе гонка N-1)
  if j.group_key is not null then
    select * into v_assembler from seo.jobs
      where group_key = j.group_key and expected_count is not null and status='waiting'
      for update limit 1;
    if found then
      select count(*) filter (where status='done'),
             count(*) filter (where status='failed')
        into v_done, v_failed
        from seo.jobs
       where group_key = j.group_key and expected_count is null;  -- только дети
      v_allowed := coalesce((v_assembler.payload->>'allowed_failures')::int, 1);
      if v_done + v_failed = v_assembler.expected_count then
        if v_failed <= v_allowed then
          update seo.jobs set status='pending', next_run_at=now() where id=v_assembler.id;
        else
          update seo.jobs set status='failed', last_error='too many child failures' where id=v_assembler.id;
          if v_assembler.run_item_id is not null then
            update seo.production_run_items set status='failed', error='fan-in failed' where id=v_assembler.run_item_id;
          end if;
        end if;
      end if;
    end if;
  end if;

  return true;
end $$;

grant execute on function seo.heartbeat_job(bigint, bigint, text) to service_role;
grant execute on function seo.complete_job(bigint, text, jsonb, bigint) to service_role;
grant execute on function seo.claim_jobs(text, int, text) to service_role;

commit;


-- ───────────────────────────────────────────────────────────────
-- 20260917020000_job_lease_enable.sql
-- ───────────────────────────────────────────────────────────────

-- Аренда задачи. Фаза enable: меняем правило возврата.
--
-- Применять ТОЛЬКО после 20260917010000 и только когда видно, что heartbeat
-- реально идёт: `select count(*) from seo.jobs where status='running' and
-- heartbeat_at > now() - interval '2 minutes'` должно быть больше нуля при
-- работающем воркере. Иначе новое правило вернёт в очередь всё разом.
--
-- Было: задача возвращается, если провисела в running дольше десяти минут.
-- Стало: задача возвращается, когда исполнитель перестал подавать признаки
-- жизни. Долгий шаг, который отмечается, не трогаем — именно из-за старого
-- правила долгие шаги нельзя было ставить в очередь.
--
-- ── Почему именно сердцебиение, а не истечение аренды ───────────────────────
--
-- Первая версия этого файла возвращала задачу, только когда истекла аренда И
-- молчит сердце. На бумаге строже, на деле — хуже прежнего. Воркер на Vercel
-- убивают на трёхстах секундах, а аренда живёт девятьсот: убитая функция
-- держала бы задачу пятнадцать минут плюс запас, то есть возврат стал бы
-- медленнее нынешних десяти минут. Чинить надёжность, замедляя восстановление,
-- бессмысленно.
--
-- Поэтому решает сердцебиение: оно и есть признак жизни, а аренда — только
-- верхняя граница на случай, если сердце стучит, а работа стоит.
--
-- Арифметика запаса: удар раз в 30 секунд (BEAT_MS в lib/seo/lease.ts),
-- запас 180 секунд — это шесть пропущенных ударов подряд. Меньше брать
-- опасно: сеть моргает, и один-два удара теряются штатно.
--
-- ── Про задачи, выданные мимо claim_jobs ────────────────────────────────────
--
-- Агент публикации на сервере сайта берёт задачу прямым UPDATE через
-- /api/seo/publish/next, а не через claim_jobs — у него нет ни аренды, ни
-- сердцебиения, и быть не может: он знает один узкий токен и ничего больше.
-- Для таких задач остаётся прежняя мерка по locked_at. Отличаем их по пустой
-- lease_expires_at.
--
-- Откат без миграции: seo.settings.key='lease_recovery' → false. Тогда работает
-- прежнее правило по locked_at. Флаг читается на каждом вызове.

begin;

insert into seo.settings (key, value)
values ('lease_recovery', to_jsonb(true))
on conflict (key) do update set value = to_jsonb(true);

-- Шесть пропущенных ударов вместо четырёх: сеть моргает, и терять задачу
-- из-за двух потерянных пакетов не стоит.
update seo.settings set value = to_jsonb(180) where key = 'heartbeat_grace_seconds';

create or replace function seo.claim_jobs(p_worker text, p_limit int default 5, p_runner text default null)
returns setof seo.jobs
language plpgsql
as $$
declare
  v_conc    jsonb;
  v_ids     bigint[];
  v_lease   int;
  v_grace   int;
  v_by_lease boolean;
begin
  -- Каждое значение может отсутствовать строкой, а не значением: coalesce внутри
  -- запроса ловит только второе. Без подстраховки ниже правило возврата с NULL
  -- в запасе не вернуло бы ни одной задачи и молча перестало бы работать.
  select (value #>> '{}')::boolean into v_by_lease from seo.settings where key='lease_recovery';
  select (value #>> '{}')::int     into v_lease    from seo.settings where key='lease_seconds';
  select (value #>> '{}')::int     into v_grace    from seo.settings where key='heartbeat_grace_seconds';
  v_by_lease := coalesce(v_by_lease, false);
  v_lease    := coalesce(v_lease, 900);
  v_grace    := coalesce(v_grace, 180);

  if v_by_lease then
    update seo.jobs
       set status='pending', locked_at=null, locked_by=null,
           lease_expires_at=null, attempts=attempts+1
     where status='running'
       and (
             -- Выдана через claim_jobs: решает сердцебиение. Молчит дольше
             -- запаса — исполнитель мёртв, сколько бы ни оставалось аренды.
             (lease_expires_at is not null
              and coalesce(heartbeat_at, locked_at) < now() - make_interval(secs => v_grace))

             -- Верхняя граница: сердце стучит, а аренда давно вышла. Такого
             -- быть не должно — heartbeat_job продлевает аренду каждым ударом,
             -- — но если случится, задача не залипнет навсегда.
          or (lease_expires_at is not null and lease_expires_at < now() - make_interval(secs => v_grace))

             -- Выдана мимо claim_jobs (агент публикации): прежняя мерка.
          or (lease_expires_at is null and locked_at < now() - interval '10 minutes')
           );
  else
    update seo.jobs
       set status='pending', locked_at=null, locked_by=null, attempts=attempts+1
     where status='running' and locked_at < now() - interval '10 minutes';
  end if;

  select value into v_conc from seo.settings where key='worker_concurrency_by_lane';

  with running_by_lane as (
    select lane, count(*)::int c from seo.jobs where status='running' group by lane
  ),
  eligible as (
    select j.id, j.lane, j.priority, j.next_run_at,
           row_number() over (partition by j.lane order by j.priority, j.next_run_at, j.id) rn
      from seo.jobs j
     where j.status='pending'
       and j.next_run_at <= now()
       and (p_runner is null or j.runner = 'any' or j.runner = p_runner)
       and (j.run_id is null or exists (
             select 1 from seo.production_runs pr
              where pr.id=j.run_id and pr.status='running'))
  )
  select array_agg(e.id order by e.priority, e.next_run_at, e.id)
    into v_ids
    from eligible e
    left join running_by_lane r on r.lane = e.lane
   where e.rn <= greatest(coalesce((v_conc->>e.lane)::int, 999) - coalesce(r.c,0), 0);

  if v_ids is null then return; end if;

  return query
  update seo.jobs j
     set status='running',
         locked_at=now(),
         locked_by=p_worker,
         heartbeat_at=now(),
         lease_expires_at = now() + make_interval(secs => v_lease),
         fencing_token = nextval('seo.job_fencing_seq')
   where j.id in (
     select id from seo.jobs
      where id = any(v_ids)
        and status = 'pending'
      order by priority, next_run_at, id
      for update skip locked
      limit p_limit
   )
   returning j.*;
end $$;

commit;


-- ───────────────────────────────────────────────────────────────
-- 20260917030000_cost_accounting.sql
-- ───────────────────────────────────────────────────────────────

-- Учёт расходов: runs, budget_reservations, cost_ledger (E1.11).
--
-- Сейчас стоимость копится одним числом в seo.jobs.cost и seo.production_runs
-- .total_cost. По ним нельзя ответить ни на один вопрос, который задаёт PRD:
-- сколько стоит один пакет по составляющим, где p50 и p95, сходится ли учтённое
-- с месячным счётом провайдера. Отсюда три таблицы вместо одного счётчика.
--
-- Старые колонки остаются и продолжают работать: миграция только добавляет.

begin;

-- ── Тарифы отдельно от кода ─────────────────────────────────────────────────
--
-- PRD E2.7 требует, чтобы провайдер, модель, версия промпта и тариф задавались
-- конфигурацией, а идентификаторы моделей не были зашиты в бизнес-логику.
-- Цена модели меняется без выкатки кода, а прошлые расчёты не переписываются
-- задним числом: у записи есть дата, с которой она действует.
create table if not exists seo.model_pricing (
  id                bigserial primary key,
  provider          text not null,              -- anthropic | openai | voyage | fal
  model             text not null,
  input_per_mtok    numeric not null,           -- цена за миллион входных токенов
  output_per_mtok   numeric not null,
  cache_write_mult  numeric not null default 1.25,  -- запись в кэш дороже обычного входа
  cache_read_mult   numeric not null default 0.10,  -- чтение из кэша почти бесплатно
  unit              text not null default 'token',  -- token | image | second
  per_unit          numeric,                    -- для повременных и поштучных: цена за единицу
  currency          text not null default 'USD',
  effective_from    timestamptz not null default now(),
  note              text
);
create unique index if not exists model_pricing_current
  on seo.model_pricing (provider, model, effective_from);

comment on table seo.model_pricing is
  'Тарифы провайдеров. Меняются без выкатки; прошлые расчёты не переписываются.';

-- ── Один вызов провайдера ───────────────────────────────────────────────────
--
-- Учитываются ВСЕ вызовы, включая неудачные попытки и рендер картинок: PRD E1.9
-- говорит об этом отдельно, потому что неудачные попытки оплачены так же, как
-- удачные, и именно они делают разницу между сметой и счётом.
create table if not exists seo.runs (
  id               bigserial primary key,
  job_id           bigint references seo.jobs(id),
  article_id       bigint references seo.articles(id),
  trace_id         text,                        -- сквозной идентификатор цепочки
  role             text not null,               -- writer | fact_reviewer | context_reviewer | embeddings | image
  provider         text not null,
  model            text not null,
  prompt_version   text,
  input_tokens     int not null default 0,      -- не попавшие в кэш
  cache_write_tokens int not null default 0,
  cache_read_tokens  int not null default 0,
  output_tokens    int not null default 0,
  units            numeric,                     -- для поштучных: картинок, секунд
  cost             numeric not null default 0,
  currency         text not null default 'USD',
  status           text not null,               -- ok | failed | timeout | unknown
  error            text,
  latency_ms       int,
  started_at       timestamptz not null default now(),
  finished_at      timestamptz
);
create index if not exists runs_job     on seo.runs (job_id);
create index if not exists runs_role    on seo.runs (role, started_at desc);
create index if not exists runs_article on seo.runs (article_id) where article_id is not null;

comment on column seo.runs.status is
  'unknown — ответ провайдера не получен и не опровергнут. Резерв под такой вызов не освобождается до сверки.';

-- ── Резерв бюджета до платного шага ─────────────────────────────────────────
create table if not exists seo.budget_reservations (
  id           bigserial primary key,
  scope        text not null,                   -- day:2026-09-17 | month:2026-09
  amount       numeric not null,                -- верхняя оценка стоимости шага
  state        text not null default 'held',    -- held | settled | released
  job_id       bigint references seo.jobs(id),
  run_id       bigint references seo.runs(id),
  role         text,
  reason       text,
  created_at   timestamptz not null default now(),
  settled_at   timestamptz
);
create index if not exists budget_res_open on seo.budget_reservations (scope) where state = 'held';

-- ── Проводки для сверки со счётом ───────────────────────────────────────────
create table if not exists seo.cost_ledger (
  id             bigserial primary key,
  run_id         bigint not null references seo.runs(id),
  provider       text not null,
  model          text not null,
  amount         numeric not null,
  currency       text not null default 'USD',
  invoice_period text not null,                 -- YYYY-MM: период счёта провайдера
  reconciled_at  timestamptz,                   -- когда сверили с фактическим счётом
  invoiced       numeric,                       -- что провайдер выставил по факту
  variance       numeric,                       -- invoiced - amount
  created_at     timestamptz not null default now()
);
create index if not exists ledger_period on seo.cost_ledger (invoice_period, provider);
create index if not exists ledger_unrec  on seo.cost_ledger (invoice_period) where reconciled_at is null;

comment on column seo.cost_ledger.variance is
  'Расхождение учтённого и фактического. Метрика PRD §12, снимается ежемесячно.';

-- ── Лимиты ──────────────────────────────────────────────────────────────────
insert into seo.settings (key, value)
values ('budget_daily_usd',   to_jsonb(25)),
       ('budget_monthly_usd', to_jsonb(500))
on conflict (key) do nothing;

-- ── Стоимость вызова по тарифу ──────────────────────────────────────────────
create or replace function seo.run_cost(
  p_provider     text,
  p_model        text,
  p_input        int,
  p_cache_write  int,
  p_cache_read   int,
  p_output       int,
  p_units        numeric default null
)
returns numeric
language plpgsql
stable
as $$
declare
  t seo.model_pricing;
begin
  select * into t from seo.model_pricing
   where provider = p_provider and model = p_model and effective_from <= now()
   order by effective_from desc limit 1;

  -- Тарифа нет — возвращаем null, а не ноль. Ноль выглядел бы как «бесплатно»
  -- и тихо занижал бы расходы; null видно в отчёте как пробел.
  if not found then return null; end if;

  if t.unit <> 'token' then
    return coalesce(p_units, 0) * coalesce(t.per_unit, 0);
  end if;

  return (
      coalesce(p_input,0)       * t.input_per_mtok
    + coalesce(p_cache_write,0) * t.input_per_mtok * t.cache_write_mult
    + coalesce(p_cache_read,0)  * t.input_per_mtok * t.cache_read_mult
    + coalesce(p_output,0)      * t.output_per_mtok
  ) / 1000000.0;
end $$;

-- ── Атомарный резерв ────────────────────────────────────────────────────────
--
-- Параллельные резервы не должны давать превысить лимит — это отдельный
-- обязательный тест PRD E1. Блокировка на область берётся на время транзакции,
-- поэтому два воркера не прочитают один и тот же остаток.
--
-- Возвращает id резерва или null, если денег не осталось.
create or replace function seo.reserve_budget(
  p_amount numeric,
  p_job_id bigint default null,
  p_role   text default null,
  p_reason text default null
)
returns bigint
language plpgsql
as $$
declare
  v_day     text := 'day:'   || to_char(now() at time zone 'UTC', 'YYYY-MM-DD');
  v_month   text := 'month:' || to_char(now() at time zone 'UTC', 'YYYY-MM');
  v_day_lim numeric;
  v_mon_lim numeric;
  v_day_used numeric;
  v_mon_used numeric;
  v_id      bigint;
begin
  if p_amount is null or p_amount <= 0 then
    raise exception 'резерв должен быть положительным, получено %', p_amount;
  end if;

  -- Одна блокировка на сутки и одна на месяц: порядок фиксирован, чтобы два
  -- воркера не встали друг напротив друга.
  perform pg_advisory_xact_lock(hashtext(v_month));
  perform pg_advisory_xact_lock(hashtext(v_day));

  select coalesce((value #>> '{}')::numeric, 25)  into v_day_lim from seo.settings where key='budget_daily_usd';
  select coalesce((value #>> '{}')::numeric, 500) into v_mon_lim from seo.settings where key='budget_monthly_usd';

  -- Занято = держится в резервах + уже потрачено по проводкам. Резервы под
  -- unknown остаются held и продолжают занимать место — так и задумано.
  select coalesce(sum(amount),0) into v_day_used
    from seo.budget_reservations where scope = v_day and state in ('held','settled');
  select coalesce(sum(amount),0) into v_mon_used
    from seo.budget_reservations where scope = v_month and state in ('held','settled');

  if v_day_used + p_amount > v_day_lim then return null; end if;
  if v_mon_used + p_amount > v_mon_lim then return null; end if;

  insert into seo.budget_reservations (scope, amount, job_id, role, reason)
  values (v_day, p_amount, p_job_id, p_role, p_reason)
  returning id into v_id;

  -- Месячная область учитывается отдельной строкой: иначе суточные и месячные
  -- суммы пришлось бы выводить из одной, и они разошлись бы на границе месяца.
  insert into seo.budget_reservations (scope, amount, job_id, role, reason)
  values (v_month, p_amount, p_job_id, p_role, 'зеркало суточного резерва #' || v_id);

  return v_id;
end $$;

-- ── Закрытие резерва фактической суммой ─────────────────────────────────────
create or replace function seo.settle_reservation(
  p_reservation_id bigint,
  p_run_id         bigint,
  p_actual         numeric
)
returns void
language plpgsql
as $$
declare
  r seo.runs;
begin
  update seo.budget_reservations
     set state = 'settled', amount = coalesce(p_actual, amount),
         run_id = p_run_id, settled_at = now()
   where id = p_reservation_id and state = 'held';

  update seo.budget_reservations
     set state = 'settled', amount = coalesce(p_actual, amount), settled_at = now()
   where reason = 'зеркало суточного резерва #' || p_reservation_id and state = 'held';

  if p_run_id is null or p_actual is null then return; end if;

  select * into r from seo.runs where id = p_run_id;
  if not found then return; end if;

  insert into seo.cost_ledger (run_id, provider, model, amount, currency, invoice_period)
  values (p_run_id, r.provider, r.model, p_actual, r.currency,
          to_char(coalesce(r.finished_at, r.started_at) at time zone 'UTC', 'YYYY-MM'));
end $$;

-- ── Освобождение резерва ────────────────────────────────────────────────────
--
-- Только для вызовов, про которые точно известно, что они не состоялись.
-- PRD E1.9: unknown и timeout резерв НЕ освобождают до сверки — иначе деньги,
-- которые провайдер, возможно, уже списал, второй раз уйдут на другую работу.
create or replace function seo.release_reservation(
  p_reservation_id bigint,
  p_reason         text default null
)
returns boolean
language plpgsql
as $$
declare
  v_run_status text;
begin
  select r.status into v_run_status
    from seo.budget_reservations b left join seo.runs r on r.id = b.run_id
   where b.id = p_reservation_id;

  if v_run_status in ('unknown', 'timeout') then
    return false;   -- исход неизвестен: держим резерв до сверки
  end if;

  update seo.budget_reservations
     set state = 'released', settled_at = now(),
         reason = coalesce(p_reason, reason)
   where id = p_reservation_id and state = 'held';

  update seo.budget_reservations
     set state = 'released', settled_at = now()
   where reason = 'зеркало суточного резерва #' || p_reservation_id and state = 'held';

  return true;
end $$;

-- ── Остаток бюджета: для дашборда и для шага, который решает, начинать ли ────
create or replace function seo.budget_left()
returns table (scope text, limit_usd numeric, used_usd numeric, left_usd numeric)
language sql
stable
as $$
  with lims as (
    select 'day:'   || to_char(now() at time zone 'UTC','YYYY-MM-DD') as scope,
           coalesce((select (value #>> '{}')::numeric from seo.settings where key='budget_daily_usd'), 25) as lim
    union all
    select 'month:' || to_char(now() at time zone 'UTC','YYYY-MM'),
           coalesce((select (value #>> '{}')::numeric from seo.settings where key='budget_monthly_usd'), 500)
  )
  select l.scope, l.lim,
         coalesce((select sum(amount) from seo.budget_reservations b
                    where b.scope = l.scope and b.state in ('held','settled')), 0),
         l.lim - coalesce((select sum(amount) from seo.budget_reservations b
                            where b.scope = l.scope and b.state in ('held','settled')), 0)
    from lims l;
$$;

grant execute on function seo.run_cost(text,text,int,int,int,int,numeric) to service_role;
grant execute on function seo.reserve_budget(numeric,bigint,text,text)    to service_role;
grant execute on function seo.settle_reservation(bigint,bigint,numeric)   to service_role;
grant execute on function seo.release_reservation(bigint,text)            to service_role;
grant execute on function seo.budget_left()                               to service_role;

commit;


-- ───────────────────────────────────────────────────────────────
-- 20260917040000_model_pricing_seed.sql
-- ───────────────────────────────────────────────────────────────

-- Тарифы провайдеров на 17 сентября 2026.
--
-- Отдельным файлом от схемы намеренно: цены меняются чаще, чем таблицы, и
-- обновление тарифа не должно выглядеть как изменение структуры. Новая цена
-- добавляется строкой с новой effective_from — прошлые расчёты остаются
-- верными для своего времени.
--
-- Источники цен на дату: Anthropic — $5/$25 за миллион токенов для claude-opus-5,
-- чтение из кэша ×0.1, запись в кэш ×1.25 при пятиминутном сроке хранения.
-- Voyage и fal внесены с нулями и пометкой: их тариф надо подставить, и до тех
-- пор их вызовы будут видны в runs, но не будут учитываться в деньгах.

begin;

-- Повторный прогон не должен плодить дубли. Уникальный индекс здесь не помощник:
-- effective_from по умолчанию now(), поэтому у второго прогона он всегда другой,
-- конфликта не возникает и on conflict do nothing молчит. Поэтому проверяем явно:
-- есть ли уже тариф на эту модель.
do $seed$
begin
if exists (select 1 from seo.model_pricing where provider='anthropic' and model='claude-opus-5') then
  raise notice 'тарифы уже посеяны — пропускаем';
  return;
end if;

insert into seo.model_pricing
  (provider, model, input_per_mtok, output_per_mtok, cache_write_mult, cache_read_mult, unit, note)
values
  ('anthropic', 'claude-opus-5',   5.00, 25.00, 1.25, 0.10, 'token', 'основная модель производства статей'),
  ('anthropic', 'claude-sonnet-5', 3.00, 15.00, 1.25, 0.10, 'token', 'на случай перевода части шагов на более дешёвую модель'),
  ('anthropic', 'claude-haiku-4-5',1.00,  5.00, 1.25, 0.10, 'token', 'короткие служебные шаги')
on conflict do nothing;

-- Тарифы, которые надо уточнить. Ноль здесь означает «не знаем», и это видно
-- в отчёте: seo.run_cost вернёт ноль, а не null, поэтому рядом стоит пометка.
insert into seo.model_pricing
  (provider, model, input_per_mtok, output_per_mtok, unit, note)
values
  ('voyage', 'voyage-3', 0, 0, 'token', 'ТАРИФ НЕ ПОДСТАВЛЕН — уточнить в личном кабинете Voyage'),
  ('fal',    'cover',    0, 0, 'image', 'ТАРИФ НЕ ПОДСТАВЛЕН — уточнить в личном кабинете fal')
on conflict do nothing;

update seo.model_pricing set per_unit = 0 where unit = 'image' and per_unit is null;
end
$seed$;

commit;


-- ───────────────────────────────────────────────────────────────
-- 20260917050000_single_scheduler.sql
-- ───────────────────────────────────────────────────────────────

-- Один владелец расписаний (PRD, инвариант 3).
--
-- Что было. В кроне пять ночных заданий, каждое зовёт seo.enqueue_nightly(lane).
-- Эта функция — заглушка: внутри `perform 1`, то есть ничего. Всю ночную работу
-- на самом деле ставит тик: раз в сутки он добавляет одиннадцать шагов обхода,
-- импорта и находок, и раз в час — шаги потока статей.
--
-- Это хуже, чем два владельца. Два спорили бы, и спор был бы виден. А здесь
-- один работает, а пять лишь выглядят работающими: открыв миграцию, человек
-- уверен, что обход запускается в два часа ночи, и ищет беду не там.
--
-- Что стало. В кроне остаётся один seo_tick. Он и есть тот самый «pg_cron →
-- /api/seo/tick ставит задачи», который PRD называет единственным владельцем.
--
-- Функция enqueue_nightly НЕ удаляется. Удалять то, чего я не могу прочитать,
-- нельзя: её могли переопределить руками в SQL Editor, и тогда удаление снесло
-- бы живую логику. Она просто перестаёт вызываться, и рядом остаётся пометка.

begin;

-- Снимаем только то, что действительно стоит: unschedule по несуществующему
-- имени падает с ошибкой и откатил бы всю транзакцию.
do $$
declare
  v_name text;
begin
  for v_name in
    select jobname from cron.job
     where jobname in ('seo_crawl', 'seo_gsc', 'seo_findings', 'seo_freshness', 'seo_attribution')
  loop
    perform cron.unschedule(v_name);
    raise notice 'снято ночное задание: %', v_name;
  end loop;
end $$;

comment on function seo.enqueue_nightly(text) is
  'НЕ ИСПОЛЬЗУЕТСЯ с 17.09.2026. Была заглушкой, её вызовы сняты из крона. '
  'Ночную работу ставит /api/seo/tick — он единственный владелец расписаний.';

-- ── schedule_all больше не возвращает снятые задания ────────────────────────
--
-- Иначе первый же вызов после этой миграции вернул бы всё как было, и через
-- месяц никто бы не понял, откуда снова взялись ночные задания-пустышки.
create or replace function seo.schedule_all()
returns void language plpgsql as $$
begin
  -- Единственное расписание: тик раз в минуту. Что и когда ставить в очередь,
  -- решает сам тик — там это видно в коде, а не размазано между кроном и кодом.
  perform cron.unschedule(jobname) from cron.job where jobname = 'seo_tick';
  perform cron.schedule('seo_tick', '* * * * *', $q$ select seo.dispatch_tick(); $q$);
end $$;

create or replace function seo.unschedule_all()
returns void language plpgsql as $$
declare
  v_name text;
begin
  for v_name in
    select jobname from cron.job
     where jobname in ('seo_tick','seo_crawl','seo_gsc','seo_findings','seo_freshness','seo_attribution')
  loop
    perform cron.unschedule(v_name);
  end loop;
end $$;

commit;

-- Проверить, что осталось:
--   select jobname, schedule, command, active from cron.job order by jobname;
-- Ожидается одна строка: seo_tick, '* * * * *'.


-- ───────────────────────────────────────────────────────────────
-- 20260917060000_provenance.sql
-- ───────────────────────────────────────────────────────────────

-- Провенанс: откуда известно каждое утверждение (E2.1–E2.4).
--
-- Сейчас в базе девятнадцать утверждений, один источник и НОЛЬ связей между
-- ними. То есть ни одно утверждение не опирается ни на что: гейт достоверности
-- работает и правильно блокирует, а подтверждать ему нечем.
--
-- Девять утверждений про Чулалонгкорн заведены 16 сентября в 08:41, источник
-- chula.ac.th добавлен в 08:42 — минутой позже. Связать их «по очевидности»
-- нельзя: PRD говорит прямо, что наличие URL подтверждением не является.
-- Проверять придётся по тексту страницы, и эта миграция готовит для этого место.

begin;

-- ── Версия и происхождение утверждения ──────────────────────────────────────

alter table seo.claims
  add column if not exists version      int not null default 1,
  add column if not exists verified_at  timestamptz,
  add column if not exists country      text,
  add column if not exists institution  text;

comment on column seo.claims.version is
  'Растёт при любой правке смысла. Связь claim↔source указывает на конкретную версию: '
  'иначе правка утверждения тихо переносила бы на него старое подтверждение.';
comment on column seo.claims.verified_at is
  'Когда утверждение в последний раз сошлось с текстом источника. NULL — не проверялось ни разу.';
comment on column seo.claims.country is
  'Страна отдельно от subject_key. В ключе сейчас смешаны страна (cn, th) и вуз (bocconi), '
  'а приёмочный тест PRD требует ловить подмену «другая программа, год или валюта» — '
  'по смешанному ключу это не отличить.';

-- Статус: появляется unverified.
--
-- До сих пор все девятнадцать лежали как active, что читалось как «действует».
-- Действовать им не на чем: источников нет. Проставляем честный статус там,
-- где подтверждения нет, и не трогаем там, где оно появится.
comment on column seo.claims.status is
  'unverified | active | stale | superseded | disputed. '
  'unverified — подтверждения нет или оно не проверялось. Это не «плохое» утверждение, '
  'а честно отмеченное непроверенным.';

update seo.claims
   set status = 'unverified'
 where status = 'active'
   and not exists (select 1 from seo.claim_sources cs where cs.claim_id = claims.id);

-- ── О чём вообще этот источник ──────────────────────────────────────────────
--
-- Без этого поля проверка ловит числа где угодно. Проверено на живых данных:
-- утверждение «стипендия CSC для бакалавриата — 2 500 юаней» совпало со
-- страницей тайского университета, потому что там есть «2,500» — доллары за
-- направление Arts. Китайская стипендия оказалась бы подтверждённой сайтом
-- Чулалонгкорна. Это ровно приёмочный тест PRD №8: «источник есть, но другая
-- программа, год или валюта — гейт блокирует».
alter table seo.sources
  add column if not exists subject_key text;

comment on column seo.sources.subject_key is
  'О каком предмете говорит источник: cn, th, bocconi. Утверждение проверяется только '
  'по источнику с тем же предметом. Пусто — источник общий, проверять по нему нельзя.';

-- Известный источник — страница Чулалонгкорна, предмет тот же, что у th-утверждений.
update seo.sources set subject_key = 'th' where domain = 'chula.ac.th' and subject_key is null;

-- ── Снимок источника ────────────────────────────────────────────────────────

alter table seo.source_snapshots
  add column if not exists final_url     text,
  add column if not exists content_type  text,
  add column if not exists bytes         int,
  add column if not exists fetch_error   text;

comment on column seo.source_snapshots.final_url is
  'Адрес после редиректов. Запрашивали одно, прочитали другое — и доказательством '
  'является именно то, что прочитали.';
comment on column seo.source_snapshots.fetch_error is
  'Почему снимок не снялся. Строка со снимком создаётся и при неудаче: молчание '
  'неотличимо от «не проверяли», а неудачная попытка — это наблюдение.';

-- ── Связь утверждения с источником ──────────────────────────────────────────

alter table seo.claim_sources
  add column if not exists claim_version int not null default 1,
  add column if not exists locator       text,
  add column if not exists method        text,
  add column if not exists checked_at    timestamptz not null default now();

comment on column seo.claim_sources.claim_version is
  'Версия утверждения, которую подтвердили. Правка утверждения не наследует '
  'подтверждение автоматически — в этом весь смысл.';
comment on column seo.claim_sources.locator is
  'Где в документе нашли: смещение, заголовок раздела, номер строки таблицы.';
comment on column seo.claim_sources.method is
  'exact_number — совпало число с единицей; exact_phrase — совпала формулировка; '
  'human — подтвердил человек. Способ важен: совпадение числа 25 в тексте про возраст '
  'и в тексте про количество мест — разные вещи, и способ показывает, что именно сверяли.';

-- ── Манифест доказательств (E2.4) ───────────────────────────────────────────
--
-- Набор версий утверждений и снимков, по которому писалась конкретная статья.
-- Без него нельзя ответить на вопрос «на чём это было основано», когда факт
-- уже изменился: утверждения перезаписаны, снимки новые, а статья та же.
create table if not exists seo.evidence_bundles (
  id           bigserial primary key,
  hash         text not null unique,     -- по составу: одинаковый состав даёт один манифест
  claim_refs   jsonb not null,           -- [{claim_id, version}]
  source_refs  jsonb not null,           -- [{snapshot_id, source_id}]
  created_at   timestamptz not null default now()
);

comment on table seo.evidence_bundles is
  'Слепок доказательной базы на момент написания. Хеш считается по составу, поэтому '
  'два одинаковых набора дают один манифест, а любое изменение состава — новый.';

create index if not exists claim_sources_claim on seo.claim_sources (claim_id, claim_version);
create index if not exists claims_unverified on seo.claims (status) where status = 'unverified';
create index if not exists snapshots_source on seo.source_snapshots (source_id, fetched_at desc);

commit;

-- Проверить:
--   select status, count(*) from seo.claims group by 1;
--   ожидается: unverified 19

