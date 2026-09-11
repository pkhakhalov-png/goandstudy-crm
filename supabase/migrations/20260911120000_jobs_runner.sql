-- Маршрутизация задач по исполнителю.
--
-- Было: любой воркер брал любую задачу, и если она ему не по силам — возвращал
-- в очередь. Публикацию в тему первым забирал Vercel, ронял её на отсутствии
-- ssh, и статья не выходила, хотя рядом стоял агент, который умеет.
-- Возврат остаётся страховкой, но перестаёт быть способом маршрутизации.
--
-- 'any'    — может выполнить любой воркер
-- 'vercel' — только воркер CRM (нужны ключи моделей и внешних API)
-- 'agent'  — только агент на сервере WordPress (нужен доступ к файлам темы)

begin;

alter table seo.jobs
  add column if not exists runner text not null default 'any';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'jobs_runner_check') then
    alter table seo.jobs add constraint jobs_runner_check
      check (runner in ('any', 'vercel', 'agent'));
  end if;
end $$;

-- Задачам, которые уже стоят в очереди, проставим исполнителя по шагу
update seo.jobs
   set runner = 'agent'
 where runner = 'any'
   and step in ('article_publish_blog', 'link_insert_theme')
   and status in ('pending', 'waiting', 'running');

create index if not exists jobs_runner_status_idx on seo.jobs (runner, status, next_run_at);

-- ── Выдача задач с учётом исполнителя ───────────────────────────────────────
--
-- Важно: новая функция с третьим аргументом НЕ заменяет старую с двумя, а
-- становится второй перегрузкой. Третий аргумент со значением по умолчанию
-- делает вызов с двумя аргументами подходящим обеим — и Postgres откажется
-- выбирать: «function is not unique». Поэтому старую снимаем явно.
--
-- Порядок безопасен: выложенный код сначала пробует вызов с тремя аргументами,
-- и после этой миграции он сработает. Окно, в котором ни та ни другая не
-- отвечает, — доли секунды внутри транзакции; воркер в этом случае просто
-- пропустит один проход и придёт через минуту.
drop function if exists seo.claim_jobs(text, int);

create or replace function seo.claim_jobs(p_worker text, p_limit int default 5, p_runner text default null)
returns setof seo.jobs
language plpgsql
as $$
declare
  v_conc jsonb;
  v_ids  bigint[];
begin
  -- авторазблокировка зависших running (> 10 минут) → pending, attempts+1
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
      order by priority, next_run_at, id
      for update skip locked
      limit p_limit
   )
   returning j.*;
end $$;

commit;
