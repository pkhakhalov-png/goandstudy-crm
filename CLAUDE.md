# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Commands

- `npm run dev` — start dev server
- `npm run build` — production build
- `npm run lint` — run ESLint

No test runner is configured.

## Architecture

This is a **Go & Study CRM** — a single Next.js 16 app (App Router) for managing clients, payments, expenses, and sales for an educational consultancy. The UI language is Russian.

### Stack

- **Next.js 16.2.2** with React 19, TypeScript 5
- **Supabase** for auth (cookie-based SSR) and PostgreSQL database — no ORM, direct SDK queries and RPC calls
- **Tailwind CSS 4** + custom CSS variables (defined in `app/globals.css`: `--purple`, `--green`, `--red`, `--bg`, `--surf`, `--bor`, `--text`, `--muted`, etc.)
- No component library — custom buttons (`.btn-p`, `.btn-s`), sidebar, and layout classes

### Two-role system

The app has two user roles with separate dashboards:

- **Admin** (`/admin/*`) — full access: dashboard analytics, client management, payments, expenses, sales, settings
- **Salesperson** (`/sales/*`) — limited: own clients list, create new clients

`middleware.ts` handles auth gating and role-based redirects. Root `/` redirects by role.

### Data flow pattern

1. **Server Components** (page.tsx files) fetch data from Supabase and pass as props
2. **Client Components** (`'use client'`) handle interactivity — tables, forms, filters, modals
3. **Server Actions** (`'use server'` in `actions.ts` files) handle all mutations, then call `revalidatePath()`

### Supabase clients

- `lib/supabase/server.ts` — `createClient()` (user-scoped) and `createAdminClient()` (service role key, bypasses RLS)
- `lib/supabase/client.ts` — `createBrowserClient()` for client components

### Key database objects

Tables: `users`, `clients`, `payments`, `expenses`, `fixed_expenses`, `curators`
Views: `payments_view`
RPC: `create_client_with_payments`

Schema is managed in the Supabase dashboard, not in the repo.

### Environment variables

- `NEXT_PUBLIC_SUPABASE_URL` — Supabase project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` — public anon key
- `SUPABASE_SERVICE_ROLE_KEY` — admin key (server-only)
