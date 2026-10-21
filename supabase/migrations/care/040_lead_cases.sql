-- Кабинет куратора v2, миграция 040: дело-лид — человек после консультации,
-- который ещё не стал клиентом CRM.
--
-- ЗАЧЕМ. Консультации продаж теперь записываются и расшифровываются. Из
-- звонка известно почти всё, что куратору нужно для профиля: страна, бюджет,
-- уровень, сроки, сомнения. Владелец хочет видеть этих людей в кабинете уже
-- сейчас — с заполненным профилем и планом, что дальше, — а не после оплаты,
-- когда разговор забыт.
--
-- ПОЧЕМУ НЕ КЛИЕНТ В public.clients. Клиент там — это деньги: платежи,
-- комиссия продажника, зарплата куратора считаются от него. Завести клиента
-- ради профиля значит испортить финансы. Поэтому дело-лид держится на сделке
-- воронки (`deal_id`), а имя хранит у себя (`lead_name`) — как синтетическое
-- дело хранит `synthetic_name`, и по той же причине: чужую базу кабинет не
-- трогает.
--
-- Когда лид оплатит, делу проставят `client_id` и статус `active` — профиль,
-- источники и задачи останутся на месте.
--
-- Откат: supabase/migrations/care/040_lead_cases.rollback.sql

begin;

alter table care.cases
  add column if not exists deal_id   uuid,
  add column if not exists lead_name text;

comment on column care.cases.deal_id is
  'Сделка воронки продаж (public.deals.id) — по значению, без FK, как client_id. У дела-лида это единственная связь с CRM.';
comment on column care.cases.lead_name is
  'Имя для показа у дела-лида: клиента в public.clients у него ещё нет.';

create unique index if not exists care_cases_deal_uniq
  on care.cases (deal_id) where deal_id is not null;

alter table care.cases alter column client_id drop not null;

alter table care.cases drop constraint if exists cases_status_check;
alter table care.cases add constraint cases_status_check
  check (status in ('lead', 'active', 'paused', 'completed', 'archived'));

-- Чьё это дело — должно быть ясно всегда: клиент CRM, тестовое или лид со
-- сделкой и именем. Дела «ни о ком» быть не может.
alter table care.cases add constraint care_cases_who
  check (client_id is not null or is_synthetic or (deal_id is not null and lead_name is not null));

commit;

-- Проверить:
--   select status, count(*) from care.cases group by 1;
