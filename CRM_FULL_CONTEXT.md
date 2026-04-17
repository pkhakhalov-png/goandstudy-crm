# Go & Study CRM — Full Project Context

## Overview
**Go & Study CRM** — Next.js 16.2.2 (App Router) + React 19 + TypeScript 5 + Supabase (PostgreSQL + Auth SSR). Educational consultancy CRM. UI language: Russian.

**Live**: https://goandstudy-crm.vercel.app (Vercel, auto-deploy from `main`)
**Supabase**: https://pxtwaxhmygnssyyowrgr.supabase.co
**Repo**: https://github.com/pkhakhalov-png/goandstudy-crm

## Three Roles
- **Admin** (`/admin/*`) — full access: clients, payments, expenses, funnel, settings
- **Salesperson** (`/sales/*`) — own clients, create clients, view funnel
- **ROP** (`/rop/*`) — sales manager: analytics, plans, leaderboard, SLA, pipeline

## Stack
- Supabase for auth (cookie-based SSR) + PostgreSQL — no ORM, direct SDK
- Tailwind CSS 4 + CSS vars (`--purple`, `--green`, `--red`, `--gold`, `--bg`, `--surf`, `--bor`, `--text`, `--muted`)
- Wazzup24 API for TG/WhatsApp messaging
- Telegram Bot API for group chat reception
- Anthropic Claude for AI sales suggestions
- T-Bank for SBP payments

## Data Flow Pattern
1. **Server Components** (page.tsx) fetch from Supabase → pass as props
2. **Client Components** ('use client') handle interactivity
3. **Server Actions** ('use server') handle mutations → `revalidatePath()`

## Supabase Clients
- `lib/supabase/server.ts` → `createClient()` (user-scoped, cookies) + `createAdminClient()` (service role, bypasses RLS)
- `lib/supabase/client.ts` → `createBrowserClient()` for client components

---

## Database Schema (19 tables)

### users
id UUID PK, name TEXT, email TEXT, role TEXT CHECK('admin','salesperson','rop'), is_active BOOL, round_robin_count INT, created_at

### curators
id UUID PK, name TEXT, contact TEXT, is_active BOOL

### clients
id SERIAL PK (integer), name TEXT, phone TEXT, phone_normalized TEXT, email, telegram, country, university, months INT, first_payment_date DATE, status CHECK('active','completed'), notes, salesperson_id UUID FK→users, curator_id UUID FK→curators, created_at

### payments
id SERIAL PK, client_id INT FK→clients, num INT, plan_date DATE, plan_sum NUMERIC, fact_date DATE, fact_sum NUMERIC, is_paid BOOL, comment TEXT, updated_by UUID, created_at
View: payments_view adds computed status ('paid'|'overdue'|'soon')

### expenses
id UUID PK, client_id INT FK→clients, article TEXT(curator|salesperson|visa|docs|other), who TEXT, plan_date DATE, plan_sum NUMERIC, fact_date, fact_sum, is_paid BOOL, status CHECK('pending','paid'), note TEXT

### fixed_expenses + fixed_expense_records
Templates for recurring expenses (office, salary, software, marketing)

### invoices
id UUID PK, client_id INT, amount NUMERIC, description, order_id TEXT UNIQUE, payment_id, payment_url, sbp_payload, status TEXT, created_by UUID

### schedule_slots + bookings
Salesperson availability + client appointment booking with round-robin

### pipeline_stages
id UUID PK, name TEXT, color TEXT, position INT, stage_type CHECK('active','success','lost','paused'), weight NUMERIC(0-1), is_active BOOL
Default stages: Новые заявки, Контакт, Выявление потребности, Презентация/Консультация, Возражения, Договор, Первичная продажа, Оплата услуг, Догрев, Не пришёл на консультацию, На будущее, Релокац

### deals
id UUID PK, title TEXT, stage_id UUID FK→pipeline_stages, salesperson_id UUID FK→users, contact_name/phone/email/telegram/whatsapp, budget NUMERIC, currency TEXT, source TEXT(manual|telegram_bot|telegram_group_bot|whatsapp|booking), booking_id UUID, client_id INT, custom_fields JSONB(is_group, group_chat_id, tg_chat_id, wazzup_chat_id), lost_reason TEXT, is_critical BOOL, deleted_at TIMESTAMPTZ(soft delete), created_at, updated_at, closed_at

### deal_activities
id UUID PK, deal_id UUID FK, user_id UUID FK, activity_type TEXT(note|stage_change|system|message), content TEXT, metadata JSONB, created_at

### deal_files
id UUID PK, deal_id UUID FK, name TEXT, url TEXT, size INT, mime_type TEXT, source TEXT(upload|wazzup|telegram|whatsapp)

### deal_messages
id UUID PK, deal_id UUID FK, direction TEXT(incoming|outgoing), channel TEXT(telegram|whatsapp), sender_name TEXT, content TEXT, file_id UUID FK→deal_files, external_id TEXT, metadata JSONB(tgChatId, chatId, etc.), created_at

### deal_tasks
id UUID PK, deal_id UUID FK, title TEXT, deadline TIMESTAMPTZ, is_done BOOL, assigned_to UUID FK→users, task_type TEXT(manual|rop_action), created_at, completed_at

### sales_plans (ROP)
id UUID PK, month TEXT('2026-04'), salesperson_id UUID FK→users (NULL=department), plan_amount NUMERIC, UNIQUE(month, salesperson_id)

### rop_settings (ROP)
id UUID PK, key TEXT UNIQUE, value JSONB
Keys: sla_response_minutes(30), stuck_deal_days(5), low_conversion_threshold(0.7), pipeline_weights, score_weights, watched_salespersons

