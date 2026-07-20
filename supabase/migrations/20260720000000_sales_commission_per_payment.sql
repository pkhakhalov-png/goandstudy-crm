-- Sales commission payout rule
-- ---------------------------------------------------------------------------
-- Rule: the salesperson earns 10% of the deal.
--   * Full payment or installment up to 3 months  -> the full 10% is booked
--     as ONE expense immediately at client creation (paid out right away).
--   * Installment of 4 months or more -> commission accrues per received
--     payment: 10% of each actually received amount, booked as an expense when
--     the client's payment is marked as paid ("от полученных средств").
--
-- Existing clients keep their current single lump-sum commission untouched:
-- the per-payment behaviour is gated by clients.commission_per_payment, which
-- defaults to false and is only set true for NEW 4+ month clients.
-- ---------------------------------------------------------------------------

-- 1. Client flag: when true, this client's commission is accrued per payment
--    (via the trigger below) instead of one lump sum at creation.
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS commission_per_payment BOOLEAN NOT NULL DEFAULT false;

-- 2. Link a commission expense back to the client payment that generated it.
--    ON DELETE SET NULL keeps already-settled commission history if a payment
--    is later deleted (the trigger only removes still-unpaid commission rows).
ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS payment_id INTEGER REFERENCES public.payments(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_expenses_payment_id ON public.expenses(payment_id);

-- 3. Recreate the client-creation RPC.
--    - fills expenses.who with the salesperson name (so the admin "Продажники"
--      tab groups payouts per person)
--    - months <= 3  -> one salesperson lump = 10% of the whole deal
--    - months >= 4  -> no lump; sets commission_per_payment = true so the
--      trigger books commission per received payment
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
  v_per_payment BOOLEAN := (p_months >= 4);
  v_sp_name TEXT;
BEGIN
  SELECT name INTO v_sp_name FROM public.users WHERE id = p_salesperson_id;

  INSERT INTO public.clients (name, phone, email, telegram, country, university, months, first_payment_date, salesperson_id, curator_id, notes, commission_per_payment)
  VALUES (p_name, p_phone, p_email, p_telegram, p_country, p_university, p_months, p_first_pay_date, p_salesperson_id, p_curator_id, p_notes, v_per_payment)
  RETURNING id INTO v_client_id;

  v_pay_amount := ROUND(p_total_amount / p_months, 2);

  FOR i IN 0..(p_months - 1) LOOP
    v_pay_date := p_first_pay_date + (i || ' months')::INTERVAL;
    INSERT INTO public.payments (client_id, num, plan_date, plan_sum)
    VALUES (v_client_id, i + 1, v_pay_date, v_pay_amount);
  END LOOP;

  v_second_pay := p_first_pay_date + INTERVAL '1 month';

  -- Curator payouts (unchanged)
  INSERT INTO public.expenses (client_id, article, plan_date, plan_sum, is_paid, status, note) VALUES
    (v_client_id, 'curator', p_first_pay_date, 25000, false, 'pending', 'Куратор — этап 1'),
    (v_client_id, 'curator', v_second_pay,     25000, false, 'pending', 'Куратор — этап 2');

  -- Salesperson commission: full 10% upfront only for <= 3 month installments.
  -- For 4+ months it is accrued per received payment by the trigger below.
  IF NOT v_per_payment THEN
    INSERT INTO public.expenses (client_id, article, who, plan_date, plan_sum, is_paid, status, note) VALUES
      (v_client_id, 'salesperson', v_sp_name, p_first_pay_date, ROUND(p_total_amount * 0.1), false, 'pending',
       'ЗП продажника — 10% от ' || to_char(p_total_amount, 'FM999G999G999') || ' ₽');
  END IF;

  RETURN json_build_object('id', v_client_id);
END;
$$;

-- 4. Trigger: keep per-payment salesperson commission in sync with client
--    payments, but only for clients flagged commission_per_payment = true.
CREATE OR REPLACE FUNCTION public.sync_sales_commission()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_rate CONSTANT NUMERIC := 0.10;
  v_flag BOOLEAN;
  v_sp UUID;
  v_name TEXT;
BEGIN
  IF TG_OP = 'DELETE' THEN
    -- Drop the commission tied to a removed payment, unless it was already
    -- paid out to the salesperson (that stays as history, payment_id -> NULL).
    DELETE FROM public.expenses
     WHERE payment_id = OLD.id AND article = 'salesperson' AND is_paid = false;
    RETURN OLD;
  END IF;

  SELECT c.commission_per_payment, c.salesperson_id
    INTO v_flag, v_sp
    FROM public.clients c
   WHERE c.id = NEW.client_id;

  -- Not a per-payment client -> leave commission handling to creation-time lump.
  IF v_flag IS NOT TRUE THEN
    RETURN NEW;
  END IF;

  SELECT name INTO v_name FROM public.users WHERE id = v_sp;

  IF NEW.is_paid AND COALESCE(NEW.fact_sum, 0) > 0 THEN
    IF EXISTS (
      SELECT 1 FROM public.expenses
       WHERE payment_id = NEW.id AND article = 'salesperson'
    ) THEN
      -- Recompute an existing, not-yet-paid-out commission (e.g. fact_sum edited).
      UPDATE public.expenses
         SET plan_sum  = ROUND(NEW.fact_sum * v_rate),
             plan_date = COALESCE(NEW.fact_date, CURRENT_DATE),
             who       = v_name,
             note      = 'ЗП продажника — 10% с платежа ' || to_char(NEW.fact_sum, 'FM999G999G999') || ' ₽'
       WHERE payment_id = NEW.id AND article = 'salesperson' AND is_paid = false;
    ELSE
      INSERT INTO public.expenses (client_id, payment_id, article, who, plan_date, plan_sum, is_paid, status, note)
      VALUES (NEW.client_id, NEW.id, 'salesperson', v_name, COALESCE(NEW.fact_date, CURRENT_DATE),
              ROUND(NEW.fact_sum * v_rate), false, 'pending',
              'ЗП продажника — 10% с платежа ' || to_char(NEW.fact_sum, 'FM999G999G999') || ' ₽');
    END IF;
  ELSE
    -- Payment un-marked / cleared -> remove its still-unpaid commission.
    DELETE FROM public.expenses
     WHERE payment_id = NEW.id AND article = 'salesperson' AND is_paid = false;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_sales_commission ON public.payments;
CREATE TRIGGER trg_sync_sales_commission
AFTER INSERT OR DELETE OR UPDATE OF is_paid, fact_sum, fact_date ON public.payments
FOR EACH ROW EXECUTE FUNCTION public.sync_sales_commission();
