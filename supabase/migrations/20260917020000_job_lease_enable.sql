-- Аренда задачи. Фаза enable: меняем правило возврата.
--
-- Применять ТОЛЬКО после 20260917010000 и только когда видно, что heartbeat
-- реально идёт: `select count(*) from seo.jobs where status='running' and
-- heartbeat_at > now() - interval '2 minutes'` должно быть больше нуля при
-- работающем воркере. Иначе новое правило вернёт в очередь всё разом.
--
-- Было: задача возвращается, если провисела в running дольше десяти минут.
-- Стало: задача возвращается, если её аренда истекла и heartbeat молчит дольше
-- отпущенного запаса. Долгий шаг, который подтверждает, что жив, не трогаем —
-- а именно из-за старого правила долгие шаги нельзя было ставить в очередь.
--
-- Откат без миграции: seo.settings.key='lease_recovery' → false. Тогда работает
-- прежнее правило по locked_at. Флаг читается на каждом вызове.

begin;

insert into seo.settings (key, value)
values ('lease_recovery', to_jsonb(true))
on conflict (key) do update set value = to_jsonb(true);

create or replace function seo.claim_jobs(p_worker text, p_limit int default 5, p_runner text default null)
returns setof seo.jobs
language plpgsql
as $$
declare
  v_conc    jsonb;
  v_ids     bigint[];
  v_lease   int;
  v_grace   int;
  v_by_lease boolean;
begin
  -- Каждое значение может отсутствовать строкой, а не значением: coalesce внутри
  -- запроса ловит только второе. Без подстраховки ниже правило возврата с NULL
  -- в запасе не вернуло бы ни одной задачи и молча перестало бы работать.
  select (value #>> '{}')::boolean into v_by_lease from seo.settings where key='lease_recovery';
  select (value #>> '{}')::int     into v_lease    from seo.settings where key='lease_seconds';
  select (value #>> '{}')::int     into v_grace    from seo.settings where key='heartbeat_grace_seconds';
  v_by_lease := coalesce(v_by_lease, false);
  v_lease    := coalesce(v_lease, 900);
  v_grace    := coalesce(v_grace, 120);

  if v_by_lease then
    -- Возвращаем только тех, у кого аренда кончилась И сердце молчит дольше
    -- запаса. Два условия, а не одно: аренда могла истечь за миг до продления,
    -- а свежий heartbeat — это прямое доказательство, что исполнитель работает.
    -- Задачи, выданные до этой миграции, аренды не имеют — для них остаётся
    -- прежняя мерка по locked_at, иначе они зависли бы навсегда.
    update seo.jobs
       set status='pending', locked_at=null, locked_by=null,
           lease_expires_at=null, attempts=attempts+1
     where status='running'
       and (
             (lease_expires_at is not null
              and lease_expires_at < now()
              and coalesce(heartbeat_at, locked_at) < now() - make_interval(secs => v_grace))
          or (lease_expires_at is null and locked_at < now() - interval '10 minutes')
           );
  else
    update seo.jobs
       set status='pending', locked_at=null, locked_by=null, attempts=attempts+1
     where status='running' and locked_at < now() - interval '10 minutes';
  end if;

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
     set status='running',
         locked_at=now(),
         locked_by=p_worker,
         heartbeat_at=now(),
         lease_expires_at = now() + make_interval(secs => v_lease),
         fencing_token = nextval('seo.job_fencing_seq')
   where j.id in (
     select id from seo.jobs
      where id = any(v_ids)
        and status = 'pending'
      order by priority, next_run_at, id
      for update skip locked
      limit p_limit
   )
   returning j.*;
end $$;

commit;
