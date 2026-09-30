-- Откат 017. Возвращает производителя заданий к виду из миграции 013:
-- напоминания и отправка, без разбора переписки.
--
-- Уже поставленные задания `extract_facts` при этом остаются в очереди и
-- будут выполнены: снимать чужую работу откатом функции неправильно, а
-- обработчик в воркере от этого не исчезает.

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
begin
  select coalesce(value #>> '{}', 'Europe/Moscow') into v_tz
    from care.settings where key = 'timezone';
  v_tz := coalesce(v_tz, 'Europe/Moscow');

  select coalesce((value ->> 'to')::time, time '09:00') into v_день_с
    from care.settings where key = 'quiet_hours';
  v_день_с := coalesce(v_день_с, time '09:00');

  v_местное := now() at time zone v_tz;

  select count(*) into v_провалов
    from care.jobs
   where kind = 'prepare_reminders'
     and status = 'failed'
     and (created_at at time zone v_tz)::date = v_местное::date;

  -- Подготовка напоминаний: раз в сутки, не раньше начала рабочего дня.
  -- Провалившиеся задания «сутки» не занимают — но не больше трёх за день.
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
    values (
      'prepare_reminders',
      jsonb_build_object('поставлено', 'care.enqueue_due_jobs', 'провалов_за_день', v_провалов),
      50
    );
    v_готовить := true;
  end if;

  -- Отправка: есть что отправлять и некому этим заняться.
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
    'send_outbound',     v_отправить,
    'провалов_за_день',  v_провалов,
    'местное_время',     to_char(v_местное, 'YYYY-MM-DD HH24:MI'),
    'пояс',              v_tz
  );
end $$;

comment on function care.enqueue_due_jobs() is
  'Ставит задания в очередь: подготовку напоминаний раз в сутки и отправку — когда есть что отправлять. Сама ничего не делает.';

commit;
