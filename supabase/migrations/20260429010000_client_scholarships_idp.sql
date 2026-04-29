-- Добавляем третий источник стипендий — IDP (idp_scholarships в GS_apply Supabase).
-- Расширяем CHECK на kind: было ('private', 'government'), становится ('private', 'government', 'idp').

ALTER TABLE public.client_scholarships
  DROP CONSTRAINT IF EXISTS client_scholarships_kind_check;

ALTER TABLE public.client_scholarships
  ADD CONSTRAINT client_scholarships_kind_check
  CHECK (kind IN ('private', 'government', 'idp'));
