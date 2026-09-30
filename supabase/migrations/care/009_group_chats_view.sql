-- Кабинет куратора v2, миграция 009: представление групповых чатов.
--
-- ЗАЧЕМ. Привязка дела к группе Телеграма требует знать, какие группы
-- вообще есть и как они называются. Эти сведения лежат в
-- `public.deal_messages`, которая роли контура намеренно не выдана: там вся
-- переписка воронки продаж, включая заявки, не ставшие клиентами.
--
-- ПОЧЕМУ ПРЕДСТАВЛЕНИЕ, А НЕ ГРАНТ НА ТАБЛИЦУ. Контуру нужны четыре вещи:
-- идентификатор чата, название, когда было последнее сообщение и сколько их.
-- Текста сообщений не нужно ни одного. Грант на таблицу дал бы всё сразу и
-- навсегда; представление отдаёт ровно необходимое, и расширить его можно
-- только новой миграцией.
--
-- Представление выполняется с правами владельца (postgres), поэтому роли
-- достаточно права на само представление — грант на `deal_messages` не
-- выдаётся и не понадобится. Это осознанный и узкий обход: всё, что через
-- него видно, перечислено в списке колонок ниже.
--
-- Откат: supabase/migrations/care/009_group_chats_view.rollback.sql

begin;

create or replace view care.group_chats as
select
  m.metadata ->> 'tgChatId'                as chat_id,
  max(m.metadata ->> 'chatTitle')          as title,
  max(m.metadata ->> 'chatType')           as chat_type,
  min(m.created_at)                        as first_at,
  max(m.created_at)                        as last_at,
  count(*)                                 as message_count
from public.deal_messages m
where m.metadata ->> 'chatType' in ('group', 'supergroup')
  and m.metadata ->> 'tgChatId' is not null
  and m.metadata ->> 'chatTitle' is not null
group by 1;

comment on view care.group_chats is
  'Группы Телеграма: идентификатор, название, даты, количество. Текста сообщений не отдаёт. Нужно для привязки дела к группе.';

grant select on care.group_chats to care_app;

commit;
