# Go & Study CRM — описание системы для модуля отчётности

> Справочник по структуре данных, ролям, деньгам, истории и техническому стеку —
> основа для проектирования модуля отчётности и статистики.
> Составлено из миграций (`supabase/migrations/*.sql`), кода дашбордов и данных прода.

**Стек (кратко):** Next.js 16 (App Router, React 19, TS) + Supabase (Postgres, без ORM —
прямые SDK-запросы и RPC). Аналитика сейчас считается **в JavaScript** на серверном
рендере страниц, без аналитического слоя в SQL и без чарт-библиотек (графики — самописный
SVG/CSS). Один вью — `payments_view`. Язык интерфейса — русский.

---

## 1. Структура данных

### Две параллельные сущности верхнего уровня

Важнейший факт для отчётности: **«лид/сделка» и «клиент» — это разные таблицы**,
связанные при конверсии.

- **`deals`** — воронка продаж (лид = сделка на ранней стадии; та же строка двигается по стадиям). PK — UUID.
- **`clients`** — оплативший клиент, которого ведёт куратор. PK — `SERIAL` (integer).
- Связь: `deals.client_id → clients.id` (заполняется при переходе сделки в стадию
  Договор/Первичная продажа/Оплата — тогда автоматически создаётся клиент через RPC
  `create_client_with_payments`).

### `deals` (ключевые поля)

```
id UUID, title, stage_id → pipeline_stages,
salesperson_id → users, client_id → clients (nullable),
contact_name/phone/email/telegram/whatsapp, phone_normalized,
budget NUMERIC, currency (RUB), source (default 'manual'),
booking_id → bookings, custom_fields JSONB, lost_reason,
is_critical BOOL, deleted_at (soft-delete),
created_at, updated_at, closed_at
```

**У сделки НЕТ поля `status`** — статус определяется стадией:
`pipeline_stages.stage_type ∈ (active | success | lost | paused)`.

**Источники (`deals.source`):** `manual`, `booking`, `website`, `telegram`, `telegram_group_bot`.
Доп. каналы — в `custom_fields` (group_chat_id, tg_chat_id, wazzup_chat_id, is_group).

### `pipeline_stages` (стадии воронки, seeded)

`id, name, color, position, stage_type, weight, value, is_active`. Дефолтные стадии:

| # | Стадия | stage_type |
|---|---|---|
| 0 | Новые заявки | active |
| 1 | Контакт | active |
| 2 | Выявление потребности | active |
| 3 | Презентация/Консультация | active |
| 4 | Возражения | active |
| 5 | Договор | active *(→ конверсия в клиента)* |
| 6 | Первичная продажа | success *(→ конверсия)* |
| 7 | Оплата услуг | success *(→ конверсия)* |
| 8 | Догрев | paused |
| 9 | Не пришёл на консультацию | lost |
| 10 | На будущее | paused |
| 11 | НЕ ЦЕЛЕВЫЕ | lost |

`weight` — вес для взвешенного пайплайна, `value` — фиксированная ценность стадии.

### `clients` (ключевые поля)

```
id SERIAL, name/first_name/last_name, phone/phone_normalized, email, telegram,
country, university, months INT, first_payment_date DATE,
status ∈ (active | completed | refunded),
salesperson_id → users, curator_id → curators,
service_type ∈ (full | session), commission_per_payment BOOL,
current_stage_code, curator_assigned_at, workflow_started_at, workflow_completed_at,
roadmap_approved_at, onboarded BOOL, tg_group_chat_id/title,
created_at
```

Сумма договора **не хранится** на клиенте — она разбита по платежам:
план = `SUM(payments.plan_sum)`, факт = `SUM(fact_sum WHERE is_paid)`.

### Платежи — рассрочка, частичные, возвраты

**`payments`** (одна строка = один плановый транш рассрочки):

```
id SERIAL, client_id, num INT (номер транша),
plan_date, plan_sum,        -- план
fact_date, fact_sum,        -- факт (может отличаться от плана)
is_paid BOOL, comment, updated_by, updated_at, created_at
```

- **Рассрочка:** RPC делит сумму договора поровну на `months` и создаёт N строк.
- **Частичные оплаты:** через расхождение `fact_sum` ≠ `plan_sum` + ручную корректировку `plan_sum` по будущим траншам.
- **Возвраты:** отдельной колонки нет — вставляется зеркальная строка с **отрицательной суммой**
  (`num=-1`, `plan_sum/fact_sum` отрицательные, comment «Возврат к платежу №…»),
  статус клиента → `refunded`.
- **Статусы платежа** (вычисляются в `payments_view`, не хранятся):
  `paid` / `overdue` (`plan_date < today` и не оплачен) / `soon`.

### Продукты/курсы

