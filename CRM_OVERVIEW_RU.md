# Go & Study CRM — обзор проекта

Бизнес- и тех-справочник: что система делает, кто ей пользуется, как устроена. Документ актуален на 2026-05-01.

**Прод-домен:** https://crm.goandstudy.com
**Хостинг:** Vercel (автодеплой из ветки `main`)
**База данных:** Supabase (PostgreSQL, основной проект `pxtwaxhmygnssyyowrgr`)
**Парсер вузов/программ:** отдельный Supabase-проект GS_apply (`ymyzzdnmadtxzjuvpefq`)
**Язык интерфейса:** русский

---

## Что это такое

Внутренняя CRM для образовательной консалтинговой компании Go & Study. Заменяет связку amoCRM + Google Sheets + почта + мессенджеры. Включает:

- Воронку продаж (канбан) с перепиской прямо в карточке
- Платежи, расходы, счета через СБП
- Базу клиентов и кураторов
- **Каталог 7000+ вузов и программ** + AI-обогащение (фото, тьюшн, видео, описания)
- **Базу 3 источников стипендий** (частные TopUni QS, государственные, IDP)
- **Кабинет клиента** с подборкой, документами, эссе, мотивашкой, резюме
- **Кабинет куратора** для управления клиентами
- Запись на консультации через публичную ссылку
- Транзакционные письма через Resend (домен `goandstudy.com` верифицирован)

---

## Четыре роли + четыре кабинета

### 1. Администратор — `/admin`
Полный доступ. Владелец/бухгалтер.
- Главная (KPI, выручка, должники)
- Клиенты, платежи, расходы, счета, постоянные расходы
- Воронка продаж (управление)
- Аналитика по менеджерам
- Настройки (продажники, кураторы, этапы, веса), календарь записей
- Кнопка **«Ссылка для активации кабинета»** для каждого куратора (генерирует invite)

### 2. Менеджер по продажам — `/sales`
Видит только своих клиентов и сделки.
- «Мои клиенты» — список + кнопка `🔗 Ссылка для активации кабинета`
- Воронка (только свои сделки) — карточка сделки с перепиской, файлами, AI-подсказкой ответа
- Создание клиента (RPC `create_client_with_payments`)
- Свой график приёма консультаций, задачи, лидерборд

### 3. Куратор — `/curator`
Работа с клиентами после продажи.
- **Мои клиенты** (`/curator/clients`) — список + детальная страница клиента (6 табов: подборка, документы, эссе, стипендии, заметки, активность)
- **Каталог вузов** (`/curator/universities`) — поиск по 7000+ школ, фильтры (страна, направление), детальная страница школы с фото-героем, картой Google, видео с YouTube, программами, тьюшн
- **AI-обогащение** (кнопка «Заполнить через AI») — Claude + Wikipedia API + YouTube подгружают фото кампуса, описание, тьюшн, кол-во студентов, проходной балл, видео, аккредитации
- **Стипендии** (`/curator/scholarships`) — каталог из 3 источников (частные/государственные/IDP), привязка к школам по названию, фильтры
- **Bulk unlock**: куратор скрывает стипендии от клиента до оплаты доп-услуги, потом включает массово
- **Шортлисты** — добавление программ в подборку клиента (без лимита, drag-and-drop приоритет 1–15)

### 4. Клиент — `/client`
Личный кабинет студента после активации invite-ссылки.
- **Главная** — DashboardHero (приветствие), таймлайн прогресса, превью подборки/документов/эссе
- **Подборка** (`/client/shortlist`) — 15 программ от куратора, drag-and-drop приоритеты, синхрон с куратором
- **Документы** (`/client/documents`) — загрузка/просмотр документов
- **Мотивашка** (`/client/motivation`) — Personal Statement builder (UCAS-template, секции: интерес, мотивация, образование, опыт, навыки, достижения, цели)
- **Резюме** (`/client/resume`) — резюме-билдер по образцу resume.io
- **Эссе** (`/client/essays`) — школьные эссе с проверкой куратором
- **Стипендии** (`/client/scholarships`) — пусто пока куратор не разблокирует, тогда видны подходящие
- **Спотлайт-тур** (`/client/page` при первом входе) — 7 шагов с подсветкой UI-элементов

---

## Воронка продаж

Канбан со сделками. Этапы по умолчанию (можно править в настройках):
`Новые заявки → Контакт → Выявление → Презентация → Возражения → Договор → Первичная продажа → Оплата услуг → Догрев`
Тупики: `Не пришёл`, `На будущее`, `Релокация`.

