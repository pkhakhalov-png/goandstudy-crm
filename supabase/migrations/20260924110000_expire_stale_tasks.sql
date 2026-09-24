-- Автозакрытие протухших задач.
-- PRD: docs/PRD_SALES_UPGRADE.md, раздел 3.4.
--
-- Почему это понадобилось. Задача «клиент написал — надо ответить» заводилась
-- автоматически, а закрывалась только эхом Wazzup. В Telegram — основном
-- канале переписки — ветки закрытия не было вовсе, поэтому каждое входящее
-- оставляло после себя задачу навсегда. Замер 24.09.2026: 336 открытых, из них
-- 333 просрочены, самая старая от 21 апреля.
--
-- Сам протекающий кран починен в коде (lib/sales/reply-tasks.ts): ответ
-- закрывает задачу, откуда бы он ни пришёл. Но налитое за полгода надо слить,
-- и надо защититься от случая, когда на сообщение просто никто не ответил:
-- задача полугодовой давности не становится полезной оттого, что висит.
--
-- Почему закрываем как 'expired', а не 'done'. Потому что её не сделали.
-- Свалить брошенное в выполненное значит получить красивый отчёт о дисциплине
-- и потерять сам смысл его читать.
--
-- Почему без записи в ленту сделки. На одну сделку приходится несколько таких
-- задач, и 333 записи «задача протухла» засорят историю, которую продажники
-- читают глазами. След остаётся в самой задаче: `closed_as = 'expired'`,
-- время — в `completed_at`. Этого достаточно, чтобы отличить одно от другого
-- в любом отчёте.
--
-- Расписание здесь НЕ создаётся — по тому же правилу, что и у SEO-тика:
-- миграция описывает возможность, включает её человек, когда убедился, что
-- функция делает ровно то, что написано.

begin;

create or replace function public.expire_stale_tasks()
returns int
language plpgsql
as $$
declare
  v_days  int;
  v_count int;
begin
  -- Срок живёт в настройках РОПа и меняется без выкатки.
  select nullif(value #>> '{}', '')::int into v_days
    from public.rop_settings
   where key = 'task_expire_days';
  v_days := coalesce(v_days, 14);

  -- `deadline` у задачи может быть не задан — тогда считаем от создания.
  -- Иначе задача без срока не протухнет никогда и переживёт всех.
  update public.deal_tasks
     set is_done      = true,
         completed_at = now(),
         closed_as    = 'expired'
   where is_done = false
     and coalesce(deadline, created_at) < now() - make_interval(days => v_days);

  get diagnostics v_count = row_count;
  return v_count;
end $$;

comment on function public.expire_stale_tasks() is
  'Закрывает задачи, просроченные больше rop_settings.task_expire_days дней, '
  'пометкой closed_as = expired. Возвращает число закрытых. Идемпотентна: '
  'повторный вызов подряд закроет ноль.';

commit;

-- Включить ежедневный прогон (выполнять ОТДЕЛЬНО, после проверки функции):
--   create extension if not exists pg_cron;
--   select cron.schedule('expire-stale-tasks', '15 3 * * *',
--                        $$ select public.expire_stale_tasks() $$);
--
-- Проверить сейчас, ничего не меняя:
--   select count(*) from public.deal_tasks
--    where is_done = false and coalesce(deadline, created_at) < now() - interval '14 days';
