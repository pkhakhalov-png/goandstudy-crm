-- Soft delete for deals
ALTER TABLE public.deals ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- Deal tasks
CREATE TABLE IF NOT EXISTS public.deal_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id UUID NOT NULL REFERENCES public.deals(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  deadline TIMESTAMPTZ,
  is_done BOOLEAN NOT NULL DEFAULT false,
  assigned_to UUID REFERENCES public.users(id),
  created_by UUID REFERENCES public.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_deal_tasks_deal ON public.deal_tasks(deal_id);
ALTER TABLE public.deal_tasks DISABLE ROW LEVEL SECURITY;

-- Normalized phone on clients for fast dedup lookups
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS phone_normalized TEXT;

-- Populate existing
UPDATE public.clients SET phone_normalized = regexp_replace(
  CASE WHEN phone ~ '^8' AND length(regexp_replace(phone, '\D', '', 'g')) = 11
    THEN '7' || substring(regexp_replace(phone, '\D', '', 'g') from 2)
    ELSE regexp_replace(phone, '\D', '', 'g')
  END, '^\+', '', 'g'
) WHERE phone IS NOT NULL AND phone_normalized IS NULL;

CREATE INDEX IF NOT EXISTS idx_clients_phone_norm ON public.clients(phone_normalized);
