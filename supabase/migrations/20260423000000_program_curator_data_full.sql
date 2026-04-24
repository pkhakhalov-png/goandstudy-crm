-- Полная версия таблицы обогащения программ ИИ (web-search).
-- program_id ссылается на parser.programs.id — cross-DB FK невозможен, храним как BIGINT.

CREATE TABLE IF NOT EXISTS program_curator_data (
  program_id BIGINT PRIMARY KEY,

  -- Сводка
  program_length_text TEXT,
  earliest_intake_label TEXT,
  deadline_label TEXT,
  gross_tuition_label TEXT,
  cost_of_living_label TEXT,
  application_fee_label TEXT,
  other_fees JSONB,

  -- Admission requirements
  min_education_level TEXT,
  min_gpa_percent NUMERIC,
  ielts_min NUMERIC,
  toefl_min NUMERIC,
  pte_min NUMERIC,
  duolingo_min NUMERIC,

  -- Post-study work visa
  pgwp_eligible BOOLEAN,
  pgwp_text TEXT,

  -- Новые поля
  coop_available BOOLEAN,
  conditional_offer_available BOOLEAN,

  -- Мета
  source_urls JSONB,
  is_ai_generated BOOLEAN DEFAULT true,
  last_updated_by UUID REFERENCES curators(id) ON DELETE SET NULL,
  last_updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Добавить недостающие колонки если таблица уже существует (без ошибки)
ALTER TABLE program_curator_data ADD COLUMN IF NOT EXISTS earliest_intake_label TEXT;
ALTER TABLE program_curator_data ADD COLUMN IF NOT EXISTS deadline_label TEXT;
ALTER TABLE program_curator_data ADD COLUMN IF NOT EXISTS coop_available BOOLEAN;
ALTER TABLE program_curator_data ADD COLUMN IF NOT EXISTS conditional_offer_available BOOLEAN;

ALTER TABLE program_curator_data DISABLE ROW LEVEL SECURITY;

-- История
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
