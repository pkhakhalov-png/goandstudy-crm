-- Кэш проверок: одна пара «версия утверждения × версия источника» проверяется
-- один раз (E2.6).
--
-- Почему это требование к стоимости, а не удобство. Проверка утверждения перед
-- выпуском вызывается не один раз: статью проверяют при сборке, при попытке
-- публикации, после правки соседнего абзаца и при каждом повторе после сбоя.
-- Входные данные при этом байт в байт те же — тот же текст утверждения, тот же
-- текст страницы. Платить за повтор не за что.
--
-- Ключ — четыре поля, и каждое обязано быть в ключе:
--   claim_id + claim_version — правка утверждения обязана сбросить результат,
--     иначе старое подтверждение тихо переедет на новый смысл;
--   source_id + content_hash — версия источника. Хеш считается по извлечённому
--     тексту, поэтому смена вёрстки без смены содержания кэш не сбрасывает,
--     а смена цифры на странице — сбрасывает;
--   checker — чем проверяли. Другая модель или другая версия промпта дают
--     другой ответ, и выдавать старый за новый нельзя.
--
-- Отрицательный результат кэшируется наравне с положительным. Именно он
-- повторяется чаще всего: заблокированная статья перепроверяется перед каждой
-- следующей попыткой выпуска.

begin;

create table if not exists seo.verification_cache (
  id            bigserial primary key,
  claim_id      bigint not null references seo.claims(id) on delete cascade,
  claim_version int    not null,
  source_id     bigint not null references seo.sources(id) on delete cascade,
  content_hash  text   not null,
  checker       text   not null,
  outcome       text   not null check (outcome in ('supports', 'not_found', 'refutes')),
  quote         text,
  locator       text,
  method        text,
  snapshot_id   bigint,
  cost_usd      numeric(12,6) not null default 0,
  hits          int    not null default 0,
  created_at    timestamptz not null default now(),
  last_hit_at   timestamptz,
  unique (claim_id, claim_version, source_id, content_hash, checker)
);

comment on table seo.verification_cache is
  'Результат проверки пары «версия утверждения × версия источника». Строка живёт, '
  'пока живы обе версии; изменилось любое — ключ другой, и проверка идёт заново.';

comment on column seo.verification_cache.content_hash is
  'Версия источника: sha256 извлечённого текста страницы. Не хеш HTML — переверстали '
  'страницу, содержание то же, перепроверять нечего.';

comment on column seo.verification_cache.checker is
  'Кто проверял и чем: code/v1, fact_reviewer/claude-opus-5/p3. Версия промпта в ключе, '
  'потому что новый промпт — это новая проверка, а не тот же ответ.';

comment on column seo.verification_cache.outcome is
  'supports — нашли дословное подтверждение; not_found — искали и не нашли; '
  'refutes — источник утверждению противоречит. not_found обязан храниться: '
  'иначе неподтверждённое утверждение оплачивается заново перед каждой попыткой выпуска.';

comment on column seo.verification_cache.cost_usd is
  'Во что обошлась сама проверка. Сумма по столбцу против суммы сэкономленного по hits — '
  'это и есть ответ на вопрос, окупается ли кэш.';

comment on column seo.verification_cache.hits is
  'Сколько раз ответ отдан из кэша. Ноль — проверку ни разу не повторяли.';

create index if not exists verification_cache_claim on seo.verification_cache (claim_id, claim_version);
create index if not exists verification_cache_source on seo.verification_cache (source_id, content_hash);

commit;

-- Проверить:
--   select count(*) from seo.verification_cache;
--   ожидается: 0 — таблица создана пустой, наполняется первой же проверкой
