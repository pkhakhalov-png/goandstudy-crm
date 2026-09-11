-- Откат маршрутизации по исполнителю.
--
-- Возвращает прежнюю функцию с двумя аргументами и снимает новую. Колонку
-- runner НЕ удаляем: она никому не мешает, а её удаление — единственная
-- необратимая операция во всей миграции. Если нужно убрать и её, делать это
-- отдельно и осознанно: alter table seo.jobs drop column runner;

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
     where j.status='pending'
       and j.next_run_at <= now()
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
