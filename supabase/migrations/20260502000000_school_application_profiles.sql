-- Паспорт вуза для целей подачи заявки.
-- Один row = один вуз × уровень × портал. Khalifa ug и pg — два разных profile.
-- Хранит требования: какие документы, эссе, поля профиля, сроки intake.
-- Используется в client wizard на /client/applications/* и для генерации
-- пакета документов для куратора (ручной submit на портале вуза).

CREATE TABLE IF NOT EXISTS public.school_application_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id BIGINT,                        -- из парсера, опционально (Khalifa может ещё не быть в schools)
  school_name TEXT NOT NULL,               -- денормализуем чтобы не зависело от парсера
  country_code TEXT,                       -- 'AE', 'GB', etc
  level TEXT NOT NULL CHECK (level IN ('bachelor', 'master', 'phd')),
  portal_url TEXT NOT NULL,                -- куда подаётся: ugapply.ku.ac.ae
  registration_url TEXT,                   -- если отличается от portal_url

  application_fee_amount NUMERIC,
  application_fee_currency TEXT,

  -- Требования к профилю клиента: какие поля нужны до подачи.
  -- Пример: [{"key":"first_name_latin","label":"First name (latin)","type":"text","required":true}, ...]
  profile_fields_required JSONB DEFAULT '[]'::jsonb,

  -- Требования к документам.
  -- Пример: [{"key":"passport","label":"Passport copy","format":"pdf","max_mb":5,"required":true,"notes":"In English"}, ...]
  documents_required JSONB DEFAULT '[]'::jsonb,

  -- Требования к эссе.
  -- Пример: [{"key":"personal_statement","label":"Personal Statement","prompt":"Why this program?","min_words":300,"max_words":500,"required":true}]
  essays_required JSONB DEFAULT '[]'::jsonb,

  -- Внешние шаги (например MOE equivalency для UAE)
  -- [{"key":"moe_equivalency","label":"MOE equivalency","url":"https://...","required":true,"notes":"..."}]
  external_steps JSONB DEFAULT '[]'::jsonb,

  -- Intake'и (даты приёма + дедлайны)
  -- [{"name":"Fall 2026","deadline":"2026-06-30","start":"2026-09-01"}]
  intakes JSONB DEFAULT '[]'::jsonb,

  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sap_school ON public.school_application_profiles(school_id) WHERE school_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sap_active ON public.school_application_profiles(is_active) WHERE is_active = TRUE;

ALTER TABLE public.school_application_profiles DISABLE ROW LEVEL SECURITY;


-- Расширяем client_applications привязкой к profile (опционально — старые заявки без profile продолжают работать).
ALTER TABLE public.client_applications
  ADD COLUMN IF NOT EXISTS profile_id UUID REFERENCES public.school_application_profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_client_applications_profile ON public.client_applications(profile_id) WHERE profile_id IS NOT NULL;


-- Чек-лист профиля клиента: значения для полей из profile_fields_required.
-- Кладём сюда то что клиент заполнил в wizard'е (напр. first_name_latin).
-- Часть полей переиспользует данные из clients.* (ФИО, email, тел) — те не дублируются.
CREATE TABLE IF NOT EXISTS public.application_profile_data (
  application_id UUID PRIMARY KEY REFERENCES public.client_applications(id) ON DELETE CASCADE,
  data JSONB DEFAULT '{}'::jsonb,
  -- {"first_name_latin":"Ivan","gpa":"4.5","ielts_overall":"7.0",...}
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.application_profile_data DISABLE ROW LEVEL SECURITY;
