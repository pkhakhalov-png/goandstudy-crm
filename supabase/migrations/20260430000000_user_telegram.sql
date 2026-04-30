-- TG-username продажников для тегирования в групповом чате уведомлений о записях.
-- Хранится без префикса @ (e.g. "ivan_petrov"), пусть UI и при отправке добавляет @ сам.

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS telegram_username TEXT;
