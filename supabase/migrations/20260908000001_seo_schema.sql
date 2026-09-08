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
  deal_id          bigint,          -- public.deals.id, проставляется ночной сшивкой
  client_id        bigint,
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
