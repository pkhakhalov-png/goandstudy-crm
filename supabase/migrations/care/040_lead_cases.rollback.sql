-- Откат 040: дела-лиды удаляются вместе с фактами, задачами и источниками
-- (каскад), затем схема возвращается к «дело = клиент CRM».
begin;
delete from care.cases where client_id is null and not is_synthetic;
alter table care.cases drop constraint if exists care_cases_who;
alter table care.cases drop constraint if exists cases_status_check;
alter table care.cases add constraint cases_status_check
  check (status in ('active', 'paused', 'completed', 'archived'));
update care.cases set client_id = 0 where client_id is null and is_synthetic;
alter table care.cases alter column client_id set not null;
drop index if exists care.care_cases_deal_uniq;
alter table care.cases drop column if exists lead_name, drop column if exists deal_id;
commit;
