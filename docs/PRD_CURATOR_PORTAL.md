# PRD — Модуль «Кураторы» (ЛК куратора + поступление клиента)

**Проект:** Go & Study CRM
**Автор:** Andrey Boretskiy + Claude
**Версия:** 1.0 (от 2026-04-17)
**Статус:** Draft → готов к реализации

---

## 1. Контекст и цель

### 1.1. Что есть сейчас

В CRM есть таблица `curators` (id, name, contact, is_active) — это справочник, без авторизации. Кураторы не имеют доступа в систему, куратор привязывается к клиенту через `clients.curator_id`. Вся рабочая методика поступления живёт на Tilda-странице `/portal` (этапы, регламент, шаблоны, ресурсы) — статичный справочник, без интеграции с данными конкретного клиента.

Мониторинг клиентов ведётся в Google Sheets + AMO CRM параллельно, рабочие чаты с клиентами — в Telegram-группах вручную, файлы теряются в чатах.

### 1.2. Что делаем

Превращаем куратора в полноценного пользователя CRM с личным кабинетом. Каждый оплаченный клиент попадает к конкретному куратору и ведётся внутри CRM по всем 10 этапам поступления, с чатом из TG-группы, файлами, задачами, шаблонами, AI-помощником. Google Sheets и Tilda-портал замещаются.

### 1.3. Кому и зачем

- **Куратор** — получает один инструмент вместо Tilda + Sheets + AMO + TG. Видит своих клиентов, этапы, задачи, чат, файлы.
- **Продажник** — после оплаты назначает клиенту куратора, создаёт TG-группу, добавляет бота — клиент автоматически улетает в ЛК куратора.
- **Админ/Основатель** — видит всю работу кураторов: кто на каком этапе, где застряли, какие доки собраны.
- **Клиент (Фаза 3)** — получает свой ЛК, куда сам загружает документы по чек-листам.

### 1.4. Почему это важно

1. Единая история по клиенту «от продажи до вуза» — сейчас она рваная.
2. Ничего не теряется в TG — вся переписка и файлы структурированы в карточке клиента.
3. Прозрачность для руководства — видно, кто и где буксует.
4. База знаний (шаблоны, регламенты, подборки вузов) — встроены в контекст, а не в отдельной вкладке браузера.
5. Задел под AI: автосаммари сессий, проверки документов, AI-помощник куратору.

---

## 2. Роли и права

### 2.1. Новая роль — `curator`

Добавляем в `users.role` ещё одно значение: `'admin' | 'salesperson' | 'rop' | 'curator'`.

**Куратор может:**
- Видеть только своих клиентов (`clients.curator_id = auth.uid()`)
- Вести карточку клиента: этапы, задачи, чат, файлы, заметки
- Читать/отправлять сообщения в TG-группу клиента
- Пользоваться шаблонами, регламентами, ресурсами (встроенный портал)
- Видеть свой дашборд: клиенты по этапам, дедлайны, просроченные задачи

**Куратор НЕ может:**
- Видеть чужих клиентов
- Видеть финансы (оплаты, расходы)
- Видеть воронку продаж, клиентов без оплаты
- Создавать клиентов (клиент создаётся продажником)

### 2.2. Изменения для других ролей

- **Salesperson** — получает в карточке клиента/сделки поле «куратор» и кнопку «передать куратору». При передаче создаётся связка `clients.curator_id` + клиент становится видимым в ЛК куратора.
- **Admin** — получает полный доступ ко всем ЛК кураторов, страницу `/admin/curators` (управление кураторами, назначения, нагрузка), плюс видит в карточке клиента всю кураторскую часть.
- **ROP** — без изменений в Фазе 1. В Фазе 2 можно добавить метрики по кураторам (скорость прохождения этапов, конверсия в оффер).

### 2.3. Миграция существующих `curators`

Таблица `curators` остаётся как **расширение профиля** (контакты, специализация, страны, языки), но получает `user_id` → `users.id`. Для каждой записи в `curators` создаётся пользователь в `users` с ролью `curator` (если ещё не создан). Админ через UI приглашает кураторов (выдаёт логин/временный пароль).

---

## 3. Архитектура данных

