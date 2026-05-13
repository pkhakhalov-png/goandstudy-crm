-- "НЕ ЦЕЛЕВЫЕ" — финальный этап для нецелевых лидов.
-- При переносе сюда менеджер заполняет основание (deals.lost_reason).

INSERT INTO public.pipeline_stages (name, color, position, stage_type, is_active)
SELECT 'НЕ ЦЕЛЕВЫЕ', '#8E8E93', COALESCE(MAX(position), 0) + 1, 'lost', true
FROM public.pipeline_stages
WHERE NOT EXISTS (
  SELECT 1 FROM public.pipeline_stages WHERE name = 'НЕ ЦЕЛЕВЫЕ'
);
