-- Откат 005. Снимает поручения, предложения, отправки и журнал.
--
-- Внимание: вместе с журналом `care.events` теряется история решений — кто
-- что принял и на каком основании. Если контур работал с живыми клиентами,
-- выгрузите журнал до отката.

begin;

drop table if exists care.events cascade;
drop table if exists care.outbound_actions cascade;
drop table if exists care.proposals cascade;
drop table if exists care.assignment_items cascade;
drop table if exists care.assignments cascade;

commit;
