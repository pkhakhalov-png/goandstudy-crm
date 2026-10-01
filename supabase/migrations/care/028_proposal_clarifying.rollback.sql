-- Откат 028. Убирает состояние «ушло в уточнение».
--
-- Перед снятием ограничения переводим такие предложения в `rework`: иначе
-- ограничение не встанет на уже существующие строки. `rework` — ближайшее по
-- смыслу из оставшихся, хотя и неточное: дорабатывать там нечего.

begin;

update care.proposals set status = 'rework' where status = 'clarifying';

alter table care.proposals drop constraint if exists proposals_status_check;

alter table care.proposals
  add constraint proposals_status_check
  check (status in ('pending', 'accepted', 'rejected', 'rework', 'expired'));

commit;
