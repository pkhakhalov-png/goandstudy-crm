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
