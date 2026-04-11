-- Add fixed monetary value per stage (e.g. "Продажа" = 290000)
ALTER TABLE public.pipeline_stages ADD COLUMN IF NOT EXISTS value NUMERIC DEFAULT 0;
