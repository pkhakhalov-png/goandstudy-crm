-- Звонки Zoom: встреча под бронь и запись разговора.
-- PRD: docs/PRD_SALES_UPGRADE.md, разделы 4 и 15.
--
-- Главное решение, ради которого нужны эти колонки: встречу создаём мы, а не
-- продажник. Тогда запись сшивается со сделкой точно — по идентификатору
-- встречи, — а не угадывается по телефону участника и времени. Угадывание на
-- общих аккаунтах не работает вовсе: хост у всех один.
--
-- Аккаунтов Zoom два на четверых продажников, оба лицензированные. Значит
-- одновременно можно вести две встречи, и какой аккаунт станет хостом — решает
-- код в момент брони. Отсюда `zoom_host_email` у брони: без него потом не
-- понять, под кем создавали, и не почистить облако.

begin;

alter table public.bookings
  add column if not exists zoom_meeting_id text,
  add column if not exists zoom_join_url   text,
  add column if not exists zoom_host_email text;

comment on column public.bookings.zoom_meeting_id is
  'Идентификатор встречи Zoom, созданной под эту бронь. По нему вебхук о готовой '
  'записи находит бронь и сделку — однозначно, без угадывания.';

-- Одна встреча — одна бронь. Уникальность здесь не украшение: если один и тот
-- же meeting_id окажется у двух броней, запись прилетит не тому клиенту.
create unique index if not exists bookings_zoom_meeting_uniq
  on public.bookings (zoom_meeting_id) where zoom_meeting_id is not null;

-- ── Записи разговоров ───────────────────────────────────────────────────────

create table if not exists public.call_recordings (
  id          uuid primary key default gen_random_uuid(),

  deal_id     uuid references public.deals(id) on delete set null,
  booking_id  uuid references public.bookings(id) on delete set null,

  source      text not null default 'zoom' check (source in ('zoom', 'upload')),
  -- Идентификатор файла у Zoom. Вебхук приходит повторно при сбоях доставки —
  -- по этому полю повтор отбрасывается, а не превращается во второй разбор
  -- того же разговора за те же деньги.
  external_id text,
  meeting_id  text,
  host_email  text,

  storage_path text,
  duration_sec int,
  started_at   timestamptz,
  file_size    bigint,

  status text not null default 'ingested'
    check (status in ('ingested', 'transcribing', 'transcribed', 'analyzing', 'done', 'failed', 'skipped')),
  error  text,

  -- Когда освободили место в облаке Zoom. NULL при status='done' означает, что
  -- чистка не прошла, и это видно, а не теряется.
  purged_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists call_recordings_external_uniq
  on public.call_recordings (external_id) where external_id is not null;
create index if not exists call_recordings_deal on public.call_recordings (deal_id, created_at desc);
create index if not exists call_recordings_status on public.call_recordings (status) where status <> 'done';

comment on table public.call_recordings is
  'Запись разговора: откуда приехала, где лежит наша копия, на каком шаге разбор.';

alter table public.call_recordings disable row level security;

-- ── Настройки ───────────────────────────────────────────────────────────────
--
-- Вебхук Zoom приходит на весь аккаунт, включая кураторские созвоны и
-- внутренние планёрки. Без списка разрешённых хостов чужие разговоры поехали бы
-- в разбор по чек-листу продаж и стоили бы денег. Список — настройкой, чтобы
-- третья лицензия не требовала выкатки.

insert into public.rop_settings (key, value) values
  ('calls_enabled',     'false'),
  ('calls_zoom_auto',   'false'),
  ('calls_zoom_purge',  'true'),
  ('calls_zoom_hosts',  '["gs@goandstudy.com"]'),
  ('calls_zoom_primary_host', '"gs@goandstudy.com"'),
  ('calls_zoom_backup_host',  '"gszoom@goandstudy.com"')
on conflict (key) do nothing;

commit;

-- Проверить:
--   select key, value from public.rop_settings where key like 'calls%' order by key;
--   select count(*) from public.call_recordings;
