-- Откат 019. Снимает сохранение ответов помощника.
--
-- После отката разговор снова живёт только в браузере и пропадает при
-- обновлении страницы. Прежние ответы удаляются вместе с колонкой.

begin;

drop index if exists care.care_assignments_recent_idx;
alter table care.assignments drop column if exists answer;

commit;
