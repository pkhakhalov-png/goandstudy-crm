-- Invite-flow для кураторов: админ заводит куратора + email → CRM генерит
-- ссылку → куратор кликает → задаёт пароль → попадает в /curator.

ALTER TABLE public.curators
  ADD COLUMN IF NOT EXISTS email TEXT;

CREATE TABLE IF NOT EXISTS public.curator_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  curator_id UUID NOT NULL REFERENCES public.curators(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  email_sent_at TIMESTAMPTZ,
  email_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES public.users(id)
);

CREATE INDEX IF NOT EXISTS idx_curator_invitations_curator ON public.curator_invitations(curator_id);
CREATE INDEX IF NOT EXISTS idx_curator_invitations_token ON public.curator_invitations(token);
ALTER TABLE public.curator_invitations DISABLE ROW LEVEL SECURITY;
