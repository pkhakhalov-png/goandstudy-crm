-- Кабинет куратора v2, миграция 017: разбор переписки встаёт в очередь сам.
--
-- Правило то же, что у подготовки напоминаний: раз в сутки, после начала
-- рабочего дня. Разбор дороже всего остального — модель читает переписку
-- целиком, — поэтому чаще его ставить незачем: переписка за час не меняется
-- настолько, чтобы это стоило десяти центов на дело.
--
-- Провалившиеся задания сутки не занимают, но повтор ограничен тремя за день
-- — так же, как у напоминаний (миграция 013). Причина та же: при сломанном
-- коде безусловный повтор каждые пять минут даёт сотни неудачных заданий, и
-- настоящая поломка в таком журнале не видна.
--
-- Откат: supabase/migrations/care/017_enqueue_extract.rollback.sql

begin;

create or replace function care.enqueue_due_jobs()
returns jsonb
language plpgsql
as $$
declare
  v_tz         text;
  v_день_с     time;
  v_местное    timestamp;
  v_провалов   int;
  v_готовить   boolean := false;
  v_отправить  boolean := false;
  v_разобрать  boolean := false;
begin
  select coalesce(value #>> '{}', 'Europe/Moscow') into v_tz
    from care.settings where key = 'timezone';
  v_tz := coalesce(v_tz, 'Europe/Moscow');

  select coalesce((value ->> 'to')::time, time '09:00') into v_день_с
    from care.settings where key = 'quiet_hours';
  v_день_с := coalesce(v_день_с, time '09:00');

  v_местное := now() at time zone v_tz;

  -- ── Подготовка напоминаний ────────────────────────────────────────────────
  select count(*) into v_провалов
    from care.jobs
   where kind = 'prepare_reminders'
     and status = 'failed'
     and (created_at at time zone v_tz)::date = v_местное::date;

  if v_местное::time >= v_день_с
     and v_провалов < 3
     and not exists (
       select 1 from care.jobs
        where kind = 'prepare_reminders'
          and status in ('queued', 'running', 'done')
          and (created_at at time zone v_tz)::date = v_местное::date
     )
  then
    insert into care.jobs (kind, payload, priority)
    values ('prepare_reminders', jsonb_build_object('поставлено', 'care.enqueue_due_jobs'), 50);
    v_готовить := true;
  end if;

  -- ── Разбор переписки ──────────────────────────────────────────────────────
  select count(*) into v_провалов
    from care.jobs
   where kind = 'extract_facts'
     and status = 'failed'
     and (created_at at time zone v_tz)::date = v_местное::date;

  if v_местное::time >= v_день_с
     and v_провалов < 3
     and not exists (
       select 1 from care.jobs
        where kind = 'extract_facts'
          and status in ('queued', 'running', 'done')
          and (created_at at time zone v_tz)::date = v_местное::date
     )
     -- Ставим, только если есть что разбирать: непрочитанное сообщение хотя
     -- бы у одного дела. Пустое задание стоит запроса к базе, а не десяти
     -- центов, но и его незачем плодить.
     and exists (
       select 1
         from care.cases c
         join care.case_messages m on m.case_id = c.id
        where c.automation_owner = 'v2'
          and c.status = 'active'
          and (c.facts_extracted_at is null or m.created_at > c.facts_extracted_at)
     )
  then
    insert into care.jobs (kind, payload, priority)
    values ('extract_facts', jsonb_build_object('поставлено', 'care.enqueue_due_jobs'), 80);
    v_разобрать := true;
  end if;

  -- ── Отправка ──────────────────────────────────────────────────────────────
  if exists (select 1 from care.outbound_actions where status = 'queued')
     and not exists (
       select 1 from care.jobs
        where kind = 'send_outbound' and status in ('queued', 'running')
     )
  then
    insert into care.jobs (kind, payload, priority)
    values ('send_outbound', jsonb_build_object('поставлено', 'care.enqueue_due_jobs'), 20);
    v_отправить := true;
  end if;

  return jsonb_build_object(
    'prepare_reminders', v_готовить,
    'extract_facts',     v_разобрать,
    'send_outbound',     v_отправить,
    'местное_время',     to_char(v_местное, 'YYYY-MM-DD HH24:MI'),
    'пояс',              v_tz
  );
end $$;

comment on function care.enqueue_due_jobs() is
  'Ставит задания: подготовку напоминаний и разбор переписки раз в сутки, отправку — когда есть что отправлять.';

commit;