Каждый этап имеет **вес** (0–1) — для прогноза выручки.

### Карточка сделки
- Контакты (телефон, email, TG, WhatsApp)
- Бюджет и валюта
- Источник (ручной, Wazzup, TG-бот, бронь)
- Переписка прямо в карточке (Wazzup24 для TG/WhatsApp)
- Файлы, заметки, активность, задачи с дедлайном
- AI-подсказка ответа (Claude `claude-sonnet-4-6`)

### Источники сделок
- Ручное создание из `/sales` или `/admin`
- Webhook Wazzup (WhatsApp + TG) — `/api/wazzup-webhook`
- Webhook TG-бота для групповых чатов — `/api/tg-webhook`
- Публичная форма `/book/[manager]` — создаёт бронь + сделку

### Перевод сделки в клиента
Когда сделка переходит на этап «Оплата услуг» с галкой «онбординг» — автоматически:
1. Создаётся row в `clients` через RPC `create_client_with_payments`
2. Возвращается invite-ссылка для активации кабинета
3. Кнопка показывает модалку с копированием ссылки

---

## Invite-флоу (новинка апрель 2026)

### Для клиента
1. Продажник/админ жмёт `🔗 Ссылка для активации кабинета` → `lib/invitation.ts:createClientInvitation()`
2. Создаётся row в `client_invitations` (token 24 байта hex, TTL 30 дней)
3. Resend отправляет письмо клиенту с темой *«Доступ в личный кабинет Go & Study»* от `noreply@goandstudy.com`
4. Клиент открывает `/invite/[token]` → email read-only + поле пароля → активация
5. Создаётся `auth.users` + `public.users` с `role='client'`
6. Welcome-письмо («Кабинет готов»)
7. Клиент логинится и попадает на `/client` со спотлайт-туром

### Для куратора (`/admin/settings`)
Аналогично, но через `lib/curator-invitation.ts:createCuratorInvitation()` → `curator_invitations` → `/invite/curator/[token]` → `curators.user_id` привязывается к `auth.users.id`.

---

## Запись на консультацию

`/book` (общая страница) и `/book/[manager]` (под конкретного продажника).

- Все даты/время **в MSK** (Europe/Moscow) через `lib/time.ts`
- **Минимум 1 час между консультациями** одного продажника (`MIN_GAP_MINUTES = 60`)
- **Round-robin распределение** между активными продажниками — счётчик `round_robin_count`
- При отмене — счётчик откатывается + удаляется row, чтобы можно было перебронить
- Уведомления в **отдельный TG-бот** (`TELEGRAM_BOOKINGS_BOT_TOKEN`, группа `-5281204319`)

---

## Деньги

### Платежи
Графики по клиентам: номер, план-дата, план-сумма, факт-дата, факт-сумма, оплачен/нет. Представление `payments_view` со статусом `paid` / `overdue` / `soon`.

Особенность: при изменении суммы платежа система **перераспределяет** остальные неоплаченные пропорционально, чтобы общая сумма по клиенту не поменялась.

### Расходы
По статьям: куратор, менеджер, виза, документы, прочее. Статус: ожидает/оплачено.

### Постоянные расходы
Шаблоны (офис, зарплаты, софт, маркетинг) + ежемесячные записи.

### Счета (СБП через Т-Банк)
Создаются из карточки сделки. Т-Банк колбэк на `/api/tbank-notify` → статус обновляется.

---

## Каталог вузов + AI-обогащение

### Источник данных
Парсер из репозитория `idp_scholarships_scraper` (отдельная Supabase БД GS_apply) тянет вузы из IDP, TopUniversities, etc → `schools` + `programs`. ~7000 вузов и ~150к программ.

### Дедупликация
Скрипты `scripts/find-duplicate-schools.ts` + `merge-duplicate-schools.ts` со smart-классификатором (FACULTY_KEYWORDS, ultra-normalize, sorted tokens). Слиты 33 группы из 118 кандидатов.

