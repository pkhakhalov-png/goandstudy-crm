-- Кабинет куратора v2, миграция 035: переписка care-бота становится видимой.
--
-- ЧТО СЛОМАЛОСЬ БЫ ЗАВТРА. Представление `care.case_messages` читает
-- `public.deal_messages` — таблицу, которую наполняет **прежний** бот. Всё,
-- что приходит care-боту, лежит в `care.inbound_events` и не попадает туда
-- вовсе.
--
-- Пока бота нет ни в одной группе клиентов, это незаметно. Но ближайшее дело
-- команды — добавить его туда, и ровно в этот момент новые сообщения
-- перестанут доходить до разбора: вопросы клиентов не превратятся в задачи,
-- факты не извлекутся, «ждём клиента» не погаснет. Ошибок при этом не будет
-- ни одной — просто тишина, которую легко принять за спокойный день.
--
-- ЧТО ДЕЛАЕМ. Добавляем в то же представление вторую половину — события
-- care-бота, разобранные в ту же форму. Привязка к делу прежняя: через
-- `care.sources(kind='message', ref.chat_id)`, то есть ровно то, что ставит
-- привязка группы из карточки.
--
-- ПОЧЕМУ ПРЕДСТАВЛЕНИЕ, А НЕ КОПИРОВАНИЕ В ТАБЛИЦУ. Копия живёт своей жизнью:
-- отстаёт, дублируется, расходится при сбое переноса. Здесь же один источник —
-- само событие, как его прислал Телеграм.
--
-- ПОЧЕМУ ВСЁ ВХОДЯЩЕЕ. Бот получает и слова клиента, и слова наших, кто пишет
-- в той же группе. Различить их здесь нечем и не нужно: разбор входящих сам
-- решает, чьё это слово, и отмечает чужое как «без действия».
--
-- Откат: supabase/migrations/care/035_case_messages_care_bot.rollback.sql

begin;

create or replace view care.case_messages as
-- Прежний бот: история, перенесённая в контур.
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
  and length(btrim(m.content)) > 0

union all

-- Care-бот: то, что приходит сейчас.
select
  s.case_id                                                   as case_id,
  e.id                                                        as message_id,
  e.received_at                                               as created_at,
  'incoming'                                                  as direction,
  -- Имя отправителя: у групп оно есть почти всегда, но не обязано быть.
  coalesce(
    nullif(btrim(coalesce(e.payload -> 'message' -> 'from' ->> 'first_name', '') || ' ' ||
                 coalesce(e.payload -> 'message' -> 'from' ->> 'last_name', '')), ''),
    e.payload -> 'message' -> 'from' ->> 'username',
    'без имени'
  )                                                           as sender_name,
  coalesce(e.payload -> 'message' ->> 'text',
           e.payload -> 'message' ->> 'caption')              as content,
  e.payload -> 'message' -> 'chat' ->> 'id'                   as chat_id
from care.inbound_events e
join care.sources s
  on s.kind = 'message'
 and s.ref ->> 'chat_id' = e.payload -> 'message' -> 'chat' ->> 'id'
join care.cases c
  on c.id = s.case_id
 and c.automation_owner = 'v2'
where e.channel = 'telegram'
  -- Служебные обновления (вход бота в группу, смена прав) текста не несут.
  and coalesce(e.payload -> 'message' ->> 'text',
               e.payload -> 'message' ->> 'caption') is not null
  and length(btrim(coalesce(e.payload -> 'message' ->> 'text',
                            e.payload -> 'message' ->> 'caption'))) > 0;

comment on view care.case_messages is
  'Текст переписки по делам на v2: история прежнего бота и живые события care-бота. Сняли дело с v2 — переписка перестала быть видна.';

grant select on care.case_messages to care_app;

commit;
