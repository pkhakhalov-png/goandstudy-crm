-- Invite-ссылки для регистрации клиентов в их кабинете.
-- Продажник создаёт клиента → CRM генерирует invitation с токеном →
-- ссылка вида /invite/<token> отправляется клиенту на email + копируется
-- продажником. Срок жизни 30 дней, токен одноразовый (used_at).

CREATE TABLE IF NOT EXISTS public.client_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id INTEGER NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  email_sent_at TIMESTAMPTZ,
  email_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES public.users(id)
);

CREATE INDEX IF NOT EXISTS idx_client_invitations_client ON public.client_invitations(client_id);
CREATE INDEX IF NOT EXISTS idx_client_invitations_token ON public.client_invitations(token);

ALTER TABLE public.client_invitations DISABLE ROW LEVEL SECURITY;

-- Флаг прошёл ли клиент онбординг (для tour-overlay при первом входе).
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS onboarded BOOLEAN NOT NULL DEFAULT false;