### Обогащение (AI)
Кнопка «Заполнить через AI» на странице школы → `/api/ai/fill-school` → Claude с web_search:
- Описание (description)
- **Фото кампуса** — приоритет: AI → Wikipedia summary → Wikipedia pageimages → Wikipedia search
- **Видео** — приоритет: канал @Goandstudy (whitelist) → школа на YouTube (с blocklist агентств: smaps, idp, applyboard и т.д.)
- **Карта Google** (всегда) — `?q=name+address&output=embed`
- Числовые: `avg_tuition_year_intl`, `tuition_currency`, `avg_living_cost_year`, `avg_application_fee`, `student_count_total`, `international_students_share`, `acceptance_rate`, `top_specialties`, `accreditations` (в `raw_data.curator_extras`)

---

## Стипендии — 3 источника

### 1. Частные (TopUniversities QS)
Таблица `scholarships`. Парсятся из QS Top Universities.

### 2. Государственные
Таблица `scholarships_gov` (по странам, программам типа Chevening/DAAD).

### 3. IDP
Таблица `scholarships_idp` (новинка — добавлены в 2026-04). Кнопка `FillIdpScholarshipButton` для AI-обогащения.

### Привязка к школам
`lib/scholarship-match.ts:matchScholarshipsForSchools()` сопоставляет по **названию школы и стране** (НЕ по ID — так надёжнее когда парсер обновляется).

### Bulk unlock
`/curator/clients/[id]` → таб «Стипендии» → toolbar «Разблокировать все» (доп-услуга). До разблокировки в кабинете клиента вкладка пустая («Если найдутся стипендии под профиль — обязательно предложим»).

---

## Кабинет клиента — детали

### Подборка (shortlist)
- 15 программ от куратора (без хард-лимита, можно меньше/больше)
- Drag-and-drop приоритет 1–15
- Синхронизация с куратором через shared store
- **Заголовок карточки**: программа сверху, школа снизу. Для BD-импортированных программ (где `name=specialty_group`) — наоборот, школа сверху

### Мотивашка
Personal Statement builder под UCAS-шаблон. 8 секций (интерес, мотивация, образование, опыт работы, навыки, достижения, цели, доп). Превью прямо в редакторе. Сохраняется в `client_essays` с `type='motivation'`.

### Резюме
Билдер по образцу resume.io. Секции: контакты, образование, опыт, проекты, навыки, языки, достижения. `client_essays` с `type='resume'`.

### Эссе
Школьные эссе с проверкой куратором. Статусы: draft → submitted → approved → returned. AI-подсказки от Claude. `client_essays` с `type='essay'`.

### Документы
Загрузка/просмотр через Supabase Storage bucket `client-docs`.

### Спотлайт-тур
`OnboardingTour.tsx` — 7 шагов с line-icons (IconHand, IconRoute, IconCap, IconFolder, IconPen, IconChat, IconCheck — в стиле мотивашки/резюме). 4 dim-дива + cutout-border вокруг подсвеченного элемента (использует data-tour атрибуты).

---

## База данных — основные таблицы

| Таблица | Что хранит |
|---|---|
| `users` | пользователи + роль (`admin` / `salesperson` / `rop` / `curator` / `client`) |
| `curators` | кураторы + `user_id` после активации |
| `clients` | клиенты (после конверсии из сделки) |
| `client_invitations` | invite-токены для клиентов (TTL 30д) |
| `curator_invitations` | invite-токены для кураторов |
| `client_shortlists` | подборка программ клиента (с приоритетом) |
| `client_essays` | эссе/мотивашки/резюме (по `type`) |
| `client_documents` | загруженные документы |
| `client_applications` | заявки в вузы |
| `payments` / `payments_view` | график платежей |
| `expenses` / `fixed_expenses` | расходы |
| `invoices` | счета Т-Банка |
| `schedule_slots` / `bookings` | график консультаций + записи |
| `pipeline_stages` | этапы воронки |
| `deals` / `deal_activities` / `deal_messages` / `deal_files` / `deal_tasks` | воронка |
| `sales_plans` | планы продаж |
| `rop_settings` / `rop_actions_log` | РОП |
| `schools` / `programs` | каталог (foreign tables через FDW из GS_apply) |
| `scholarships` / `scholarships_gov` / `scholarships_idp` | стипендии |

---

## Интеграции

