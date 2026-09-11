-- Обратимый архив клиентов.
-- 1) Снапшот-таблица: хранит клиента + все его платежи/расходы на момент архивации,
--    чтобы восстановить «одним нажатием». Это же — отдельная «табличка архива».
-- 2) Разрешаем status='archived' в clients.

CREATE TABLE IF NOT EXISTS public.client_archive (
  client_id       integer PRIMARY KEY,
  archived_at     timestamptz NOT NULL DEFAULT now(),
  reason          text,
  original_status text,
  client_json     jsonb NOT NULL,
  payments_json   jsonb NOT NULL,
  expenses_json   jsonb NOT NULL
);

ALTER TABLE public.clients
  DROP CONSTRAINT IF EXISTS clients_status_check;
ALTER TABLE public.clients
  ADD CONSTRAINT clients_status_check
  CHECK (status IN ('active','completed','refunded','archived'));
