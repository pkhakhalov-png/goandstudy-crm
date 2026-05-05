-- ════════════════════════════════════════════════════════════════════
-- Индексы для scholarships DB (отдельный Supabase-проект).
-- Запускать в SQL Editor проекта scholarships ПО ОДНОМУ statement'у.
-- ════════════════════════════════════════════════════════════════════

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ─── scholarships_topuni (private/QS) ───
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_topuni_archived
  ON public.scholarships_topuni (archived);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_topuni_deadline
  ON public.scholarships_topuni (deadline)
  WHERE deadline IS NOT NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_topuni_amount_type
  ON public.scholarships_topuni (amount_type)
  WHERE amount_type IS NOT NULL;

-- ILIKE-поиск по title + institution
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_topuni_title_trgm
  ON public.scholarships_topuni USING gin (title gin_trgm_ops);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_topuni_institution_trgm
  ON public.scholarships_topuni USING gin (institution_title gin_trgm_ops)
  WHERE institution_title IS NOT NULL;

-- study_levels — массив, GIN под @>
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_topuni_study_levels
  ON public.scholarships_topuni USING gin (study_levels);

-- ─── government_scholarships ───
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_gov_is_active
  ON public.government_scholarships (is_active);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_gov_deadline
  ON public.government_scholarships (application_deadline)
  WHERE application_deadline IS NOT NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_gov_country_name
  ON public.government_scholarships (country_name)
  WHERE country_name IS NOT NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_gov_name_trgm
  ON public.government_scholarships USING gin (name gin_trgm_ops);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_gov_short_name_trgm
  ON public.government_scholarships USING gin (short_name gin_trgm_ops)
  WHERE short_name IS NOT NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_gov_levels
  ON public.government_scholarships USING gin (levels);

-- ─── idp_scholarships ───
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_idp_country_code
  ON public.idp_scholarships (country_code);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_idp_school_id
  ON public.idp_scholarships (school_id)
  WHERE school_id IS NOT NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_idp_deadline
  ON public.idp_scholarships (application_deadline)
  WHERE application_deadline IS NOT NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_idp_level
  ON public.idp_scholarships (level)
  WHERE level IS NOT NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_idp_name_trgm
  ON public.idp_scholarships USING gin (name gin_trgm_ops);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_idp_university_name_trgm
  ON public.idp_scholarships USING gin (university_name gin_trgm_ops)
  WHERE university_name IS NOT NULL;

-- ─── schools (если есть таблица в этой БД) ───
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='schools') THEN
    CREATE INDEX IF NOT EXISTS idx_sch_schools_country ON public.schools (country_code);
    CREATE INDEX IF NOT EXISTS idx_sch_schools_name    ON public.schools (name);
  END IF;
END $$;

-- ─── ANALYZE ───
ANALYZE public.scholarships_topuni;
ANALYZE public.government_scholarships;
ANALYZE public.idp_scholarships;