### rop_actions_log (ROP audit)
id UUID PK, rop_id UUID FK→users, action_type TEXT(reassign|create_task|mark_critical|watch|set_plan|update_setting), deal_id UUID, salesperson_id UUID, metadata JSONB, created_at

---

## Page Routes (32 pages)

### Public
- `/login` — email/password login
- `/book` — public booking form
- `/book/cancel` — cancel booking

### Admin (/admin/*)
- `/admin` — dashboard (KPIs, revenue, debtors)
- `/admin/clients` — clients list + drawer (info, payments, expenses)
- `/admin/clients/new` — create client form
- `/admin/payments` — all payments table
- `/admin/expenses` — expenses CRUD
- `/admin/invoices` — T-Bank invoices
- `/admin/funnel` — kanban board
- `/admin/funnel/[id]` — deal detail card (chat, files, tasks, activities)
- `/admin/funnel/trash` — deleted deals
- `/admin/sales` — sales analytics by salesperson
- `/admin/settings` — app settings
- `/admin/calendar` — bookings calendar

### Salesperson (/sales/*)
- `/sales` — own clients + department leaderboard
- `/sales/new` — create client
- `/sales/funnel` — own deals kanban (read-only)
- `/sales/funnel/[id]` — view deal
- `/sales/schedule` — manage availability
- `/sales/invoices` — view invoices

### ROP (/rop/*)
- `/rop` — main: fact/plan/forecast, critical panel, leaderboard+score, recommendations
- `/rop/conversions` — funnel drop-off, per-manager conversion, AI problem detection
- `/rop/response-times` — avg response time, unreplied deals, SLA
- `/rop/pipeline` — budget × stage weight, by stage and manager
- `/rop/stuck` — stuck deals + manager workload balance
- `/rop/analytics` — lost reasons, deal sources, best source
- `/rop/tasks` — overdue tasks by manager
- `/rop/deals` — drill-down deals list with filters
- `/rop/settings` — SLA, thresholds, weights config
- `/rop/history` — ROP actions audit log

---

## API Routes
- `POST /api/wazzup/webhook` — Wazzup messages → create/update deals
- `POST /api/telegram/webhook` — Telegram bot → create deals from groups
- `POST /api/ai/suggest` — Claude AI sales reply suggestion
- `POST /api/book/create` — Create booking + deal
- `GET /api/book/slots` — Available booking slots
- `POST /api/tbank-notify` — T-Bank payment callback
- `GET /api/debug/wazzup-channels` — Debug: list Wazzup channels

---

## Key Server Actions

### admin/funnel/actions.ts (main)
moveDeal, createDeal, addDealNote, updateDeal, softDeleteDeal, restoreDeal, sendDealMessage, sendDealFile, suggestReply, createDealTask, toggleDealTask, linkDealToClient, findDuplicates, mergeDeals, loadMoreDeals

### admin/clients/actions.ts
updatePaymentSum (keeps total, redistributes others), updateClientTotal (redistributes unpaid), assignCurator

### rop/actions.ts
upsertSalesPlan, reassignDeal, createRopTask, markCritical, watchSalesperson, updateRopSetting, updateStageWeight

---

## Lib Files
- `lib/supabase/server.ts` — createClient + createAdminClient
- `lib/supabase/client.ts` — createBrowserClient
- `lib/ai.ts` — Claude integration (suggestSalesReply)
- `lib/wazzup.ts` — sendWazzupMessage, getWazzupChannels, getTgapiChannelId
- `lib/telegram.ts` — sendTelegramMessage, downloadTelegramFile, buildSenderName
- `lib/tbank.ts` — T-Bank SBP init/QR/status/verify
- `lib/phone.ts` — normalizePhone, phonesMatch

---

## Middleware Logic
1. Public routes bypass: /login, /book/*, /api/wazzup/*, /api/telegram/*, /api/tbank*, /api/debug/*
2. Unauthenticated → redirect /login
3. Authenticated on /login → redirect by role: admin→/admin, rop→/rop, else→/sales
4. ROP users blocked from /sales/* pages (redirect to /rop)

---

## Environment Variables
NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, ANTHROPIC_API_KEY, WAZZUP_API_KEY, WAZZUP_TGAPI_CHANNEL_ID, TELEGRAM_BOT_TOKEN, TBANK_TERMINAL_KEY, TBANK_PASSWORD

---

## ROP Dashboard — What's Done vs TODO

### DONE (deployed):
- All 10 pages created and functional
- SQL migration applied (role, tables, columns)
- Fact/plan/leaderboard working with real data
- Critical panel (unreplied deals)
- Department plan = auto-sum of individual plans
- Score calculation (sales + conversion + SLA + tasks)
- Forecast (fact + weighted pipeline)
- AI problem detection in conversions
- Recommendations engine
- Settings page (SLA, thresholds, weights)
- History (audit log)
- Leaderboard visible to salespersons in /sales

### TODO:
- Action buttons on tables (передать, задача, критично) — server actions ready, UI buttons not wired
- Global filters (RopFilters component exists, not placed on all pages)
- Drill-down links (click metric → /rop/deals?filter=...)
- Remove debug endpoint /api/debug/wazzup-channels
- Rotate leaked Telegram bot token

---

## Key Patterns
- Props use `any[]` throughout (no strict typing)
- No component library — all custom inline styles
- Button classes: `.btn-p` (primary purple), `.btn-s` (secondary)
- Card style: `{ background: 'var(--surf)', border: '1px solid var(--bor2)', borderRadius: 14, padding: '16px 20px' }`
- Section title: `{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--muted)' }`
- Number formatting: `Math.round(n).toLocaleString('ru')`
- RLS enabled on most tables with USING(true) for authenticated; ROP pages use createAdminClient to bypass
