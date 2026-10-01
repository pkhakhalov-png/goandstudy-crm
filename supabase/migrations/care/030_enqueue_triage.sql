-- Кабинет куратора v2, миграция 030: разбор входящих ставится в очередь.
--
-- ПОЧЕМУ НЕ РАЗ В СУТКИ, КАК РАЗБОР ФАКТОВ. Факты терпят: бюджет, названный
-- вчера, останется бюджетом и завтра. Вопрос клиента не терпит. «А когда
-- дедлайн?», пролежавший сутки, — это сутки молчания в ответ на прямой вопрос,
-- и клиент делает из этого свои выводы раньше, чем мы успеваем ответить.
--
-- Поэтому ставится при каждом проходе расписания (раз в пять минут), как
-- только есть неразобранное входящее и такого задания ещё нет в работе.
--
-- СКОЛЬКО ЭТО СТОИТ. Замерено: пачка из пяти сообщений — около трёх центов,
-- одиночное сообщение — около полуцента. Расписание проходит раз в пять минут,
-- то есть при самом густом потоке выходит порядка полутора долларов в сутки
-- при дневном потолке вида `extraction` в пять. Запас есть, но он не
-- десятикратный, и потолок здесь не формальность.
--
-- ПОЧЕМУ БЕЗ ПРОВЕРКИ ВРЕМЕНИ СУТОК. Тихие часы — про отправку клиенту.
-- Разбор ничего наружу не шлёт, а задача, появившаяся ночью, ждёт куратора до
-- утра так же, как появившаяся утром.
--
-- ПРО НАЗВАНИЕ НАПРАВЛЕНИЯ. В `care.case_messages` оно `incoming`/`outgoing`,
-- а не `in`/`out`. Первая версия условия фильтровала по сокращённым — и ничего
-- не находила вовсе: функция отрабатывала, задание не ставилось, ошибки не
-- было. Такое не видно ниоткуда, кроме живого вызова.
--
-- Откат: supabase/migrations/care/030_enqueue_triage.rollback.sql

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
    'send_outbound',     v_отправить,
    'местное_время',     to_char(v_местное, 'YYYY-MM-DD HH24:MI'),
    'пояс',              v_tz
  );
end $function$;

commit;
