-- Откат 010. Снимает причину отмены, настройки напоминаний и индекс очереди.
-- Сами предложения и отправки остаются: их заводила миграция 005.

begin;

drop index if exists care.care_proposals_reminders_idx;

delete from care.settings
 where key in ('templates', 'reminder_window_days', 'reminder_repeat_days', 'reminder_pause_hours');

alter table care.outbound_actions drop column if exists cancel_reason;

commit;
