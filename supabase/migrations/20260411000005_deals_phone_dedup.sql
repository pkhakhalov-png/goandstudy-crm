-- Normalized phone column for fast dedup lookups on 1M+ deals
ALTER TABLE public.deals ADD COLUMN IF NOT EXISTS phone_normalized TEXT;

-- Populate from existing contact_phone (strip non-digits, 8→7 prefix)
UPDATE public.deals SET phone_normalized = (
  CASE
    WHEN regexp_replace(contact_phone, '\D', '', 'g') ~ '^8\d{10}$'
    THEN '7' || substring(regexp_replace(contact_phone, '\D', '', 'g') from 2)
    WHEN length(regexp_replace(contact_phone, '\D', '', 'g')) = 10
    THEN '7' || regexp_replace(contact_phone, '\D', '', 'g')
    ELSE regexp_replace(contact_phone, '\D', '', 'g')
  END
) WHERE contact_phone IS NOT NULL AND contact_phone != '';

-- Index for instant lookups
CREATE INDEX IF NOT EXISTS idx_deals_phone_normalized ON public.deals(phone_normalized) WHERE phone_normalized IS NOT NULL;

-- RPC: find duplicate groups (returns groups of 2+ deals with same phone)
CREATE OR REPLACE FUNCTION public.find_duplicate_deals()
RETURNS TABLE(phone text, deal_ids uuid[], contact_names text[], deal_count bigint)
LANGUAGE sql STABLE
AS $$
  SELECT
    d.phone_normalized AS phone,
    array_agg(d.id ORDER BY d.created_at) AS deal_ids,
    array_agg(d.contact_name ORDER BY d.created_at) AS contact_names,
    count(*) AS deal_count
  FROM public.deals d
  WHERE d.phone_normalized IS NOT NULL
    AND d.phone_normalized != ''
    AND d.deleted_at IS NULL
  GROUP BY d.phone_normalized
  HAVING count(*) > 1
  ORDER BY count(*) DESC
  LIMIT 500;
$$;

-- RPC: merge deals — keep first (oldest), move activities/tasks/files, delete rest
CREATE OR REPLACE FUNCTION public.merge_deals(keep_id uuid, remove_ids uuid[])
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  rid uuid;
  remove_deal record;
  keep_deal record;
BEGIN
  SELECT * INTO keep_deal FROM public.deals WHERE id = keep_id;

  FOREACH rid IN ARRAY remove_ids LOOP
    SELECT * INTO remove_deal FROM public.deals WHERE id = rid;

    -- Fill missing contact fields from the deal being removed
    IF keep_deal.contact_telegram IS NULL AND remove_deal.contact_telegram IS NOT NULL THEN
      UPDATE public.deals SET contact_telegram = remove_deal.contact_telegram WHERE id = keep_id;
    END IF;
    IF keep_deal.contact_whatsapp IS NULL AND remove_deal.contact_whatsapp IS NOT NULL THEN
      UPDATE public.deals SET contact_whatsapp = remove_deal.contact_whatsapp WHERE id = keep_id;
    END IF;
    IF keep_deal.contact_email IS NULL AND remove_deal.contact_email IS NOT NULL THEN
      UPDATE public.deals SET contact_email = remove_deal.contact_email WHERE id = keep_id;
    END IF;
    IF keep_deal.booking_id IS NULL AND remove_deal.booking_id IS NOT NULL THEN
      UPDATE public.deals SET booking_id = remove_deal.booking_id WHERE id = keep_id;
    END IF;
    IF keep_deal.client_id IS NULL AND remove_deal.client_id IS NOT NULL THEN
      UPDATE public.deals SET client_id = remove_deal.client_id WHERE id = keep_id;
    END IF;

    -- Move child records to the kept deal
    UPDATE public.deal_activities SET deal_id = keep_id WHERE deal_id = rid;
    UPDATE public.deal_tasks SET deal_id = keep_id WHERE deal_id = rid;
    UPDATE public.deal_files SET deal_id = keep_id WHERE deal_id = rid;
    UPDATE public.deal_messages SET deal_id = keep_id WHERE deal_id = rid;

    -- Log merge
    INSERT INTO public.deal_activities (deal_id, activity_type, content)
    VALUES (keep_id, 'system', 'Дубль объединён: ' || remove_deal.contact_name || ' (' || COALESCE(remove_deal.contact_phone, '') || ')');

    -- Soft-delete merged deal
    UPDATE public.deals SET deleted_at = now() WHERE id = rid;
  END LOOP;

  -- Refresh keep deal timestamp
  UPDATE public.deals SET updated_at = now() WHERE id = keep_id;
END;
$$;
