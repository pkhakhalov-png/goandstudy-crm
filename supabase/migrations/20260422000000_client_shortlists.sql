-- Подборка программ куратора для клиента.
-- Денормализуем school/program данные из парсер-базы (ymyzzdnmadtxzjuvpefq)
-- чтобы не делать cross-db join и не терять данные при изменениях в парсере.

CREATE TABLE IF NOT EXISTS client_shortlists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  curator_id UUID NOT NULL REFERENCES curators(id) ON DELETE CASCADE,
  school_id BIGINT NOT NULL,
  program_id BIGINT NOT NULL,
  school_name TEXT NOT NULL,
  program_name TEXT NOT NULL,
  country_code TEXT,
  tuition NUMERIC,
  currency TEXT,
  note TEXT,
  status TEXT DEFAULT 'shortlisted' CHECK (status IN ('shortlisted','applied','offered','rejected','accepted')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(client_id, program_id)
);

CREATE INDEX IF NOT EXISTS idx_shortlists_client ON client_shortlists(client_id);
CREATE INDEX IF NOT EXISTS idx_shortlists_curator ON client_shortlists(curator_id);

-- Доступ только через server actions (createAdminClient bypass RLS).
ALTER TABLE client_shortlists DISABLE ROW LEVEL SECURITY;
