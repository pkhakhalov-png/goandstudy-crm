-- ═══ CURATOR PORTAL — Phase 1 Migration ═══
-- PRD: docs/PRD_CURATOR_PORTAL.md, Section 3 "Архитектура данных"

-- ═══ 1. Add 'curator' to user roles ═══

ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE public.users ADD CONSTRAINT users_role_check
  CHECK (role IN ('admin', 'salesperson', 'rop', 'curator'));

-- ═══ 2. Extend curators table — link to users, add profile fields ═══

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='curators' AND column_name='user_id') THEN
    ALTER TABLE public.curators ADD COLUMN user_id UUID REFERENCES public.users(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='curators' AND column_name='specializations') THEN
    ALTER TABLE public.curators ADD COLUMN specializations TEXT[];
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='curators' AND column_name='languages') THEN
    ALTER TABLE public.curators ADD COLUMN languages TEXT[];
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='curators' AND column_name='max_clients') THEN
    ALTER TABLE public.curators ADD COLUMN max_clients INT DEFAULT 20;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='curators' AND column_name='telegram_id') THEN
    ALTER TABLE public.curators ADD COLUMN telegram_id BIGINT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='curators' AND column_name='telegram_username') THEN
    ALTER TABLE public.curators ADD COLUMN telegram_username TEXT;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS curators_user_id_uniq ON public.curators(user_id) WHERE user_id IS NOT NULL;

-- ═══ 3. Extend clients table — curator workflow fields ═══

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='clients' AND column_name='curator_assigned_at') THEN
    ALTER TABLE public.clients ADD COLUMN curator_assigned_at TIMESTAMPTZ;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='clients' AND column_name='current_stage_code') THEN
    ALTER TABLE public.clients ADD COLUMN current_stage_code TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='clients' AND column_name='tg_group_chat_id') THEN
    ALTER TABLE public.clients ADD COLUMN tg_group_chat_id BIGINT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='clients' AND column_name='tg_group_title') THEN
    ALTER TABLE public.clients ADD COLUMN tg_group_title TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='clients' AND column_name='workflow_started_at') THEN
    ALTER TABLE public.clients ADD COLUMN workflow_started_at TIMESTAMPTZ;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='clients' AND column_name='workflow_completed_at') THEN
    ALTER TABLE public.clients ADD COLUMN workflow_completed_at TIMESTAMPTZ;
  END IF;
END $$;

-- ═══ 4. New tables ═══

-- 4.1 Curator stages (10-step methodology)
CREATE TABLE IF NOT EXISTS public.curator_stages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  subtitle TEXT,
  position INT NOT NULL,
  is_optional BOOLEAN DEFAULT false,
  badge TEXT,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 4.2 Stage checklist items
CREATE TABLE IF NOT EXISTS public.curator_stage_checklist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stage_id UUID REFERENCES public.curator_stages(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  position INT NOT NULL,
  external_link TEXT,
  section TEXT
);

-- 4.3 Client stage progress
CREATE TABLE IF NOT EXISTS public.client_stages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id INT REFERENCES public.clients(id) ON DELETE CASCADE,
  stage_id UUID REFERENCES public.curator_stages(id),
  status TEXT CHECK (status IN ('not_started', 'in_progress', 'done', 'skipped')) DEFAULT 'not_started',
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  completed_by UUID REFERENCES public.users(id),
  notes TEXT,
  UNIQUE(client_id, stage_id)
);

-- 4.4 Client checklist progress
CREATE TABLE IF NOT EXISTS public.client_checklist_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id INT REFERENCES public.clients(id) ON DELETE CASCADE,
  checklist_id UUID REFERENCES public.curator_stage_checklist(id),
  is_done BOOLEAN DEFAULT false,
  done_at TIMESTAMPTZ,
  done_by UUID REFERENCES public.users(id),
  UNIQUE(client_id, checklist_id)
);

