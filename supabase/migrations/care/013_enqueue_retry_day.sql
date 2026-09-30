-- Кабинет куратора v2, миграция 013: дневная подготовка не теряет сутки.
--
-- ЧТО СЛУЧИЛОСЬ В ПЕРВЫЙ ЖЕ ДЕНЬ. Расписание включили, `care_enqueue` поставил
-- `prepare_reminders`, а превью отдавало предыдущий коммит — без обработчика
-- этого вида. Задание честно исчерпало три попытки и легло в `failed`. Проверка
-- «раз в сутки» смотрела на любое задание за сегодня, включая провалившееся, и
-- следующая подготовка случилась бы только завтра. Один сбой — потерянный день
-- напоминаний, и заметить это можно лишь по пустой очереди.
--
-- ПОЧЕМУ НЕ «ПОВТОРЯТЬ, ПОКА НЕ ПОЛУЧИТСЯ». Производитель работает раз в пять
-- минут. Безусловный повтор при сломанном коде дал бы под триста неудачных
-- заданий за сутки и превратил журнал в кашу — а в каше настоящую поломку не
-- видно. Поэтому повтор ограничен: не больше трёх провалившихся заданий за
-- день. Дальше подготовка честно ждёт следующего дня и остаётся видимой в
-- `scripts/care/inbox.ts --всё`.
--
-- Три попытки внутри задания плюс три задания за день — это девять обращений к
-- воркеру. Достаточно, чтобы пережить неудачный деплой или минутную сетевую
-- беду, и мало, чтобы заметить настоящую поломку по счётчику, а не по журналу.
--
-- Откат: supabase/migrations/care/013_enqueue_retry_day.rollback.sql

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
  'Ставит задания в очередь: подготовку напоминаний раз в сутки (провалившееся переставляется, но не больше трёх раз за день) и отправку — когда есть что отправлять.';

commit;
