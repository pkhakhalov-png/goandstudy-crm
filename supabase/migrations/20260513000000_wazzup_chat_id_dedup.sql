-- Race-condition dedup for Wazzup-created deals.
-- Webhook now always writes custom_fields.wazzup_chat_id (was only set for groups).
-- This index enforces 1 active deal per chatId so two concurrent webhooks can't both
-- create deals (round-robin would otherwise split a single contact across managers).
--
-- Existing rows are NOT touched. Old individual deals with empty custom_fields stay
-- as-is; lookup continues to find them via deal_messages.metadata.

DO $$
DECLARE
  dup_count int;
BEGIN
  -- Count chatIds that already have 2+ active deals. These would block a strict
  -- unique index. If found, we fall back to a non-unique index — same query speed,
  -- no race protection until the user resolves them via merge_deals RPC.
  SELECT count(*) INTO dup_count FROM (
    SELECT custom_fields->>'wazzup_chat_id' AS chat_id, count(*) AS c
    FROM public.deals
    WHERE custom_fields->>'wazzup_chat_id' IS NOT NULL
      AND deleted_at IS NULL
    GROUP BY 1
    HAVING count(*) > 1
  ) t;

  IF dup_count > 0 THEN
    RAISE NOTICE 'Found % chatIds with duplicate active deals. Creating non-unique index; resolve duplicates with merge_deals() and rerun to enforce unique.', dup_count;
    EXECUTE $sql$
      CREATE INDEX IF NOT EXISTS idx_deals_wazzup_chat_id
        ON public.deals ((custom_fields->>'wazzup_chat_id'))
        WHERE custom_fields->>'wazzup_chat_id' IS NOT NULL AND deleted_at IS NULL
    $sql$;
  ELSE
    EXECUTE $sql$
      CREATE UNIQUE INDEX IF NOT EXISTS idx_deals_wazzup_chat_id_unique
        ON public.deals ((custom_fields->>'wazzup_chat_id'))
        WHERE custom_fields->>'wazzup_chat_id' IS NOT NULL AND deleted_at IS NULL
    $sql$;
  END IF;
END $$;

-- Helper: list chatIds with duplicate active deals — for auditing before re-running
-- this migration if it created a non-unique index.
CREATE OR REPLACE FUNCTION public.find_duplicate_wazzup_chats()
RETURNS TABLE(chat_id text, deal_ids uuid[], deal_count bigint)
LANGUAGE sql STABLE
AS $$
  SELECT
    d.custom_fields->>'wazzup_chat_id' AS chat_id,
    array_agg(d.id ORDER BY d.created_at) AS deal_ids,
    count(*) AS deal_count
  FROM public.deals d
  WHERE d.custom_fields->>'wazzup_chat_id' IS NOT NULL
    AND d.deleted_at IS NULL
  GROUP BY 1
  HAVING count(*) > 1
  ORDER BY count(*) DESC;
$$;
