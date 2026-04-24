-- Essays: resume + motivation letter. One row per (client, type).
-- Flow: client заполняет (status='draft') → жмёт «Отправить куратору» (status='sent')
-- → куратор редактирует + жмёт «Готово» (status='approved')
-- → клиент видит approved версию.

CREATE TABLE IF NOT EXISTS client_essays (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id INT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('resume', 'motivation')),

  -- JSONB structure matches the shape in app/client/resume or app/client/motivation
  content JSONB NOT NULL DEFAULT '{}'::jsonb,
  curator_content JSONB,
  ai_suggestions JSONB,

  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'editing', 'approved')),

  submitted_at TIMESTAMPTZ,
  approved_at TIMESTAMPTZ,
  last_updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE (client_id, type)
);

CREATE INDEX IF NOT EXISTS idx_client_essays_client ON client_essays(client_id);
ALTER TABLE client_essays DISABLE ROW LEVEL SECURITY;
