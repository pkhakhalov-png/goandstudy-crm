-- Площадки: полный список, а не только те, куда идём первыми.
--
-- Прошлая миграция разрешила одиннадцать кодов — ровно те, что были в реестре
-- на тот момент. Реестр вырос до двадцати четырёх: экран подключений должен
-- показывать все места, куда мы собираемся выпускать, включая те, что ждут
-- точки решения. Иначе «все площадки» на экране означает «те, про которые мы
-- вспомнили», и вопрос «а Pinterest мы вообще рассматривали» возвращается
-- каждый месяц.
--
-- Проверка остаётся: опечатка в коде площадки — это канал, который ни с чем не
-- сопоставится, и найдётся он не здесь, а когда публикация повиснет.
--
-- Список обязан совпадать с ПЛОЩАДКИ в lib/content/platforms.ts — расхождение
-- ловит scripts/content-connections-test.ts.

begin;

alter table content.channels drop constraint if exists channels_platform_check;
alter table content.channels add constraint channels_platform_check
  check (platform in (
    -- публикует машина
    'site', 'telegram', 'vk',
    -- выкладка руками
    'dzen', 'vc', 'tenchat', 'instagram', 'threads', 'facebook', 'ok', 'pikabu',
    'habr', 'x', 'linkedin', 'pinterest', 'bluesky', 'tiktok', 'youtube',
    'rutube', 'medium', 'whatsapp', 'email', 'maps', 'podcasts'
  ));

commit;

-- Проверить:
--   select platform, delivery, mode, count(*) from content.channels group by 1,2,3 order by 1;
