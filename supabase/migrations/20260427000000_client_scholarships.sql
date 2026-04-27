-- Подборка стипендий клиента.
-- scholarship_id — id из внешней БД GS_apply (таблица scholarships_topuni)
-- Не FK, чтобы не зависеть от сторонней БД. Title и institution_title
-- денормализованы, чтобы карточка показывалась даже если стипендия пропала из API.

CREATE TABLE IF NOT EXISTS client_scholarships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id INT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  scholarship_id INTEGER NOT NULL,
  scholarship_title TEXT NOT NULL,
  institution_title TEXT,
  amount_text TEXT,
  deadline DATE,
  status TEXT NOT NULL DEFAULT 'planned'
    CHECK (status IN ('planned', 'applying', 'submitted', 'awarded', 'rejected')),
  notes TEXT,
  added_by UUID REFERENCES curators(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (client_id, scholarship_id)
);

CREATE INDEX IF NOT EXISTS idx_client_scholarships_client ON client_scholarships(client_id);
ALTER TABLE client_scholarships DISABLE ROW LEVEL SECURITY;
