-- Первое и последнее касание — раздельно (E5.2).
--
-- Зачем разделять. Человек читает статью про Австрию, через неделю приходит с
-- поста в Telegram и оставляет заявку. Если хранить одно касание, придётся
-- выбрать, кого считать автором заявки: статью или пост. Любой выбор соврёт —
-- статья привела интерес, пост привёл действие, и это разные заслуги.
--
-- PRD требует хранить оба и НЕ складывать их в отчёте. Отсюда две группы полей
-- вместо одной и отдельная оговорка ниже про то, почему их нельзя суммировать.
--
-- Страницы касаний (first_touch_page, last_touch_page) уже есть — добавляем к
-- ним время, метки кампании и источник перехода.

begin;

alter table seo.lead_identities
  add column if not exists first_touch_at       timestamptz,
  add column if not exists first_touch_utm      jsonb,
  add column if not exists first_touch_referrer text,
  add column if not exists last_touch_at        timestamptz,
  add column if not exists last_touch_utm       jsonb,
  add column if not exists last_touch_referrer  text,
  add column if not exists touches_count        int;

comment on column seo.lead_identities.first_touch_utm is
  'Метки кампании первого касания. utm_campaign = пакет, utm_content = публикация — '
  'соглашение PRD E5.2, по нему переход с поста связывается с тем, что его породило.';
comment on column seo.lead_identities.touches_count is
  'Сколько просмотров было до заявки. Один — человек пришёл и сразу оставил; '
  'много — читал и возвращался. Разница видна в отчёте и меняет вывод о том, '
  'что именно сработало.';
comment on column seo.lead_identities.last_touch_at is
  'Последнее касание перед заявкой. В отчёте показывается ОТДЕЛЬНО от первого '
  'и не складывается с ним: одна заявка — одно первое касание и одно последнее, '
  'а не две заявки.';

-- Поиск цепочки касаний по анонимному идентификатору — основная операция сшивки.
create index if not exists attr_anon_time on seo.attribution_events (anon_id, created_at)
  where anon_id is not null;

commit;

-- Проверить:
--   select count(*) from seo.lead_identities where first_touch_at is not null;
