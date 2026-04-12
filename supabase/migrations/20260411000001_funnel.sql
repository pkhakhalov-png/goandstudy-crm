-- Pipeline stages (configurable funnel columns)
CREATE TABLE IF NOT EXISTS public.pipeline_stages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#B15ECC',
  position INT NOT NULL DEFAULT 0,
  stage_type TEXT NOT NULL DEFAULT 'active' CHECK (stage_type IN ('active', 'success', 'lost', 'paused')),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Insert default stages matching amoCRM
INSERT INTO public.pipeline_stages (name, color, position, stage_type) VALUES
  ('Новые заявки', '#FF9500', 0, 'active'),
  ('Контакт', '#5AC8FA', 1, 'active'),
  ('Выявление потребности', '#AF52DE', 2, 'active'),
  ('Презентация/Консультация', '#007AFF', 3, 'active'),
  ('Возражения', '#FF9500', 4, 'active'),
  ('Договор', '#34C759', 5, 'active'),
  ('Первичная продажа', '#30D158', 6, 'success'),
  ('Оплата услуг', '#34C759', 7, 'success'),
  ('Догрев', '#FF9F0A', 8, 'paused'),
  ('Не пришёл на консультацию', '#FF453A', 9, 'lost'),
  ('На будущее', '#8E8E93', 10, 'paused');

-- Deals (main entity)
CREATE TABLE IF NOT EXISTS public.deals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  stage_id UUID NOT NULL REFERENCES public.pipeline_stages(id),
  salesperson_id UUID REFERENCES public.users(id),
  contact_name TEXT NOT NULL,
  contact_phone TEXT,
  contact_email TEXT,
  contact_telegram TEXT,
  contact_whatsapp TEXT,
  budget NUMERIC DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'RUB',
  source TEXT DEFAULT 'manual',
  booking_id UUID REFERENCES public.bookings(id) ON DELETE SET NULL,
  client_id INTEGER REFERENCES public.clients(id) ON DELETE SET NULL,
  custom_fields JSONB DEFAULT '{}',
  lost_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_at TIMESTAMPTZ
);

-- Deal activity feed
CREATE TABLE IF NOT EXISTS public.deal_activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id UUID NOT NULL REFERENCES public.deals(id) ON DELETE CASCADE,
  user_id UUID REFERENCES public.users(id),
  activity_type TEXT NOT NULL DEFAULT 'note',
  content TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_deals_stage ON public.deals(stage_id);
CREATE INDEX IF NOT EXISTS idx_deals_salesperson ON public.deals(salesperson_id);
CREATE INDEX IF NOT EXISTS idx_deals_booking ON public.deals(booking_id);
CREATE INDEX IF NOT EXISTS idx_deals_client ON public.deals(client_id);
CREATE INDEX IF NOT EXISTS idx_deal_activities_deal ON public.deal_activities(deal_id);

-- Disable RLS
ALTER TABLE public.pipeline_stages DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.deals DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.deal_activities DISABLE ROW LEVEL SECURITY;
