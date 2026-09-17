-- E3: утверждения из опубликованного архива — откуда они и где именно (E3.2).
--
-- Зачем. Ревизия архива нашла 685 утверждений без подтверждения в 84 статьях,
-- которые вышли до появления гейта достоверности. Чтобы с ними можно было
-- работать, а не перечитывать отчёт, каждое должно лечь в seo.claims — со
-- ссылкой на страницу и точным местом в тексте.
--
-- Сейчас claims не знает ни того, ни другого: он заводился под утверждения,
-- которые приходят из источников, а не из наших же статей.
--
-- Про article_id и page_id. В задании названа одна колонка — article_id. Её
-- мало: seo.articles знает только восемь статей конвейера, а восемьдесят
-- легаси-статей живут в seo.pages и строки в articles не имеют вовсе. Поэтому
-- колонки две, и ровно одна из них будет заполнена: article_id для статей
-- конвейера, page_id для архива. Без page_id утверждения из архива пришлось бы
-- привязывать к несуществующей статье или ни к чему.
--
-- Про body_offset. Это смещение в теле статьи — в том HTML, который читала
-- ревизия (контейнер содержимого страницы, без шапки и подвала). Проверяется
-- срезом: по смещению стоит ровно найденная фраза. Утверждение без места — это
-- мнение, а не находка, поэтому колонка и нужна.
--
-- Применять в SQL Editor проекта pxtwaxhmygnssyyowrgr. Повторный запуск
-- безопасен. После применения запускать:
--   npx tsx scripts/seo-legacy-audit.ts --import

-- ── 1. Откуда утверждение и где именно ──────────────────────────────────────

alter table seo.claims add column if not exists article_id  bigint references seo.articles(id) on delete set null;
alter table seo.claims add column if not exists page_id     bigint references seo.pages(id)    on delete set null;
alter table seo.claims add column if not exists body_offset int;

comment on column seo.claims.article_id is
  'Статья конвейера, из которой взято утверждение. Для архива пусто — там page_id.';
comment on column seo.claims.page_id is
  'Страница сайта, из которой взято утверждение. Так размечен опубликованный архив.';
comment on column seo.claims.body_offset is
  'Смещение утверждения в теле статьи. По нему стоит ровно найденная фраза — проверяется срезом.';

create index if not exists claims_page   on seo.claims (page_id)    where page_id is not null;
create index if not exists claims_articl on seo.claims (article_id) where article_id is not null;

-- ── 2. Повторный прогон ревизии не должен плодить дубли ─────────────────────
--
-- Ревизию будут запускать ещё: статьи правятся, находки уходят и появляются.
-- Ключ — страница, вид утверждения и место в тексте. По самой формулировке ключ
-- не сделать: statement бывает длиннее, чем влезает в btree, а хэш от неё
-- PostgREST не умеет указывать в on_conflict, то есть скрипту он бесполезен.
--
-- Если статью перепишут и абзац сдвинется, появится новая строка, а прежняя
-- останется со старым смещением. Это честно: старая находка относилась к
-- прежнему тексту, и затирать её новой — значит потерять историю.
create unique index if not exists claims_from_page_unique
  on seo.claims (page_id, kind, body_offset)
  where page_id is not null;

-- ── 3. Виды утверждений, которых ещё нет в словаре ──────────────────────────
--
-- claims.kind ссылается на claim_policy.kind. Ревизия размечает находки видами
-- promise и work_rights — их в словаре нет, и вставка упадёт на внешнем ключе.
-- Те же две строки лежат в docs/sql/семантические-виды-утверждений.sql; если
-- тот файл уже применён, эта вставка ничего не сделает.
insert into seo.claim_policy (kind, required_kinds, preferred_kinds, default_ttl, autopilot_ok)
values
  ('promise',     array['internal_expert'], array['internal_expert'],          interval '90 days',  false),
  ('work_rights', array['official_gov'],    array['official_gov', 'ministry'], interval '180 days', false)
on conflict (kind) do nothing;

-- ── Проверка ────────────────────────────────────────────────────────────────
-- select kind, count(*), min(body_offset), max(body_offset)
--   from seo.claims where page_id is not null group by kind order by count(*) desc;
--
-- Сколько статей архива размечено:
-- select count(distinct page_id) from seo.claims where page_id is not null;