### 3.1. Изменения в существующих таблицах

**`users`**
```sql
ALTER TABLE users DROP CONSTRAINT users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check
  CHECK (role IN ('admin', 'salesperson', 'rop', 'curator'));
```

**`curators`** — связываем с users:
```sql
ALTER TABLE curators ADD COLUMN user_id UUID REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE curators ADD COLUMN specializations TEXT[];  -- ['UK', 'Italy', 'Netherlands']
ALTER TABLE curators ADD COLUMN languages TEXT[];        -- ['ru', 'en']
ALTER TABLE curators ADD COLUMN max_clients INT DEFAULT 20;
ALTER TABLE curators ADD COLUMN telegram_id BIGINT;      -- для тегания в группе
ALTER TABLE curators ADD COLUMN telegram_username TEXT;
CREATE UNIQUE INDEX ON curators(user_id) WHERE user_id IS NOT NULL;
```

**`clients`** — добавляем статус работы куратора:
```sql
ALTER TABLE clients ADD COLUMN curator_assigned_at TIMESTAMPTZ;
ALTER TABLE clients ADD COLUMN current_stage_code TEXT;       -- 'onboarding'|'profo'|'strategy'|...
ALTER TABLE clients ADD COLUMN tg_group_chat_id BIGINT;       -- рабочая группа в TG
ALTER TABLE clients ADD COLUMN tg_group_title TEXT;
ALTER TABLE clients ADD COLUMN workflow_started_at TIMESTAMPTZ;
ALTER TABLE clients ADD COLUMN workflow_completed_at TIMESTAMPTZ;
```

### 3.2. Новые таблицы

**`curator_stages`** — справочник этапов (10 штук по методике с портала):
```sql
CREATE TABLE curator_stages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT UNIQUE NOT NULL,          -- 'onboarding', 'profo', 'strategy_session', ...
  title TEXT NOT NULL,                -- 'Онбординг клиента'
  subtitle TEXT,                      -- 'Договор, оплата, рабочий чат'
  position INT NOT NULL,              -- порядок 1..10
  is_optional BOOLEAN DEFAULT false,  -- профориентация опциональна
  badge TEXT,                         -- 'СТАРТ'|'ЕСЛИ НУЖНО'|'КЛЮЧЕВОЙ'|'ФИНАЛ'
  description TEXT,                   -- текст регламента
  created_at TIMESTAMPTZ DEFAULT now()
);
```

**`curator_stage_checklist`** — пункты-чеклисты внутри этапа (как на Tilda):
```sql
CREATE TABLE curator_stage_checklist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stage_id UUID REFERENCES curator_stages(id) ON DELETE CASCADE,
  text TEXT NOT NULL,                 -- 'Отправить видеозапись в рабочий чат'
  position INT NOT NULL,
  external_link TEXT,                 -- ссылка (Google Calendar и т.п.)
  section TEXT                        -- 'Параметры поступления'|'Бэкграунд клиента'|'Резюме'
);
```

**`client_stages`** — прохождение этапов конкретным клиентом:
```sql
CREATE TABLE client_stages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id INT REFERENCES clients(id) ON DELETE CASCADE,
  stage_id UUID REFERENCES curator_stages(id),
  status TEXT CHECK (status IN ('not_started', 'in_progress', 'done', 'skipped')),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  completed_by UUID REFERENCES users(id),
  notes TEXT,
  UNIQUE(client_id, stage_id)
);
```

**`client_checklist_progress`** — отметки по пунктам внутри этапа:
```sql
CREATE TABLE client_checklist_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id INT REFERENCES clients(id) ON DELETE CASCADE,
  checklist_id UUID REFERENCES curator_stage_checklist(id),
  is_done BOOLEAN DEFAULT false,
  done_at TIMESTAMPTZ,
  done_by UUID REFERENCES users(id),
  UNIQUE(client_id, checklist_id)
);
```

