-- ════════════════════════════════════════════════════════════════════
-- search_programs(...) — единый RPC для каталога вузов.
--
-- Раньше клиент собирал OR с 14 ветками (level-варианты + name ILIKE
-- + null) — на DE+bachelor count считался ~800ms.
--
-- Здесь level-mapping переехал в SQL (`= ANY(array)` вместо длинного OR),
-- логика фильтра permissive-null. Возвращает {rows, total} одним вызовом.
--
-- Запускать в SQL Editor парсера ОДНИМ Run (CREATE FUNCTION можно
-- внутри транзакции).
-- ════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.search_programs(
  p_country       text   DEFAULT NULL,
  p_school_id     bigint DEFAULT NULL,
  p_specialty     text   DEFAULT NULL,
  p_uni_type      text   DEFAULT NULL,
  p_budget        text   DEFAULT NULL,   -- 'free'|'low'|'mid1'|'mid2'|'high'
  p_levels        text[] DEFAULT NULL,   -- ['bachelor','master','phd','language']
  p_intake_years  text[] DEFAULT NULL,
  p_search        text   DEFAULT NULL,
  p_sort          text   DEFAULT 'name_asc',
  p_limit         int    DEFAULT 24,
  p_offset        int    DEFAULT 0,
  p_count_cap     int    DEFAULT NULL    -- capped count (Google-style "1000+"). NULL = exact
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
PARALLEL SAFE
AS $$
DECLARE
  v_raw_levels    text[] := ARRAY[]::text[];
  v_name_keywords text[] := ARRAY[]::text[];
  v_total         bigint := 0;
  v_rows          jsonb  := '[]'::jsonb;
  v_sort          text   := COALESCE(p_sort, 'name_asc');
BEGIN
  -- Группа уровня → set raw-кодов + ключевых слов в названии
  IF p_levels IS NOT NULL THEN
    IF 'bachelor' = ANY(p_levels) THEN
      v_raw_levels    := v_raw_levels    || ARRAY['bachelors','3_year_bachelors','integrated_masters','topup_degree','certificate','diploma','advanced_diploma'];
      v_name_keywords := v_name_keywords || ARRAY['bachelor','undergrad','bsc','bachelorstudiengang'];
    END IF;
    IF 'master' = ANY(p_levels) THEN
      v_raw_levels    := v_raw_levels    || ARRAY['masters_degree','post_graduate_certificate','post_graduate_diploma'];
      v_name_keywords := v_name_keywords || ARRAY['master','msc','mba','masterstudiengang'];
    END IF;
    IF 'phd' = ANY(p_levels) THEN
      v_raw_levels    := v_raw_levels    || ARRAY['doctoral_phd'];
      v_name_keywords := v_name_keywords || ARRAY['phd','doctor','promotion'];
    END IF;
    IF 'language' = ANY(p_levels) THEN
      v_raw_levels    := v_raw_levels    || ARRAY['english','non_credential'];
      v_name_keywords := v_name_keywords || ARRAY['language course','esl'];
    END IF;
  END IF;

  -- ─── 1) Total count (без LIMIT) ───
  -- Capped count: если p_count_cap=5000 и совпадений ≥5000, считаем
  -- ровно 5000 и UI показывает «5000+». Скорость х10-100 на широких
  -- выборках — Postgres останавливает скан как только набрано N.
  WITH filtered AS (
    SELECT 1
    FROM public.programs p
    INNER JOIN public.schools s ON s.id = p.school_id
    WHERE
      (p_country     IS NULL OR s.country_code     = p_country)
      AND (p_school_id IS NULL OR p.school_id      = p_school_id)
      AND (p_specialty IS NULL OR p.specialty_group = p_specialty)
      AND (p_uni_type  IS NULL OR s.university_type = p_uni_type)
      AND (p_search    IS NULL OR p.name ILIKE '%' || p_search || '%')
      AND (
        p_budget IS NULL
        OR (p_budget = 'free' AND p.tuition < 1000)
        OR (p_budget = 'low'  AND p.tuition >= 0     AND p.tuition < 10000)
        OR (p_budget = 'mid1' AND p.tuition >= 10000 AND p.tuition < 25000)
        OR (p_budget = 'mid2' AND p.tuition >= 25000 AND p.tuition < 50000)
        OR (p_budget = 'high' AND p.tuition >= 50000)
      )
      AND (
        coalesce(array_length(v_raw_levels, 1), 0) = 0
        OR p.raw_data->'attributes'->>'level' IS NULL
        OR p.raw_data->'attributes'->>'level' = ANY(v_raw_levels)
        OR (
          coalesce(array_length(v_name_keywords, 1), 0) > 0
          AND p.name ILIKE ANY (SELECT '%' || kw || '%' FROM unnest(v_name_keywords) AS kw)
        )
      )
      AND (
        coalesce(array_length(p_intake_years, 1), 0) = 0
        OR p.raw_data->'attributes'->'earliest_intake'->>'start_date' IS NULL
        OR EXISTS (
          SELECT 1 FROM unnest(p_intake_years) AS y
          WHERE p.raw_data->'attributes'->'earliest_intake'->>'start_date' LIKE y || '%'
        )
      )
    LIMIT CASE WHEN p_count_cap IS NULL THEN NULL ELSE p_count_cap END
  )
  SELECT COUNT(*) INTO v_total FROM filtered;

  -- ─── 2) Rows (с ORDER + LIMIT/OFFSET) ───
  SELECT COALESCE(jsonb_agg(row_to_jsonb(t)), '[]'::jsonb)
  INTO v_rows
  FROM (
    SELECT
      p.id, p.name, p.tuition, p.application_fee, p.raw_data, p.school_id,
      p.specialty_group, p.source, p.degree_text, p.program_description,
      p.language_text, p.duration_text, p.start_date_text, p.deadline_text,
      p.tuition_text, p.living_cost_text, p.living_cost_period,
      p.scholarships_text, p.curator_note,
      jsonb_build_object(
        'id', s.id,
        'name', s.name,
        'logo_url', s.logo_url,
        'country_code', s.country_code,
        'city', s.city,
        'institution_type', s.institution_type,
        'qs_rank', s.qs_rank,
        'university_type', s.university_type,
        'curator_note', s.curator_note
      ) AS school
    FROM public.programs p
    INNER JOIN public.schools s ON s.id = p.school_id
    WHERE
      (p_country     IS NULL OR s.country_code     = p_country)
      AND (p_school_id IS NULL OR p.school_id      = p_school_id)
      AND (p_specialty IS NULL OR p.specialty_group = p_specialty)
      AND (p_uni_type  IS NULL OR s.university_type = p_uni_type)
      AND (p_search    IS NULL OR p.name ILIKE '%' || p_search || '%')
      AND (
        p_budget IS NULL
        OR (p_budget = 'free' AND p.tuition < 1000)
        OR (p_budget = 'low'  AND p.tuition >= 0     AND p.tuition < 10000)
        OR (p_budget = 'mid1' AND p.tuition >= 10000 AND p.tuition < 25000)
        OR (p_budget = 'mid2' AND p.tuition >= 25000 AND p.tuition < 50000)
        OR (p_budget = 'high' AND p.tuition >= 50000)
      )
      AND (
        coalesce(array_length(v_raw_levels, 1), 0) = 0
        OR p.raw_data->'attributes'->>'level' IS NULL
        OR p.raw_data->'attributes'->>'level' = ANY(v_raw_levels)
        OR (
          coalesce(array_length(v_name_keywords, 1), 0) > 0
          AND p.name ILIKE ANY (SELECT '%' || kw || '%' FROM unnest(v_name_keywords) AS kw)
        )
      )
      AND (
        coalesce(array_length(p_intake_years, 1), 0) = 0
        OR p.raw_data->'attributes'->'earliest_intake'->>'start_date' IS NULL
        OR EXISTS (
          SELECT 1 FROM unnest(p_intake_years) AS y
          WHERE p.raw_data->'attributes'->'earliest_intake'->>'start_date' LIKE y || '%'
        )
      )
    ORDER BY
      CASE WHEN v_sort = 'name_asc'   THEN p.name END ASC,
      CASE WHEN v_sort = 'price_asc'  THEN p.tuition END ASC  NULLS LAST,
      CASE WHEN v_sort = 'price_desc' THEN p.tuition END DESC NULLS LAST,
      CASE WHEN v_sort = 'recent'     THEN p.updated_at END DESC
    LIMIT p_limit
    OFFSET p_offset
  ) t;

  RETURN jsonb_build_object('total', v_total, 'rows', v_rows);
END;
$$;

GRANT EXECUTE ON FUNCTION public.search_programs(
  text, bigint, text, text, text, text[], text[], text, text, int, int, int
) TO anon, authenticated, service_role;
