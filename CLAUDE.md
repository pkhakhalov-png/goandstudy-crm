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

## Design System

Always read `DESIGN.md` before making any visual or UI decisions in `/curator/*`, `/client/*`, or new shared components. All font choices, colors, spacing, and aesthetic direction are defined there. Do not deviate without explicit user approval. Admin and Sales routes keep existing utilitarian styles (out of scope for DESIGN.md v1).

## Skill routing

When the user's request matches an available skill, invoke it via the Skill tool. The
skill has multi-step workflows, checklists, and quality gates that produce better
results than an ad-hoc answer. When in doubt, invoke the skill. A false positive is
cheaper than a false negative.

Key routing rules:
- Product ideas, "is this worth building", brainstorming → invoke /office-hours
- Strategy, scope, "think bigger", "what should we build" → invoke /plan-ceo-review
- Architecture, "does this design make sense" → invoke /plan-eng-review
- Design system, brand, "how should this look" → invoke /design-consultation
- Design review of a plan → invoke /plan-design-review
- Developer experience of a plan → invoke /plan-devex-review
- "Review everything", full review pipeline → invoke /autoplan
- Bugs, errors, "why is this broken", "wtf", "this doesn't work" → invoke /investigate
- Test the site, find bugs, "does this work" → invoke /qa (or /qa-only for report only)
- Code review, check the diff, "look at my changes" → invoke /review
- Visual polish, design audit, "this looks off" → invoke /design-review
- Developer experience audit, try onboarding → invoke /devex-review
- Ship, deploy, create a PR, "send it" → invoke /ship
- Merge + deploy + verify → invoke /land-and-deploy
- Configure deployment → invoke /setup-deploy
- Post-deploy monitoring → invoke /canary
- Update docs after shipping → invoke /document-release
- Weekly retro, "how'd we do" → invoke /retro
- Second opinion, codex review → invoke /codex
- Safety mode, careful mode, lock it down → invoke /careful or /guard
- Restrict edits to a directory → invoke /freeze or /unfreeze
- Upgrade gstack → invoke /gstack-upgrade
- Save progress, "save my work" → invoke /context-save
- Resume, restore, "where was I" → invoke /context-restore
- Security audit, OWASP, "is this secure" → invoke /cso
- Make a PDF, document, publication → invoke /make-pdf
- Launch real browser for QA → invoke /open-gstack-browser
- Import cookies for authenticated testing → invoke /setup-browser-cookies
- Performance regression, page speed, benchmarks → invoke /benchmark
- Review what gstack has learned → invoke /learn
- Tune question sensitivity → invoke /plan-tune
- Code quality dashboard → invoke /health
