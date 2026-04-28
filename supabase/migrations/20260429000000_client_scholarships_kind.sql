-- Расширяем client_scholarships для двух источников:
--   private    — scholarships_topuni (университетские, QS)
--   government — government_scholarships (Chevening, Fulbright, DAAD и т.д.)
-- ID разные (между источниками может пересекаться), поэтому уникальность
-- становится по тройке (client_id, kind, scholarship_id).

ALTER TABLE public.client_scholarships
  ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'private'
  CHECK (kind IN ('private', 'government'));

ALTER TABLE public.client_scholarships
  DROP CONSTRAINT IF EXISTS client_scholarships_client_id_scholarship_id_key;

ALTER TABLE public.client_scholarships
  ADD CONSTRAINT client_scholarships_client_kind_id_key UNIQUE (client_id, kind, scholarship_id);

-- Расширяем CHECK по статусу — добавим 'preparing' (для гос. стипендий это корректнее чем 'applying')
ALTER TABLE public.client_scholarships
  DROP CONSTRAINT IF EXISTS client_scholarships_status_check;

ALTER TABLE public.client_scholarships
  ADD CONSTRAINT client_scholarships_status_check
  CHECK (status IN ('planned', 'preparing', 'applying', 'submitted', 'awarded', 'rejected'));
