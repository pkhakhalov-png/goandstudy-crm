-- Каналы: площадок больше двух, и доставка у них разная.
--
-- В схеме было записано, что площадка — это telegram или vk. Так и было задумано
-- на E5: две площадки, обе с API. Но выпуск идёт ещё и на сайт, а VC, Дзен и
-- TenChat в обозримом будущем будут принимать материал руками — там либо нет
-- пригодного API, либо он не выдаётся под наши задачи.
--
-- Ручная площадка — это не «канал, который не работает». Это канал, где машина
-- готовит материал целиком, а публикует человек. Разница видна в двух местах:
-- у него не бывает исхода «отправили, ответа нет», зато бывает состояние «лежит
-- и ждёт рук четвёртый день», которого у API-канала не бывает вовсе.
--
-- Поэтому способ доставки — отдельное поле, а не вывод из названия площадки.
-- Завтра у VC появится токен, и канал станет api, не меняя ни истории, ни
-- публикаций.

begin;

alter table content.channels drop constraint if exists channels_platform_check;
alter table content.channels add constraint channels_platform_check
  check (platform in ('telegram', 'vk', 'vc', 'dzen', 'tenchat', 'site'));

alter table content.channels
  add column if not exists delivery text not null default 'manual';

alter table content.channels drop constraint if exists channels_delivery_check;
alter table content.channels add constraint channels_delivery_check
  check (delivery in ('api', 'ssh', 'manual'));

comment on column content.channels.delivery is
  'api — машина публикует сама через API площадки. ssh — машина кладёт файл на '
  'свой сервер. manual — машина готовит, человек публикует руками. От этого '
  'зависит, какие состояния у публикации вообще возможны: у ручного канала не '
  'бывает «ответа нет», зато бывает «ждёт рук четвёртый день».';

-- Существующие каналы: telegram и vk заводились под API, сайт ходит по ssh.
update content.channels set delivery = 'api' where platform in ('telegram', 'vk') and delivery = 'manual';
update content.channels set delivery = 'ssh' where platform = 'site' and delivery = 'manual';

commit;

-- Проверить:
--   select platform, delivery, mode, count(*) from content.channels group by 1,2,3;
