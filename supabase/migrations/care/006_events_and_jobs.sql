-- Кабинет куратора v2, миграция 006: приём событий, очередь, планировщик.
--
-- Что делает. Четыре таблицы и пять функций: входящие события с защитой от
-- повторной доставки (inbound_events), очередь заданий с арендой (jobs),
-- потолки на вид работы (job_kinds_budget), состояние внешних подключений
-- (connections).
--
-- Конструкция очереди повторяет проверенную в контуре статей: выдача через
-- FOR UPDATE SKIP LOCKED, аренда с истечением, один планировщик. Копируется
-- устройство, не таблица: своя очередь нужна, чтобы задания нового кабинета
-- не делили потолки и приоритеты с производством статей.
--
-- Почему приём и обработка разделены. Площадка ждёт ответа несколько секунд и
-- при таймауте шлёт событие снова. Если обрабатывать в обработчике вебхука,
-- медленная модель превратит одно сообщение в три. Поэтому вебхук делает
-- ровно одно: INSERT и 200. Работа — из очереди.
--
-- Откат: supabase/migrations/care/006_events_and_jobs.rollback.sql

begin;

-- ── Входящие события ────────────────────────────────────────────────────────
--
-- unique(channel, external_id) — единственное, что отделяет одно сообщение
-- клиента от трёх одинаковых напоминаний в ответ на него. Дедуп в базе, а не
-- в коде: код можно обойти новым маршрутом, ограничение — нет.

create table care.inbound_events (
  id            uuid primary key default gen_random_uuid(),
  channel       text not null check (channel in ('telegram', 'zoom', 'manual')),
  external_id   text not null,
  payload       jsonb not null,
  received_at   timestamptz not null default now(),
  processed_at  timestamptz null,
  error         text null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (channel, external_id)
);

comment on table care.inbound_events is
  'Сырое событие как пришло. Обработка — из очереди, не в обработчике вебхука.';
comment on column care.inbound_events.processed_at is
  'null — ещё не разобрано. Повторная доставка того же external_id отбивается ограничением, а не кодом.';

create index care_inbound_unprocessed_idx
  on care.inbound_events (received_at) where processed_at is null;

-- ── Очередь ─────────────────────────────────────────────────────────────────

