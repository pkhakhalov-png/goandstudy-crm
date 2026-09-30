-- Кабинет куратора v2, миграция 019: ответ помощника сохраняется.
--
-- ЧТО БЫЛО НЕ ТАК. Поручение записывало вопрос, стоимость и статус — всё,
-- кроме самого ответа. Ответ жил только в состоянии React: обновил страницу —
-- и разговора нет. Заплатили за него дважды: деньгами при вызове и временем
-- куратора, когда он спрашивает то же самое заново.
--
-- Хуже того, это ломало проверяемость. «Почему куратор так решил» —
-- нормальный вопрос через месяц, и ответ на него был в переписке с помощником,
-- которой мы не сохраняли.
--
-- Откат: supabase/migrations/care/019_assistant_answer.rollback.sql

begin;

alter table care.assignments
  add column if not exists answer text null;

comment on column care.assignments.answer is
  'Что помощник ответил. Без этого разговор жил только в браузере и пропадал при обновлении страницы.';

create index if not exists care_assignments_recent_idx
  on care.assignments (initiator_member_id, created_at desc);

commit;
