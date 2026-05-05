-- ════════════════════════════════════════════════════════════════════
-- Индексы для parser DB (ymyzzdnmadtxzjuvpefq).
--
-- ЗАПУСКАТЬ в Supabase SQL Editor проекта parser БЛОКАМИ — каждый
-- CREATE INDEX CONCURRENTLY должен быть в своей транзакции.
-- (Editor по умолчанию каждый run = одна транзакция, поэтому
-- запускай по одному statement'у).
--
-- При 80k программ обычный CREATE INDEX блокирует записи на пару
-- секунд. CONCURRENTLY медленнее но не блокирует.
-- ════════════════════════════════════════════════════════════════════

-- pg_trgm нужен для GIN-поиска по name (ILIKE %query%)
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ─── programs (80k строк, самая горячая) ───
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_programs_school_id
  ON public.programs (school_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_programs_source
  ON public.programs (source);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_programs_specialty_group
  ON public.programs (specialty_group);

-- Composite: school+source часто вместе
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_programs_school_source
  ON public.programs (school_id, source);

-- Sort by name (default sort в каталоге)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_programs_name
  ON public.programs (name);

-- Sort by tuition (для price_asc/price_desc)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_programs_tuition
  ON public.programs (tuition)
  WHERE tuition IS NOT NULL;

-- Sort by updated_at (для recent)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_programs_updated_at
  ON public.programs (updated_at DESC);

-- ILIKE-поиск по имени программы (Каталог: 'Что изучать?')
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_programs_name_trgm
  ON public.programs USING gin (name gin_trgm_ops);

-- JSONB: level (используется в фильтре каталога)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_programs_jsonb_level
  ON public.programs ((raw_data #>> '{attributes,level}'));

-- JSONB: earliest_intake.start_date (фильтр года)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_programs_jsonb_intake_start
  ON public.programs ((raw_data #>> '{attributes,earliest_intake,start_date}'));

-- Опциональный GIN для @> containment запросов на raw_data — пока
-- не используем, но если в будущем будут @>-запросы, раскомментировать:
-- CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_programs_raw_data_gin
--   ON public.programs USING gin (raw_data jsonb_path_ops);

-- ─── schools ───
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_schools_country_code
  ON public.schools (country_code);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_schools_university_type
  ON public.schools (university_type)
  WHERE university_type IS NOT NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_schools_name
  ON public.schools (name);

-- ILIKE на schools.name (если когда-нибудь добавим поиск вузов)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_schools_name_trgm
  ON public.schools USING gin (name gin_trgm_ops);

-- ─── ANALYZE для обновления статистики оптимизатора ───
-- (запустить после CREATE INDEX'ов, ускоряет планирование)
ANALYZE public.programs;
ANALYZE public.schools;