-- 4.5 Client TG files (create BEFORE messages, as messages reference it)
CREATE TABLE IF NOT EXISTS public.client_tg_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id INT REFERENCES public.clients(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  mime_type TEXT,
  size INT,
  url TEXT,
  source TEXT DEFAULT 'telegram',
  category TEXT,
  uploaded_by TEXT,
  uploaded_at TIMESTAMPTZ DEFAULT now()
);

-- 4.6 Client TG messages
CREATE TABLE IF NOT EXISTS public.client_tg_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id INT REFERENCES public.clients(id) ON DELETE CASCADE,
  tg_message_id BIGINT,
  tg_chat_id BIGINT,
  direction TEXT CHECK (direction IN ('incoming', 'outgoing')),
  sender_tg_id BIGINT,
  sender_name TEXT,
  sender_role TEXT,
  content TEXT,
  reply_to_tg_id BIGINT,
  file_id UUID REFERENCES public.client_tg_files(id),
  metadata JSONB,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_client_tg_messages_client_sent ON public.client_tg_messages(client_id, sent_at DESC);

-- 4.7 Client universities
CREATE TABLE IF NOT EXISTS public.client_universities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id INT REFERENCES public.clients(id) ON DELETE CASCADE,
  priority INT CHECK (priority BETWEEN 1 AND 5),
  university_name TEXT NOT NULL,
  program_name TEXT,
  country TEXT,
  city TEXT,
  tuition_per_year NUMERIC,
  currency TEXT,
  language TEXT,
  deadline DATE,
  start_date DATE,
  status TEXT CHECK (status IN ('planned', 'applied', 'offer_received', 'rejected', 'accepted')) DEFAULT 'planned',
  portal_url TEXT,
  portal_login TEXT,
  portal_password TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 4.8 Client documents
CREATE TABLE IF NOT EXISTS public.client_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id INT REFERENCES public.clients(id) ON DELETE CASCADE,
  doc_type TEXT NOT NULL,
  title TEXT,
  status TEXT CHECK (status IN ('missing', 'received', 'translating', 'translated', 'notarized', 'uploaded_to_uni')) DEFAULT 'missing',
  file_id UUID REFERENCES public.client_tg_files(id),
  translation_needed BOOLEAN DEFAULT false,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 4.9 Curator templates
CREATE TABLE IF NOT EXISTS public.curator_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT UNIQUE,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  category TEXT,
  usage_hint TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 4.10 Curator resources
CREATE TABLE IF NOT EXISTS public.curator_resources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  icon_code TEXT,
  url TEXT,
  login TEXT,
  password TEXT,
  category TEXT,
  is_active BOOLEAN DEFAULT true,
  position INT
);

-- 4.11 Client activities (unified feed)
CREATE TABLE IF NOT EXISTS public.client_activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id INT REFERENCES public.clients(id) ON DELETE CASCADE,
  user_id UUID REFERENCES public.users(id),
  activity_type TEXT,
  content TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_client_activities_client_created ON public.client_activities(client_id, created_at DESC);

-- ═══ 5. Disable RLS on new tables (match existing pattern) ═══

ALTER TABLE public.curator_stages DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.curator_stage_checklist DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_stages DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_checklist_progress DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_tg_files DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_tg_messages DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_universities DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_documents DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.curator_templates DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.curator_resources DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_activities DISABLE ROW LEVEL SECURITY;

-- ═══ 6. Seed data — 10 stages ═══

