-- ═══ Add 'client' role to users_role_check ═══
-- Required for client cabinet (/client/*) — middleware checks role='client'

ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE public.users ADD CONSTRAINT users_role_check
  CHECK (role IN ('admin', 'salesperson', 'rop', 'curator', 'client'));
