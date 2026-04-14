-- Make create_client_with_payments also create the 3 default expense rows
-- (Куратор × 2 + ЗП продажника), so a client can never end up without expenses
-- if a follow-up insert from the server action fails silently.

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
  v_second_pay DATE;
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

  v_second_pay := p_first_pay_date + INTERVAL '1 month';

  INSERT INTO public.expenses (client_id, article, plan_date, plan_sum, is_paid, status, note) VALUES
    (v_client_id, 'curator', p_first_pay_date, 25000, false, 'pending', 'Куратор — этап 1'),
    (v_client_id, 'curator', v_second_pay,     25000, false, 'pending', 'Куратор — этап 2'),
    (v_client_id, 'salesperson', p_first_pay_date, ROUND(p_total_amount * 0.1), false, 'pending',
     'ЗП продажника — 10% от ' || to_char(p_total_amount, 'FM999G999G999') || ' ₽');

  RETURN json_build_object('id', v_client_id);
END;
$$;

-- Backfill: for active clients that currently have NO expenses, create the 3 defaults
-- using the sum of their planned payments as total_amount and the earliest plan_date.
DO $$
DECLARE
  c RECORD;
  v_total NUMERIC;
  v_first DATE;
  v_second DATE;
BEGIN
  FOR c IN
    SELECT cl.id
    FROM public.clients cl
    WHERE cl.status = 'active'
      AND NOT EXISTS (SELECT 1 FROM public.expenses e WHERE e.client_id = cl.id)
  LOOP
    SELECT COALESCE(SUM(plan_sum), 0), MIN(plan_date)
      INTO v_total, v_first
      FROM public.payments
      WHERE client_id = c.id;

    IF v_first IS NULL THEN
      v_first := CURRENT_DATE;
    END IF;
    v_second := v_first + INTERVAL '1 month';

    INSERT INTO public.expenses (client_id, article, plan_date, plan_sum, is_paid, status, note) VALUES
      (c.id, 'curator', v_first,  25000, false, 'pending', 'Куратор — этап 1'),
      (c.id, 'curator', v_second, 25000, false, 'pending', 'Куратор — этап 2'),
      (c.id, 'salesperson', v_first, ROUND(v_total * 0.1), false, 'pending',
       'ЗП продажника — 10% от ' || to_char(v_total, 'FM999G999G999') || ' ₽');
  END LOOP;
END $$;
