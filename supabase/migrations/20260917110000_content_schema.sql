-- Схема content: пакеты, варианты, каналы, публикации (E4.1).
--
-- Что здесь появляется и чего до сих пор не было. Сегодня статья доходит до
-- сайта и на этом всё заканчивается. Нет понятия «пакет» — материала, который
-- живёт неделю-другую в разных форматах; нет каналов; нет публикаций; нет
-- отложенного выпуска. Из-за этого отчёт «Результат» не может сказать, что
-- принёс конкретный пост: приписывать переход не к чему.
--
-- Три отступления от списка таблиц в PRD, и каждое сделано намеренно.
--
-- 1. `evidence_bundles`, `runs`, `budget_reservations`, `cost_ledger` здесь НЕ
--    создаются. Они уже есть в схеме seo и работают: в cost_ledger лежат живые
--    проводки, в evidence_bundles — манифесты доказательств. Завести вторые
--    такие же значило бы получить два учёта расходов и два ответа на вопрос
--    «сколько мы потратили». PRD в своих же инвариантах требует одной очереди
--    и одного реестра фактов — здесь ровно тот случай. Ссылки идут в seo.
--
-- 2. `metrics_daily` создаётся здесь, а не в seo: это метрики публикаций, а не
--    статей, и живут они по другому ключу.
--
-- 3. `assets`, `variant_assets`, `consents`, `ai_visibility_runs` создаются
--    пустыми и в MVP не используются — так прямо сказано в PRD. Создаются
--    затем, чтобы позже не пришлось менять форму соседних таблиц.
--
-- Доступ. Схема закрыта так же, как seo: права только у service_role, из
-- браузера её не видно. Проверено анонимным ключом — seo отвечает «permission
-- denied for schema», и content будет отвечать так же. Использование
-- service_role сервером остаётся риском, он записан в ADR-0005 с планом
-- сужения до отдельных ролей воркеров.

begin;

create schema if not exists content;

-- ── Пакет: материал, а не статья ────────────────────────────────────────────
--
-- Пакет может не иметь SEO-статьи: кейс клиента или ручная тема — такой же
-- материал. PRD допускает это прямо, но с тем же манифестом доказательств и
-- тем же гейтом: происхождение факта не зависит от того, кто завёл тему.

