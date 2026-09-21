-- Площадок больше шести, и список живёт в коде.
--
-- В схеме допустимые площадки перечислены проверкой: telegram, vk, vc, dzen,
-- tenchat, site. Пока каналы заводились по одному, этого хватало. Но экран
-- подключений показывает весь список площадок, куда мы собираемся выпускать, —
-- и завести канал он должен на любую из них, иначе экран показывает то, чего
-- сделать нельзя.
--
-- Почему проверка остаётся, а не выбрасывается совсем. Опечатка в коде
-- площадки — это канал, который никогда ни с чем не сопоставится: профиль не
-- найдётся, коннектор не найдётся, публикация повиснет без объяснения.
-- Дешевле поймать её здесь.
--
-- Список должен совпадать с ПЛОЩАДКИ в lib/content/platforms.ts. Расходится —
-- ловит тест scripts/content-connections-test.ts.

begin;

alter table content.channels drop constraint if exists channels_platform_check;
alter table content.channels add constraint channels_platform_check
  check (platform in (
    'site', 'telegram', 'vk',
    'dzen', 'vc', 'tenchat', 'instagram', 'threads', 'youtube', 'ok', 'pikabu'
  ));

commit;

-- Проверить:
--   select platform, delivery, mode, count(*) from content.channels group by 1,2,3 order by 1;