Отдельной таблицы «продуктов» нет. Тип продукта = `clients.service_type`
(`full` — полное сопровождение / `session` — экспертная сессия). «Университеты/программы»
ведутся на этапе куратора (`client_universities`, `client_applications`, `client_shortlists`)
и в отдельном каталоге школ (parser-база).

---

## 2. Роли и люди

### Роли

- **`users.role`** ∈ `admin | salesperson | rop | curator` (клиент — **не** user; клиенты входят по invite-ссылкам).
- **Продажник** — `users` с `role='salesperson'`.
- **Куратор** — **отдельная таблица `curators`** (не то же, что users!):
  `id, name, is_active, user_id → users (nullable, unique), specializations[], languages[], max_clients, telegram_*`.
  То есть куратор в `users` (для входа) может иметь расширенный профиль в `curators`.

### Привязка

- Клиент → продажник: `clients.salesperson_id → users.id`.
- Клиент → куратор: `clients.curator_id → curators.id`.
- Сделка → продажник: `deals.salesperson_id → users.id`.
- **Атрибуция продажи = «кто владеет сделкой»** (`salesperson_id`), а не отдельно
  «кто создал / кто закрыл». `closed_at` фиксирует момент закрытия, но отдельного «closer» нет.

### История смены куратора — ⚠️ НЕ хранится

При переназначении куратора старый `curator_id` **перезаписывается без истории**.
Единственные следы — `curator_assigned_at` (только последнее назначение) и записи в
`client_activities`. `program_curator_data_history` — это история правок **каталога программ**,
не привязки клиент↔куратор. **Для отчётности по «переходам между кураторами» данных сейчас нет** —
понадобится триггер/таблица истории.

---

## 3. Деньги

### Два независимых денежных потока

1. **Рассрочка (`payments`)** — плановые транши. Оплата отмечается **вручную**
   (`is_paid` toggle в админке/кабинете продажника). Никакой авто-синхронизации с эквайрингом.
2. **Счета (`invoices`)** — разовые счета через эквайринг **Тинькофф / T-Bank (СБП)**:
   `amount, description, order_id, payment_id (T-Bank), payment_url, sbp_payload,
   status (NEW/CONFIRMED/…), client_id`. Статус обновляется вебхуком `POST /api/tbank-notify`
   (с проверкой SHA256-токена).

> ⚠️ **Эти потоки НЕ связаны:** оплата счёта T-Bank не отмечает автоматически транш рассрочки
> как оплаченный. Онлайн-эквайринг покрывает только `invoices`.

### Плановые платежи с датами

Да — вся суть `payments`: `plan_date` + `plan_sum` по каждому траншу. План/факт хранятся
раздельно (`plan_*` vs `fact_*`) и в payments, и в expenses.

### Момент фиксации оплаты

- Рассрочка: когда менеджер жмёт «оплачено» → `is_paid=true, fact_date, fact_sum`.
  Это триггерит `sync_sales_commission`.
- Счёт: когда T-Bank присылает `CONFIRMED` в вебхук.

### Расходы и комиссии (`expenses`)

```
id UUID, client_id, article (curator|salesperson|office|…), who (имя получателя),
plan_date/plan_sum, fact_date/fact_sum, is_paid, status (pending|paid),
payment_id → payments (для покомиссионных), note
```

- **Куратору:** `full` → 2×25 000 ₽, `session` → 1×7 500 ₽ (создаётся RPC).
- **Продажнику 10%:** рассрочка ≤3 мес → 10% разово при создании; ≥4 мес → флаг
  `commission_per_payment=true`, и триггер `sync_sales_commission` начисляет 10% с
  **каждого фактически пришедшего** платежа (строка расхода с `payment_id`).
- **`fixed_expenses` / `fixed_expense_records`** — постоянные расходы
  (офис/зарплаты/софт/маркетинг) по месяцам (`monthly/quarterly/yearly/once`).

---

## 4. История и даты

### Timestamps по жизненному циклу

- **Сделка:** `created_at` (лид зашёл), `updated_at` (любое изменение), `closed_at`, `deleted_at`.
  Переходы стадий — в `deal_activities` (`activity_type='stage_change'`, metadata `{from_stage,to_stage}`).
- **Клиент:** `created_at`, `curator_assigned_at`, `workflow_started_at`, `workflow_completed_at`,
  `roadmap_approved_at`, `first_payment_date`.
- **Этапы куратора:** `client_stages.started_at / completed_at / completed_by`
  (12 стадий `curator_stages`), чек-листы `client_checklist_progress.done_at/done_by`.
- **Заявки в вузы:** `client_applications` — `submitted_at, decision_at, fee_paid_at, app_deadline`,
  стадии `created→docs_collected→fee_paid→submitted→decision`, решения `offer/rejected/…`.
