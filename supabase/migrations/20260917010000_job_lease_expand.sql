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
