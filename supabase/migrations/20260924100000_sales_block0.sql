-- Блок 0 апгрейда отдела продаж: воронка должна перестать врать.
-- PRD: docs/PRD_SALES_UPGRADE.md, раздел 3.
--
-- Всё здесь — только добавления. Ни одна существующая колонка не меняется и не
-- удаляется, поэтому уже выложенный код продолжает работать так же, как вчера:
-- он про эти поля просто не знает. Это и есть условие безопасного отката.
--
-- Что чинится и почему именно так.
--
--   Исход консультации. Отдельной колонки `outcome` не заводим: статус брони
--     (`confirmed` / `completed` / `no_show` / `cancelled`) уже описывает исход.
--     Заводить рядом второе поле про то же самое значит завести два источника
--     правды, которые разойдутся. Не хватает другого — следа: кто и когда
--     отметил. Без него «прошла» неотличима от «кто-то нажал не глядя», и
--     спрашивать не с кого.
--
--   Чем закончилась задача. Сейчас `is_done` отвечает на вопрос «закрыта ли»,
--     но не на вопрос «сделана или протухла». Без этого различия автозакрытие
--     просроченных подделает статистику выполнения: 333 брошенные задачи
--     превратятся в 333 выполненные.
--
--   Какие этапы считаются продажами. «НЕ ЦЕЛЕВЫЕ», «Релокац» и «Группы» — это
--     отдельные потоки, а не стадии продажи. Пока они в общей куче, конверсия
--     и список застрявших считаются по 1111 сделкам вместо нескольких сотен и
--     не значат ничего. Признак ставим у этапа, а не списком имён в коде:
--     этапы заводит РОП, и переименование не должно ломать отчёты.

begin;

-- ── Исход консультации: кто отметил и когда ─────────────────────────────────

alter table public.bookings
  add column if not exists outcome_at timestamptz,
  add column if not exists outcome_by uuid references public.users(id);

comment on column public.bookings.outcome_at is
  'Когда отметили исход консультации. NULL при прошедшей дате означает, что '
  'исход не отмечен вовсе — это и есть дыра, которую видно в отчёте, а не '
  'молчаливое «наверное, состоялась».';

comment on column public.bookings.outcome_by is
  'Кто отметил исход. Нужен, чтобы «не пришёл» был чьим-то утверждением, '
  'а не свойством строки без автора.';

-- Список неотмеченных консультаций — операция утренней панели и блока на
-- /sales, выполняется на каждый заход. Частичный индекс: строк со статусом
-- confirmed мало, и именно их мы перебираем.
create index if not exists idx_bookings_pending_outcome
  on public.bookings (booking_date, salesperson_id)
  where status = 'confirmed';

-- ── Задачи: сделана или протухла ────────────────────────────────────────────

alter table public.deal_tasks
  add column if not exists closed_as text;

comment on column public.deal_tasks.closed_as is
  'done — человек сделал; expired — задача закрыта автоматически как потерявшая '
  'смысл. Без этого различия автозакрытие просроченных превратит брошенные '
  'задачи в выполненные и отчёт о дисциплине станет красивым и ложным.';

-- Уже закрытые задачи закрыты человеком — других способов до сих пор не было.
update public.deal_tasks set closed_as = 'done'
 where is_done = true and closed_as is null;

create index if not exists idx_deal_tasks_open_by_user
  on public.deal_tasks (assigned_to, deadline)
  where is_done = false;

-- ── Какие этапы вообще считаются продажами ──────────────────────────────────

alter table public.pipeline_stages
  add column if not exists counts_in_sales boolean not null default true;

comment on column public.pipeline_stages.counts_in_sales is
  'Участвует ли этап в метриках отдела продаж. Выключается у потоков, которые '
  'продажами не являются (нецелевые обращения, релокация, групповые чаты): '
  'иначе конверсия и список застрявших считаются по всей базе и не значат ничего.';

update public.pipeline_stages set counts_in_sales = false
 where name in ('НЕ ЦЕЛЕВЫЕ', 'Релокац', 'Группы');

-- ── Настройки блока 0 ───────────────────────────────────────────────────────
--
-- Живут там же, где остальные пороги РОПа, и меняются в интерфейсе без выкатки.
-- Это и есть механизм отката для поведения: `funnel_autoclose = false`
-- выключает автоперевод сделки мгновенно, не трогая ни код, ни данные.

insert into public.rop_settings (key, value) values
  ('funnel_autoclose',   'true'),
  ('task_expire_days',   '14'),
  ('outcome_prompt_hours', '2')
on conflict (key) do nothing;

commit;

-- Проверить:
--   select count(*) from public.bookings where outcome_at is not null;          -- 0, поле новое
--   select name, counts_in_sales from public.pipeline_stages order by position; -- три false
--   select key from public.rop_settings order by key;                           -- +3 ключа
--   select closed_as, count(*) from public.deal_tasks group by 1;               -- done у закрытых
