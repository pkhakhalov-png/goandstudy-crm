-- Deal files (documents, contracts, chat attachments)
CREATE TABLE IF NOT EXISTS public.deal_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id UUID NOT NULL REFERENCES public.deals(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  size INTEGER DEFAULT 0,
  mime_type TEXT,
  source TEXT NOT NULL DEFAULT 'upload' CHECK (source IN ('upload', 'wazzup', 'telegram', 'whatsapp')),
  uploaded_by UUID REFERENCES public.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Deal messages (for Wazzup TG/WhatsApp integration — prepared)
CREATE TABLE IF NOT EXISTS public.deal_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id UUID NOT NULL REFERENCES public.deals(id) ON DELETE CASCADE,
  direction TEXT NOT NULL DEFAULT 'incoming' CHECK (direction IN ('incoming', 'outgoing')),
  channel TEXT NOT NULL DEFAULT 'telegram' CHECK (channel IN ('telegram', 'whatsapp')),
  sender_name TEXT,
  content TEXT,
  file_id UUID REFERENCES public.deal_files(id) ON DELETE SET NULL,
  external_id TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_deal_files_deal ON public.deal_files(deal_id);
CREATE INDEX IF NOT EXISTS idx_deal_messages_deal ON public.deal_messages(deal_id);

ALTER TABLE public.deal_files DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.deal_messages DISABLE ROW LEVEL SECURITY;