INSERT INTO public.curator_stages (code, title, subtitle, position, is_optional, badge) VALUES
  ('onboarding',            'Онбординг клиента',                  'Договор, оплата, рабочий чат',                     1,  false, 'СТАРТ'),
  ('profo',                 'Профориентация',                     'Определение направления (опционально)',             2,  true,  'ЕСЛИ НУЖНО'),
  ('strategy_session',      'Стратегическая сессия',              'Анализ бэкграунда, цели, стратегия',               3,  false, 'КЛЮЧЕВОЙ'),
  ('roadmap_presentation',  'Дорожная карта и презентация',       'Подбор вузов, подготовка презентации',              4,  false, 'РАБОТА КУРАТОРА'),
  ('presentation_review',   'Разбор и выбор приоритетов',         'Созвон с клиентом, выбор 1-2-3',                   5,  false, 'СОЗВОН'),
  ('documents',             'Документы',                          'Сбор, перевод, нотариальное заверение',             6,  false, 'ДОКУМЕНТЫ'),
  ('uni_applications',      'Подачи в вузы',                      'Регистрация ЛК, загрузка документов',              7,  false, 'ПОДАЧИ'),
  ('offer_housing_visa',    'Оффер, жильё, виза',                 'Принятие оффера, общежитие/квартира, виза',        8,  false, 'ЛЕГАЛИЗАЦИЯ'),
  ('arrival_prep',          'Подготовка к приезду',               'Билеты, страховка, инструкции',                    9,  false, 'ФИНАЛ'),
  ('enrollment_done',       'Легализация и зачисление',           'ВНЖ, банк, зачисление подтверждено',              10,  false, 'ЗАВЕРШЁН')
ON CONFLICT (code) DO NOTHING;

-- ═══ 7. Seed data — templates ═══

INSERT INTO public.curator_templates (code, title, body, category, usage_hint) VALUES
  ('session_summary',       'Итог стратегической сессии',
   'Привет, [Имя]! Подводим итог нашей сессии:\n\n1. Цель: [цель]\n2. Страны: [страны]\n3. Направления: [направления]\n4. Следующий шаг: [шаг]\n\nПрезентация будет готова к [дата].',
   'session', 'Отправить после стратегической сессии'),
  ('portals_ready',         'Личные кабинеты созданы',
   'Привет, [Имя]! Создала личные кабинеты в вузах:\n\n1. [Вуз 1] — [логин/пароль]\n2. [Вуз 2] — [логин/пароль]\n3. [Вуз 3] — [логин/пароль]\n\nОбязательно проверь доступ и напиши, если что-то не открывается.',
   'portals', 'Когда ЛК вузов настроены'),
  ('presentation_summary',  'Итог разбора презентации',
   'Привет, [Имя]! По итогу нашего созвона:\n\nПриоритет 1: [вуз]\nПриоритет 2: [вуз]\nПриоритет 3: [вуз]\n\nДалее — собираем документы. Список отправлю отдельно.',
   'session', 'После разбора презентации'),
  ('designer_brief',        'ТЗ для дизайнера',
   'Алёна, привет! Нужна презентация для клиента [Имя].\n\nВузы:\n1. [Вуз 1], [страна]\n2. [Вуз 2], [страна]\n3. [Вуз 3], [страна]\n\nСтиль: стандартный Go&Study.\nДедлайн: [дата].',
   'designer', 'Отправить дизайнеру Алёне')
ON CONFLICT (code) DO NOTHING;

-- ═══ 8. Seed data — resources ═══

INSERT INTO public.curator_resources (title, description, icon_code, url, category, position) VALUES
  ('Таблица мониторинга',      'Google Sheets — трекинг клиентов',            'GS',  NULL, 'main',     1),
  ('Google Calendar',          'Расписание сессий и дедлайнов',               'Cal', 'https://calendar.google.com', 'main', 2),
  ('Zoom',                     'Видеозвонки с клиентами',                     'Zm',  'https://zoom.us', 'session', 3),
  ('ApplyBoard SoP',           'Генератор Statement of Purpose',              'AB',  NULL, 'docs',     4),
  ('Resume.io',                'Конструктор CV',                              'CV',  'https://resume.io', 'docs', 5),
  ('Курсы подготовки к тестам', 'IELTS, Goethe, DELE и др.',                  'EN',  NULL, 'main',     6),
  ('Дизайнер Алёна',           'Презентации для клиентов',                    'TG',  NULL, 'designer', 7)
ON CONFLICT DO NOTHING;
