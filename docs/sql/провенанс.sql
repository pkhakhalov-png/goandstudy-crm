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
