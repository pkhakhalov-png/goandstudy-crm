-- Общая таблица с расширенной информацией о программе, которую заполняют
-- кураторы через ИИ-агент. program_id ссылается на parser-base programs.id (BIGINT)
-- — cross-DB FK невозможен, поэтому храним как число без FK.

CREATE TABLE IF NOT EXISTS program_curator_data (
  program_id BIGINT PRIMARY KEY,

  -- Сводка (блок справа на странице программы)
  program_length_text TEXT,
  gross_tuition_label TEXT,
  cost_of_living_label TEXT,
  application_fee_label TEXT,
  other_fees JSONB,

  -- Admission Requirements
  min_education_level TEXT,
  min_gpa_percent NUMERIC,
  ielts_min NUMERIC,
  toefl_min NUMERIC,
  pte_min NUMERIC,
  duolingo_min NUMERIC,

  -- Post-Study Work Visa
  pgwp_eligible BOOLEAN,
  pgwp_text TEXT,

  -- Мета
  source_urls JSONB,
  is_ai_generated BOOLEAN DEFAULT true,
  last_updated_by UUID REFERENCES curators(id) ON DELETE SET NULL,
  last_updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE program_curator_data DISABLE ROW LEVEL SECURITY;

-- История изменений — для отката и прозрачности
CREATE TABLE IF NOT EXISTS program_curator_data_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id BIGINT NOT NULL,
  snapshot JSONB NOT NULL,
  updated_by UUID REFERENCES curators(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pcd_history_program
  ON program_curator_data_history(program_id, updated_at DESC);

ALTER TABLE program_curator_data_history DISABLE ROW LEVEL SECURITY;
