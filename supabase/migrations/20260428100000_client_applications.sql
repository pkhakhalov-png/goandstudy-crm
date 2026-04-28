-- Заявки клиента в вузы. Каждая запись = «клиент X подаёт в вуз Y на программу Z в intake K».
-- Стадии: created → docs_collected → fee_paid → submitted → decision (offer/reject/etc).
--
-- Связь с client_universities (shortlist) — опциональная: заявку можно создать
-- из shortlist одним кликом, либо напрямую без shortlist. university_name/program_name
-- денормализованы, чтобы карточка не ломалась при удалении из shortlist.

CREATE TABLE IF NOT EXISTS public.client_applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id INT NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  shortlist_id UUID REFERENCES public.client_universities(id) ON DELETE SET NULL,

  university_name TEXT NOT NULL,
  program_name TEXT,
  country TEXT,
  intake TEXT,                    -- "May 2025", "Fall 2025"
  school_id BIGINT,               -- из парсера (заполним позже когда мигрируем все вузы)

  stage TEXT NOT NULL DEFAULT 'created'
    CHECK (stage IN ('created', 'docs_collected', 'fee_paid', 'submitted', 'decision')),
  decision TEXT
    CHECK (decision IN ('offer', 'conditional_offer', 'rejected', 'waitlisted', 'withdrawn')),

  app_deadline DATE,
  submitted_at TIMESTAMPTZ,
  decision_at TIMESTAMPTZ,

  fee_amount NUMERIC,
  fee_currency TEXT,
  fee_paid_at TIMESTAMPTZ,

  school_app_ref TEXT,            -- внешний номер заявки в портале вуза
  hold_reason TEXT,
  notes TEXT,

  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_client_applications_client ON public.client_applications(client_id);
CREATE INDEX IF NOT EXISTS idx_client_applications_stage ON public.client_applications(stage);
CREATE INDEX IF NOT EXISTS idx_client_applications_school ON public.client_applications(school_id) WHERE school_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_client_applications_shortlist ON public.client_applications(shortlist_id) WHERE shortlist_id IS NOT NULL;

ALTER TABLE public.client_applications DISABLE ROW LEVEL SECURITY;


-- Документы заявки. Могут быть «привязаны» к глобальным document'ам клиента
-- (паспорт, IELTS) через global_doc_id, либо загружены отдельно для этой заявки
-- (deposit receipt, GTE statement, mortgage form).

CREATE TABLE IF NOT EXISTS public.application_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id UUID NOT NULL REFERENCES public.client_applications(id) ON DELETE CASCADE,

  doc_type TEXT NOT NULL,         -- свободный текст: 'passport', 'transcript', 'gte_form', etc
  title TEXT,                     -- человекочитаемое имя (для не-стандартных)
  required BOOLEAN DEFAULT TRUE,

  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'in_review', 'approved', 'rejected', 'optional')),

  -- если документ переиспользуется из глобальных:
  global_doc_id UUID REFERENCES public.client_documents(id) ON DELETE SET NULL,

  -- либо файл загружен отдельно для этой заявки:
  storage_path TEXT,
  file_name TEXT,
  file_size_bytes BIGINT,
  mime_type TEXT,

  due_date DATE,
  notes TEXT,

  uploaded_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  uploaded_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_app_docs_application ON public.application_documents(application_id);
CREATE INDEX IF NOT EXISTS idx_app_docs_status ON public.application_documents(application_id, status);

ALTER TABLE public.application_documents DISABLE ROW LEVEL SECURITY;


-- Лента событий по заявке: смены стадии, заметки куратора, переписка с вузом.
-- type='school_message' — пока ручной ввод текста (заглушка под будущую почту).

CREATE TABLE IF NOT EXISTS public.application_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id UUID NOT NULL REFERENCES public.client_applications(id) ON DELETE CASCADE,

  event_type TEXT NOT NULL
    CHECK (event_type IN ('stage_change', 'note', 'school_message', 'doc_uploaded', 'decision_set')),
  content TEXT,
  payload JSONB,                  -- произвольная структура (например {from_stage, to_stage})

  author_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_app_events_application ON public.application_events(application_id, created_at DESC);

ALTER TABLE public.application_events DISABLE ROW LEVEL SECURITY;
