-- ═══════════════════════════════════════════════════════════════════════════
-- ПРИМЕНИТЬ СЕЙЧАС — четыре миграции подряд, в этом порядке.
--
-- Куда:  Supabase → проект goandstudy → SQL Editor → New query
--        Вставить всё содержимое этого файла и нажать Run.
--
-- Каждая миграция обёрнута в свою транзакцию. Если одна не пройдёт, она
-- откатится целиком, а следующие не выполнятся — наполовину применённого состояния
-- не будет. Ошибку пришли мне, разберу.
--
-- Пятая миграция (20260917020000_job_lease_enable.sql) в этот файл НЕ входит
-- намеренно: она переключает правило возврата задач, и включать её можно
-- только после проверки, что воркеры реально подтверждают, что живы.
-- ═══════════════════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────────────────
-- ФАЙЛ: 20260917000000_claim_jobs_no_double.sql
-- ─────────────────────────────────────────────────────────────────────────

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


-- ─────────────────────────────────────────────────────────────────────────
-- ФАЙЛ: 20260917010000_job_lease_expand.sql
-- ─────────────────────────────────────────────────────────────────────────

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


-- ─────────────────────────────────────────────────────────────────────────
-- ФАЙЛ: 20260917030000_cost_accounting.sql
-- ─────────────────────────────────────────────────────────────────────────

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


-- ─────────────────────────────────────────────────────────────────────────
-- ФАЙЛ: 20260917040000_model_pricing_seed.sql
-- ─────────────────────────────────────────────────────────────────────────

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

