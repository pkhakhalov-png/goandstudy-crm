-- Кабинет куратора v2, миграция 029: что это было за сообщение.
--
-- ЧЕГО НЕ ХВАТАЛО. Разбор переписки достаёт из сообщений факты — страну,
-- бюджет, сроки. Но клиент пишет не только факты. Он пишет «а когда дедлайн в
-- Мюнхене?» — и в этом вопросе нет ни одного факта о клиенте, поэтому разбор
-- проходит мимо. Вопрос остаётся в чате, куратор его не видит, и клиент ждёт.
--
-- Неотвеченный вопрос — самое дорогое молчание в этой работе: он не горит, ни
-- о чём не напоминает и обнаруживается, когда человек уходит к другим.
--
-- ЧТО КЛАДЁМ. По строке на разобранное сообщение: чем оно оказалось, о чём, и
-- какой задачей мы на него ответили. Задача — это то, у чего есть срок;
-- пометка «был вопрос» без задачи ничего не меняет.
--
-- ПОЧЕМУ ОТДЕЛЬНАЯ ТАБЛИЦА, А НЕ ПОЛЕ В СООБЩЕНИИ. Сообщения приходят в
-- `care.inbound_events` сырыми, как их прислал мессенджер, и дописывать в них
-- наши выводы значит смешивать то, что было сказано, с тем, что мы об этом
-- подумали. Первое — свидетельство, второе — мнение.
--
-- ПОЧЕМУ `unique (message_id)`. Разбор идёт по расписанию и повторяется. Без
-- этого каждый прогон заводил бы новую задачу «Ответить клиенту» на тот же
-- вопрос — и очередь куратора засыпало бы копиями одного и того же.
--
-- Откат: supabase/migrations/care/029_message_triage.rollback.sql

begin;

create table if not exists care.message_triage (
  id          uuid primary key default gen_random_uuid(),
  case_id     uuid not null references care.cases(id) on delete cascade,
  -- uuid, как в `care.case_messages`: там это идентификатор входящего события.
  -- Сначала был `text` — соединение по нему валило всю функцию расписания
  -- ошибкой «operator does not exist: text = uuid», и видно это стало только
  -- при живом вызове, потому что миграция применяется, а падает выполнение.
  message_id  uuid not null,
  kind        text not null
                check (kind in ('question', 'document', 'terms', 'other')),
  -- О чём это, одной строкой — чтобы куратор понял, не открывая чат.
  about       text null,
  -- Точные слова. Без них «клиент спрашивал про сроки» проверяется только
  -- пересказом, то есть не проверяется.
  quote       text null,
  task_id     uuid null references care.tasks(id) on delete set null,
  created_at  timestamptz not null default now(),
  unique (message_id)
);

create index if not exists care_message_triage_case_idx
  on care.message_triage (case_id, created_at desc);

alter table care.message_triage enable row level security;
revoke all on care.message_triage from anon, authenticated;
create policy care_app_all on care.message_triage for all to care_app using (true) with check (true);
grant select, insert, update, delete on care.message_triage to care_app;

commit;
