-- Instagram из списка площадок убран, список приведён к реестру.
--
-- Владелец снял ручную выкладку как путь: публикуем только тем, у чего есть
-- интерфейс публикации. Instagram убран отдельным решением — не потому, что
-- пути нет, а потому что площадка из планов вычеркнута.
--
-- Остальные коды не меняются: канал, заведённый на площадке, которая теперь
-- числится тупиковой, не ломается — он просто не получит коннектора.
--
-- Список обязан совпадать с ПЛОЩАДКИ в lib/content/platforms.ts — расхождение
-- ловит scripts/content-connections-test.ts.

begin;

-- Каналов на instagram быть не должно; если завёлся до решения — снимаем.
delete from content.channels where platform = 'instagram';
delete from content.connector_capabilities where platform = 'instagram';

alter table content.channels drop constraint if exists channels_platform_check;
alter table content.channels add constraint channels_platform_check
  check (platform in (
    -- публикует машина: свой сайт и площадки с интерфейсом публикации
    'site', 'telegram', 'vk', 'bluesky', 'vc', 'ok', 'x', 'threads',
    'pinterest', 'linkedin', 'facebook', 'youtube', 'tiktok', 'email',
    -- забирает сама, из нашей ленты
    'dzen', 'podcasts',
    -- пути нет: остаются в списке, чтобы решение было видно
    'tenchat', 'whatsapp', 'pikabu', 'habr', 'medium', 'rutube', 'maps'
  ));

commit;

-- Проверить:
--   select platform, delivery, mode, count(*) from content.channels group by 1,2,3 order by 1;
