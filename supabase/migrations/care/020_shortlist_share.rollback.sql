-- Откат 020. Убирает страницы для клиента.
--
-- Все выданные ссылки перестают работать вместе с колонкой — это и есть
-- правильное поведение отката: страница, которой больше не управляет контур,
-- не должна оставаться доступной.

begin;

drop index if exists care.care_shortlists_token_uniq;
alter table care.shortlists
  drop column if exists share_token,
  drop column if exists published_at,
  drop column if exists intro;

commit;
