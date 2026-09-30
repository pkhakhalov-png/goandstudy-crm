-- Кабинет куратора v2, миграция 014: расход на модель становится настоящим.
--
-- ЧТО БЫЛО НЕ ТАК. `care.job_kinds_budget` завели миграцией 006 с
-- комментарием «daily_budget_usd = 0 означает не расходовать». Читать эту
-- таблицу не умел никто: ни одного обращения к ней в коде. То есть потолок
-- существовал как обещание в комментарии, а не как ограничение.
--
-- Пока модель звали только из кабинета — по нажатию человека, по одному
-- вопросу — это было терпимо: расход виден в `assignments.cost_ledger`, и
-- больше, чем человек нажмёт, не потратится. Как только модель начинает
-- писать сообщения из очереди сама, обещание в комментарии перестаёт годиться:
-- зациклившееся задание тратит деньги, пока кто-нибудь не заметит счёт.
--
-- Здесь заводится журнал расхода по каждому вызову и функция «сколько
-- потрачено сегодня». Проверку перед вызовом делает код — `lib/care/ai/budget.ts`.
--
-- ПОЧЕМУ ЖУРНАЛ, А НЕ СЧЁТЧИК. Счётчик отвечает «сколько», журнал — «на что».
-- Когда дневной потолок упрётся, первый вопрос будет не «сколько», а «куда
-- ушло»: одно задание съело всё или тысяча мелких.
--
-- Откат: supabase/migrations/care/014_ai_spend.rollback.sql

begin;

create table care.ai_spend (
  id            uuid primary key default gen_random_uuid(),
  kind          text not null,
  model         text not null,
  tokens_in     int not null default 0,
  tokens_out    int not null default 0,
  usd           numeric(12, 6) not null default 0,
  case_id       uuid null references care.cases(id) on delete set null,
  job_id        uuid null references care.jobs(id) on delete set null,
  assignment_id uuid null references care.assignments(id) on delete set null,
  note          text null,
  created_at    timestamptz not null default now()
);

comment on table care.ai_spend is
  'Расход на модель по каждому вызову. Потолок из job_kinds_budget без этого журнала был обещанием в комментарии.';
comment on column care.ai_spend.usd is
  'Доллары, не центы: округление до цента вниз врёт в нашу пользу, а врать в свою пользу в учёте расходов нельзя.';

create index care_ai_spend_kind_day_idx on care.ai_spend (kind, created_at desc);

-- ── Сколько потрачено сегодня ───────────────────────────────────────────────
--
-- Сутки считаются по поясу из care.settings, а не по UTC: «сегодня» у
-- человека, который смотрит на счёт, начинается не в три часа ночи.

create or replace function care.spent_today(p_kind text)
returns numeric
language sql
stable
as $$
  select coalesce(sum(usd), 0)
    from care.ai_spend
   where kind = p_kind
     and (created_at at time zone coalesce(
           (select value #>> '{}' from care.settings where key = 'timezone'),
           'Europe/Moscow'))::date
         = (now() at time zone coalesce(
           (select value #>> '{}' from care.settings where key = 'timezone'),
           'Europe/Moscow'))::date
$$;

comment on function care.spent_today(text) is
  'Потрачено сегодня по виду работы, в долларах. Сутки — по care.settings.timezone.';

-- ── Потолки ─────────────────────────────────────────────────────────────────
--
-- Решение владельца от 30.09.2026. Числа выбраны по стоимости работы, а не
-- на глаз: одно напоминание — это примерно две тысячи токенов входа и полторы
-- сотни выхода, то есть около полутора центов. Три доллара в день — двести
-- сообщений; столько кураторов у нас нет и близко.
--
-- Потолок — не бюджет на расходование, а предохранитель. Упереться в него
-- значит, что что-то зациклилось, и это должно быть видно, а не оплачено.

insert into care.job_kinds_budget (kind, max_parallel, daily_budget_usd) values
  ('outbound', 1, 3.00)
on conflict (kind) do update set daily_budget_usd = excluded.daily_budget_usd, updated_at = now();

update care.job_kinds_budget set daily_budget_usd = 5.00, updated_at = now() where kind = 'extraction';

-- ── Доступ ──────────────────────────────────────────────────────────────────

alter table care.ai_spend enable row level security;
create policy care_app_all on care.ai_spend for all to care_app using (true) with check (true);
revoke all on care.ai_spend from anon, authenticated;
grant execute on function care.spent_today(text) to care_app;

commit;
