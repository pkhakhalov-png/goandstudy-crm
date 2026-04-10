-- =============================================
-- Go & Study CRM — Full Schema
-- =============================================

-- 1. USERS (extends Supabase Auth)
CREATE TABLE IF NOT EXISTS public.users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT,
  role TEXT NOT NULL DEFAULT 'salesperson' CHECK (role IN ('admin', 'salesperson')),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. CURATORS
CREATE TABLE IF NOT EXISTS public.curators (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. CLIENTS
CREATE TABLE IF NOT EXISTS public.clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  telegram TEXT,
  country TEXT,
  university TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed')),
  months INTEGER NOT NULL DEFAULT 1,
  notes TEXT,
  salesperson_id UUID REFERENCES public.users(id),
  curator_id UUID REFERENCES public.curators(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4. PAYMENTS
CREATE TABLE IF NOT EXISTS public.payments (
  id SERIAL PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  plan_date DATE NOT NULL,
  plan_sum NUMERIC NOT NULL DEFAULT 0,
  fact_date DATE,
  fact_sum NUMERIC,
  is_paid BOOLEAN NOT NULL DEFAULT false,
  status TEXT NOT NULL DEFAULT 'soon' CHECK (status IN ('soon', 'paid', 'overdue')),
  comment TEXT,
  updated_by UUID REFERENCES public.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 5. PAYMENTS VIEW (adds num = row number per client)
CREATE OR REPLACE VIEW public.payments_view AS
SELECT
  id,
  client_id,
  ROW_NUMBER() OVER (PARTITION BY client_id ORDER BY plan_date) AS num,
  plan_date,
  plan_sum,
  fact_sum,
  fact_date,
  is_paid,
  status,
  comment
FROM public.payments;

-- 6. EXPENSES
CREATE TABLE IF NOT EXISTS public.expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES public.clients(id) ON DELETE CASCADE,
  article TEXT NOT NULL,
  who TEXT,
  plan_date DATE,
  plan_sum NUMERIC NOT NULL DEFAULT 0,
  fact_date DATE,
  fact_sum NUMERIC,
  is_paid BOOLEAN NOT NULL DEFAULT false,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid')),
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 7. FIXED EXPENSES (templates)
CREATE TABLE IF NOT EXISTS public.fixed_expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  amount NUMERIC NOT NULL DEFAULT 0,
  period TEXT NOT NULL DEFAULT 'monthly' CHECK (period IN ('monthly', 'quarterly', 'yearly', 'once')),
  article TEXT NOT NULL DEFAULT 'other' CHECK (article IN ('office', 'salary', 'software', 'marketing', 'other')),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 8. FIXED EXPENSE RECORDS (actual monthly entries)
CREATE TABLE IF NOT EXISTS public.fixed_expense_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fixed_expense_id UUID NOT NULL REFERENCES public.fixed_expenses(id) ON DELETE CASCADE,
  month TEXT NOT NULL,
  amount NUMERIC NOT NULL DEFAULT 0,
  fact_amount NUMERIC,
  is_paid BOOLEAN NOT NULL DEFAULT false,
  fact_date DATE,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =============================================
-- RPC: create_client_with_payments
-- Creates a client and splits total into N monthly payments
-- =============================================
CREATE OR REPLACE FUNCTION public.create_client_with_payments(
  p_name TEXT,
  p_phone TEXT,
  p_email TEXT DEFAULT NULL,
  p_telegram TEXT DEFAULT NULL,
  p_country TEXT DEFAULT NULL,
  p_university TEXT DEFAULT NULL,
  p_total_amount NUMERIC DEFAULT 0,
  p_months INTEGER DEFAULT 1,
  p_first_pay_date DATE DEFAULT CURRENT_DATE,
  p_curator_id UUID DEFAULT NULL,
  p_salesperson_id UUID DEFAULT NULL,
  p_notes TEXT DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_client_id UUID;
  v_pay_amount NUMERIC;
  v_pay_date DATE;
BEGIN
  -- Create client
  INSERT INTO public.clients (name, phone, email, telegram, country, university, months, salesperson_id, curator_id, notes)
  VALUES (p_name, p_phone, p_email, p_telegram, p_country, p_university, p_months, p_salesperson_id, p_curator_id, p_notes)
  RETURNING id INTO v_client_id;

  -- Calculate per-month payment
  v_pay_amount := ROUND(p_total_amount / p_months, 2);

  -- Create payment records
  FOR i IN 0..(p_months - 1) LOOP
    v_pay_date := p_first_pay_date + (i || ' months')::INTERVAL;
    INSERT INTO public.payments (client_id, plan_date, plan_sum)
    VALUES (v_client_id, v_pay_date, v_pay_amount);
  END LOOP;

  RETURN json_build_object('id', v_client_id);
END;
$$;

-- =============================================
-- INDEXES
-- =============================================
CREATE INDEX IF NOT EXISTS idx_clients_salesperson ON public.clients(salesperson_id);
CREATE INDEX IF NOT EXISTS idx_clients_curator ON public.clients(curator_id);
CREATE INDEX IF NOT EXISTS idx_payments_client ON public.payments(client_id);
CREATE INDEX IF NOT EXISTS idx_payments_plan_date ON public.payments(plan_date);
CREATE INDEX IF NOT EXISTS idx_expenses_client ON public.expenses(client_id);
CREATE INDEX IF NOT EXISTS idx_fixed_expense_records_expense ON public.fixed_expense_records(fixed_expense_id);

-- =============================================
-- RLS (disable for now — app uses service role for admin)
-- =============================================
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.curators ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fixed_expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fixed_expense_records ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to read all data
CREATE POLICY "Authenticated read" ON public.users FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated read" ON public.clients FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated read" ON public.payments FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated read" ON public.expenses FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated read" ON public.curators FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated read" ON public.fixed_expenses FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated read" ON public.fixed_expense_records FOR SELECT TO authenticated USING (true);

-- Allow authenticated users to insert/update/delete (admin checks happen in app)
CREATE POLICY "Authenticated write" ON public.users FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated write" ON public.clients FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated write" ON public.payments FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated write" ON public.expenses FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated write" ON public.curators FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated write" ON public.fixed_expenses FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated write" ON public.fixed_expense_records FOR ALL TO authenticated USING (true) WITH CHECK (true);