**`client_tg_messages`** — архив сообщений из рабочей группы:
```sql
CREATE TABLE client_tg_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id INT REFERENCES clients(id) ON DELETE CASCADE,
  tg_message_id BIGINT,               -- id сообщения в TG
  tg_chat_id BIGINT,                  -- id группы
  direction TEXT CHECK (direction IN ('incoming', 'outgoing')),
  sender_tg_id BIGINT,
  sender_name TEXT,                   -- кто написал (клиент / куратор / кто-то)
  sender_role TEXT,                   -- 'client'|'curator'|'other'
  content TEXT,
  reply_to_tg_id BIGINT,              -- если это ответ на другое сообщение
  file_id UUID REFERENCES client_tg_files(id),
  metadata JSONB,                     -- всё что пришло от TG
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX ON client_tg_messages(client_id, sent_at DESC);
```

**`client_tg_files`** — файлы из чата:
```sql
CREATE TABLE client_tg_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id INT REFERENCES clients(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  mime_type TEXT,
  size INT,
  url TEXT,                           -- Supabase Storage URL
  source TEXT DEFAULT 'telegram',
  category TEXT,                      -- 'passport'|'diploma'|'ielts'|'motivation'|'other'
  uploaded_by TEXT,                   -- имя отправителя
  uploaded_at TIMESTAMPTZ DEFAULT now()
);
```

**`client_universities`** — приоритетные вузы (1, 2, 3 из этапа «Разбор»):
```sql
CREATE TABLE client_universities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id INT REFERENCES clients(id) ON DELETE CASCADE,
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
  status TEXT CHECK (status IN ('planned','applied','offer_received','rejected','accepted')),
  portal_url TEXT,                    -- ссылка на ЛК вуза
  portal_login TEXT,
  portal_password TEXT,               -- шифровать!
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
```

**`client_documents`** — учёт документов (паспорт, аттестат, IELTS, мотивационное письмо и т.д.):
```sql
CREATE TABLE client_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id INT REFERENCES clients(id) ON DELETE CASCADE,
  doc_type TEXT NOT NULL,             -- 'passport'|'diploma'|'ielts'|'motivation_letter'|'cv'|...
  title TEXT,                         -- кастомное название
  status TEXT CHECK (status IN ('missing','received','translating','translated','notarized','uploaded_to_uni')),
  file_id UUID REFERENCES client_tg_files(id),
  translation_needed BOOLEAN DEFAULT false,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
```

**`curator_templates`** — шаблоны сообщений (то что сейчас в Tilda во вкладке «Шаблоны»):
```sql
CREATE TABLE curator_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT UNIQUE,                   -- 'session_summary', 'portals_ready', ...
  title TEXT NOT NULL,
  body TEXT NOT NULL,                 -- с плейсхолдерами [Имя], [дата]
  category TEXT,                      -- 'session'|'portals'|'docs'|'designer_brief'
  usage_hint TEXT,                    -- 'Отправить в день сессии в общий чат'
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

**`curator_resources`** — ресурсы/инструменты (Google Calendar, Zoom, ApplyBoard и т.д.):
```sql
CREATE TABLE curator_resources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  icon_code TEXT,                     -- 'GS'|'Cal'|'Zm'|'AB'|'CV'|'EN'|'TG'
  url TEXT,
  login TEXT,                         -- шифровать если хранить пароль
  password TEXT,
  category TEXT,                      -- 'main'|'session'|'docs'|'designer'
  is_active BOOLEAN DEFAULT true,
  position INT
);
```

**`client_activities`** — единый фид событий по клиенту (этап сменился, файл пришёл, задача закрылась):
```sql
CREATE TABLE client_activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id INT REFERENCES clients(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id),
  activity_type TEXT,                 -- 'stage_change'|'note'|'file'|'task'|'system'|'ai'
  content TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX ON client_activities(client_id, created_at DESC);
