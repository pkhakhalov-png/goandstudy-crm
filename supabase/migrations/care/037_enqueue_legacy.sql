-- Кабинет куратора v2, миграция 037: расписание сверяет прежний кабинет.
--
-- ЗАЧЕМ. Переведённого клиента прежний кабинет показывать не перестал: мы его
-- не меняли, и запрет там — дисциплина, а не замок. Куратор по привычке правит
-- этап или дорожную карту в старом окне, новый кабинет об этом не знает и
-- продолжает работать на своих сведениях.
--
-- ПОЧЕМУ РАЗ В СУТКИ. Реакции в ту же минуту это не требует: расхождение не
-- опасно само по себе, опасно работать на устаревшем месяцами. Сверка не зовёт
-- модель и денег не стоит — чтение девяти полей на клиента и сравнение хэшей.
--
-- ПОЧЕМУ ТОЛЬКО ПО НАСТОЯЩИМ КЛИЕНТАМ. У тестовых дел выдуманный клиент,
-- которого в прежнем кабинете нет вовсе: сверять не с чем.
--
-- Откат: supabase/migrations/care/037_enqueue_legacy.rollback.sql

begin;

CREATE OR REPLACE FUNCTION care.enqueue_due_jobs()
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
declare
  v_tz         text;
  v_день_с     time;
  v_местное    timestamp;
  v_провалов   int;
  v_готовить   boolean := false;
  v_отправить  boolean := false;
  v_разобрать  boolean := false;
  v_входящие   boolean := false;
  v_каналы     boolean := false;
  v_прежний    boolean := false;
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

  -- ── Разбор входящих сообщений ─────────────────────────────────────────────
  --
  -- Не раз в сутки, в отличие от разбора фактов: неотвеченный вопрос клиента
  -- не должен ждать до завтра. Ставим, как только есть неразобранное входящее
  -- и такого задания ещё нет в работе.
  select count(*) into v_провалов
    from care.jobs
   where kind = 'triage_messages'
     and status = 'failed'
     and (created_at at time zone v_tz)::date = v_местное::date;

  if v_провалов < 3
     and not exists (
       select 1 from care.jobs
        where kind = 'triage_messages'
          and status in ('queued', 'running')
     )
     and exists (
       select 1
         from care.cases c
         join care.case_messages m on m.case_id = c.id
    left join care.message_triage t on t.message_id = m.message_id
        where c.automation_owner = 'v2'
          and c.status = 'active'
          and m.direction = 'incoming'
          and t.id is null
     )
  then
    insert into care.jobs (kind, payload, priority)
    values ('triage_messages', jsonb_build_object('поставлено', 'care.enqueue_due_jobs'), 60);
    v_входящие := true;
  end if;

  -- ── Можем ли писать клиентам ──────────────────────────────────────────────
  --
  -- Раз в сутки. Проверка не зовёт модель и денег не стоит — два запроса Bot
  -- API на чат, — но знать результат надо до отправки, а не в момент, когда
  -- напоминание со сроком никуда не ушло.
  select count(*) into v_провалов
    from care.jobs
   where kind = 'check_channels'
     and status = 'failed'
     and (created_at at time zone v_tz)::date = v_местное::date;

  if v_провалов < 3
     and not exists (
       select 1 from care.jobs
        where kind = 'check_channels'
          and status in ('queued', 'running', 'done')
          and (created_at at time zone v_tz)::date = v_местное::date
     )
     and exists (
       select 1 from care.cases
        where automation_owner = 'v2' and status = 'active'
     )
  then
    insert into care.jobs (kind, payload, priority)
    values ('check_channels', jsonb_build_object('поставлено', 'care.enqueue_due_jobs'), 90);
    v_каналы := true;
  end if;

  -- ── Правки в прежнем кабинете ─────────────────────────────────────────────
  --
  -- Раз в сутки. Переведённого клиента прежний кабинет показывать не перестал,
  -- и куратор по привычке правит этап там. Реакции в ту же минуту это не
  -- требует, но узнавать о расхождении через месяц поздно: новый кабинет всё
  -- это время работал на своих сведениях.
  select count(*) into v_провалов
    from care.jobs
   where kind = 'detect_legacy_writes'
     and status = 'failed'
     and (created_at at time zone v_tz)::date = v_местное::date;

  if v_провалов < 3
     and not exists (
       select 1 from care.jobs
        where kind = 'detect_legacy_writes'
          and status in ('queued', 'running', 'done')
          and (created_at at time zone v_tz)::date = v_местное::date
     )
     and exists (
       select 1 from care.cases
        where automation_owner = 'v2' and status = 'active' and not is_synthetic
     )
  then
    insert into care.jobs (kind, payload, priority)
    values ('detect_legacy_writes', jsonb_build_object('поставлено', 'care.enqueue_due_jobs'), 95);
    v_прежний := true;
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
    'triage_messages',   v_входящие,
    'check_channels',    v_каналы,
    'detect_legacy_writes', v_прежний,
    'send_outbound',     v_отправить,
    'местное_время',     to_char(v_местное, 'YYYY-MM-DD HH24:MI'),
    'пояс',              v_tz
  );
end $function$;

commit;
