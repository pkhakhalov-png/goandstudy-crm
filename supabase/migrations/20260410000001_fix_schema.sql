-- Fix schema to match production

-- Drop existing view and constraints
DROP VIEW IF EXISTS public.payments_view;

-- 1. Fix curators: add contact column
ALTER TABLE public.curators ADD COLUMN IF NOT EXISTS contact TEXT;

-- 2. Fix clients: id should be serial integer, add first_payment_date
-- Need to recreate since changing PK type

-- Drop dependent tables first (order matters for FKs)
DROP TABLE IF EXISTS public.fixed_expense_records CASCADE;
DROP TABLE IF EXISTS public.fixed_expenses CASCADE;
DROP TABLE IF EXISTS public.expenses CASCADE;
DROP TABLE IF EXISTS public.payments CASCADE;
DROP TABLE IF EXISTS public.clients CASCADE;

-- Recreate clients with integer ID
CREATE TABLE public.clients (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  telegram TEXT,
  country TEXT,
  university TEXT,
  months INTEGER NOT NULL DEFAULT 1,
  first_payment_date DATE,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed')),
  notes TEXT,
  salesperson_id UUID REFERENCES public.users(id),
  curator_id UUID REFERENCES public.curators(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Recreate payments with num column, updated_at, no status column
CREATE TABLE public.payments (
  id SERIAL PRIMARY KEY,
  client_id INTEGER NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  num INTEGER NOT NULL DEFAULT 1,
  plan_date DATE NOT NULL,
  plan_sum NUMERIC NOT NULL DEFAULT 0,
  fact_date DATE,
  fact_sum NUMERIC,
  is_paid BOOLEAN NOT NULL DEFAULT false,
  comment TEXT,
  updated_by UUID REFERENCES public.users(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Recreate payments_view (adds computed status)
CREATE OR REPLACE VIEW public.payments_view AS
SELECT
  id,
  client_id,
  num,
  plan_date,
  plan_sum,
  fact_sum,
  fact_date,
  is_paid,
  CASE
    WHEN is_paid THEN 'paid'
    WHEN plan_date < CURRENT_DATE THEN 'overdue'
    ELSE 'soon'
  END AS status,
  comment
FROM public.payments;

-- Recreate expenses with integer client_id
CREATE TABLE public.expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id INTEGER REFERENCES public.clients(id) ON DELETE CASCADE,
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

-- Recreate fixed_expenses
CREATE TABLE public.fixed_expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  amount NUMERIC NOT NULL DEFAULT 0,
  period TEXT NOT NULL DEFAULT 'monthly' CHECK (period IN ('monthly', 'quarterly', 'yearly', 'once')),
  article TEXT NOT NULL DEFAULT 'other' CHECK (article IN ('office', 'salary', 'software', 'marketing', 'other')),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Recreate fixed_expense_records
CREATE TABLE public.fixed_expense_records (
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

-- Indexes
CREATE INDEX IF NOT EXISTS idx_clients_salesperson ON public.clients(salesperson_id);
CREATE INDEX IF NOT EXISTS idx_clients_curator ON public.clients(curator_id);
CREATE INDEX IF NOT EXISTS idx_payments_client ON public.payments(client_id);
CREATE INDEX IF NOT EXISTS idx_payments_plan_date ON public.payments(plan_date);
CREATE INDEX IF NOT EXISTS idx_expenses_client ON public.expenses(client_id);
CREATE INDEX IF NOT EXISTS idx_fixed_expense_records_expense ON public.fixed_expense_records(fixed_expense_id);

-- RLS
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fixed_expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fixed_expense_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read" ON public.clients FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated read" ON public.payments FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated read" ON public.expenses FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated read" ON public.fixed_expenses FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated read" ON public.fixed_expense_records FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated write" ON public.clients FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated write" ON public.payments FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated write" ON public.expenses FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated write" ON public.fixed_expenses FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated write" ON public.fixed_expense_records FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Update create_client_with_payments for integer client id
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
  v_client_id INTEGER;
  v_pay_amount NUMERIC;
  v_pay_date DATE;
BEGIN
  INSERT INTO public.clients (name, phone, email, telegram, country, university, months, first_payment_date, salesperson_id, curator_id, notes)
  VALUES (p_name, p_phone, p_email, p_telegram, p_country, p_university, p_months, p_first_pay_date, p_salesperson_id, p_curator_id, p_notes)
  RETURNING id INTO v_client_id;

  v_pay_amount := ROUND(p_total_amount / p_months, 2);

  FOR i IN 0..(p_months - 1) LOOP
    v_pay_date := p_first_pay_date + (i || ' months')::INTERVAL;
    INSERT INTO public.payments (client_id, num, plan_date, plan_sum)
    VALUES (v_client_id, i + 1, v_pay_date, v_pay_amount);
  END LOOP;

  RETURN json_build_object('id', v_client_id);
END;
$$;
