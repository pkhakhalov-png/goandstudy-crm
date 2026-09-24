-- Разбор разговора с клиентом.
-- PRD: docs/PRD_SALES_UPGRADE.md, раздел 4.
--
-- Одна таблица на два источника, и это осознанно. Переписка и звонок — разные
-- по форме, но один и тот же разговор по смыслу: что человек хочет, что его
-- держит, о чём договорились. Если завести под них две таблицы, любой отчёт
-- придётся собирать объединением, а карточка сделки будет показывать две
-- разные правды рядом.
--
-- Поэтому источник — колонка, а не таблица. Сегодня доступен только 'chat'
-- (переписка лежит в deal_messages с апреля), 'call' подключается тем же
-- конвейером, когда поедут записи Zoom.
--
-- Разбор хранится целиком в jsonb, а не разложен по колонкам. Причина простая:
-- состав разбора будет меняться — чек-лист правит РОП, поля добавляются по
-- ходу. Раскладывать это по колонкам значит мигрировать схему на каждое
-- изменение промпта. То, что нужно для отчётов и сортировок, продублировано
-- отдельными колонками сверху.

begin;

create table if not exists public.deal_analyses (
  id          uuid primary key default gen_random_uuid(),
  deal_id     uuid not null references public.deals(id) on delete cascade,

  source      text not null check (source in ('chat', 'call')),
  -- До какого момента разобрано. По нему видно, устарел ли разбор: если в
  -- переписке появились сообщения новее, разбор пора повторить.
  covered_to  timestamptz,
  -- Сколько материала вошло — чтобы отличить разбор трёх реплик от разбора
  -- часового разговора, не открывая payload.
  items_count int,

  -- Вытащено наверх ради списков и фильтров: по ним РОП сортирует и ищет.
  client_type text,
  next_step   boolean,
  summary     text,

  payload     jsonb not null,

  model       text,
  cost_usd    numeric(10, 5),
  ms          int,
  created_at  timestamptz not null default now()
);

comment on table public.deal_analyses is
  'Разбор разговора: переписки или звонка. Один конвейер, два входа.';
comment on column public.deal_analyses.covered_to is
  'Время последнего сообщения, вошедшего в разбор. Появились новее — разбор устарел.';
comment on column public.deal_analyses.next_step is
  'Зафиксирован ли следующий шаг. Главный операционный показатель отдела: '
  'разговор без следующего шага — это разговор, после которого ничего не будет.';

-- Последний разбор по сделке — основная операция карточки.
create index if not exists idx_deal_analyses_deal
  on public.deal_analyses (deal_id, created_at desc);

-- Выборки РОПа: «у кого нет следующего шага», «холодные за неделю».
create index if not exists idx_deal_analyses_fresh
  on public.deal_analyses (created_at desc);

alter table public.deal_analyses disable row level security;

commit;

-- Проверить:
--   select source, count(*) from public.deal_analyses group by 1;