| Сервис | Для чего | Env |
|---|---|---|
| **Supabase** | БД + auth | `NEXT_PUBLIC_SUPABASE_URL`, `_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` |
| **Resend** | Транзакционные письма (invite + welcome) | `RESEND_API_KEY`, `RESEND_FROM_ADDRESS` (`GoAndStudy <noreply@goandstudy.com>`) |
| **Wazzup24** | TG/WhatsApp в карточках сделок | (готовится подключение) |
| **Telegram Bot API** | Приём сообщений из групп + уведомления о бронях | `TELEGRAM_BOOKINGS_BOT_TOKEN` |
| **Anthropic Claude** | AI-подсказки + AI-обогащение школ | `ANTHROPIC_API_KEY` |
| **Т-Банк СБП** | Счета + колбэки | `TBANK_*` |
| **GS_apply (Supabase #2)** | Каталог вузов/программ | `GS_APPLY_*` |
| **GoDaddy** | DNS для домена goandstudy.com (Resend Auto-configure) | — |

---

## Стек

- **Next.js 16.2.2** (App Router, Turbopack) + React 19 + TypeScript 5
- **Tailwind CSS 4** + кастомные CSS-переменные (`--purple`, `--green`, `--red`, `--bg`, `--surf`, `--bor`, `--text`, `--muted` в `app/globals.css`)
- Без ORM — прямые запросы к Supabase SDK + RPC
- Без UI-библиотек — все компоненты свои (`.btn-p`, `.btn-s`, sidebar, layout)
- Дизайн-система описана в `DESIGN.md` (Apple-style tech-minimal, sans-serif, белый фон, акцент Apple-blue)

---

## Архитектурный паттерн

1. **Server Components** (`page.tsx`) — фетчат данные из Supabase, передают пропсами
2. **Client Components** (`'use client'`) — таблицы, формы, фильтры, модалки
3. **Server Actions** (`'use server'` в `actions.ts`) — мутации + `revalidatePath()`

### Supabase clients
- `lib/supabase/server.ts` — `createClient()` (user-scoped) и `createAdminClient()` (service role, bypasses RLS)
- `lib/supabase/client.ts` — `createBrowserClient()` для client components

### Auth
`middleware.ts` — гейтинг + редиректы по ролям. Public paths: `/login`, `/book/*`, `/invite/*`, `/api/*`. Корень `/` редиректит по роли.

---

## Известные нюансы / в работе

- **Wazzup**: инфраструктура готова, аккаунт подключим позже
- **Часть кнопок РОПа** (управление перекосом нагрузки и т.д.) — серверная логика есть, UI ещё не доделан
- **Миграция `program_curator_data`** не применена в проде ещё (только `client_essays` и `program_curator_data_full` в untracked)
- **25 клиентов без email** — для них invite-флоу пока недоступен (email требуется)
- **Тестовые данные**: клиент `#50 "Тестовый Клиент — Подборка"` с email `p.khakhalov@gmail.com` — для тестирования invite-флоу

---

## Кому что показывать

- **Менеджеру** — `/sales` (свои клиенты, своя воронка, график, задачи)
- **РОПу** — `/rop` (аналитика по отделу)
- **Бухгалтеру/владельцу** — `/admin` (всё)
- **Куратору** — `/curator` (клиенты + каталог + стипендии)
- **Клиенту** — `/client` (после активации invite)
- **Внешним людям (запись на консультацию)** — `/book` или `/book/[manager]`

---

## Файловая структура (ключевое)

```
app/
  admin/           — кабинет админа
  sales/           — кабинет продажника
  rop/             — кабинет РОПа
  curator/         — кабинет куратора
    clients/[id]/  — детальная клиента (6 табов)
    universities/  — каталог вузов + детальные
    scholarships/  — каталог стипендий (3 источника)
  client/          — кабинет клиента
    shortlist/     — подборка
    documents/     — документы
    essays/        — эссе
    motivation/    — Personal Statement builder
    resume/        — резюме-билдер
    scholarships/  — стипендии (lock/unlock)
    OnboardingTour.tsx — спотлайт-тур
  book/            — публичная запись на консультации
  invite/[token]/         — активация клиента
  invite/curator/[token]/ — активация куратора
  api/             — webhooks, AI-обогащение, slots, etc.
lib/
  supabase/        — clients (server, browser, admin)
  invitation.ts            — invite-флоу клиентов
  curator-invitation.ts    — invite-флоу кураторов
  time.ts                  — MSK helpers
  telegram.ts              — TG-уведомления о бронях
  scholarship-match.ts     — привязка стипендий к школам
supabase/migrations/  — SQL-миграции
scripts/              — служебные TS-скрипты (seed, проверки, дедуп)
```

---

Техническая документация для AI-агентов: `CLAUDE.md`, `AGENTS.md`, `DESIGN.md`.
