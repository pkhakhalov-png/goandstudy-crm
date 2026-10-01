-- Откат 035. Возвращает представление к одной половине — прежнему боту.
--
-- После отката всё, что приходит care-боту, снова перестаёт быть видимым:
-- вопросы клиентов не станут задачами, факты не извлекутся. Ошибок не будет
-- ни одной — просто тишина.

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

grant select on care.case_messages to care_app;

commit;
