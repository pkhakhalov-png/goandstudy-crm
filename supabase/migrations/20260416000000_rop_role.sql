-- ═══ РОП (Head of Sales) role + supporting tables ═══

-- 1. Add 'rop' to user roles
ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE public.users ADD CONSTRAINT users_role_check
  CHECK (role IN ('admin', 'salesperson', 'rop'));

-- 2. Sales plans — monthly targets per salesperson or department-wide
CREATE TABLE IF NOT EXISTS public.sales_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  month TEXT NOT NULL,
  salesperson_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
  plan_amount NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (month, salesperson_id)
);
-- Department-wide plan has salesperson_id IS NULL — need a partial unique index
CREATE UNIQUE INDEX IF NOT EXISTS sales_plans_department_month
  ON public.sales_plans(month) WHERE salesperson_id IS NULL;

ALTER TABLE public.sales_plans DISABLE ROW LEVEL SECURITY;

-- 3. ROP settings — configurable thresholds and weights
CREATE TABLE IF NOT EXISTS public.rop_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT UNIQUE NOT NULL,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO public.rop_settings (key, value) VALUES
  ('sla_response_minutes', '30'),
  ('stuck_deal_days', '5'),
  ('low_conversion_threshold', '0.7'),
  ('pipeline_weights', '{"early": 0.2, "mid": 0.5, "late": 0.8}'),
  ('score_weights', '{"sales": 0.4, "conv": 0.25, "sla": 0.2, "tasks": 0.15}'),
  ('watched_salespersons', '[]')
ON CONFLICT (key) DO NOTHING;

ALTER TABLE public.rop_settings DISABLE ROW LEVEL SECURITY;

-- 4. ROP actions log — audit trail
CREATE TABLE IF NOT EXISTS public.rop_actions_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rop_id UUID NOT NULL REFERENCES public.users(id),
  action_type TEXT NOT NULL,
  deal_id UUID REFERENCES public.deals(id),
  salesperson_id UUID REFERENCES public.users(id),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rop_actions_log_rop ON public.rop_actions_log(rop_id);
CREATE INDEX IF NOT EXISTS idx_rop_actions_log_created ON public.rop_actions_log(created_at DESC);

ALTER TABLE public.rop_actions_log DISABLE ROW LEVEL SECURITY;

-- 5. Pipeline stage weights (for weighted pipeline value)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'pipeline_stages' AND column_name = 'weight'
  ) THEN
    ALTER TABLE public.pipeline_stages ADD COLUMN weight NUMERIC DEFAULT 0;
    -- Set default weights by position
    UPDATE public.pipeline_stages SET weight = CASE
      WHEN stage_type = 'success' THEN 1.0
      WHEN stage_type IN ('lost', 'paused') THEN 0
      WHEN position <= 2 THEN 0.2
      WHEN position <= 4 THEN 0.5
      ELSE 0.8
    END;
  END IF;
END $$;

-- 6. Deal critical flag
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'deals' AND column_name = 'is_critical'
  ) THEN
    ALTER TABLE public.deals ADD COLUMN is_critical BOOLEAN DEFAULT false;
  END IF;
END $$;

-- 7. Task type for ROP-assigned tasks
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'deal_tasks' AND column_name = 'task_type'
  ) THEN
    ALTER TABLE public.deal_tasks ADD COLUMN task_type TEXT DEFAULT 'manual';
  END IF;
END $$;
