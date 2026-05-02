-- Дорожная карта клиента: список пунктов с месячной точностью.
-- Заполняется куратором, видит и сам клиент.
-- Структура:
-- [
--   { "id": "uuid", "stage": "intro", "title": "Стратегическая сессия", "month": "2026-02", "done": true },
--   ...
-- ]

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS roadmap_data JSONB DEFAULT '[]'::jsonb;
