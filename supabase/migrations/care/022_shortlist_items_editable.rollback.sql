-- Откат 022. Подборка снова только читается.
--
-- Убранные строки вернутся в список: признака, по которому их прятали, больше
-- нет. Это лучше, чем удалять их вместе с колонкой — данные куратора не
-- должны пропадать при откате кода.

begin;

drop index if exists care.care_shortlist_items_active_idx;
alter table care.shortlist_items
  drop column if exists status,
  drop column if exists removed_reason,
  drop column if exists image_url;

commit;
