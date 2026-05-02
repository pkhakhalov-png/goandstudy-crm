-- Структурированный «Проект студента»: 8 стратегических полей + заметка куратора.
-- Заполняется куратором после стратегической сессии. Клиент видит и может
-- редактировать. Хранится одной JSONB-колонкой в clients для простоты.
--
-- Структура:
-- {
--   "level": "Магистратура",
--   "specialty": "...",
--   "location": "...",
--   "budget": "...",
--   "start_date": "...",
--   "english": "...",
--   "education": "...",
--   "other": "...",
--   "note": "...",
--   "updated_at": "2026-05-02T...",
--   "updated_by_name": "Куратор Анна"
-- }

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS project_data JSONB DEFAULT '{}'::jsonb;
