-- Откат 025. Снимает триггер и возвращает столбцу прежние условия.
--
-- Возвращать столкнувшиеся позиции обратно не нужно и нечем: нумерация
-- подряд — это исправление, а не изменение смысла.

begin;

drop trigger if exists shortlist_item_position on care.shortlist_items;
drop function if exists care.shortlist_item_position();

update care.shortlist_items set position = 0 where position is null;
alter table care.shortlist_items alter column position set default 0;
alter table care.shortlist_items alter column position set not null;

commit;
