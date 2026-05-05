-- Разделяем имя клиента на first_name + last_name. name остаётся
-- legacy полем-конкатенацией для обратной совместимости.

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS first_name TEXT,
  ADD COLUMN IF NOT EXISTS last_name TEXT;

-- Backfill: для существующих клиентов пытаемся разделить по первому пробелу.
UPDATE public.clients
SET
  first_name = CASE WHEN position(' ' in name) > 0
    THEN split_part(name, ' ', 1)
    ELSE name END,
  last_name = CASE WHEN position(' ' in name) > 0
    THEN substring(name from position(' ' in name) + 1)
    ELSE NULL END
WHERE first_name IS NULL AND name IS NOT NULL;