- **Оплаты/расходы:** `plan_date`, `fact_date`.

### Логи активности менеджеров и кураторов

- **`deal_activities`** — заметки, смены стадий, сообщения, задачи, файлы. **~19 450 строк**
  (самый богатый источник событий воронки).
- **`deal_messages`** — переписка (telegram/whatsapp через Wazzup, `direction` incoming/outgoing) —
  основа для метрик времени ответа/SLA.
- **`deal_tasks`** — задачи (`deadline, is_done, completed_at, assigned_to, task_type`).
- **`rop_actions_log`** — аудит действий РОПа (set_plan, reassign, mark_critical…).
- **`client_activities`** (~262) — активности на стороне куратора.
  **`client_tg_messages/files`** — переписка с клиентом.
- **`bookings`** — записи на консультации/экспертные сессии
  (`status`: confirmed/completed/cancelled/no_show) → источник лидов.

---

## 5. Техническое

### Стек

Backend/Frontend — единое Next.js 16 приложение (Server Components + Server Actions),
БД — Supabase Postgres (RLS: авторизованным — read/write; сервисный ключ обходит RLS).
Интеграции: **T-Bank** (эквайринг), **Wazzup** (Telegram/WhatsApp), Telegram-бот, AI-роуты.

### Что уже считается (существующие дашборды)

Уже построено **~12 регионов отчётности**, всё агрегируется в JS:

- **`/admin`** — дебиторка (неоплаченные платежи + просрочка), кредиторка (расходы по статьям),
  выручка помесячно (план/факт/расходы/прибыль), выплаты кураторам и продажникам.
- **`/admin/sales`** — по продажникам/месяцам: новые договоры, сборы факт, % выполнения плана
  (план 900k захардкожен), просрочка, конверсия по bookings.
- **`/admin/expenses`** — расходы по статьям/месяцам (вкладка «Кураторы»).
- **`/rop`** (руководитель продаж) — факт vs план отдела, прогноз (факт + взвешенный пайплайн),
  лидерборд (продажи 40% / конверсия 25% / SLA 20% / задачи 15%), критические/зависшие сделки.
- **`/rop/analytics`** — причины потерь, на какой стадии теряем, потери по менеджерам, анализ источников лидов.
- **`/rop/conversions`** — воронка стадия→стадия с dropoff, конверсия по менеджерам, эвристики проблем.
- **`/rop/response-times`** — среднее время ответа, нарушения SLA.
- **`/rop/stuck`** — зависшие сделки + баланс нагрузки.
- **`/rop/pipeline`** — стоимость пайплайна (взвешенная) по стадиям/менеджерам.
- **`/rop/history`** — аудит действий РОПа.
- **`/sales`** — личный кабинет продажника: KPI, статусы платежей, ЗП помесячно, лидерборд отдела.
  **`/sales/calendar`** — календарь платежей.

### Объём данных (прод, на 2026-08-05)

| Таблица | Всего | ~в месяц |
|---|---|---|
| deals | 782 | ~150–200 |
| clients | 57 | ~7–12 |
| payments | 154 | ~30–45 |
| expenses | 132 | — |
| invoices | 20 | — |
| deal_activities | ~19 450 | (богатый лог событий) |
| client_activities | 262 | — |
| curators | 9 | — |
| users | 28 | — |

Данные **маленькие** — любой отчёт можно строить прямыми запросами/вью без OLAP;
узкое место скорее `deal_activities` (~19k) для метрик воронки.

---

## Что важно учесть при проектировании модуля (пробелы)

1. **Нет исторических снимков** — все метрики point-in-time; для трендов/когорт нужны
   снапшоты или реконструкция из `*_activities`.
2. **Нет истории смены куратора** (и вообще смены `salesperson_id`/`curator_id`) — если нужна
   атрибуция во времени, добавить триггер-лог.
3. **Два несвязанных денежных потока** (рассрочка vs T-Bank-счета) — при отчёте «сколько
   реально получили денег» их надо консолидировать вручную.
4. **Статус сделки — только через join** `pipeline_stages.stage_type`; «lost_reason» и «на какой
   стадии потеряли» — из `deal_activities`.
5. **Возвраты — отрицательные строки** в `payments`: агрегаты `SUM` их учтут, но `COUNT платежей`
   исказят; фильтруй `num >= 0` где нужно.
6. **Нет аналитического слоя** — если отчётов станет много, разумно вынести агрегации в
   SQL-вью/материализованные вью/RPC, а не считать в JS на каждой странице.
7. **План отдела 900k захардкожен** в `/admin/sales`, тогда как в `/rop` планы берутся из таблицы
   `sales_plans` — источник плана надо унифицировать.