create table if not exists content.packages (
  id                 bigserial primary key,
  seo_article_id     bigint,                    -- в схеме seo; может быть пусто
  topic_id           bigint,
  current_version_id bigint,
  intent             text,
  audience           text,
  language           text not null default 'ru',
  status             text not null default 'draft'
                     check (status in ('draft', 'verified', 'scheduled', 'published', 'superseded', 'blocked')),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

comment on table content.packages is
  'Материал, живущий 7–14 дней в разных форматах. Не статья: у пакета может не быть '
  'SEO-статьи вовсе — кейс или ручная тема проходят тот же гейт достоверности.';

create table if not exists content.package_versions (
  id                     bigserial primary key,
  package_id             bigint not null references content.packages(id) on delete cascade,
  version                int not null,
  source_article_version int,
  source_hash            text,
  evidence_bundle_id     bigint,                -- seo.evidence_bundles
  body                   text,
  content_hash           text not null,
  created_at             timestamptz not null default now(),
  unique (package_id, version)
);

comment on table content.package_versions is
  'Неизменяемая версия пакета. Правка создаёт новую строку, а не меняет старую: '
  'иначе нельзя ответить, что именно было опубликовано в прошлый вторник.';
comment on column content.package_versions.evidence_bundle_id is
  'Манифест доказательств из seo.evidence_bundles. Второй такой таблицы здесь нет '
  'намеренно: манифест один на всю систему, иначе «на чём это основано» имеет два ответа.';

-- Правка версии запрещена на уровне базы, а не договорённости.
create or replace function content.versions_are_immutable() returns trigger
language plpgsql as $$
begin
  raise exception 'версия пакета неизменяема: создайте новую версию (пакет %, версия %)',
    old.package_id, old.version;
end $$;

drop trigger if exists package_versions_immutable on content.package_versions;
create trigger package_versions_immutable
  before update or delete on content.package_versions
  for each row execute function content.versions_are_immutable();

-- ── Вариант: один материал под разные площадки ──────────────────────────────

create table if not exists content.variants (
  id                 bigserial primary key,
  package_id         bigint not null references content.packages(id) on delete cascade,
  format             text not null check (format in ('article', 'social_post')),
  locale             text not null default 'ru',
  editorial_angle    text,
  current_version_id bigint,
  created_at         timestamptz not null default now()
);

comment on column content.variants.format is
  'В MVP только article и social_post. Остальные десять форматов описаны в v1.1 '
  'и не реализуются — ограничение стоит здесь, чтобы это не обходилось молча.';
comment on column content.variants.editorial_angle is
  'Под каким углом взят материал на этой площадке. Адаптация меняет угол и глубину, '
  'а не синонимы: пересказ теми же словами — не адаптация, а дубль.';

create table if not exists content.variant_versions (
  id                 bigserial primary key,
  variant_id         bigint not null references content.variants(id) on delete cascade,
  version            int not null,
  package_version_id bigint references content.package_versions(id),
  body_json          jsonb not null,
  claim_refs         jsonb,
  content_hash       text not null,
  prompt_version     text,
  created_at         timestamptz not null default now(),
  unique (variant_id, version)
);

comment on column content.variant_versions.claim_refs is
  'Какие утверждения и каких версий пошли в этот текст. Без этого правка факта '
  'не находит посты, которые на нём стоят.';

-- ── Проверки ────────────────────────────────────────────────────────────────

create table if not exists content.reviews (
  id             bigserial primary key,
  target_type    text not null check (target_type in ('package_version', 'variant_version')),
  target_id      bigint not null,
  target_version int,
  target_hash    text,
  provider       text not null,
  model          text not null,
  prompt_version text,
  verdict        text not null check (verdict in ('supported', 'contradicted', 'insufficient', 'stale', 'passed', 'failed')),
  findings_json  jsonb,
  run_id         bigint,                        -- seo.runs
  created_at     timestamptz not null default now()
);

comment on column content.reviews.target_hash is
  'Хеш проверенного содержимого. Правка текста меняет хеш, и старое одобрение '
  'перестаёт относиться к тому, что лежит сейчас, — это требование гейта E4.';

-- ── Каналы ──────────────────────────────────────────────────────────────────

create table if not exists content.channel_policies (
  id            bigserial primary key,
  name          text not null,
  version       int not null default 1,
  formats       text[] not null default '{}',
  caps          jsonb,
  review_depth  text,
  allowed_topics text[],
  budget_caps   jsonb,
  created_at    timestamptz not null default now(),
  unique (name, version)
);

create table if not exists content.channels (
  id                    bigserial primary key,
  platform              text not null check (platform in ('telegram', 'vk')),
  account_external_id   text not null,
  title                 text,
  timezone              text not null default 'Europe/Moscow',
  mode                  text not null default 'paused' check (mode in ('active', 'paused', 'stopped')),
  policy_id             bigint references content.channel_policies(id),
  capabilities_version  int not null default 1,
  secret_ref            text,
  created_at            timestamptz not null default now(),
  unique (platform, account_external_id)
);

comment on column content.channels.timezone is
  'IANA-зона аккаунта. Время хранится в UTC, зона — отдельно: «в девять утра» '
  'без зоны это не время, а намерение.';
comment on column content.channels.mode is
  'Новый канал заводится приостановленным. Включение — отдельное действие человека, '
  'а не побочный эффект создания.';
comment on column content.channels.secret_ref is
  'Ссылка на секрет, а не секрет. В интерфейс не отдаётся ни при каких условиях.';

create table if not exists content.connector_capabilities (
  id                bigserial primary key,
  platform          text not null,
  account_external_id text,
  verified_formats  text[] not null default '{}',
  verified_actions  text[] not null default '{}',
  docs_url          text,
  checked_at        timestamptz,
  proof_ref         text,
  unique (platform, account_external_id)
);

comment on table content.connector_capabilities is
  'Что площадка умеет НА САМОМ ДЕЛЕ, проверенное вызовом, а не вычитанное в документации. '
  'proof_ref — ссылка на тот самый успешный вызов. Без этого «поддерживает ссылки» '
  'означает «мы так думаем».';

-- ── Публикации ──────────────────────────────────────────────────────────────

create table if not exists content.publications (
  id                 bigserial primary key,
  channel_id         bigint not null references content.channels(id),
  variant_version_id bigint not null references content.variant_versions(id),
  scheduled_at       timestamptz not null,
  status             text not null default 'scheduled'
                     check (status in ('scheduled', 'publishing', 'published', 'failed', 'superseded', 'cancelled')),
  idempotency_key    text not null,
  remote_id          text,
  remote_url         text,
  last_verified_at   timestamptz,
  channel_policy_version_snapshot jsonb,
  /* Ссылка в посте кликабельна. Пусто — не знаем, и это не «да». */
  link_clickable     boolean,
  created_at         timestamptz not null default now(),
  unique (channel_id, idempotency_key)
);

comment on column content.publications.idempotency_key is
  'Ключ, по которому повтор не создаёт вторую публикацию. Уникален в пределах канала: '
  'десять повторов события дают одну публикацию — это гейт этапа.';
comment on column content.publications.channel_policy_version_snapshot is
  'Снимок политики канала на момент планирования. Политику потом поменяют, а вопрос '
  '«по каким правилам это вышло» задают уже после.';
comment on column content.publications.link_clickable is
  'Была ли ссылка в посте кликабельной. NULL — неизвестно, и это не то же самое, что false. '
  'Переходы приписываются публикации только при true: если площадка ссылку не отдала, '
  'приписывать ей переходы значит выдумывать результат.';

create table if not exists content.publication_attempts (
  id                  bigserial primary key,
  publication_id      bigint not null references content.publications(id) on delete cascade,
  attempt             int not null,
  request_hash        text,
  phase               text not null,
  provider_request_id text,
  result              text,
  error               text,
  started_at          timestamptz not null default now(),
  finished_at         timestamptz,
  unique (publication_id, attempt)
);

comment on table content.publication_attempts is
  'Каждая попытка отправки со своим следом. phase нужен, чтобы отличить «не отправили» '
  'от «отправили и не узнали ответ»: во втором случае повтор создаёт второй пост.';

-- ── Событийный мост ─────────────────────────────────────────────────────────

create table if not exists content.outbox_events (
  id           bigserial primary key,
  event_id     uuid not null unique,
  topic        text not null,
  payload      jsonb not null,
  created_at   timestamptz not null default now(),
  processed_at timestamptz
);

comment on table content.outbox_events is
  'Событие пишется в одной транзакции с тем, что его породило. Иначе бывает результат '
  'без события (пакет не создастся) или событие без результата (создастся из воздуха).';

create table if not exists content.event_receipts (
  consumer     text not null,
  event_id     uuid not null,
  processed_at timestamptz not null default now(),
  primary key (consumer, event_id)
);

comment on table content.event_receipts is
  'Кто какое событие уже обработал. Повтор события десять раз создаёт один пакет '
  'именно благодаря этой таблице, а не осторожности кода.';

-- ── Метрики, внимание, аудит ────────────────────────────────────────────────

create table if not exists content.metrics_daily (
  id                 bigserial primary key,
  publication_id     bigint references content.publications(id) on delete cascade,
  date               date not null,
  metric             text not null,
  source             text not null,
  value              numeric,
  completeness       text not null default 'unknown'
                     check (completeness in ('complete', 'partial', 'unavailable', 'unknown')),
  provider_of_record text,
  value_revision     int not null default 1,
  fetched_at         timestamptz not null default now(),
  unique (publication_id, date, metric, source, value_revision)
);

comment on column content.metrics_daily.completeness is
  'unavailable — метрику не отдали. Это НЕ ноль. Ноль означает «показали ноль раз», '
  'а недоступность означает «мы не знаем», и в отчёте это разные строки.';
comment on column content.metrics_daily.value_revision is
  'Площадки задним числом правят цифры. Новая ревизия — новая строка, старая остаётся: '
  'иначе вчерашний отчёт нельзя воспроизвести.';
comment on column content.metrics_daily.provider_of_record is
  'Чьё число считается верным, когда их два. Без этого поля спор решается тем, '
  'кто последним записал.';

create table if not exists content.attention_items (
  id               bigserial primary key,
  reason_code      text not null,
  severity         text not null default 'medium' check (severity in ('low', 'medium', 'high')),
  entity_type      text,
  entity_id        bigint,
  entity_version   int,
  owner            text,
  suggested_action text,
  resolution       text,
  opened_at        timestamptz not null default now(),
  resolved_at      timestamptz
);

comment on table content.attention_items is
  'Очередь внимания: то, что не блокирует, но и не должно молча исчезнуть. '
  'Разногласие двух проверок попадает сюда, а не усредняется.';

create table if not exists content.audit_events (
  id            bigserial primary key,
  actor         text,
  operation     text not null,
  entity_type   text,
  entity_id     bigint,
  previous_hash text,
  new_hash      text,
  trace_id      text,
  created_at    timestamptz not null default now()
);

-- ── Заведены структурно, в MVP не используются ──────────────────────────────

create table if not exists content.assets (
  id bigserial primary key, kind text, url text, meta jsonb, created_at timestamptz not null default now()
);
create table if not exists content.variant_assets (
  variant_version_id bigint, asset_id bigint, role text, primary key (variant_version_id, asset_id)
);
create table if not exists content.consents (
  id bigserial primary key, subject text, scope text, granted_at timestamptz, revoked_at timestamptz
);
create table if not exists content.ai_visibility_runs (
  id bigserial primary key, query text, engine text, result jsonb, checked_at timestamptz
);

comment on table content.assets is
  'Заведена структурно и в MVP не используется — так сказано в PRD. Создаётся сейчас, '
  'чтобы позже не менять форму соседних таблиц.';

-- ── Индексы ─────────────────────────────────────────────────────────────────

create index if not exists publications_scheduled on content.publications (scheduled_at)
  where status in ('scheduled', 'publishing');
create index if not exists publications_remote on content.publications (remote_id)
  where remote_id is not null;
create index if not exists publications_channel on content.publications (channel_id, scheduled_at desc);
create index if not exists attention_open on content.attention_items (severity, opened_at)
  where resolved_at is null;
create index if not exists outbox_unprocessed on content.outbox_events (created_at)
  where processed_at is null;
create index if not exists packages_article on content.packages (seo_article_id)
  where seo_article_id is not null;
create index if not exists metrics_pub_date on content.metrics_daily (publication_id, date desc);

-- Один пакет на версию статьи. Повтор события упирается сюда, а не в аккуратность кода.
create unique index if not exists packages_one_per_article_version
  on content.package_versions (package_id, source_article_version)
  where source_article_version is not null;

-- ── Права ───────────────────────────────────────────────────────────────────
--
-- Из браузера схема не видна: прав у anon и authenticated нет вовсе, поэтому
-- ответ будет «permission denied for schema content» — так же, как сейчас
-- отвечает seo.

grant usage on schema content to service_role;
grant all privileges on all tables    in schema content to service_role;
grant all privileges on all sequences in schema content to service_role;

alter default privileges in schema content grant all on tables to service_role;
alter default privileges in schema content grant all on sequences to service_role;

commit;

-- Проверить:
--   select count(*) from information_schema.tables where table_schema = 'content';
--   ожидается: 19
--
-- ПОСЛЕ ЭТОГО нужно одно действие в панели, которого SQL не делает:
--   Settings → API → Exposed schemas → добавить content (рядом с public и seo).
-- Без этого сервер получит «The schema must be one of the following», а браузер
-- как не видел схему, так и не увидит: наружу её открывают не права, а этот список,
-- и права остаются закрытыми для anon в любом случае.
