-- Service type: "полное сопровождение" (full) vs "экспертная сессия" (session).
--
-- An expert session is a one-off 15 000 ₽ service: the salesperson still earns
-- 10% (1 500 ₽), but the curator is paid a single 7 500 ₽ — NOT the two 25 000 ₽
-- payouts that represent a client who fully entered work. The salesperson now
-- picks the service type when creating the client; it is stored on the client
-- and drives which curator expenses create_client_with_payments generates.

-- 1. Persist the choice on the client.
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS service_type TEXT NOT NULL DEFAULT 'full'
  CHECK (service_type IN ('full', 'session'));

-- 2. Replace the RPC. Drop the old signature first so adding the parameter does
--    not leave an ambiguous overload behind.
DROP FUNCTION IF EXISTS public.create_client_with_payments(
  TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, NUMERIC, INTEGER, DATE, UUID, UUID, TEXT);

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
  p_notes TEXT DEFAULT NULL,
  p_service_type TEXT DEFAULT 'full'
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_client_id INTEGER;
  v_pay_amount NUMERIC;
  v_pay_date DATE;
  v_second_pay DATE;
  v_per_payment BOOLEAN := (p_months >= 4);
  v_sp_name TEXT;
  v_cur_name TEXT;
BEGIN
  SELECT name INTO v_sp_name FROM public.users WHERE id = p_salesperson_id;
  SELECT name INTO v_cur_name FROM public.curators WHERE id = p_curator_id;

  INSERT INTO public.clients (name, phone, email, telegram, country, university, months, first_payment_date, salesperson_id, curator_id, notes, commission_per_payment, service_type)
  VALUES (p_name, p_phone, p_email, p_telegram, p_country, p_university, p_months, p_first_pay_date, p_salesperson_id, p_curator_id, p_notes, v_per_payment, p_service_type)
  RETURNING id INTO v_client_id;

  v_pay_amount := ROUND(p_total_amount / p_months, 2);

  FOR i IN 0..(p_months - 1) LOOP
    v_pay_date := p_first_pay_date + (i || ' months')::INTERVAL;
    INSERT INTO public.payments (client_id, num, plan_date, plan_sum)
    VALUES (v_client_id, i + 1, v_pay_date, v_pay_amount);
  END LOOP;

  v_second_pay := p_first_pay_date + INTERVAL '1 month';

  -- Curator payout depends on the service type.
  IF p_service_type = 'session' THEN
    -- Expert session: single 7 500 ₽ curator payout.
    INSERT INTO public.expenses (client_id, article, who, plan_date, plan_sum, is_paid, status, note) VALUES
      (v_client_id, 'curator', v_cur_name, p_first_pay_date, 7500, false, 'pending', 'Куратор — экспертная сессия');
  ELSE
    -- Full support: two 25 000 ₽ curator payouts.
    INSERT INTO public.expenses (client_id, article, who, plan_date, plan_sum, is_paid, status, note) VALUES
      (v_client_id, 'curator', v_cur_name, p_first_pay_date, 25000, false, 'pending', 'Куратор — этап 1'),
      (v_client_id, 'curator', v_cur_name, v_second_pay,     25000, false, 'pending', 'Куратор — этап 2');
  END IF;

  -- Salesperson commission: full 10% upfront only for <= 3 month installments.
  -- For 4+ months it is accrued per received payment by the trigger.
  IF NOT v_per_payment THEN
    INSERT INTO public.expenses (client_id, article, who, plan_date, plan_sum, is_paid, status, note) VALUES
      (v_client_id, 'salesperson', v_sp_name, p_first_pay_date, ROUND(p_total_amount * 0.1), false, 'pending',
       'ЗП продажника — 10% от ' || to_char(p_total_amount, 'FM999G999G999') || ' ₽');
  END IF;

  RETURN json_build_object('id', v_client_id);
END;
$$;
