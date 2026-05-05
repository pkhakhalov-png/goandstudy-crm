-- ════════════════════════════════════════════════════════════════════
-- Индексы для main CRM. Создаём только под фактические hot-queries
-- (фильтры/сортировки которые реально гоняем в коде). Все CREATE
-- INDEX IF NOT EXISTS — миграция идемпотентна.
-- ════════════════════════════════════════════════════════════════════

-- ─── pg_trgm для ILIKE-поиска (имена клиентов, тексты) ───
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ─── clients (центральная таблица CRM) ───
CREATE INDEX IF NOT EXISTS idx_clients_curator_id        ON public.clients (curator_id);
CREATE INDEX IF NOT EXISTS idx_clients_sales_id          ON public.clients (sales_id);
CREATE INDEX IF NOT EXISTS idx_clients_status            ON public.clients (status);
CREATE INDEX IF NOT EXISTS idx_clients_current_stage     ON public.clients (current_stage_code);
CREATE INDEX IF NOT EXISTS idx_clients_email_lower       ON public.clients (lower(email));
CREATE INDEX IF NOT EXISTS idx_clients_telegram          ON public.clients (telegram) WHERE telegram IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_clients_phone             ON public.clients (phone) WHERE phone IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_clients_created_at        ON public.clients (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_clients_name_trgm         ON public.clients USING gin (name gin_trgm_ops);

-- ─── deals (воронка продаж) ───
CREATE INDEX IF NOT EXISTS idx_deals_stage_id            ON public.deals (stage_id);
CREATE INDEX IF NOT EXISTS idx_deals_sales_id            ON public.deals (sales_id);
CREATE INDEX IF NOT EXISTS idx_deals_status              ON public.deals (status);
CREATE INDEX IF NOT EXISTS idx_deals_contact_email       ON public.deals (lower(contact_email)) WHERE contact_email IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_deals_created_at          ON public.deals (created_at DESC);

-- ─── payments ───
CREATE INDEX IF NOT EXISTS idx_payments_client_id        ON public.payments (client_id);
CREATE INDEX IF NOT EXISTS idx_payments_plan_date        ON public.payments (plan_date);
CREATE INDEX IF NOT EXISTS idx_payments_fact_date        ON public.payments (fact_date) WHERE fact_date IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_payments_is_paid          ON public.payments (is_paid);

-- ─── expenses ───
CREATE INDEX IF NOT EXISTS idx_expenses_expense_date     ON public.expenses (expense_date DESC);
CREATE INDEX IF NOT EXISTS idx_expenses_type             ON public.expenses (type);

-- ─── users ───
CREATE INDEX IF NOT EXISTS idx_users_email_lower         ON public.users (lower(email));
CREATE INDEX IF NOT EXISTS idx_users_role                ON public.users (role);

-- ─── curators ───
CREATE INDEX IF NOT EXISTS idx_curators_user_id          ON public.curators (user_id);
CREATE INDEX IF NOT EXISTS idx_curators_is_active        ON public.curators (is_active);

-- ─── client_documents ───
CREATE INDEX IF NOT EXISTS idx_client_documents_client   ON public.client_documents (client_id);
CREATE INDEX IF NOT EXISTS idx_client_documents_doctype  ON public.client_documents (client_id, doc_type);
CREATE INDEX IF NOT EXISTS idx_client_documents_uploaded ON public.client_documents (uploaded_at DESC);

-- ─── client_essays ───
CREATE INDEX IF NOT EXISTS idx_client_essays_client_type ON public.client_essays (client_id, type);
CREATE INDEX IF NOT EXISTS idx_client_essays_status      ON public.client_essays (status);

-- ─── client_universities (старая shortlist-таблица) ───
CREATE INDEX IF NOT EXISTS idx_client_universities_client   ON public.client_universities (client_id);
CREATE INDEX IF NOT EXISTS idx_client_universities_deadline ON public.client_universities (deadline) WHERE deadline IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_client_universities_status   ON public.client_universities (status);

-- ─── client_scholarships ───
CREATE INDEX IF NOT EXISTS idx_client_scholarships_client     ON public.client_scholarships (client_id);
CREATE INDEX IF NOT EXISTS idx_client_scholarships_kind_id    ON public.client_scholarships (client_id, kind, scholarship_id);
CREATE INDEX IF NOT EXISTS idx_client_scholarships_status     ON public.client_scholarships (status);
CREATE INDEX IF NOT EXISTS idx_client_scholarships_unlocked   ON public.client_scholarships (client_id) WHERE unlocked_for_client = true;

-- ─── client_applications (Application Hub) ───
CREATE INDEX IF NOT EXISTS idx_client_applications_client    ON public.client_applications (client_id);
CREATE INDEX IF NOT EXISTS idx_client_applications_status    ON public.client_applications (status);
CREATE INDEX IF NOT EXISTS idx_client_applications_created   ON public.client_applications (created_at DESC);

-- ─── client_activities (фид «Обновления») ───
-- (idx_client_activities_client_created уже есть из 20260417000000_curator_portal.sql)
CREATE INDEX IF NOT EXISTS idx_client_activities_type        ON public.client_activities (activity_type);

-- ─── client_invitations ───
CREATE INDEX IF NOT EXISTS idx_client_invitations_token      ON public.client_invitations (token);
CREATE INDEX IF NOT EXISTS idx_client_invitations_client     ON public.client_invitations (client_id);
CREATE INDEX IF NOT EXISTS idx_client_invitations_email      ON public.client_invitations (lower(email));

-- ─── curator_invitations ───
CREATE INDEX IF NOT EXISTS idx_curator_invitations_token     ON public.curator_invitations (token);
CREATE INDEX IF NOT EXISTS idx_curator_invitations_curator   ON public.curator_invitations (curator_id);
CREATE INDEX IF NOT EXISTS idx_curator_invitations_email     ON public.curator_invitations (lower(email));

-- ─── curator_stages / client_stages ───
CREATE INDEX IF NOT EXISTS idx_curator_stages_code           ON public.curator_stages (code);
CREATE INDEX IF NOT EXISTS idx_curator_stages_position       ON public.curator_stages (position);
CREATE INDEX IF NOT EXISTS idx_client_stages_client          ON public.client_stages (client_id);
CREATE INDEX IF NOT EXISTS idx_client_stages_code            ON public.client_stages (stage_code);

-- ─── curator_stage_checklist + client_checklist_progress ───
CREATE INDEX IF NOT EXISTS idx_checklist_stage               ON public.curator_stage_checklist (stage_code);
CREATE INDEX IF NOT EXISTS idx_checklist_progress_client     ON public.client_checklist_progress (client_id);

-- ─── client_tg_messages / client_tg_files ───
CREATE INDEX IF NOT EXISTS idx_tg_messages_client_created    ON public.client_tg_messages (client_id, created_at);
CREATE INDEX IF NOT EXISTS idx_tg_files_client               ON public.client_tg_files (client_id);

-- ─── client_shortlists (новая shortlist для curator portal) ───
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='client_shortlists') THEN
    CREATE INDEX IF NOT EXISTS idx_client_shortlists_client_curator ON public.client_shortlists (client_id, curator_id);
    CREATE INDEX IF NOT EXISTS idx_client_shortlists_curator        ON public.client_shortlists (curator_id);
    CREATE INDEX IF NOT EXISTS idx_client_shortlists_status         ON public.client_shortlists (status);
  END IF;
END $$;

-- ─── school_application_profiles (Application Hub Wizard) ───
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='school_application_profiles') THEN
    CREATE INDEX IF NOT EXISTS idx_app_profiles_school ON public.school_application_profiles (school_id);
  END IF;
END $$;

-- ─── application_documents (Хаб подач) ───
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='application_documents') THEN
    CREATE INDEX IF NOT EXISTS idx_app_docs_application ON public.application_documents (application_id);
    CREATE INDEX IF NOT EXISTS idx_app_docs_global      ON public.application_documents (global_doc_id) WHERE global_doc_id IS NOT NULL;
  END IF;
END $$;

-- ─── ANALYZE для обновления статистики после индексов ───
ANALYZE public.clients;
ANALYZE public.deals;
ANALYZE public.payments;
ANALYZE public.client_documents;
ANALYZE public.client_essays;
ANALYZE public.client_universities;
ANALYZE public.client_scholarships;
ANALYZE public.client_activities;
ANALYZE public.users;
ANALYZE public.curators;