```

### 3.3. Начальные данные (seed)

**10 этапов** (по методике с портала):
1. `onboarding` — Онбординг клиента (Договор, оплата, рабочий чат) — СТАРТ
2. `profo` — Профориентация (опционально) — ЕСЛИ НУЖНО
3. `strategy_session` — Стратегическая сессия — КЛЮЧЕВОЙ
4. `roadmap_presentation` — Дорожная карта и презентация — РАБОТА КУРАТОРА
5. `presentation_review` — Разбор и выбор приоритетов — СОЗВОН
6. `documents` — Документы — ДОКУМЕНТЫ
7. `uni_applications` — Подачи в вузы (ЛК вузов) — ПОДАЧИ
8. `offer_housing_visa` — Оффер, жильё, виза — ЛЕГАЛИЗАЦИЯ
9. `arrival_prep` — Подготовка к приезду — ФИНАЛ
10. `enrollment_done` — Легализация и зачисление — ЗАВЕРШЁН

**4 шаблона сообщений** (уже есть текст на портале):
- `session_summary` — Итог стратегической сессии
- `portals_ready` — Личные кабинеты созданы
- `presentation_summary` — Итог разбора презентации
- `designer_brief` — ТЗ для дизайнера

**7 ресурсов:**
Таблица мониторинга, Google Calendar, Zoom, ApplyBoard SoP, Resume.io, Курсы подготовки к тестам, Дизайнер Алёна.

Всё это вставляется миграцией, чтобы при старте портал работал «из коробки».

---

## 4. UI — страницы и компоненты

### 4.1. Роуты куратора `/curator/*`

| Путь | Назначение |
|---|---|
| `/curator` | Главная: мои клиенты по этапам, задачи на сегодня, алерты |
| `/curator/clients` | Список клиентов с фильтрами (этап, страна, дедлайн) |
| `/curator/clients/[id]` | Карточка клиента — главный экран работы |
| `/curator/templates` | Библиотека шаблонов |
| `/curator/guide` | Встроенный регламент (замена Tilda-портала) |
| `/curator/resources` | Инструменты и ресурсы |
| `/curator/profile` | Свой профиль, TG-username, специализации |

### 4.2. Карточка клиента `/curator/clients/[id]`

Это главный экран. Структура — вертикальная, с табами:

**Шапка:**
- Имя, страна, уровень образования, куратор (можно видеть всех)
- Текущий этап (badge), прогресс 3/10
- Кнопки: «Открыть TG-группу», «Позвонить», «Zoom»

**Табы:**
1. **Обзор** — виджеты: текущий этап + чек-лист, ближайшие задачи, последние сообщения, прогресс документов
2. **Этапы** — все 10 этапов в виде аккордеона (как на Tilda), но интерактивно: галочки по чек-листам, автозаписи в `client_activities`
3. **Чат** — полная история TG-группы + отправка сообщений отсюда (двусторонний обмен через Bot API)
4. **Файлы** — библиотека всех файлов, группировка по категориям/этапам, быстрый поиск
5. **Вузы** — приоритетные вузы, статусы подач, ЛК
6. **Документы** — чек-лист документов, статусы (нужен / получен / переведён / загружен)
7. **Задачи** — задачи куратора по клиенту (deadline, done)
8. **Заметки** — свободные записи
9. **Активность** — единый фид всех событий

### 4.3. Главный экран `/curator` (дашборд куратора)

**Блоки:**
- **Сегодня** — задачи с дедлайном сегодня/просроченные
- **Мои клиенты по этапам** — колонки этапов, карточки клиентов (мини-канбан; клик → карточка)
- **Непрочитанные сообщения** — клиенты, у которых в TG-группе есть новое от клиента, но нет ответа куратора
- **Ближайшие дедлайны вузов** — клиенты, у которых через 30 дней дедлайн подачи
- **Подсказки AI** — «Клиент N 3 дня без ответа», «У клиента M дедлайн IELTS через неделю» (Фаза 2)

### 4.4. Изменения на существующих страницах

**`/admin/clients/[id]` (drawer/карточка)** — добавить секцию «Куратор»:
- Кто назначен, с какой даты
- Текущий этап клиента, прогресс
- Кнопка «Перейти в кураторский ЛК клиента»
- Поле выбора куратора + кнопка «Назначить/Сменить»

**`/admin/clients/new` и `/sales/new`** — после создания клиента, если оплата подтверждена, шаг «Назначить куратора» с выбором из списка + полем TG chat_id.

**`/admin/curators`** — новая страница (admin only):
- Список кураторов
- Нагрузка (сколько активных клиентов)
- Специализации
- Приглашение нового куратора (создание user с ролью curator)

### 4.5. Дизайн-токены

Используем существующие CSS-переменные. Badge этапов:
- `onboarding` / старт — `--purple`
- ключевые (3) — `--gold`
- активные — `--purple`
- завершён — `--green`
- красная зона (нарушения) — `--red`

---

## 5. Интеграция с Telegram-группой

### 5.1. Как это работает

**Сценарий создания:**
1. Продажник в карточке клиента жмёт «Передать куратору»
2. Выбирает куратора из списка
3. Система показывает инструкцию: «Создай в Telegram группу с клиентом, добавь бота `@goandstudy_bot`, пришли в неё команду `/bind <client_id>`»
4. Продажник делает это → бот получает сообщение, извлекает `chat_id`, записывает в `clients.tg_group_chat_id`
5. С этого момента все сообщения группы парсятся и сохраняются в `client_tg_messages`

Это избавляет нас от проблемы «как автоматически создать группу» — Bot API такого не умеет, группа всегда создаётся человеком.

### 5.2. Webhook `/api/telegram/curator-webhook`

Отдельный эндпоинт (не переиспользуем существующий `/api/telegram/webhook`, т.к. там другая логика — деалы из групповых чатов в воронку продаж).

Обрабатывает:
- **Команда `/bind <client_id>`** — связываем группу с клиентом (проверка: отправитель — куратор или продажник этого клиента)
- **Входящие сообщения** — сохраняем в `client_tg_messages`, файлы — в `client_tg_files` (качаем через Telegram File API, кладём в Supabase Storage)
- **Определение роли отправителя** — ищем его `tg_id` в `users` / `curators` / `clients.telegram`. Если не найден — `sender_role = 'other'`.

### 5.3. Отправка из ЛК в группу

В табе «Чат» карточки клиента — поле ввода + отправка. Server Action → `sendTelegramMessage(chatId, text)` → запись в `client_tg_messages` с `direction='outgoing'`.

### 5.4. Безопасность

- Бот должен быть admin в группе (чтобы получать все сообщения, а не только те, где его упомянули)
- Проверка: если `chat_id` не привязан ни к какому клиенту, бот молчит
- Токен бота — только в env (`TELEGRAM_BOT_TOKEN`, уже есть)

---

## 6. Server Actions (`app/curator/actions.ts`)

Ключевые действия:

**Управление клиентом:**
- `assignCurator(clientId, curatorUserId)` — назначение (админ/продажник)
- `bindTgGroup(clientId, chatId, chatTitle)` — ручная привязка группы (альтернатива /bind команде)

**Этапы и чек-листы:**
- `startStage(clientId, stageCode)` — перевести клиента на этап
- `completeStage(clientId, stageCode, notes?)` — закрыть этап
- `toggleChecklistItem(clientId, checklistId, done)` — чекбокс внутри этапа
- `skipStage(clientId, stageCode, reason)` — пропуск опционального этапа

**Коммуникация:**
- `sendTgMessage(clientId, text)` — отправить в рабочую группу
- `sendTemplate(clientId, templateCode, vars)` — отправить шаблон с подставленными переменными

**Вузы:**
- `addUniversity(clientId, data)` / `updateUniversity(id, data)` / `deleteUniversity(id)`
- `setUniversityStatus(id, status)` — planned → applied → offer_received → accepted

**Документы:**
- `upsertDocument(clientId, docType, data)`
- `linkFileToDocument(docId, fileId)` — связать файл из чата с нужным типом документа
- `setDocumentStatus(docId, status)`

**Задачи и заметки:**
- `createCuratorTask(clientId, title, deadline)` / `toggleCuratorTask(taskId)` — переиспользуем `deal_tasks` либо создаём аналог `client_tasks`
- `addNote(clientId, text)`

**AI (Фаза 2):**
- `generateSessionSummary(clientId, transcript)` — автосаммари из видеозаписи/текста
- `suggestReplyToClient(clientId)` — подсказка ответа куратору
- `checkDocumentCompleteness(clientId)` — AI проверяет, всё ли есть

---

## 7. API Routes

| Метод | Путь | Назначение |
|---|---|---|
| POST | `/api/telegram/curator-webhook` | Webhook от TG бота для групп кураторов |
| POST | `/api/curator/tg-send` | Отправка сообщения в группу из ЛК (если выносим из server action) |
| GET | `/api/curator/files/[id]` | Отдача файла (проверка прав, подписанный URL Supabase Storage) |

Существующие (`/api/ai/suggest`, `/api/wazzup/webhook`) не трогаем.

---

## 8. Middleware

В `middleware.ts`:
- Роль `curator` пускаем только в `/curator/*`, `/api/curator/*`
- При логине куратора редиректим на `/curator`
- Блокируем кураторов на `/admin/*`, `/sales/*`, `/rop/*`
- Админ/ROP могут ходить в `/curator/*` (read-only просмотр)

---

## 9. RLS (Row Level Security)

**`clients`** — куратор видит только `curator_id IN (SELECT id FROM curators WHERE user_id = auth.uid())`
**`client_stages`, `client_tg_messages`, `client_documents`, `client_universities`** — через JOIN на `clients` с той же проверкой
**`curator_templates`, `curator_resources`, `curator_stages`** — SELECT доступен всем аутентифицированным

Для админских/ROP страниц — `createAdminClient()` (как уже делаем в ROP).

---

## 10. Фазы реализации

### ФАЗА 1 — MVP (2-3 недели)

**Цель:** куратор заходит в ЛК, видит своих клиентов, ведёт по этапам, получает сообщения/файлы из TG, шаблоны и регламент есть.

**Скоуп:**
- [ ] Миграции: новая роль `curator`, расширение `curators`, новые таблицы (стадии, чек-листы, прогресс, TG-сообщения, файлы, шаблоны, ресурсы, активности)
- [ ] Seed: 10 этапов + чек-листы по портала, 4 шаблона, 7 ресурсов
- [ ] Страница управления кураторами `/admin/curators` (пригласить, активировать)
- [ ] Middleware + RLS для роли `curator`
- [ ] Роут `/curator` — дашборд (простой, без AI)
- [ ] Роут `/curator/clients` + `/curator/clients/[id]` с табами: Обзор / Этапы / Чат / Файлы / Документы / Задачи / Заметки
- [ ] Компонент «Этапы клиента» (аккордеон 10 этапов с чек-листами)
- [ ] Назначение куратора из `/admin/clients/[id]` и `/sales/new`
- [ ] Интеграция TG:
  - новый webhook `/api/telegram/curator-webhook`
  - команда `/bind <client_id>`
  - парсинг входящих (текст, файлы → Supabase Storage)
  - отправка из таба «Чат»
- [ ] Библиотека шаблонов `/curator/templates` + встроенные в чат
- [ ] Регламент `/curator/guide` — перенос Tilda-страницы в CRM
- [ ] Ресурсы `/curator/resources`

### ФАЗА 2 — Усиление (2 недели)

**Цель:** подборки вузов, AI-помощник куратору, автоматизация рутины.

**Скоуп:**
- [ ] Таб «Вузы» в карточке клиента — приоритеты 1/2/3/4/5, статусы подач, дедлайны
- [ ] Каталог вузов (новая таблица `universities` с базой — страна, программы, требования, стоимость) + подбор для клиента
- [ ] Генератор ТЗ для дизайнера (по данным вузов в карточке → готовый текст для Алёны)
- [ ] AI-саммари стратегической сессии (загрузка транскрипта → текст по шаблону)
- [ ] AI-подсказки ответа куратору (аналог `/api/ai/suggest`, но на контексте кураторского чата)
- [ ] Уведомления: новое сообщение от клиента, дедлайн вуза через N дней
- [ ] Дашборд куратора — полный, с AI-алертами

### ФАЗА 3 — ЛК клиента (2-3 недели)

**Цель:** клиент сам загружает документы по чек-листам, отслеживает прогресс.

**Скоуп:**
- [ ] Новая роль `client` в `users` (или отдельная авторизация magic-link по email/телефону — без пароля)
- [ ] Роут `/student/*`: дашборд, документы, вузы, прогресс
- [ ] Чек-листы документов с примерами (куратор задаёт, клиент загружает)
- [ ] Упрощённый просмотр прогресса этапов (без внутрянки куратора)
- [ ] Нотификации клиенту (email/TG) о действиях куратора
- [ ] Публичная ссылка-трекер (то что на портале «отправить клиенту ссылку на отслеживание этапов»)

### ФАЗА 4 — AI и автоматизация (гибко)

**Цель:** AI-ассистент куратора, автопроверки, межроль коммуникация.

**Идеи:**
- AI проверяет загруженные документы клиента (корректность формата, полнота)
- AI готовит черновики мотивационных писем на основе анкеты
- AI-агент пишет клиенту за куратора при отсутствии ответа 2+ дня (с подтверждением куратора)
- AI-саммари всей переписки клиента для передачи другому куратору
- Автоматические алерты продажнику: «Клиент X застрял на этапе Y — возможно надо вмешаться»
- AI-проверка корректности заполнения ЛК вузов (скриншот → анализ)

---

## 11. Риски и открытые вопросы

### 11.1. Риски

- **Согласие клиентов на хранение TG-переписки** — юридически нужно упомянуть в договоре/офёрте. Предлагаю: добавить пункт в договор и чек в онбординге «Клиент проинформирован об обработке переписки в рабочей группе».
- **Пароли от вузовских ЛК** — хранить в открытом виде опасно. Используем шифрование на уровне БД (pgcrypto) либо Supabase Vault. Доступ только куратору + админу.
- **Утечка бот-токена** — в CRM_FULL_CONTEXT в TODO указано «Rotate leaked Telegram bot token». До запуска нужно сделать.
- **Масштаб TG-сообщений** — если у куратора 20 клиентов × 200 сообщений = 4000 записей. Не критично, но индекс по `client_id + sent_at DESC` обязателен.
- **Файлы в Supabase Storage** — тариф, bucket politik. Для Фазы 1 — private bucket, доступ через signed URL.

### 11.2. Открытые вопросы (жду ответ)

1. **Главный куратор** — ты сказал пока не надо. Но на Tilda-портале упоминается «тегнуть главного куратора → подключить визового специалиста». Это значит, на этапе 8 должен быть механизм передачи визовому специалисту. Делать роль `visa_specialist` сразу или через поле «тег» на этапе?
2. **Нотариальный перевод** — «WA Перевод документов» — это партнёр. Интегрируем его в CRM (отдельный контакт в ресурсах, статус «отправлено на перевод») или пока просто ссылка?
3. **Подпислон** (договор на онбординге) — интегрируем API или куратор вручную отмечает «договор подписан»?
4. **AMO CRM** — сейчас параллельно. Мы её полностью замещаем этим модулем или синхронизируем? Если замещаем — миграция клиентов из AMO в `clients`?
5. **Google Sheets мониторинг** — замещаем полностью после запуска Фазы 1 или держим параллельно первое время?
6. **Zoom/Google Calendar** — глубокая интеграция (создание встреч из CRM) или пока просто ссылки в ресурсах?

---

## 12. Приёмка MVP (Фаза 1)

**Готово, если:**
1. Админ может пригласить куратора — тот получает логин и входит в `/curator`
2. Продажник из карточки клиента назначает куратора, указывает TG-группу
3. Бот в TG-группе получает все сообщения и файлы — они появляются в табе «Чат» и «Файлы» клиента
4. Куратор может прокликать чек-лист этапа, и этап автоматически завершится
5. Куратор может отправить шаблон-сообщение в TG-группу из CRM
6. Все 10 этапов, 4 шаблона, 7 ресурсов доступны во встроенном виде — Tilda-портал больше не нужен
7. В `/admin/clients/[id]` видна «кураторская часть» клиента — этап, прогресс, последнее сообщение

---

## 13. Что НЕ делаем в Фазе 1 (зафиксировано)

- ЛК клиента (студента)
- Каталог вузов с поиском
- AI-подсказки / автосаммари
- Интеграция с Zoom / Google Calendar (только ссылки)
- Интеграция с Подпислон
- Миграция из AMO CRM
- Роль главного куратора / визового специалиста
- Email-уведомления

Всё это — фазы 2-4 либо отдельные PRD.
