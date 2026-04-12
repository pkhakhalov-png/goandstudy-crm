-- Unique constraint on external_id prevents duplicate echo/local saves
CREATE UNIQUE INDEX IF NOT EXISTS idx_deal_messages_external_id
  ON public.deal_messages(external_id)
  WHERE external_id IS NOT NULL;
