-- Утверждение дорожной карты: куратор формирует, потом «Утверждаю» —
-- клиенту становится видно. Без approved_at клиент видит пустое состояние.

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS roadmap_approved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS roadmap_approved_by_name TEXT;
