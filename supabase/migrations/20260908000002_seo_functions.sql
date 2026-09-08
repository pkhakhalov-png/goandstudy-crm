-- ═══════════════════════════════════════════════════════════════════════════
-- SEO functions (PRD v1.2, 7.12 / 8.6 / 10.2): normalize_url, claim_jobs,
-- complete_job (fan-in), v_page_deals.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Нормализация URL (7.1.1). Postgres-эквивалент для сверки с TS-версией. ────
-- p_strip_query = true для page_type='article' (query удаляется целиком).
create or replace function seo.normalize_url(p_url text, p_strip_query boolean default false)
returns text
language plpgsql
immutable
as $$
declare
  v text := trim(p_url);
  v_scheme text; v_rest text; v_host text; v_path text; v_query text;
  v_pairs text[]; v_keep text[] := '{}'; kv text; k text;
  v_drop text[] := array['utm_source','utm_medium','utm_campaign','utm_content','utm_term','fbclid','gclid','yclid','_ga','ref'];
begin
  if v is null or v = '' then return null; end if;
  -- схема → https
  v_scheme := lower(coalesce(substring(v from '^([a-zA-Z][a-zA-Z0-9+.-]*)://'), 'https'));
  v_rest := regexp_replace(v, '^[a-zA-Z][a-zA-Z0-9+.-]*://', '');
  -- fragment
  v_rest := regexp_replace(v_rest, '#.*$', '');
  -- host / path / query
  v_host := lower(split_part(split_part(v_rest, '/', 1), '?', 1));
  v_host := regexp_replace(v_host, '^www\.', '');
  v_host := regexp_replace(v_host, ':(80|443)$', '');          -- дефолтные порты
  v_path := '/' || coalesce(nullif(split_part(split_part(v_rest, '?', 1), '/', 2), ''), '');
  -- восстановить полный путь (все сегменты после host)
  v_path := regexp_replace(v_rest, '^[^/?]*', '');             -- всё от первого / или ?
  v_path := split_part(v_path, '?', 1);
  if v_path = '' then v_path := '/'; end if;
  -- query
  v_query := substring(v_rest from '\?(.*)$');
  if p_strip_query then
    v_query := null;
  elsif v_query is not null and v_query <> '' then
    v_pairs := regexp_split_to_array(v_query, '&');
    foreach kv in array v_pairs loop
      k := lower(split_part(kv, '=', 1));
      if k <> '' and not (k = any(v_drop)) then
        v_keep := array_append(v_keep, kv);
      end if;
    end loop;
    if array_length(v_keep,1) is null then
      v_query := null;
    else
      v_query := array_to_string((select array(select unnest(v_keep) order by 1)), '&');
    end if;
  else
    v_query := null;
  end if;
  -- trailing slash, кроме корня
  if v_path <> '/' then v_path := regexp_replace(v_path, '/+$', ''); end if;
  if v_path = '' then v_path := '/'; end if;
  return 'https://' || v_host || v_path || case when v_query is not null then '?' || v_query else '' end;
end $$;

-- ── Атомарная выдача задач (7.8, 10.3): lanes, приоритеты, SKIP LOCKED ────────
create or replace function seo.claim_jobs(p_worker text, p_limit int default 5)
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

  -- Фаза 1: кандидаты с учётом ОСТАВШЕГОСЯ бюджета lane (running + rank <= лимит).
  -- row_number() внутри lane гарантирует, что один вызов не возьмёт больше лимита.
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
              where pr.id=j.run_id and pr.status='running'))        -- пауза run фильтрует задачи
  )
  select array_agg(e.id order by e.priority, e.next_run_at, e.id)
    into v_ids
    from eligible e
    left join running_by_lane r on r.lane = e.lane
   where e.rn <= greatest(coalesce((v_conc->>e.lane)::int, 999) - coalesce(r.c,0), 0);

  if v_ids is null then return; end if;

  -- Фаза 2: заблокировать (SKIP LOCKED, прямо по seo.jobs) и выдать.
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

-- ── Завершение задачи + fan-in (10.2) ────────────────────────────────────────
-- p_outcome: done | retry | released | failed | awaiting_human
create or replace function seo.complete_job(p_job_id bigint, p_outcome text, p_result jsonb default '{}')
returns void
language plpgsql
as $$
declare
  j          seo.jobs;
  v_cost     numeric;
  v_assembler seo.jobs;
  v_done     int;
  v_failed   int;
  v_allowed  int;
begin
  select * into j from seo.jobs where id=p_job_id for update;
  if not found then return; end if;
  v_cost := coalesce((p_result->>'cost')::numeric, 0);

  if p_outcome = 'done' then
    update seo.jobs set status='done', result=p_result, cost=cost+v_cost,
           locked_at=null, locked_by=null where id=p_job_id;
  elsif p_outcome = 'awaiting_human' then
    update seo.jobs set status='awaiting_human', result=p_result,
           locked_at=null, locked_by=null where id=p_job_id;
  elsif p_outcome = 'released' then
    -- тик отдал задачу по времени; без штрафа, без прогресса fan-in
    update seo.jobs set status='pending', locked_at=null, locked_by=null where id=p_job_id;
    return;
  elsif p_outcome = 'retry' then
    if j.attempts + 1 >= j.max_attempts then
      update seo.jobs set status='failed', attempts=attempts+1,
             last_error=coalesce(p_result->>'error', last_error),
             locked_at=null, locked_by=null where id=p_job_id;
      -- падает в терминал → идёт в fan-in ниже
    else
      update seo.jobs set status='pending', attempts=attempts+1,
             next_run_at = now() + (power(2, attempts+1)::text || ' minutes')::interval,
             last_error=coalesce(p_result->>'error', last_error),
             locked_at=null, locked_by=null where id=p_job_id;
      return;  -- в ретрае — не терминально, сборщик ждёт
    end if;
  elsif p_outcome = 'failed' then
    update seo.jobs set status='failed', last_error=coalesce(p_result->>'error', last_error),
           locked_at=null, locked_by=null where id=p_job_id;
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
end $$;

-- ── Вьюха связи с CRM: страница → сделка (только чтение public.deals) ─────────
create or replace view seo.v_page_deals as
select li.first_touch_page, li.last_touch_page, li.deal_id, d.stage_id, d.budget, li.lead_at
from seo.lead_identities li
join public.deals d on d.id = li.deal_id;
