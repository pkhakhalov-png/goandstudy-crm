-- Add "Релокац" stage right after "Группы" and migrate existing relocation deals.

DO $$
DECLARE
  group_pos INT;
  reloc_pos INT;
BEGIN
  IF EXISTS (SELECT 1 FROM public.pipeline_stages WHERE name ILIKE 'релокац%') THEN
    RETURN;
  END IF;

  SELECT position INTO group_pos
  FROM public.pipeline_stages
  WHERE name ILIKE '%групп%'
  ORDER BY position ASC
  LIMIT 1;

  IF group_pos IS NULL THEN
    SELECT COALESCE(MAX(position), -1) + 1 INTO reloc_pos FROM public.pipeline_stages;
  ELSE
    reloc_pos := group_pos + 1;
    UPDATE public.pipeline_stages
    SET position = position + 1
    WHERE position >= reloc_pos;
  END IF;

  INSERT INTO public.pipeline_stages (name, color, position, stage_type)
  VALUES ('Релокац', '#B15ECC', reloc_pos, 'active');
END $$;

-- Move existing relocation deals into the new stage
UPDATE public.deals d
SET stage_id = s.id
FROM public.pipeline_stages s
WHERE s.name ILIKE 'релокац%'
  AND d.title ILIKE 'релокац%'
  AND d.deleted_at IS NULL;

-- Merge duplicate group deals: keep the oldest per title, soft-delete the rest
WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (PARTITION BY title ORDER BY created_at ASC) AS rn
  FROM public.deals
  WHERE deleted_at IS NULL
    AND (custom_fields->>'is_group' = 'true' OR source LIKE '%group%')
)
UPDATE public.deals
SET deleted_at = now()
WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

-- Backfill unified group_chat_id for legacy rows so the unique index covers everything
UPDATE public.deals
SET custom_fields = custom_fields || jsonb_build_object(
  'group_chat_id',
  COALESCE(custom_fields->>'group_chat_id', custom_fields->>'tg_chat_id', custom_fields->>'wazzup_chat_id')
)
WHERE deleted_at IS NULL
  AND custom_fields->>'group_chat_id' IS NULL
  AND (custom_fields->>'tg_chat_id' IS NOT NULL OR custom_fields->>'wazzup_chat_id' IS NOT NULL);

-- Prevent future race-created duplicates: one active deal per group chat
CREATE UNIQUE INDEX IF NOT EXISTS uniq_deals_group_chat_id
  ON public.deals ((custom_fields->>'group_chat_id'))
  WHERE deleted_at IS NULL AND custom_fields->>'group_chat_id' IS NOT NULL;