create table care.jobs (
  id           uuid primary key default gen_random_uuid(),
  kind         text not null,
  payload      jsonb not null default '{}'::jsonb,
  priority     int not null default 100,
  run_after    timestamptz not null default now(),
  status       text not null default 'queued'
                 check (status in ('queued', 'running', 'done', 'failed', 'cancelled')),
  claimed_by   text null,
  lease_until  timestamptz null,
  attempts     int not null default 0,
  max_attempts int not null default 3,
  result       jsonb not null default '{}'::jsonb,
  last_error   text null,
  case_id      uuid null references care.cases(id) on delete cascade,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

comment on column care.jobs.lease_until is
  'До какого момента задание считается взятым. Воркер на Vercel может быть убит по таймауту и не вернуть задание — аренда возвращает его сама.';
comment on column care.jobs.result is
  'Накопленный результат. Длинная работа сохраняет сюда прогресс, чтобы следующий тик продолжил, а не начал заново.';

-- Порядок выдачи: сначала приоритет, потом очередь по времени. Индекс только
-- по готовым к выдаче — остальные в выборку не попадают никогда.
create index care_jobs_claimable_idx
  on care.jobs (priority, run_after) where status = 'queued';
create index care_jobs_lease_idx
  on care.jobs (lease_until) where status = 'running';
create index care_jobs_case_idx on care.jobs (case_id) where case_id is not null;

-- ── Потолки по виду работы ──────────────────────────────────────────────────
--
-- Раздельно по видам. Общий потолок означает, что ночная переработка
-- расшифровок может съесть весь дневной бюджет и оставить напоминания без
-- отправки — а напоминания и есть то, ради чего всё делается.

create table care.job_kinds_budget (
  kind             text primary key,
  max_parallel     int not null default 1,
  daily_budget_usd numeric(10, 2) not null default 0,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

insert into care.job_kinds_budget (kind, max_parallel, daily_budget_usd) values
  ('extraction', 2, 0),
  ('research',   2, 0),
  ('review',     1, 0),
  ('outbound',   1, 0)
on conflict (kind) do nothing;

comment on table care.job_kinds_budget is
  'daily_budget_usd = 0 означает «не расходовать»: до явного решения владельца модель по этому виду работы не зовётся.';

-- ── Внешние подключения ─────────────────────────────────────────────────────

create table care.connections (
  id          uuid primary key default gen_random_uuid(),
  kind        text not null check (kind in ('telegram', 'zoom')),
  scope       jsonb not null default '{}'::jsonb,
  status      text not null default 'unknown'
                check (status in ('ok', 'degraded', 'down', 'unknown')),
  cursor      jsonb not null default '{}'::jsonb,
  last_ok_at  timestamptz null,
  last_error  text null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table care.connections is
  'Состояние каналов. Нужно, чтобы «тихо ничего не приходит» отличалось от «всё хорошо, событий нет».';

-- ── Выдача заданий ──────────────────────────────────────────────────────────
--
-- SKIP LOCKED — то, из-за чего два воркера не возьмут одно задание: строку,
-- уже заблокированную соседом, выборка пропускает, а не ждёт.
--
-- Истёкшая аренда возвращает задание в выдачу тем же запросом: отдельный
-- сторож пришлось бы ещё и запускать, а этот путь работает сам собой.

create or replace function care.claim_jobs(p_worker text, p_limit int default 5)
returns setof care.jobs
language plpgsql
as $$
begin
  return query
  with освободившиеся as (
    update care.jobs
       set status = 'queued', claimed_by = null, lease_until = null
     where status = 'running' and lease_until < now()
    returning id
  ),
  взятые as (
    select j.id
      from care.jobs j
     where j.status = 'queued'
       and j.run_after <= now()
       and j.attempts < j.max_attempts
       and not exists (select 1 from освободившиеся o where o.id = j.id)
     order by j.priority, j.run_after
     limit greatest(p_limit, 0)
       for update skip locked
  )
  update care.jobs j
     set status      = 'running',
         claimed_by  = p_worker,
         lease_until = now() + interval '5 minutes',
         attempts    = j.attempts + 1,
         updated_at  = now()
    from взятые v
   where j.id = v.id
  returning j.*;
end $$;

comment on function care.claim_jobs(text, int) is
  'Берёт до p_limit заданий под воркера. Два параллельных вызова дают непересекающиеся наборы.';

-- ── Продление аренды ────────────────────────────────────────────────────────

create or replace function care.extend_lease(p_job uuid, p_worker text, p_seconds int default 300)
returns boolean
language plpgsql
as $$
declare продлено int;
begin
  update care.jobs
     set lease_until = now() + make_interval(secs => p_seconds), updated_at = now()
   where id = p_job and claimed_by = p_worker and status = 'running';
  get diagnostics продлено = row_count;
  return продлено > 0;
end $$;

-- ── Сохранение прогресса ────────────────────────────────────────────────────
--
-- Длинная работа не обязана уложиться в один тик. Прогресс кладётся в result,
-- аренда продлевается, задание остаётся взятым.

create or replace function care.save_progress(p_job uuid, p_worker text, p_result jsonb)
returns boolean
language plpgsql
as $$
declare сохранено int;
begin
  update care.jobs
     set result      = coalesce(result, '{}'::jsonb) || coalesce(p_result, '{}'::jsonb),
         lease_until = now() + interval '5 minutes',
         updated_at  = now()
   where id = p_job and claimed_by = p_worker and status = 'running';
  get diagnostics сохранено = row_count;
  return сохранено > 0;
end $$;

-- ── Завершение ──────────────────────────────────────────────────────────────
--
-- Неудача без попыток в запасе — failed насовсем. С попытками — обратно в
-- очередь с отсрочкой, растущей от числа попыток: повторять немедленно то, что
-- только что не получилось, значит потратить все попытки за одну секунду.

create or replace function care.release(
  p_job    uuid,
  p_worker text,
  p_ok     boolean,
  p_result jsonb default '{}'::jsonb,
  p_error  text default null
)
returns boolean
language plpgsql
as $$
declare записано int;
begin
  update care.jobs j
     set status = case
                    when p_ok then 'done'
                    when j.attempts >= j.max_attempts then 'failed'
                    else 'queued'
                  end,
         result      = coalesce(j.result, '{}'::jsonb) || coalesce(p_result, '{}'::jsonb),
         last_error  = case when p_ok then null else p_error end,
         claimed_by  = null,
         lease_until = null,
         run_after   = case
                         when p_ok or j.attempts >= j.max_attempts then j.run_after
                         else now() + make_interval(secs => 60 * j.attempts)
                       end,
         updated_at  = now()
   where j.id = p_job and j.claimed_by = p_worker;
  get diagnostics записано = row_count;
  return записано > 0;
end $$;

comment on function care.release(uuid, text, boolean, jsonb, text) is
  'Закрывает задание. Возвращает false, если задание уже отобрано по истечении аренды — воркер узнаёт, что его результат никому не нужен.';

-- ── Планировщик ─────────────────────────────────────────────────────────────
--
-- Расписание НЕ включается применением миграции. Включается вручную вызовом
-- care.schedule_all() и только после того, как: (1) воркер задеплоен на свой
-- адрес, (2) адрес записан в care.settings.tick_url, (3) секрет лежит в Vault
-- под именем CARE_TICK_SECRET.
--
-- Иначе расписание начнёт стучаться в несуществующий или, хуже, в боевой
-- адрес раньше, чем там появится маршрут.

create extension if not exists pg_cron;
create extension if not exists pg_net;

create or replace function care.dispatch_tick()
returns void
language plpgsql
security definer
as $$
declare
  v_url    text;
  v_secret text;
begin
  select (value #>> '{}') into v_url from care.settings where key = 'tick_url';
  begin
    select decrypted_secret into v_secret
      from vault.decrypted_secrets where name = 'CARE_TICK_SECRET';
  exception when others then
    v_secret := null;
  end;
  -- Нет адреса или секрета — молчим. Стучаться без секрета бессмысленно:
  -- маршрут обязан такой запрос отвергнуть.
  if v_url is null or v_secret is null then return; end if;
  perform net.http_post(
    url     := v_url,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-care-tick-secret', v_secret),
    body    := '{}'::jsonb
  );
end $$;

create or replace function care.schedule_all()
returns void language plpgsql as $$
begin
  perform cron.unschedule(jobname) from cron.job where jobname = 'care_tick';
  perform cron.schedule('care_tick', '* * * * *', $q$ select care.dispatch_tick(); $q$);
end $$;

create or replace function care.unschedule_all()
returns void language plpgsql as $$
begin
  perform cron.unschedule(jobname) from cron.job where jobname = 'care_tick';
end $$;

comment on function care.schedule_all() is
  'Вызывать вручную. Применение миграции расписание не включает.';

-- ── Триггеры отметки времени ────────────────────────────────────────────────

create trigger care_inbound_events_touch before update on care.inbound_events
  for each row execute function care.touch_updated_at();
create trigger care_jobs_touch before update on care.jobs
  for each row execute function care.touch_updated_at();
create trigger care_job_kinds_budget_touch before update on care.job_kinds_budget
  for each row execute function care.touch_updated_at();
create trigger care_connections_touch before update on care.connections
  for each row execute function care.touch_updated_at();

-- ── Доступ ──────────────────────────────────────────────────────────────────

alter table care.inbound_events enable row level security;
alter table care.jobs enable row level security;
alter table care.job_kinds_budget enable row level security;
alter table care.connections enable row level security;

create policy care_app_all on care.inbound_events   for all to care_app using (true) with check (true);
create policy care_app_all on care.jobs             for all to care_app using (true) with check (true);
create policy care_app_all on care.job_kinds_budget for all to care_app using (true) with check (true);
create policy care_app_all on care.connections      for all to care_app using (true) with check (true);

revoke all on care.inbound_events, care.jobs, care.job_kinds_budget, care.connections
  from anon, authenticated;

grant execute on function care.claim_jobs(text, int) to care_app;
grant execute on function care.extend_lease(uuid, text, int) to care_app;
grant execute on function care.save_progress(uuid, text, jsonb) to care_app;
grant execute on function care.release(uuid, text, boolean, jsonb, text) to care_app;

commit;
