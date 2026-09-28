-- Кабинет куратора v2, миграция 003: факты и их происхождение.
--
-- Что делает. Три таблицы: откуда мы что-то узнали (`sources`), что именно
-- узнали (`facts`) и где сведения разошлись (`fact_conflicts`).
--
-- ПОЧЕМУ ФАКТЫ ОТДЕЛЬНОЙ ТАБЛИЦЕЙ, А НЕ КОЛОНКАМИ В `cases`. Колонка хранит
-- одно значение и не помнит, откуда оно взялось. А куратору нужно ответить на
-- вопрос «почему тут написано 30 тысяч фунтов» через полгода после разговора,
-- и ответ «так в базе» не годится: бюджет мог назвать студент со слов
-- родителя, родитель мог поправить на встрече, а в переписке всплыть третья
-- цифра. Каждый факт хранит ссылку на источник и остаётся в истории, когда
-- его сменяет новый.
--
-- ПОЧЕМУ БЮДЖЕТ РАЗБИТ НА ПОЛЯ С ПЕРВОГО ДНЯ. «Бюджет 30 тысяч» — это не
-- факт, а недоразумение: неизвестно, входит ли туда проживание, за год это
-- или за всю программу, и в какой валюте. Поля `budget.tuition.max`,
-- `budget.living.max`, `budget.fees.max` с обязательными валютой и периодом
-- заставляют задать эти вопросы тогда, когда ответ ещё можно получить.
--
-- Откат: supabase/migrations/care/003_facts_and_sources.rollback.sql

begin;

-- ── Источники ───────────────────────────────────────────────────────────────
--
-- `ref` хранит ссылку на первоисточник в чужом контуре: идентификатор записи
-- разговора, сообщения, документа или адрес страницы. Ссылки по значению, без
-- внешнего ключа — источник может быть и вне базы.
--
-- `available` нужен, чтобы отличить «источника не было» от «источник был, но
-- запись удалена». Факт без доступного источника не становится ложным, но
-- проверить его уже нельзя, и куратор должен это видеть.

create table care.sources (
  id           uuid primary key default gen_random_uuid(),
  case_id      uuid null references care.cases(id) on delete cascade,
  kind         text not null check (kind in ('meeting', 'message', 'file', 'page', 'manual')),
  ref          jsonb not null default '{}'::jsonb,
  captured_at  timestamptz not null default now(),
  available    boolean not null default true,
  note         text null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

comment on table care.sources is
  'Откуда узнали. ref — ссылка по значению на запись разговора, сообщение, документ или адрес.';
comment on column care.sources.available is
  'false — первоисточник пропал. Факт остаётся, но проверить его нечем, и это видно куратору.';

create index care_sources_case_idx on care.sources (case_id) where case_id is not null;
create index care_sources_kind_idx on care.sources (kind, captured_at desc);

-- ── Факты ───────────────────────────────────────────────────────────────────
--
-- Жизнь факта: `draft` (модель предложила) → `confirmed` (куратор принял) или
-- `rejected`. Принятый факт перестаёт быть текущим, когда его сменяет новый:
-- тот ссылается на него через `supersedes`, а старый получает `superseded`.
-- Строки не переписываются и не удаляются — история остаётся целой.
--
-- `speaker` и `quote` обязательны для всего, что добыто из разговора: оценка
-- без опоры на реплику непроверяема, а непроверяемому через месяц перестают
-- верить. Справедливо перестают.
--
-- `is_plan` отделяет «сдам C1 в марте» от «у меня C1». Намерение, записанное
-- как результат, — самая дорогая ошибка извлечения: по ней подберут
-- программы, на которые человек не проходит.

create table care.facts (
  id            uuid primary key default gen_random_uuid(),
  case_id       uuid not null references care.cases(id) on delete cascade,
  field         text not null,
  value         jsonb not null,
  unit          text null,
  period        text null,
  currency      text null,
  is_plan       boolean not null default false,
  speaker       text null check (speaker in ('student', 'parent', 'curator', 'other')),
  quote         text null,
  source_id     uuid null references care.sources(id) on delete set null,
  version       int not null default 1,
  status        text not null default 'draft'
                  check (status in ('draft', 'confirmed', 'superseded', 'rejected')),
  confirmed_by  uuid null references care.members(id) on delete set null,
  confirmed_at  timestamptz null,
  supersedes    uuid null references care.facts(id) on delete set null,
  reject_reason text null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

comment on column care.facts.field is
  'Путь поля: budget.tuition.max, language.ielts.overall, intake.year. Бюджет разбит намеренно — «бюджет 30 тысяч» не факт.';
comment on column care.facts.is_plan is
  'true — это намерение («буду сдавать»), а не результат. В подбор такое не идёт.';
comment on column care.facts.quote is
  'Реплика, на которой стоит вывод. Без неё факт из разговора не принимается.';
comment on column care.facts.supersedes is
  'Какой факт этот сменил. Старый не удаляется, а получает статус superseded.';

-- Деньги без валюты — не сумма, а число. Ограничение ловит это на входе,
-- а не через полгода, когда окажется, что 30 000 были в рублях.
alter table care.facts add constraint care_facts_money_needs_currency
  check (field not like 'budget.%' or currency is not null);

create index care_facts_case_idx on care.facts (case_id, field);
-- Текущее значение поля — только одно. Частичный индекс и ищет быстро, и
-- показывает намерение: confirmed по одному полю должен быть один.
create unique index care_facts_current_uniq
  on care.facts (case_id, field) where status = 'confirmed';
create index care_facts_draft_idx on care.facts (case_id) where status = 'draft';

-- ── Расхождения ─────────────────────────────────────────────────────────────
--
-- Когда новый черновик спорит с принятым фактом, никто не выигрывает
-- автоматически. Строка сюда, решение — за куратором. Молчаливая замена
-- означала бы, что оговорка на встрече переписывает проверенные сведения.

create table care.fact_conflicts (
  id           uuid primary key default gen_random_uuid(),
  case_id      uuid not null references care.cases(id) on delete cascade,
  field        text not null,
  fact_a       uuid not null references care.facts(id) on delete cascade,
  fact_b       uuid not null references care.facts(id) on delete cascade,
  resolved_by  uuid null references care.members(id) on delete set null,
  resolved_at  timestamptz null,
  resolution   text null check (resolution in ('kept_a', 'kept_b', 'both_wrong', 'need_ask')),
  note         text null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index care_fact_conflicts_open_idx
  on care.fact_conflicts (case_id) where resolved_at is null;

-- ── Триггеры отметки времени ────────────────────────────────────────────────

create trigger care_sources_touch before update on care.sources
  for each row execute function care.touch_updated_at();
create trigger care_facts_touch before update on care.facts
  for each row execute function care.touch_updated_at();
create trigger care_fact_conflicts_touch before update on care.fact_conflicts
  for each row execute function care.touch_updated_at();

-- ── Доступ ──────────────────────────────────────────────────────────────────

alter table care.sources enable row level security;
alter table care.facts enable row level security;
alter table care.fact_conflicts enable row level security;

create policy care_app_all on care.sources        for all to care_app using (true) with check (true);
create policy care_app_all on care.facts          for all to care_app using (true) with check (true);
create policy care_app_all on care.fact_conflicts for all to care_app using (true) with check (true);

revoke all on care.sources, care.facts, care.fact_conflicts from anon, authenticated;

commit;
