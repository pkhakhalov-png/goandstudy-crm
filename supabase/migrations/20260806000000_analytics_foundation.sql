-- Analytics foundation for /admin/analytics.
-- Read-only aggregation layer: one consolidated money view, assignment history,
-- daily snapshots, and one JSON-returning RPC per analytics tab.
-- Nothing here changes CRM business logic; it only reads existing data.

-- ============================================================================
-- 1. v_money_in — единственный источник «сколько реально пришло денег».
--    UNION оплаченных траншей рассрочки и подтверждённых счетов T-Bank.
--    Возвраты (payments.num = -1, отрицательный fact_sum) естественно
--    уменьшают сумму. Для атрибуции — LEFT JOIN clients.
-- ============================================================================
CREATE OR REPLACE VIEW public.v_money_in AS
  SELECT p.fact_date AS dt, p.fact_sum AS amount, 'installment'::text AS source,
         p.client_id, c.salesperson_id, c.curator_id
    FROM public.payments p
    LEFT JOIN public.clients c ON c.id = p.client_id
   WHERE p.is_paid = true AND p.fact_date IS NOT NULL AND p.fact_sum IS NOT NULL
  UNION ALL
  SELECT i.updated_at::date AS dt, i.amount, 'invoice'::text AS source,
         i.client_id, c.salesperson_id, c.curator_id
    FROM public.invoices i
    LEFT JOIN public.clients c ON c.id = i.client_id
   WHERE i.status = 'CONFIRMED';

