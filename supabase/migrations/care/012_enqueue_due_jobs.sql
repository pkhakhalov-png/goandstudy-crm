-- Кабинет куратора v2, миграция 012: кто ставит задания в очередь.
--
-- ЧТО БЫЛО НЕ ТАК. Тик умеет выполнять `prepare_reminders` и `send_outbound`,
-- расписание умеет дёргать тик раз в минуту — а ставить эти задания в очередь
-- было некому. Включённое расписание работало бы вхолостую: каждую минуту
-- запрос к воркеру, каждый раз «взято 0». Выглядело бы как «всё включено, но
-- напоминаний нет» — самая дорогая разновидность поломки.
--
-- ПОЧЕМУ ПРОИЗВОДИТЕЛЬ В БАЗЕ, А НЕ В ВОРКЕРЕ. Воркер на Vercel живёт только
-- пока его позвали. Решение «пора готовить напоминания» обязано принимать то,
-- что тикает само, иначе оно зависит от того, позвал ли кто-то воркер.
--
-- ДВА ПРАВИЛА, И ОБА СКУЧНЫЕ:
--
--   · `prepare_reminders` — один раз в сутки, после начала рабочего дня по
--     поясу из `care.settings.timezone`. Начало дня берётся из `quiet_hours.to`
--     — это ровно момент, когда тихие часы кончились. Второй раз за сутки не
--     ставится: повторный проход всё равно ничего не добавит, правило само
--     считает предложения по задаче.
--
--   · `send_outbound` — когда в `care.outbound_actions` есть хоть одна строка
--     со статусом `queued` и нет уже ждущего задания на отправку. Тихие часы
--     здесь не проверяются: их проверяют ворота при самой отправке и
--     откладывают до утра. Проверять в двух местах значит завести два разных
--     ответа на один вопрос.
--
-- Функция ничего не отправляет и ничего не готовит — только ставит задания.
-- Возвращает, что поставила: пустой ответ на живом расписании должен читаться
-- как «нечего было», а не как «не сработало».
--
-- Откат: supabase/migrations/care/012_enqueue_due_jobs.rollback.sql

begin;

create or replace function care.enqueue_due_jobs()
returns jsonb
language plpgsql
as $$
declare
  v_tz         text;
  v_день_с     time;
  v_местное    timestamp;
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

  -- Подготовка напоминаний: раз в сутки, не раньше начала рабочего дня.
  if v_местное::time >= v_день_с
     and not exists (
       select 1 from care.jobs
        where kind = 'prepare_reminders'
          and (created_at at time zone v_tz)::date = v_местное::date
     )
  then
    insert into care.jobs (kind, payload, priority)
    values ('prepare_reminders', jsonb_build_object('поставлено', 'care.enqueue_due_jobs'), 50);
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
    'местное_время',     to_char(v_местное, 'YYYY-MM-DD HH24:MI'),
    'пояс',              v_tz
  );
end $$;

comment on function care.enqueue_due_jobs() is
  'Ставит задания в очередь: подготовку напоминаний раз в сутки и отправку — когда есть что отправлять. Сама ничего не делает.';

grant execute on function care.enqueue_due_jobs() to care_app;

-- ── Расписание: теперь два задания ──────────────────────────────────────────
--
-- Тик — раз в минуту, он дешёвый и обычно возвращает «взято 0». Производитель
-- — раз в пять минут: чаще незачем, ставить задание дважды он всё равно не
-- станет, а в журнале базы меньше шума.

create or replace function care.schedule_all()
returns void language plpgsql as $$
begin
  perform cron.unschedule(jobname) from cron.job where jobname in ('care_tick', 'care_enqueue');
  perform cron.schedule('care_tick',    '* * * * *',   $q$ select care.dispatch_tick();    $q$);
  perform cron.schedule('care_enqueue', '*/5 * * * *', $q$ select care.enqueue_due_jobs(); $q$);
end $$;

create or replace function care.unschedule_all()
returns void language plpgsql as $$
begin
  perform cron.unschedule(jobname) from cron.job where jobname in ('care_tick', 'care_enqueue');
end $$;

comment on function care.schedule_all() is
  'Вызывать вручную. Ставит два задания cron: care_tick раз в минуту и care_enqueue раз в пять минут.';

commit;
