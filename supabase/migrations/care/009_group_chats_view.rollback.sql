-- Откат 009. Снимает представление групповых чатов.
-- Права на public.deal_messages не менялись и не меняются: их и не было.

begin;

drop view if exists care.group_chats;

commit;