-- ============================================================================
-- 2. assignment_history — лог смены куратора/продажника у клиента.
--    Копится с момента применения миграции (историю задним числом не создаём).
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.assignment_history (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity      TEXT NOT NULL DEFAULT 'client',
  client_id   INTEGER,
  field       TEXT NOT NULL,             -- 'curator_id' | 'salesperson_id'
  old_value   TEXT,
  new_value   TEXT,
  changed_by  UUID,
  changed_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_assignment_history_client ON public.assignment_history(client_id, changed_at DESC);

CREATE OR REPLACE FUNCTION public.log_client_assignment()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.curator_id IS DISTINCT FROM OLD.curator_id THEN
    INSERT INTO public.assignment_history(client_id, field, old_value, new_value)
    VALUES (NEW.id, 'curator_id', OLD.curator_id::text, NEW.curator_id::text);
  END IF;
  IF NEW.salesperson_id IS DISTINCT FROM OLD.salesperson_id THEN
    INSERT INTO public.assignment_history(client_id, field, old_value, new_value)
    VALUES (NEW.id, 'salesperson_id', OLD.salesperson_id::text, NEW.salesperson_id::text);
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_log_client_assignment ON public.clients;
CREATE TRIGGER trg_log_client_assignment
  AFTER UPDATE OF curator_id, salesperson_id ON public.clients
  FOR EACH ROW EXECUTE FUNCTION public.log_client_assignment();

-- ============================================================================
-- 3. daily_snapshots — ежедневный срез для трендов (наполняется pg_cron).
--    NULLS NOT DISTINCT, чтобы «общая» строка (curator/salesperson = NULL)
--    была upsert-абельной.
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.daily_snapshots (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date           DATE NOT NULL,
  curator_id     UUID,
  salesperson_id UUID,
  metrics        JSONB NOT NULL DEFAULT '{}',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT daily_snapshots_uniq UNIQUE NULLS NOT DISTINCT (date, curator_id, salesperson_id)
);

CREATE OR REPLACE FUNCTION public.take_daily_snapshot()
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  -- Общий срез
  INSERT INTO public.daily_snapshots(date, curator_id, salesperson_id, metrics)
  SELECT CURRENT_DATE, NULL, NULL, jsonb_build_object(
    'active_clients',    (SELECT count(*) FROM public.clients WHERE status = 'active'),
    'pipeline_weighted', (SELECT COALESCE(sum(d.budget * s.weight), 0)
                            FROM public.deals d
                            JOIN public.pipeline_stages s ON s.id = d.stage_id
                           WHERE d.deleted_at IS NULL AND s.stage_type = 'active'),
    'receivables',       (SELECT COALESCE(sum(plan_sum), 0) FROM public.payments
                           WHERE is_paid = false AND num >= 0),
    'overdue_sum',       (SELECT COALESCE(sum(plan_sum), 0) FROM public.payments
                           WHERE is_paid = false AND num >= 0 AND plan_date < CURRENT_DATE)
  )
  ON CONFLICT (date, curator_id, salesperson_id) DO UPDATE SET metrics = EXCLUDED.metrics;

  -- Срез загрузки по кураторам
  INSERT INTO public.daily_snapshots(date, curator_id, salesperson_id, metrics)
  SELECT CURRENT_DATE, cu.id, NULL, jsonb_build_object(
    'active_clients', (SELECT count(*) FROM public.clients c
                        WHERE c.status = 'active' AND c.curator_id = cu.id),
    'max_clients',    cu.max_clients
  )
  FROM public.curators cu
  ON CONFLICT (date, curator_id, salesperson_id) DO UPDATE SET metrics = EXCLUDED.metrics;
END; $$;

-- Расписание (включить, когда появится вкладка динамики):
--   CREATE EXTENSION IF NOT EXISTS pg_cron;
--   SELECT cron.schedule('daily-snapshot', '5 0 * * *', $$ SELECT public.take_daily_snapshot() $$);

-- ============================================================================
-- 4. RPC по вкладкам — один запрос на вкладку, вход p_from/p_to, выход JSON.
--    Месячные ряды — trailing-12 месяцев (не зависят от периода).
-- ============================================================================

-- 4.1 ДЕНЬГИ
CREATE OR REPLACE FUNCTION public.analytics_money(p_from date, p_to date)
RETURNS json LANGUAGE sql STABLE SECURITY DEFINER AS $$
  WITH
  came AS (SELECT COALESCE(sum(amount),0) v FROM public.v_money_in WHERE dt BETWEEN p_from AND p_to),
  plan AS (SELECT COALESCE(sum(plan_sum),0) v FROM public.payments
            WHERE num >= 0 AND plan_date BETWEEN p_from AND p_to),
  recv AS (SELECT COALESCE(sum(plan_sum),0) v FROM public.payments
            WHERE is_paid = false AND num >= 0),
  overdue AS (SELECT COALESCE(sum(plan_sum),0) v FROM public.payments
               WHERE is_paid = false AND num >= 0 AND plan_date < CURRENT_DATE),
  exp AS (SELECT COALESCE(sum(COALESCE(fact_sum, plan_sum)),0) v FROM public.expenses
           WHERE is_paid = true AND COALESCE(fact_date, plan_date) BETWEEN p_from AND p_to),
  fixed AS (SELECT COALESCE(sum(COALESCE(fact_amount, amount)),0) v FROM public.fixed_expense_records
             WHERE is_paid = true AND month BETWEEN to_char(p_from,'YYYY-MM') AND to_char(p_to,'YYYY-MM')),
  months AS (
    SELECT gs::date AS m
      FROM generate_series(date_trunc('month', CURRENT_DATE) - interval '11 months',
                           date_trunc('month', CURRENT_DATE), interval '1 month') gs
  ),
  monthly AS (
    SELECT to_char(m,'YYYY-MM') AS ym,
      (SELECT COALESCE(sum(plan_sum),0) FROM public.payments
        WHERE num>=0 AND date_trunc('month', plan_date) = months.m) AS plan,
      (SELECT COALESCE(sum(amount),0) FROM public.v_money_in
        WHERE date_trunc('month', dt) = months.m) AS fact,
      (SELECT COALESCE(sum(COALESCE(fact_sum,plan_sum)),0) FROM public.expenses
        WHERE is_paid=true AND date_trunc('month', COALESCE(fact_date,plan_date)) = months.m) AS expenses
    FROM months
  ),
  breakdown AS (
    SELECT article, COALESCE(sum(COALESCE(fact_sum, plan_sum)),0) AS total
      FROM public.expenses
     WHERE is_paid = true AND COALESCE(fact_date, plan_date) BETWEEN p_from AND p_to
     GROUP BY article
  ),
  sources AS (
    SELECT source, COALESCE(sum(amount),0) AS total FROM public.v_money_in
     WHERE dt BETWEEN p_from AND p_to GROUP BY source
  ),
  debtors AS (
    SELECT c.id AS client_id, c.name, c.country, c.service_type,
           t.debt, t.overdue_days
      FROM (SELECT client_id, sum(plan_sum) debt,
                   MAX(CASE WHEN plan_date < CURRENT_DATE THEN (CURRENT_DATE - plan_date) ELSE 0 END) overdue_days
              FROM public.payments WHERE is_paid=false AND num>=0
             GROUP BY client_id HAVING sum(plan_sum) > 0) t
      JOIN public.clients c ON c.id = t.client_id
     ORDER BY t.debt DESC
  ),
  refunds AS (
    SELECT c.id AS client_id, c.name, ABS(p.fact_sum) AS amount, p.comment AS reason
      FROM public.payments p JOIN public.clients c ON c.id = p.client_id
     WHERE p.num < 0 AND COALESCE(p.fact_date, p.plan_date) BETWEEN p_from AND p_to
  )
  SELECT json_build_object(
    'kpis', json_build_object(
      'came', (SELECT v FROM came), 'plan', (SELECT v FROM plan),
      'receivables', (SELECT v FROM recv), 'overdue', (SELECT v FROM overdue),
      'expenses', (SELECT v FROM exp) + (SELECT v FROM fixed),
      'profit', (SELECT v FROM came) - ((SELECT v FROM exp) + (SELECT v FROM fixed))),
    'monthly', (SELECT COALESCE(json_agg(monthly ORDER BY ym),'[]') FROM monthly),
    'expense_breakdown', (SELECT COALESCE(json_agg(breakdown ORDER BY total DESC),'[]') FROM breakdown),
    'sources', (SELECT COALESCE(json_agg(sources),'[]') FROM sources),
    'debtors', (SELECT COALESCE(json_agg(debtors),'[]') FROM debtors),
    'refunds', (SELECT COALESCE(json_agg(refunds),'[]') FROM refunds),
    'refunds_total', (SELECT COALESCE(sum(amount),0) FROM refunds)
  );
$$;

-- 4.2 ПРОДАЖНИКИ
CREATE OR REPLACE FUNCTION public.analytics_sales(p_from date, p_to date)
RETURNS json LANGUAGE sql STABLE SECURITY DEFINER AS $$
  WITH
  sp AS (SELECT id, name FROM public.users WHERE role = 'salesperson'),
  rows AS (
    SELECT sp.id AS salesperson_id, sp.name,
      (SELECT count(*) FROM public.deals d WHERE d.salesperson_id = sp.id
        AND d.deleted_at IS NULL AND d.created_at::date BETWEEN p_from AND p_to) AS new_deals,
      (SELECT count(*) FROM public.deals d WHERE d.salesperson_id = sp.id AND d.deleted_at IS NULL) AS total_deals,
      (SELECT count(*) FROM public.deals d WHERE d.salesperson_id = sp.id AND d.deleted_at IS NULL
        AND d.client_id IS NOT NULL) AS converted,
      (SELECT COALESCE(sum(amount),0) FROM public.v_money_in v
        WHERE v.salesperson_id = sp.id AND v.dt BETWEEN p_from AND p_to) AS collected,
      (SELECT COALESCE(sum(plan_amount),0) FROM public.sales_plans
        WHERE salesperson_id = sp.id AND month = to_char(p_to,'YYYY-MM')) AS plan,
      (SELECT COALESCE(sum(pm.plan_sum),0) FROM public.payments pm JOIN public.clients c ON c.id = pm.client_id
        WHERE c.salesperson_id = sp.id AND pm.is_paid=false AND pm.num>=0 AND pm.plan_date < CURRENT_DATE) AS overdue,
      (SELECT COALESCE(sum(COALESCE(e.fact_sum,e.plan_sum)),0) FROM public.expenses e JOIN public.clients c ON c.id=e.client_id
        WHERE e.article='salesperson' AND c.salesperson_id = sp.id
        AND COALESCE(e.fact_date,e.plan_date) BETWEEN p_from AND p_to) AS commission
    FROM sp
  ),
  months AS (
    SELECT gs::date AS m FROM generate_series(date_trunc('month', CURRENT_DATE) - interval '7 months',
                                              date_trunc('month', CURRENT_DATE), interval '1 month') gs
  ),
  dynamics AS (
    SELECT sp.id AS salesperson_id, sp.name,
      (SELECT COALESCE(json_agg(json_build_object('ym', to_char(m,'YYYY-MM'),
          'v', (SELECT COALESCE(sum(amount),0) FROM public.v_money_in v
                 WHERE v.salesperson_id = sp.id AND date_trunc('month', v.dt) = months.m)) ORDER BY m),'[]')
        FROM months) AS series
    FROM sp
  )
  SELECT json_build_object(
    'rows', (SELECT COALESCE(json_agg(rows ORDER BY collected DESC),'[]') FROM rows),
    'dynamics', (SELECT COALESCE(json_agg(dynamics),'[]') FROM dynamics)
  );
$$;

-- 4.3 КУРАТОРЫ
CREATE OR REPLACE FUNCTION public.analytics_curators(p_from date, p_to date)
RETURNS json LANGUAGE sql STABLE SECURITY DEFINER AS $$
  WITH
  active AS (SELECT * FROM public.clients WHERE status = 'active'),
  load AS (
    SELECT cu.id AS curator_id, cu.name, cu.is_active, cu.max_clients,
      (SELECT count(*) FROM active a WHERE a.curator_id = cu.id) AS active_clients,
      (SELECT count(*) FROM active a WHERE a.curator_id = cu.id AND a.service_type='full') AS full_cnt,
      (SELECT count(*) FROM active a WHERE a.curator_id = cu.id AND a.service_type='session') AS session_cnt,
      (SELECT COALESCE(sum(COALESCE(e.fact_sum,e.plan_sum)),0) FROM public.expenses e
        WHERE e.article='curator' AND e.who = cu.name
        AND COALESCE(e.fact_date,e.plan_date) BETWEEN p_from AND p_to) AS payouts
    FROM public.curators cu
  ),
  funnel AS (
    SELECT cu.name AS curator, COALESCE(a.current_stage_code,'(не начато)') AS stage, count(*) AS cnt
      FROM active a JOIN public.curators cu ON cu.id = a.curator_id
     GROUP BY cu.name, COALESCE(a.current_stage_code,'(не начато)')
  ),
  speed_median AS (
    SELECT percentile_cont(0.5) WITHIN GROUP (
             ORDER BY EXTRACT(EPOCH FROM (roadmap_approved_at - curator_assigned_at))/86400.0) AS days
      FROM public.clients
     WHERE roadmap_approved_at IS NOT NULL AND curator_assigned_at IS NOT NULL
       AND roadmap_approved_at >= curator_assigned_at
  )
  SELECT json_build_object(
    'kpis', json_build_object(
      'active_curators', (SELECT count(*) FROM public.curators WHERE is_active),
      'total_curators',  (SELECT count(*) FROM public.curators),
      'active_clients',  (SELECT count(*) FROM active),
      'full_clients',    (SELECT count(*) FROM active WHERE service_type='full'),
      'session_clients', (SELECT count(*) FROM active WHERE service_type='session'),
      'avg_load', (SELECT COALESCE(round(avg(active_clients::numeric / NULLIF(max_clients,0) * 100)),0)
                     FROM load WHERE is_active AND max_clients > 0),
      'median_assign_to_roadmap_days', (SELECT round(days::numeric,1) FROM speed_median)),
    'load', (SELECT COALESCE(json_agg(load ORDER BY active_clients DESC),'[]') FROM load),
    'funnel', (SELECT COALESCE(json_agg(funnel),'[]') FROM funnel),
    'curator_stages', (SELECT COALESCE(json_agg(json_build_object('code',code,'title',title,'position',position) ORDER BY position),'[]')
                         FROM public.curator_stages),
    'stage_speed', '[]'::json  -- client_stages пока пусто → EmptyState
  );
$$;

-- 4.4 ПРОГНОЗ
CREATE OR REPLACE FUNCTION public.analytics_forecast()
RETURNS json LANGUAGE sql STABLE SECURITY DEFINER AS $$
  WITH
  fmonths AS (
    SELECT gs::date AS m FROM generate_series(date_trunc('month', CURRENT_DATE),
                                              date_trunc('month', CURRENT_DATE) + interval '2 months', interval '1 month') gs
  ),
  guaranteed AS (
    SELECT to_char(m,'YYYY-MM') AS ym,
      (SELECT COALESCE(sum(plan_sum),0) FROM public.payments
        WHERE is_paid=false AND num>=0 AND date_trunc('month', plan_date) = fmonths.m) AS amount
    FROM fmonths
  ),
  pipeline AS (
    SELECT COALESCE(sum(d.budget * s.weight),0) AS weighted
      FROM public.deals d JOIN public.pipeline_stages s ON s.id = d.stage_id
     WHERE d.deleted_at IS NULL AND s.stage_type = 'active'
  ),
  cur_month AS (
    SELECT to_char(CURRENT_DATE,'YYYY-MM') AS ym,
      (SELECT COALESCE(sum(amount),0) FROM public.v_money_in
        WHERE date_trunc('month', dt) = date_trunc('month', CURRENT_DATE)) AS fact,
      (SELECT COALESCE(sum(plan_sum),0) FROM public.payments
        WHERE is_paid=false AND num>=0 AND date_trunc('month', plan_date) = date_trunc('month', CURRENT_DATE)) AS remaining,
      (SELECT COALESCE(sum(plan_amount),0) FROM public.sales_plans
        WHERE salesperson_id IS NOT NULL AND month = to_char(CURRENT_DATE,'YYYY-MM')) AS plan
  ),
  future_exp AS (
    SELECT article, COALESCE(sum(plan_sum),0) AS total FROM public.expenses
     WHERE is_paid=false AND plan_date >= date_trunc('month', CURRENT_DATE)
       AND plan_date <  date_trunc('month', CURRENT_DATE) + interval '3 months'
     GROUP BY article
  )
  SELECT json_build_object(
    'guaranteed', (SELECT COALESCE(json_agg(guaranteed ORDER BY ym),'[]') FROM guaranteed),
    'pipeline_weighted', (SELECT weighted FROM pipeline),
    'month', (SELECT json_build_object('ym',ym,'fact',fact,'remaining',remaining,
                'projected', fact + remaining, 'plan', plan) FROM cur_month),
    'future_expenses', (SELECT COALESCE(json_agg(future_exp ORDER BY total DESC),'[]') FROM future_exp)
  );
$$;

GRANT EXECUTE ON FUNCTION public.analytics_money(date,date)  TO authenticated;
GRANT EXECUTE ON FUNCTION public.analytics_sales(date,date)  TO authenticated;
GRANT EXECUTE ON FUNCTION public.analytics_curators(date,date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.analytics_forecast()        TO authenticated;
GRANT SELECT ON public.v_money_in TO authenticated;
