-- Кабинет куратора v2, миграция 015: текст переписки по делам пилота.
--
-- РЕШЕНИЕ ВЛАДЕЛЬЦА ОТ 30.09.2026. Модели разрешено читать текст переписки и
-- расшифровок, чтобы извлекать из них факты. До этого решения контур видел
-- только, что переписка есть, сколько её и за какой период — представление
-- `care.group_chats` (миграция 009).
--
-- ПОЧЕМУ СНОВА ПРЕДСТАВЛЕНИЕ, А НЕ ГРАНТ НА ТАБЛИЦУ. `public.deal_messages` —
-- это двадцать пять тысяч сообщений всей воронки продаж, включая заявки, не
-- ставшие клиентами. Разрешение читать переписку клиента не означает
-- разрешения читать переписку с человеком, который до клиента не дошёл.
--
-- Поэтому видно строго следующее: сообщения тех чатов, которые привязаны к
-- делу, и только пока дело ведёт новый кабинет (`automation_owner = 'v2'`).
-- Снял дело с v2 — контур перестал видеть его переписку в ту же секунду, без
-- выката кода. Это и есть смысл переключателя.
--
-- ЧЕГО ЗДЕСЬ НЕТ. `file_id` — вложения это этап 6 и отдельное решение по
-- персональным документам. `deal_id` — связь с воронкой продаж контуру не
-- нужна и не даётся. Сообщения без текста отфильтрованы: голосовые и файлы
-- модели читать нечем.
--
-- Представление выполняется с правами владельца, поэтому грант на
-- `deal_messages` не выдаётся и не понадобится.
--
-- Откат: supabase/migrations/care/015_case_messages_view.rollback.sql

begin;

create or replace view care.case_messages as
select
  s.case_id                              as case_id,
  m.id                                   as message_id,
  m.created_at                           as created_at,
  m.direction                            as direction,
  m.sender_name                          as sender_name,
  m.content                              as content,
  m.metadata ->> 'tgChatId'              as chat_id
from public.deal_messages m
join care.sources s
  on s.kind = 'message'
 and s.ref ->> 'chat_id' = m.metadata ->> 'tgChatId'
join care.cases c
  on c.id = s.case_id
 and c.automation_owner = 'v2'
where m.content is not null
  and length(btrim(m.content)) > 0;

comment on view care.case_messages is
  'Текст переписки только по делам, переведённым на v2, и только по привязанным чатам. Сняли дело с v2 — переписка перестала быть видна.';

grant select on care.case_messages to care_app;

commit;
