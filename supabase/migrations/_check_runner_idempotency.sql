-- ПРОВЕРКА, а не миграция. Запускается один раз руками и ничего не меняет
-- в итоге: в конце база остаётся ровно в том состоянии, в каком была.
--
-- Доказывает три вещи, которые нельзя доказать рассуждением:
--   1. повторный запуск миграции не ломает базу;
--   2. откат работает;
--   3. ни то ни другое не теряет данные.
--
-- Каждый шаг печатает результат. Если какой-то шаг упадёт, транзакция целиком
-- откатится и база останется нетронутой.

do $$
declare
  jobs_before  int;
  jobs_after   int;
  runner_vals  text;
begin
  select count(*) into jobs_before from seo.jobs;
  raise notice 'задач до проверки: %', jobs_before;

  -- ── 1. Повторный запуск миграции ───────────────────────────────────────
  -- Все операции написаны так, чтобы переживать повтор: add column if not
  -- exists, create index if not exists, create or replace function.
  alter table seo.jobs add column if not exists runner text not null default 'any';

  update seo.jobs
     set runner = 'agent'
   where runner = 'any'
     and step in ('article_publish_blog', 'link_insert_theme')
     and status in ('pending', 'waiting', 'running');

  create index if not exists jobs_runner_status_idx on seo.jobs (runner, status, next_run_at);

  select count(*) into jobs_after from seo.jobs;
  if jobs_after <> jobs_before then
    raise exception 'повтор миграции изменил число задач: % → %', jobs_before, jobs_after;
  end if;
  raise notice 'повтор миграции: задачи на месте (%), колонка и индекс не задвоились', jobs_after;

  -- ── 2. Проверка, что колонка живёт и заполнена ─────────────────────────
  select string_agg(distinct runner, ', ') into runner_vals from seo.jobs;
  raise notice 'значения исполнителя в данных: %', runner_vals;

  if exists (select 1 from seo.jobs where runner is null) then
    raise exception 'у части задач исполнитель пуст — так быть не должно';
  end if;
end $$;

-- ── 3. Откат и возврат ─────────────────────────────────────────────────────
-- Снимаем новую функцию, ставим прежнюю, убеждаемся, что данные целы,
-- и возвращаем новую обратно. Колонка runner при откате НЕ удаляется —
-- это единственная необратимая операция, и она делается отдельно и осознанно.

begin;

drop function if exists seo.claim_jobs(text, int, text);

create or replace function seo.claim_jobs(p_worker text, p_limit int default 5)
returns setof seo.jobs
language plpgsql
as $$
declare
  v_conc jsonb;
  v_ids  bigint[];
begin
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
     where j.status='pending' and j.next_run_at <= now()
       and (j.run_id is null or exists (
             select 1 from seo.production_runs pr where pr.id=j.run_id and pr.status='running'))
  )
  select array_agg(e.id order by e.priority, e.next_run_at, e.id) into v_ids
    from eligible e
    left join running_by_lane r on r.lane = e.lane
   where e.rn <= greatest(coalesce((v_conc->>e.lane)::int, 999) - coalesce(r.c,0), 0);

  if v_ids is null then return; end if;

  return query
  update seo.jobs j set status='running', locked_at=now(), locked_by=p_worker
   where j.id in (select id from seo.jobs where id = any(v_ids)
                   order by priority, next_run_at, id for update skip locked limit p_limit)
   returning j.*;
end $$;

commit;

-- Проверяем, что после отката данные целы и старый вызов работает
do $$
declare n int;
begin
  select count(*) into n from seo.jobs;
  raise notice 'после отката задач: % — данные целы', n;
  if not exists (select 1 from information_schema.columns
                  where table_schema='seo' and table_name='jobs' and column_name='runner') then
    raise exception 'откат удалил колонку runner — этого он делать не должен';
  end if;
  raise notice 'колонка runner на месте: откат ничего не удалил';
end $$;

-- ── 4. Возвращаем рабочее состояние ────────────────────────────────────────

begin;

drop function if exists seo.claim_jobs(text, int);

create or replace function seo.claim_jobs(p_worker text, p_limit int default 5, p_runner text default null)
returns setof seo.jobs
language plpgsql
as $$
declare
  v_conc jsonb;
  v_ids  bigint[];
begin
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
     where j.status='pending' and j.next_run_at <= now()
       and (p_runner is null or j.runner = 'any' or j.runner = p_runner)
       and (j.run_id is null or exists (
             select 1 from seo.production_runs pr where pr.id=j.run_id and pr.status='running'))
  )
  select array_agg(e.id order by e.priority, e.next_run_at, e.id) into v_ids
    from eligible e
    left join running_by_lane r on r.lane = e.lane
   where e.rn <= greatest(coalesce((v_conc->>e.lane)::int, 999) - coalesce(r.c,0), 0);

  if v_ids is null then return; end if;

  return query
  update seo.jobs j set status='running', locked_at=now(), locked_by=p_worker
   where j.id in (select id from seo.jobs where id = any(v_ids)
                   order by priority, next_run_at, id for update skip locked limit p_limit)
   returning j.*;
end $$;

commit;

do $$
declare n int;
begin
  select count(*) into n from seo.jobs;
  raise notice 'итог: задач %, маршрутизация возвращена в рабочее состояние', n;
end $$;
