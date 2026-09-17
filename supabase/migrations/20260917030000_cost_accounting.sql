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
