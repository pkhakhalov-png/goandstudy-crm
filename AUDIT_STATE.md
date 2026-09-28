# AUDIT_STATE.md — состояние репозитория goandstudy-crm

Дата снятия: 28.09.2026. Ветка: `main` (коммит `8cc16ac`).
Режим: только чтение. Ничего не менялось, миграции не применялись, команды записи не запускались, `.env*` не читались (кроме `.env.example`, он в репозитории).

---

## 1. Общая структура

### Фреймворк и версии

Источник: `package.json`, `package-lock.json`.

| Что | Версия |
|---|---|
| Next.js | `16.2.2` (App Router) |
| React / React DOM | `19.2.4` |
| TypeScript | `^5` |
| Tailwind CSS | `^4` (+ `@tailwindcss/postcss`) |
| Supabase | `@supabase/supabase-js ^2.102.0`, `@supabase/ssr ^0.10.0` |
| LLM SDK | `@anthropic-ai/sdk ^0.88.0` |
| Прочее | `recharts ^3.10.1`, `node-html-parser`, `opentype.js`, `wawoff2` |
| Dev | `eslint ^9`, `eslint-config-next 16.2.2`, `dotenv ^17.4.2` |

Менеджер пакетов: **npm** (есть `package-lock.json`, 258 КБ; файлов `yarn.lock` / `pnpm-lock.yaml` не найдено).

Скрипты (`package.json`): `dev`, `build`, `start`, `lint`. Тестового раннера нет.

### Структура `app/` — все маршруты

Всего 8 корневых контуров: `/admin`, `/sales`, `/rop`, `/curator`, `/client`, `/demo`, `/book`, `/invite` + `/login`, `/` и `/api`.

#### `/curator/*` (кабинет куратора, действующая версия)

| Маршрут | Файл |
|---|---|
| `/curator` | `app/curator/page.tsx` |
| layout (роль + `ds.css`) | `app/curator/layout.tsx` |
| `/curator/clients` | `app/curator/clients/page.tsx` |
| `/curator/clients/[id]` | `app/curator/clients/[id]/page.tsx` + `actions.ts` |
| `/curator/clients/[id]/motivation` | `app/curator/clients/[id]/motivation/page.tsx` |
| `/curator/clients/[id]/resume` | `app/curator/clients/[id]/resume/page.tsx` |
| `/curator/applications` | `app/curator/applications/page.tsx` + `actions.ts` |
| `/curator/applications/[slug]` | `app/curator/applications/[slug]/page.tsx` |
| `/curator/universities` | `app/curator/universities/page.tsx` |
| `/curator/universities/[schoolId]` | `app/curator/universities/[schoolId]/page.tsx` |
| `/curator/programs/[programId]` | `app/curator/programs/[programId]/page.tsx` |
| `/curator/scholarships` | `app/curator/scholarships/page.tsx` + `actions.ts` |
| `/curator/scholarships/[scholarshipId]` | `app/curator/scholarships/[scholarshipId]/page.tsx` |
| `/curator/scholarships/idp/[id]` | `app/curator/scholarships/idp/[id]/page.tsx` |
| `/curator/shortlist` | `app/curator/shortlist/actions.ts` (только серверные действия, страницы нет) |
| `/curator/templates` | `app/curator/templates/page.tsx` |
| `/curator/resources` | `app/curator/resources/page.tsx` |
| `/curator/guide` | `app/curator/guide/page.tsx` |
| `/curator/profile` | `app/curator/profile/page.tsx` |
| дизайн-токены | `app/curator/ds.css` |

#### Кабинет клиента — называется `/client/*`

| Маршрут | Файл |
|---|---|
| layout (импортирует `../curator/ds.css`) | `app/client/layout.tsx` |
| `/client` | `app/client/page.tsx`, `app/client/onboarding-actions.ts` |
| `/client/applications/[id]` | `app/client/applications/[id]/page.tsx`, `ApplicationView.tsx` |
| `/client/applications/[id]/wizard` | `page.tsx`, `actions.ts`, `WizardView.tsx`, `auto-link-helper.ts` |
| `/client/documents` | `page.tsx` + `actions.ts` |
| `/client/essays` | `actions.ts` (страницы нет) |
| `/client/motivation` и `/client/motivation/print` | `page.tsx` ×2 |
| `/client/resume` и `/client/resume/print` | `page.tsx` ×2, `ResumeEditor.tsx` |
| `/client/scholarships` | `page.tsx` |
| `/client/shortlist` | `page.tsx` + `actions.ts` |
| `/client/updates` | `page.tsx` |

Отдельно: `/demo/*` — публичная витрина того же кабинета клиента (`app/demo/…`: `documents`, `essays`, `motivation`, `resume`, `scholarships`, `shortlist`, `universities/[key]`, `updates`). Публичный, не требует входа (см. `middleware.ts`).

#### `/admin/*`

`app/admin/layout.tsx`, `app/admin/page.tsx` (дашборд) и разделы:
`analytics` (+ `components/`, `lib/`, `tabs/`), `calendar`, `clients` (+ `new`), `content` (+ `attention`, `calendar`, `channels[/id]`, `connections`, `export`, `packages`, `publications[/id]`, `reviews`, `vk`, свой `layout.tsx`), `curators` (+ `[id]`, `new`), `expenses`, `finance` (+ `setup`), `funnel` (+ `[id]`, `trash`), `invoices`, `payments`, `sales`, `seo` (+ `articles[/id]`, `clusters`, `effect`, `experiments`, `experts`, `findings`, `indexation`, `opportunities`, `pages`, `pipeline`, `positions`, `result`, `schema`, `topics`, свой `layout.tsx`), `settings`.

#### `/sales/*`

`app/sales/layout.tsx`, `page.tsx`, `actions.ts` и: `calendar`, `funnel` (+ `[id]`), `invoices`, `new` (+ `success`, `actions.ts`), `schedule` (+ `actions.ts`).

#### `/rop/*` (роль РОП, в CLAUDE.md не описана)

`app/rop/layout.tsx`, `page.tsx`, `actions.ts` и: `analytics`, `conversions`, `deals`, `funnel` (+ `[id]`), `history`, `hot`, `pipeline`, `response-times`, `settings`, `stuck`, `tasks`.

#### Публичные

`app/login`, `app/book` (+ `[manager]`, `cancel`), `app/invite/[token]`, `app/invite/curator/[token]`, `app/demo/*`, `app/page.tsx` (редирект по роли).

### Server Actions

Лежат двумя способами:

1. Рядом с маршрутом — файлы `actions.ts`: `app/admin/clients/actions.ts`, `app/admin/clients/new/actions.ts`, `app/admin/content/actions.ts`, `app/admin/content/connections/actions.ts`, `app/admin/content/export/actions.ts`, `app/admin/curators/actions.ts`, `app/admin/expenses/actions.ts`, `app/admin/finance/actions.ts`, `app/admin/funnel/actions.ts`, `app/admin/funnel/[id]/fileActions.ts`, `app/admin/invoices/actions.ts`, `app/admin/payments/actions.ts`, `app/admin/seo/actions.ts`, `app/admin/seo/articles/actions.ts`, `app/admin/seo/indexation/actions.ts`, `app/admin/seo/opportunities/actions.ts`, `app/admin/seo/schema/actions.ts`, `app/admin/seo/topics/actions.ts`, `app/admin/settings/actions.ts`, `app/book/actions.ts`, `app/book/cancel/actions.ts`, `app/client/applications/[id]/wizard/actions.ts`, `app/client/documents/actions.ts`, `app/client/essays/actions.ts`, `app/client/onboarding-actions.ts`, `app/client/shortlist/actions.ts`, `app/curator/applications/actions.ts`, `app/curator/clients/[id]/actions.ts`, `app/curator/scholarships/actions.ts`, `app/curator/shortlist/actions.ts`, `app/demo/essays/actions.ts`, `app/invite/[token]/actions.ts`, `app/invite/curator/[token]/actions.ts`, `app/login/actions.ts`, `app/rop/actions.ts`, `app/sales/actions.ts`, `app/sales/new/actions.ts`, `app/sales/schedule/actions.ts`.
2. В `lib/` — общие: `lib/roadmap-actions.ts`, `lib/student-project-actions.ts`, `lib/curator-edit-actions.ts`.

### API routes (`app/api/*`)

`ai/fill-idp-scholarship`, `ai/fill-program`, `ai/fill-school`, `ai/suggest`, `ai/verify-scholarship`, `backup/export`, `book/create`, `book/lead`, `book/slots`, `content/reach`, `content/webhook/[platform]`, `debug/parser`, `debug/scholarships`, `debug/wazzup-channels`, `finance/telegram`, `seo/publish/next`, `seo/publish/result`, `seo/tick`, `tbank-notify`, `telegram/webhook`, `track`, `wazzup/webhook`, `zoom/webhook`.

### Middleware, авторизация, роли

`middleware.ts` (корень). Матчер — всё, кроме статики и картинок.

- Клиент Supabase через `@supabase/ssr` на cookie, `supabase.auth.getUser()`.
- Публичные пути (без сессии): `/login`, `/demo/*`, `/book*`, `/invite*`, `/api/book`, `/api/wazzup`, `/api/telegram`, `/api/zoom`, `/api/finance/telegram`, `/api/backup`, `/api/tbank`, `/api/debug`, `/api/seo`, `/api/track`. Каждый из вебхуков проверяет подлинность внутри себя.
- Не авторизован + не публичный путь → редирект на `/login`.
- Авторизован на `/login` → редирект по роли: `admin` → `/admin`, `rop` → `/rop`, `curator` → `/curator`, `client` → `/client`, иначе → `/sales`.
- Ограничения: `curator` не пускается в `/admin`, `/sales`, `/rop`. `client` пускается только в свой `/client` плюс read-only детали `/curator/universities/[id]`, `/curator/programs/[id]`, `/curator/scholarships/[id]`.

**Список ролей** — из БД (`supabase/migrations/20260425000000_client_role.sql`, констрейнт `users_role_check`):
`admin`, `salesperson`, `rop`, `curator`, `client`.
История: изначально `admin | salesperson` (`20260410000000_init.sql`), потом `+rop` (`20260416000000_rop_role.sql`), потом `+curator, +client` (`20260425000000_client_role.sql`).

Частота проверок в коде (`role === '…'`): `admin` 64, `rop` 43, `curator` 30, `client` 30. Роль `salesperson` проверяется «от обратного» (всё, что не другая роль).

Где проверяется, кроме middleware:
- `lib/auth/viewer.ts` — общая функция `viewer()` (обёрнута в React `cache`), возвращает `{ user, profile:{name, role} }`; используется layout'ами и страницами.
- Внутри отдельных Server Actions — своя проверка. Образец: `lib/roadmap-actions.ts:13` `CURATOR_ROLES = new Set(['curator','admin','rop'])` и `checkAccess()`, которая дополнительно проверяет привязку куратора к клиенту и совпадение e-mail для роли `client`.

---

## 2. База данных

### Миграции Supabase

Каталог `supabase/migrations/`. Всего 104 файла. Датировка — по префиксу имени.

**Апрель 2026 (ядро CRM):** `20260410000000_init`, `20260410000001_fix_schema`, `20260410000002_sync_sequences`, `20260410000003_invoices`, `20260411000000_booking`, `20260411000001_funnel`, `20260411000002_files_messages`, `20260411000003_funnel_extras`, `20260411000004_stage_value`, `20260411000005_deals_phone_dedup`, `20260412000000_dedupe_messages`, `20260414000000_relocation_stage`, `20260414000001_rpc_creates_expenses`, `20260416000000_rop_role`, `20260417000000_curator_portal`, `20260422000000_client_shortlists`, `20260422100000_program_curator_data`, `20260423000000_program_curator_data_full`, `20260423010000_client_essays`, `20260425000000_client_role`, `20260427000000_client_scholarships`, `20260428000000_client_docs_storage`, `20260428100000_client_applications`, `20260429000000_client_scholarships_kind`, `20260429010000_client_scholarships_idp`, `20260430000000_user_telegram`, `20260430010000_client_scholarships_unlock`.

**Май 2026:** `20260501000000_client_invitations`, `20260501010000_curator_invitations`, `20260502000000_school_application_profiles`, `20260502010000_client_project_data`, `20260502020000_client_roadmap_data`, `20260502030000_roadmap_approval`, `20260502040000_curator_stages_v2`, `20260505000000_clients_first_last_name`, `20260506000000_indexes`, `20260513000000_wazzup_chat_id_dedup`, `20260513100000_non_target_stage`, `20260515000000_school_covers_bucket`.

**Июль–август 2026:** `20260720000000_sales_commission_per_payment`, `20260805000001_service_type_expert_session`, `20260806000000_analytics_foundation`, `20260819000000_expected_offer_month`, `20260828000000_client_archive`.

**Сентябрь 2026 (SEO-контур):** `20260908000001_seo_schema`, `20260908000001_seo_technical`, `20260908000002_seo_functions`, `20260908000003_seo_cron`, `20260908000004_seo_seed`, `20260908000005_seo_grants`, `20260909000001_seo_opportunities`, `20260909000002_seo_experiments`, `20260910120000_index_first_indexed`.

**Сентябрь 2026 (очередь, стоимость, контент, финансы):** `20260911120000_jobs_runner` (+ `.rollback`), `20260913000000_perf_indexes`, `20260915000000_finance_core`, `20260915120000_finance_rate_cbr`, `20260917000000_claim_jobs_no_double` (+ `.rollback`), `20260917010000_job_lease_expand` (+ `.rollback`), `20260917020000_job_lease_enable`, `20260917030000_cost_accounting`, `20260917040000_model_pricing_seed`, `20260917050000_single_scheduler`, `20260917060000_provenance`, `20260917070000_touches`, `20260917080000_verification_cache`, `20260917090000_model_roles`, `20260917100000_claim_composition`, `20260917110000_content_schema`, `20260917120000_event_bridge`, `20260917130000_event_bridge_fix`, `20260917140000_purge_package`, `20260917150000_supersede`, `20260917160000_scheduling`, `20260917170000_scheduling_fix`, `20260917180000_catchup_asks_once`, `20260917190000_worker_roles`, `20260917200000_publication_outcomes`, `20260918000000_freshness`, `20260918010000_archive_claims_upsert`, `20260918020000_channels_delivery`, `20260921000000_platforms`, `20260921010000_platforms_all`, `20260921020000_platforms_auto`, `20260923000000_vk_autopost`.

**Сентябрь 2026 (апгрейд продаж, Zoom):** `20260924000000_curators_phone`, `20260924100000_sales_block0` (+ `.rollback`), `20260924110000_expire_stale_tasks` (+ `.rollback`), `20260924120000_deal_last_touch` (+ `.rollback`), `20260924130000_deal_analyses` (+ `.rollback`), `20260924140000_zoom_calls` (+ `.rollback`), `20260925000000_observed_number_kind`.

**Кабинет куратора v2:** `supabase/migrations/care/001_care_schema.sql` + `001_care_schema.rollback.sql`.

**Вне нумерации:** `supabase/migrations/_check_runner_idempotency.sql`; `supabase/parser-hidden-and-language.sql`, `parser-indexes.sql`, `parser-search-rpc.sql`, `scholarships-indexes.sql` (для соседних баз parser / scholarships).

**Не применённые / ожидающие** — каталог `supabase/migrations/применить/` (не в git, untracked): `1-gsc-daily-date.sql`, `2-gsc-page-daily-date.sql`, `3-deal-activities-type.sql` — три `create index concurrently`.

#### Что применено к production

**Из конфига или CI это не видно — CI нет вовсе, реестра применённых миграций в репозитории нет.** Косвенные свидетельства:

- Применение делается вручную скриптом `scripts/apply-sql.ts` через Supabase Management API (нужен `SUPABASE_ACCESS_TOKEN` в `.env.local`). В шапке скрипта прямо написано, что до его появления код и база расходились по времени.
- Для v2 — отдельный `scripts/care/apply.ts` с непропускаемой проверкой `scripts/care/check-sql.ts`.
- `docs/PLAN_CURATOR_V2.md` утверждает: миграция `care/001` **применена 25.09.2026** к боевой базе `pxtwaxhmygnssyyowrgr`, контрольные суммы не изменились.
- `supabase/config.toml` — конфиг локальной разработки Supabase CLI (`project_id = "goandstudy-crm"`, порты 54321/54322, `major_version = 17`, `api.schemas = ["public","graphql_public"]`). Ссылки на боевой проект в нём нет.

### Полный список таблиц

Извлечено из `create table` во всех миграциях. Схем пять: `public`, `seo`, `content`, `finance`, `care`.

#### Студенты / клиенты
| Таблица | Назначение |
|---|---|
| `public.clients` | карточка клиента (студента), имя, куратор, этап, `roadmap_data`, `project_data`, архив |
| `public.client_stages` | этапы ведения клиента |
| `public.client_activities` | журнал действий по клиенту |
| `public.client_archive` | архивирование клиентов |
| `public.client_checklist_progress` | прогресс по чек-листу этапа |
| `public.client_invitations` | приглашения клиента в кабинет по токену |
| `client_shortlists` | подборка вузов клиента |
| `client_essays` | эссе клиента |
| `client_scholarships` | стипендии, подобранные клиенту (в т.ч. IDP, разблокировка) |
| `public.client_universities` | вузы в работе у клиента |
| `public.deals` | сделка в воронке продаж |
| `public.deal_activities` / `deal_tasks` / `deal_messages` / `deal_files` | активности, задачи, чат и файлы сделки |
| `public.deal_analyses` | разбор разговора моделью (ИИ) |
| `public.pipeline_stages` | этапы воронки |
| `public.assignment_history` | история назначения менеджера |

#### Кураторы
| Таблица | Назначение |
|---|---|
| `public.curators` | справочник кураторов (+ телефон с `20260924000000`) |
| `public.curator_stages` | этапы работы куратора |
| `public.curator_stage_checklist` | чек-лист внутри этапа |
| `public.curator_templates` | шаблоны сообщений/документов куратора |
| `public.curator_resources` | материалы для куратора |
| `public.curator_invitations` | приглашение куратора по токену |

#### Вузы / программы
| Таблица | Назначение |
|---|---|
| `program_curator_data` | кураторские данные по программе (дедлайны, цены, заметки) |
| `program_curator_data_history` | история правок этих данных |
| `public.school_application_profiles` | профиль требований вуза к заявке |
| `public.application_profile_data` | заполненные данные профиля заявки |

Сам справочник вузов и программ **живёт не здесь** — это отдельный Supabase-проект «parser» (`lib/supabase/parser.ts`, переменные `NEXT_PUBLIC_PARSER_SUPABASE_*`), каталог стипендий — третий проект «GS_apply» (`lib/supabase/scholarships.ts`, `NEXT_PUBLIC_SCHOLARSHIPS_SUPABASE_*`).

#### Документы
| Таблица | Назначение |
|---|---|
| `public.client_documents` | документы клиента (+ `storage_path`, `mime_type`, `uploaded_by`) |
| `public.application_documents` | документы конкретной заявки |
| `public.client_tg_files` | файлы, пришедшие из Telegram |
| `public.deal_files` | файлы, привязанные к сделке |
| `public.invoices` | счета |

#### Задачи / план
| Таблица | Назначение |
|---|---|
| `public.deal_tasks` | задачи менеджера по сделке |
| `public.client_checklist_progress` | шаги плана клиента |
| `public.application_events` | события по заявке |
| `public.sales_plans` | планы продаж |
| `public.rop_settings` / `public.rop_actions_log` | настройки и журнал действий РОПа |
| план поступления клиента | **отдельной таблицы нет** — хранится в JSON-колонке `clients.roadmap_data` (`20260502020000_client_roadmap_data`, `20260502030000_roadmap_approval`), код — `lib/roadmap-types.ts`, `lib/roadmap-actions.ts` |

#### Сообщения
| Таблица | Назначение |
|---|---|
| `public.client_tg_messages` | сообщения клиента, зеркалируются в кабинет куратора |
| `public.deal_messages` | переписка по сделке (Telegram + Wazzup), дедуп по `external_id` |
| `finance.telegram_chats` / `finance.telegram_bindings` | чаты финансового бота и их привязки |

#### Встречи
| Таблица | Назначение |
|---|---|
| `public.bookings` | запись на консультацию |
| `public.schedule_slots` | слоты расписания менеджеров |
| `public.call_recordings` | записи и расшифровки звонков/Zoom (`20260924140000_zoom_calls`) |

#### ИИ
| Таблица | Назначение |
|---|---|
| `public.deal_analyses` | результат разбора разговора моделью |
| `seo.model_pricing` / `seo.model_roles` | цены моделей и роли (какая модель на какой шаг) |
| `seo.cost_ledger` / `seo.budget_reservations` | учёт расходов на модели и резервирование бюджета |
| `seo.verification_cache` | кэш проверок утверждений |
| `seo.claims` / `claim_sources` / `claim_policy` / `article_version_claims` | реестр фактов и их источников |
| `seo.evidence_bundles` / `seo.source_snapshots` / `seo.sources` | доказательная база |
| `content.ai_visibility_runs` | прогоны замеров видимости в ИИ-ответах |
| `care.env_marker` | отпечаток режима нового кабинета (`pilot`/`prod`, рубильник отправок) |

#### Остальное (полный перечень схем)

`public`: `users`, `payments`, `expenses`, `fixed_expenses`, `fixed_expense_records`, `daily_snapshots`, `v_deal_last_touch` (view), `v_money_in` (view).

`seo` (40 таблиц): `articles`, `article_versions`, `article_version_claims`, `attribution_events`, `budget_reservations`, `change_sets`, `claim_policy`, `claim_sources`, `claims`, `cost_ledger`, `evidence_bundles`, `experiments`, `expert_notes`, `findings`, `gsc_daily`, `gsc_page_daily`, `index_status`, `jobs`, `lead_identities`, `link_edges`, `link_suggestions`, `model_pricing`, `model_roles`, `opportunities`, `optimization_events`, `page_schema`, `pages`, `production_run_items`, `production_runs`, `review_sessions`, `runs`, `settings`, `source_snapshots`, `sources`, `topics`, `url_universe`, `verification_cache`, `vk_photo_pool`, view `v_page_deals`.

`content` (22 таблицы): `ai_visibility_runs`, `assets`, `attention_items`, `audit_events`, `channel_policies`, `channels`, `connector_capabilities`, `consents`, `event_receipts`, `metrics_daily`, `outbox_events`, `package_versions`, `packages`, `publication_attempts`, `publications`, `reviews`, `variant_assets`, `variant_versions`, `variants`.

`finance` (22 таблицы): `access`, `accounts`, `audit_events`, `categories`, `counterparties`, `counterparty_aliases`, `drafts`, `exchange_rates`, `founder_claims`, `idempotency_keys`, `link_tokens`, `movements`, `obligations`, `outbox`, `reconciliations`, `rules`, `settlements`, `source_events`, `telegram_bindings`, `telegram_chats`, `transactions`, view `account_balances`.

`care`: `env_marker` — единственная таблица на сегодня.

RPC, упомянутые в CLAUDE.md: `create_client_with_payments`; view `payments_view`. Плюс функции SEO-контура (`seo.dispatch_tick`, `seo.enqueue_nightly`, `seo.schedule_all`, `seo.unschedule_all`) и `public.take_daily_snapshot`.

### RLS

**RLS включён** (`enable row level security`) ровно на 9 таблицах:
`public.users`, `public.clients`, `public.curators`, `public.payments`, `public.expenses`, `public.fixed_expenses`, `public.fixed_expense_records`, `care.env_marker`.

> ⚠️ **Поправка от 28.09.2026.** Этот раздел описывает миграции, а не живую
> базу, и в одном месте они разошлись. Проверено запросом к каталогу:
> на `clients`, `curators`, `users`, `client_tg_messages`, `client_documents`,
> `client_universities` **RLS в боевой базе включён** — его включали позже
> через панель, миграциями это не отражено. Политики написаны под роли
> `authenticated` и `public` с предикатами `is_staff()` и `get_my_role()`.
>
> Практическое следствие: роль с выданным `GRANT SELECT`, но без политики,
> получает код 200 и ноль строк. Именно так вёл себя контур v2, пока это не
> закрыла миграция `care/007`. Список ниже читать как «выключен по миграциям»,
> а не «выключен сейчас».

**RLS явно выключен по миграциям** (`disable row level security`) на 35 таблицах — все клиентские, кураторские, воронка и заявки:
`client_essays`, `client_scholarships`, `client_shortlists`, `program_curator_data`, `program_curator_data_history`, `public.application_documents`, `application_events`, `application_profile_data`, `bookings`, `call_recordings`, `client_activities`, `client_applications`, `client_checklist_progress`, `client_documents`, `client_invitations`, `client_stages`, `client_tg_files`, `client_tg_messages`, `client_universities`, `curator_invitations`, `curator_resources`, `curator_stage_checklist`, `curator_stages`, `curator_templates`, `deal_activities`, `deal_analyses`, `deal_files`, `deal_messages`, `deal_tasks`, `deals`, `pipeline_stages`, `rop_actions_log`, `rop_settings`, `sales_plans`, `schedule_slots`, `school_application_profiles`.

Комментарий в `20260410000000_init.sql:167`: «RLS (disable for now — app uses service role for admin)». Для схем `seo`, `content`, `finance` включение RLS в миграциях не встречается — доступ там ограничен GRANT'ами на отдельные роли (`20260908000005_seo_grants`, `20260917190000_worker_roles`).

В `care` подход другой: RLS включён, единственная разрешающая политика `care_app_all` для роли `care_app`, `anon` и `authenticated` явно лишены прав.

### Где используется service-role клиент

`createAdminClient()` определён в `lib/supabase/server.ts:28` (создаёт клиент на `SUPABASE_SERVICE_ROLE_KEY`, `persistSession: false`, обходит RLS). Используется в **128 файлах** приложения. Полный перечень:

**API-маршруты (23):** `app/api/ai/fill-idp-scholarship/route.ts`, `app/api/ai/fill-program/route.ts`, `app/api/ai/verify-scholarship/route.ts`, `app/api/backup/export/route.ts`, `app/api/book/create/route.ts`, `app/api/book/lead/route.ts`, `app/api/book/slots/route.ts`, `app/api/content/webhook/[platform]/route.ts`, `app/api/debug/parser/route.ts`, `app/api/finance/telegram/route.ts`, `app/api/seo/publish/next/route.ts`, `app/api/seo/publish/result/route.ts`, `app/api/seo/tick/route.ts`, `app/api/tbank-notify/route.ts`, `app/api/telegram/webhook/route.ts`, `app/api/track/route.ts`, `app/api/wazzup/webhook/route.ts`, `app/api/zoom/webhook/route.ts`.

**Кабинет куратора (16):** `app/curator/page.tsx`, `app/curator/profile/page.tsx`, `app/curator/guide/page.tsx`, `app/curator/resources/page.tsx`, `app/curator/templates/page.tsx`, `app/curator/clients/page.tsx`, `app/curator/clients/[id]/page.tsx`, `app/curator/clients/[id]/actions.ts`, `app/curator/clients/[id]/motivation/page.tsx`, `app/curator/clients/[id]/resume/page.tsx`, `app/curator/applications/page.tsx`, `app/curator/applications/actions.ts`, `app/curator/applications/[slug]/page.tsx`, `app/curator/universities/page.tsx`, `app/curator/universities/[schoolId]/page.tsx`, `app/curator/programs/[programId]/page.tsx`, `app/curator/scholarships/page.tsx`, `app/curator/scholarships/actions.ts`, `app/curator/scholarships/[scholarshipId]/page.tsx`, `app/curator/scholarships/idp/[id]/page.tsx`, `app/curator/shortlist/actions.ts`.

**Кабинет клиента (7):** `app/client/updates/page.tsx`, `app/client/documents/actions.ts`, `app/client/essays/actions.ts`, `app/client/onboarding-actions.ts`, `app/client/shortlist/actions.ts`, `app/client/applications/[id]/wizard/actions.ts`, `app/client/applications/[id]/wizard/auto-link-helper.ts`.

**Админка (47):** все страницы и действия `app/admin/content/*`, `app/admin/seo/*`, `app/admin/funnel/*`, `app/admin/curators/*`, `app/admin/clients/actions.ts`, `app/admin/invoices/actions.ts`, `app/admin/settings/actions.ts`, `app/admin/finance/setup/page.tsx`.

**РОП (14):** `app/rop/page.tsx`, `app/rop/actions.ts`, `analytics`, `conversions`, `deals`, `funnel`, `funnel/[id]`, `history`, `hot`, `pipeline`, `response-times`, `settings`, `stuck`, `tasks`.

**Продажи (6):** `app/sales/page.tsx`, `app/sales/actions.ts`, `app/sales/funnel/page.tsx`, `app/sales/funnel/[id]/page.tsx`, `app/sales/new/actions.ts`, `app/sales/new/success/page.tsx`.

**Публичные (5):** `app/book/page.tsx`, `app/book/actions.ts`, `app/book/[manager]/page.tsx`, `app/book/cancel/page.tsx`, `app/book/cancel/actions.ts`, `app/invite/[token]/actions.ts`, `app/invite/curator/[token]/actions.ts`.

**Библиотеки (10):** `lib/supabase/server.ts` (определение), `lib/booking-link.ts`, `lib/booking/create.ts`, `lib/client-data.ts`, `lib/curator-edit-actions.ts`, `lib/curator-invitation.ts`, `lib/finance/service.ts`, `lib/invitation.ts`, `lib/roadmap-actions.ts`, `lib/seo/steps-article.ts`, `lib/seo/steps-vk.ts`, `lib/student-project-actions.ts`, `lib/supabase/parser.ts`, `lib/supabase/scholarships.ts`.

Плюс **224 файла в `scripts/`** используют service-role ключ напрямую.

Смягчающий механизм: `lib/supabase/write-guard.ts` — `warnOnError()`, читает `{error}` от Supabase и логирует, не роняя операцию; применён выборочно.

### Storage

Бакеты, встречающиеся в коде и миграциях:

| Бакет | Что хранит | Доступ |
|---|---|---|
| `client-docs` | документы клиента, загруженные через кабинет | **приватный**; создан вручную в Dashboard (комментарий в `20260428000000_client_docs_storage.sql`), миграции на него нет. Выдача — `createSignedUploadUrl()` на загрузку (`app/client/documents/actions.ts:31`), удаление через service-role |
| `deal-files` | файлы из Telegram / Wazzup и вложения сделок | `getPublicUrl()` → **публичное чтение по ссылке** (`app/admin/funnel/actions.ts:798`, `app/admin/funnel/[id]/fileActions.ts:31`, `app/api/telegram/webhook/route.ts:362,535`, `app/api/wazzup/webhook/route.ts:313`). Миграции с описанием бакета не найдено |
| `school-covers` | обложки вузов, загружают кураторы | `public = true`, лимит 3 МБ, только `image/jpeg|png|webp` (`20260515000000_school_covers_bucket.sql`). Запись — только service-role |
| `seo-snapshots` | снимки страниц для SEO | задаётся переменной `SUPABASE_STORAGE_BUCKET` (`.env.example`) |
| `care-files` | бакет нового кабинета | **не создан** — в `docs/PLAN_CURATOR_V2.md` стоит ☐ |

Политик `create policy … on storage.objects` в миграциях **не найдено** — доступ регулируется флагом `public` бакета и тем, что вся запись идёт с service-role. `app/api/backup/export/route.ts:90` выдаёт подписанные ссылки на час для ночного бэкапа.

---

## 3. Интеграции

### Telegram

**Основной бот (чаты с клиентами)**
- Файлы: `lib/telegram.ts` (клиент Bot API, 574-строчный обработчик — `app/api/telegram/webhook/route.ts`), `lib/webhook-secret.ts`, `scripts/telegram-set-webhook.ts`.
- Реализовано: **приём вебхука** (`message`, `edited_message`, `channel_post`), скачивание файлов и фото (`downloadTelegramFile`) с заливкой в бакет `deal-files`, привязка чата к сделке по телефону (`lib/phone.ts` → `normalizePhone`) и по `chat.title`, зеркалирование сообщений в `client_tg_messages` для кабинета куратора (`route.ts:459–573`), закрытие задач-напоминаний об ответе (`lib/sales/reply-tasks.ts`).
- Отправка сообщений клиенту через этот бот в коде **не найдена** — только приём.
- Переменные: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`.
- Подпись: проверяется заголовок `x-telegram-bot-api-secret-token` (`подписьВерна()`, `route.ts:41`). **Если `TELEGRAM_WEBHOOK_SECRET` не задан — проверка выключена и в лог пишется предупреждение**; то есть по умолчанию вебхук открыт любому, кто знает адрес.
- Дубли: дедуп по `external_id` (`route.ts:382–403`). Повторы: при внутренней ошибке отдаётся 200, чтобы Telegram не ретраил (`route.ts` catch).

**Бот уведомлений о записях**: `TELEGRAM_BOOKINGS_BOT_TOKEN`, `TELEGRAM_BOOKINGS_CHAT_ID` — отправка в чат о новой брони.

**Финансовый бот**: `app/api/finance/telegram/route.ts`, `lib/finance/telegram.ts`, `lib/finance/speech.ts` (распознавание голосовых через Gemini inline, до 20 МБ / 3 мин), `lib/finance/parse.ts`. Переменные: `TELEGRAM_FINANCE_BOT_TOKEN`, `TELEGRAM_FINANCE_WEBHOOK_SECRET`. Таблицы `finance.telegram_chats`, `finance.telegram_bindings`, `finance.idempotency_keys`.

**SEO-оповещения**: `SEO_ALERT_CHAT_ID` (`lib/seo/alerts.ts`), публикация в Telegram-каналы — `lib/content/telegram.ts`.

### Wazzup / WhatsApp

- Файлы: `lib/wazzup.ts` (114 строк), `app/api/wazzup/webhook/route.ts` (408 строк), `app/api/debug/wazzup-channels/route.ts`.
- Реализовано: **приём вебхука** сообщений, скачивание вложений в `deal-files`, создание/поиск сделки по телефону, дедупликация по `chat_id` (миграция `20260513000000_wazzup_chat_id_dedup.sql`).
- Переменные: `WAZZUP_API_KEY`, `WAZZUP_WA_CHANNEL_ID`, `WAZZUP_TG_CHANNEL_ID`, `WAZZUP_TGAPI_CHANNEL_ID`.
- Дубли: дедуп по `external_id = msg.messageId` (`route.ts:332–351`). Отдельного слоя идемпотентности по событию нет.
- Исходящая отправка в WhatsApp через Wazzup в коде **не найдена**.

### Zoom

- Файлы: `app/api/zoom/webhook/route.ts` (229 строк), `lib/zoom/client.ts` (Server-to-Server OAuth), `lib/zoom/meeting-for-booking.ts` (создание встречи под бронь), `lib/zoom/process-recording.ts`, `lib/zoom/transcribe.ts`.
- Реализовано: **создание встречи** под запись на консультацию; **приём вебхука** о готовой записи; **скачивание записи**; **расшифровка** через загрузку файла в хранилище Gemini Files API с последующим удалением файла (`lib/zoom/transcribe.ts` — причина: на Vercel нет ffmpeg, inline не тянет 40–60 минут). Результат → `public.call_recordings` (миграция `20260924140000_zoom_calls.sql`).
- Переменные: `ZOOM_ACCOUNT_ID`, `ZOOM_CLIENT_ID`, `ZOOM_CLIENT_SECRET`, `ZOOM_WEBHOOK_SECRET_TOKEN`, `GEMINI_API_KEY`, `GEMINI_STT_MODEL` (по умолчанию `gemini-3.6-flash`).
- Подпись вебхука проверяется внутри маршрута. Повторы: `route.ts:170–189` — дедуп по `external_id = звук.id`, повтор отбрасывается; на своей ошибке отдаётся 200. `maxDuration = 300`.

### Gmail / почта

Gmail, IMAP, SMTP, nodemailer — **не найдено**. Почта только исходящая транзакционная через **Resend HTTP API**:
- `lib/invitation.ts:207–310` (приглашение клиента), `lib/curator-invitation.ts:89–120`, `app/admin/curators/actions.ts:220–260` (приглашение куратора и пароль).
- Переменные: `RESEND_API_KEY`, `RESEND_FROM_ADDRESS` (по умолчанию `GoAndStudy <noreply@goandstudy.com>`).
- Без ключа функции возвращают `{ok:false}` тихо, не падают. Повторов и дедупа нет.

### LLM-провайдеры

| Провайдер | SDK / способ | Где |
|---|---|---|
| **Anthropic** | `@anthropic-ai/sdk ^0.88.0`, `lib/ai.ts:getAnthropic()` | `app/api/ai/*` (5 маршрутов), `lib/sales/analyze-conversation.ts`, `lib/seo/generate.ts`, `lib/seo/claim-verify.ts`, `lib/seo/review-protocol.ts`, `lib/seo/diagrams.ts`, `lib/content/adaptation-check.ts` |
| **Google Gemini** | прямой HTTP на `generativelanguage.googleapis.com` | `lib/zoom/transcribe.ts` (Files API), `lib/finance/speech.ts` (inline) |
| **Voyage / OpenAI (эмбеддинги)** | `lib/seo/embeddings.ts`, выбор через `EMBEDDING_PROVIDER` | SEO-контур |
| **fal.ai / OpenAI Images** | `lib/seo/images.ts`, выбор через `IMAGE_PROVIDER` | обложки статей |

Модели, встречающиеся в коде: `claude-opus-5` (21 упоминание), `claude-sonnet-4-6` (8), `claude-sonnet-5` (2), `claude-haiku-4-5` (2), `gemini-3.6-flash` (2), `voyage-3` (3), `gpt-image-1`, `gpt-4.1`.

Переменные: `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`, `GEMINI_STT_MODEL`, `EMBEDDING_PROVIDER`, `EMBEDDING_API_KEY`, `EMBEDDING_MODEL`, `EMBEDDING_DIM`, `OPENAI_API_KEY`, `OPENAI_IMAGE_MODEL`, `IMAGE_PROVIDER`, `FAL_KEY`, `FAL_IMAGE_MODEL`, `SALES_SYSTEM_PROMPT`.

**Где хранятся промпты.** Единого хранилища нет, три места:
1. В коде константами — `lib/ai.ts:15` `DEFAULT_SYSTEM_PROMPT` (большой продажный промпт про продукты и цены), схемы tool-use в `app/api/ai/*/route.ts` (`SAVE_TOOL`), `СХЕМА` в `lib/sales/analyze-conversation.ts:34`.
2. Переопределение из окружения — `SALES_SYSTEM_PROMPT` перебивает дефолт (`lib/ai.ts`, `getSystemPrompt()`).
3. В базе — таблицы `seo.model_roles` (какая модель на какой шаг), `seo.settings`. Отдельной таблицы промптов не найдено.

Учёт расходов: `seo.cost_ledger`, `seo.model_pricing`, `seo.budget_reservations`; цены продублированы в коде — `lib/sales/analyze-conversation.ts:28` (`claude-opus-5` 5/25, `claude-sonnet-5` 3/15).

### OCR / парсинг документов

**Не найдено.** Ни OCR, ни `pdf-parse`, ни `pdfjs`, ни `mammoth`, ни извлечения текста из загруженных файлов. Документы клиента хранятся как файлы в `client-docs` с метаданными в `client_documents`, содержимое не читается. Единственное «распознавание» — речь в текст (Gemini) для звонков и голосовых.

Парсинг HTML для SEO — `node-html-parser` (`lib/seo/crawl.ts`, `lib/content/probe.ts`).

### Cron, очереди, фоновые задачи

**Vercel Cron — нет.** `vercel.json` в репозитории **не найден**.

**pg_cron** (`supabase/migrations/20260908000003_seo_cron.sql`, `20260917050000_single_scheduler.sql`): расширения `pg_cron` + `pg_net`. Расписание **не включается при применении миграции** — только вручную вызовом `select seo.schedule_all()`. Задания:

| Имя | Расписание | Что |
|---|---|---|
| `seo_tick` | `* * * * *` | `seo.dispatch_tick()` → POST на `https://crm.goandstudy.com/api/seo/tick` с секретом из Supabase Vault |
| `seo_attribution` | `0 1 * * *` | `seo.enqueue_nightly('attribution')` |
| `seo_crawl` | `0 2 * * *` | `seo.enqueue_nightly('crawl')` |
| `seo_freshness` | `0 3 * * *` | `seo.enqueue_nightly('freshness')` |
| `seo_gsc` | `0 4 * * *` | `seo.enqueue_nightly('gsc')` |
| `seo_findings` | `0 5 * * *` | `seo.enqueue_nightly('index')` |

Закомментированы (не включены): `daily-snapshot` (`20260806000000_analytics_foundation.sql`), `expire-stale-tasks` (`20260924110000_expire_stale_tasks.sql`).

**Очередь заданий**: таблица `seo.jobs`, функция выдачи с защитой от двойной выдачи (`20260917000000_claim_jobs_no_double.sql`), аренда задания (`20260917010000_job_lease_expand.sql`, `20260917020000_job_lease_enable.sql`), один планировщик (`20260917050000_single_scheduler.sql`). Воркер — `app/api/seo/tick/route.ts` (`maxDuration = 300`, авторизация заголовком `x-seo-tick-secret`). Локальный дублёр — `scripts/seo-worker.ts`.

**Outbox-паттерн**: `content.outbox_events`, `content.event_receipts` (`20260917120000_event_bridge.sql`), `finance.outbox`, `finance.idempotency_keys`.

**Внешние воркеры** (вне Vercel, на сервере сайта в Москве):
- `wp-bridge/goandstudy-seo-bridge.php` — публикация статей в WordPress (`WP_BASE_URL`, `WP_BRIDGE_SECRET`).
- `wp-bridge/goandstudy-track.php` — трекер лидов.
- `server-agent/gs-publish-agent.php`, `server-agent/gs-backup.sh`, `server-agent/fix-trailing-slash.sh`.
- `wp-theme/blog.php`.

**Прочие вебхуки**: `app/api/content/webhook/[platform]/route.ts` — приём событий соцплатформ, с явной идемпотентностью по `event_id` и быстрым 200 на повтор (`route.ts:73–89`). `app/api/tbank-notify/route.ts` — колбэк эквайринга Т-Банка (`lib/tbank.ts`, `TBANK_TERMINAL_KEY`, `TBANK_PASSWORD`); **дедупа/идемпотентности в этом маршруте не найдено**. `app/api/track/route.ts` — трекер (`TRACK_COOKIE_DOMAIN`, `TRACK_ALLOWED_ORIGINS`, `SITE_FORM_SECRET`). VK: `lib/content/vk.ts`, `app/admin/content/vk` (`VK_ACCESS_TOKEN`, `VK_GROUP_ID`, `VK_CALLBACK_SECRET`, `VK_CONFIRMATION_STRING`).

---

## 4. Что уже начато по кабинету куратора v2

### Документы

| Файл | Размер | Дата |
|---|---|---|
| `docs/AUDIT_CURATOR_AI.md` | 72 КБ | 28.09.2026 |
| `docs/DESIGN_CURATOR_V2.md` | 56 КБ | 28.09.2026 |
| `docs/ARCH_CURATOR_V2.md` | 58 КБ | 28.09.2026 |
| `docs/PLAN_CURATOR_V2.md` | 11 КБ | 28.09.2026 |
| `DESIGN.md` (корень, v1) | 11 КБ | 23.04.2026 |
| `app/curator/ds.css` | — | токены дизайн-системы, `.ds-scope`; подключается из `app/curator/layout.tsx`, `app/client/layout.tsx`, `app/demo/layout.tsx` |

То есть все четыре запрошенных документа есть, `ds.css` лежит **в `app/curator/ds.css`**, а не в корне.

### Код, страницы, компоненты, таблицы v2

Есть только **контур изоляции**. Интерфейса и логики нового кабинета нет.

| Что | Статус |
|---|---|
| `supabase/migrations/care/001_care_schema.sql` + `.rollback.sql` | **есть и, по `PLAN_CURATOR_V2.md`, применено к боевой базе 25.09.2026.** Заводит схему `care`, роль `care_app` (nologin, выдана `authenticator`), `GRANT SELECT` перечислением на 14 таблиц `public`, таблицу `care.env_marker` с RLS и одной политикой. Ни одного `ALTER TABLE public.*` |
| `scripts/care/apply.ts` | применение миграции через Management API с непропускаемой проверкой |
| `scripts/care/check-sql.ts` | предохранитель: ловит 6 классов нарушений в SQL |
| `scripts/care/mint-key.ts` | выпуск `CARE_DB_KEY` (JWT с `role=care_app`) |
| `scripts/care/selftest-perms.ts` | проверка изоляции, 8 из 8 по плану |
| `scripts/care/expose-schema.ts` | открыть/закрыть схему `care` для PostgREST |
| `scripts/care/smoke.ts` | дымовой тест контуров |
| `app/care/*` | **не найдено** |
| `app/api/care/*` | **не найдено** |
| `lib/care/*` | **не найдено** |
| таблицы `care.cases`, `care.facts`, `care.tasks`, `care.dialogs`, `care.proposals`, `care.feature_flags`, `care.autonomy_policy`, `care.jobs` | **не найдено** — спроектированы в `ARCH_CURATOR_V2.md` §6.2 и стоят ☐ в плане, этап 2 |
| бакет `care-files` | **не создан** (☐ в плане) |
| `docs/DEPLOY_CURATOR_V2.md` | **не найдено** (☐ в плане) |

**«Общий чат» и «поручения» в терминах v2 — не найдено.** В действующей системе есть близкие по смыслу, но другие вещи: `client_tg_messages` (зеркало Telegram-переписки, читается в `app/curator/page.tsx:43` и `app/curator/clients/[id]/page.tsx:79`), `deal_messages` (чат сделки) и `deal_tasks` (задачи менеджера по сделке, используются в `app/sales`, `app/rop`, `app/admin/funnel`, `app/api/wazzup/webhook`). К кураторам задачи не привязаны.

**ИИ-помощник кабинета куратора — не найдено.** Существующие ИИ-функции перечислены в разделе 5; они точечные и к «помощнику» не относятся.

Итог: это **заготовка-фундамент**, не работающий контур. Работает и проверено: права роли, предохранитель миграций, открытие схемы. Не начато: данные, операции, очередь, интерфейс.

### Ветки git (последний коммит)

Локальные:

| Ветка | Последний коммит | К v2? |
|---|---|---|
| `main` | 28.09.2026 12:49 | содержит слитый контур v2 (`8cc16ac merge(curator-v2)`) |
| **`feat/curator-v2`** | **28.09.2026 12:32** | **да — рабочая ветка v2** |
| `sales-upgrade-block0` | 24.09.2026 19:13 | нет |
| `feat/vk-autopost` | 23.09.2026 22:17 | нет |
| `docs/seo-project` | 09.09.2026 15:40 | нет |
| `feat/seo-night` | 08.09.2026 23:02 | нет |
| `feat/seo-embed` | 08.09.2026 22:51 | нет |
| `feat/seo-m5` | 08.09.2026 22:41 | нет |
| `feat/seo-m1` | 08.09.2026 22:05 | нет |
| `feat/seo-m0` | 08.09.2026 19:42 | нет |
| `redesign-program-page` | 07.05.2026 15:47 | нет |
| `quiz-booking-form` | 20.04.2026 13:35 | нет |
| `curator-portal-phase-1` | 20.04.2026 11:29 | нет (это v1 кабинета куратора) |
| `dev` | 16.04.2026 15:31 | нет |
| `TEST-CRM` | 10.04.2026 15:54 | нет |
| `testearrwer` | 10.04.2026 15:54 | нет |
| `claude/dreamy-cerf` | 10.04.2026 15:07 | нет |

Удалённые (`origin`, github.com/pkhakhalov-png/goandstudy-crm): `main` (28.09), `feat/vk-autopost` (23.09), `redesign-program-page` (07.05), `dev` (16.04), `TEST-CRM` (10.04), `revert-1-dev` (10.04). **Ветка `feat/curator-v2` на `origin` отсутствует** — существует только локально, но уже слита в `main` и запушена.

Ветка не переключалась. Текущая — `main`.

Незакоммиченное (`git status`): `scripts/_probe18.ts`, `supabase/migrations/применить/`.

### Feature flags

**Механизма включения функций по пользователю/организации в коде нет.** Поиск по `feature_flag`, `featureFlag`, `isEnabled(`, `flags.` даёт только совпадения в `app/curator/universities/ProgramCard.tsx:41–52` — там `flags` это ярлыки программы (PGWP, Co-op, QS-ранг), к переключению функций отношения не имеет.

Что есть похожего:
- `care.env_marker` (`mode`: `pilot|prod`, `external_sends`: bool) — единственный рубильник, и он один на всю систему, а не по пользователю. Умышленно живёт в базе, а не в переменной окружения (комментарий в миграции: переменную на Vercel можно переставить деплоем и не заметить).
- `seo.settings`, `public.rop_settings`, `finance.access` — настройки, а не флаги.
- Включение/выключение переменной окружения как де-факто флаг: `TELEGRAM_WEBHOOK_SECRET`, `RESEND_API_KEY`, `GEMINI_API_KEY` — без них соответствующая функция тихо отключается.

Спроектировано, но не реализовано: `care.feature_flags` с четырьмя переключателями `ui | ai | autowrite | outbound` на трёх уровнях «клиент → куратор → все», ближайший найденный побеждает, отсутствие записи = выключено (`ARCH_CURATOR_V2.md` §9.1). Плюс `care.autonomy_policy` (`auto|confirm|human`) и `care.cases.automation_owner` (`legacy|v2`) — чтобы старый и новый процессы не работали по одному клиенту одновременно (§9.2, §9.3).

---

## 5. Существующие ИИ-функции

Все вызовы Anthropic — через `lib/ai.ts:getAnthropic()`. Все пять API-маршрутов используют tool-use со строгой схемой и инструкцией «не найдено → `null`, не выдумывай».

| Функция | Вход | Где вызывается | Куда пишет | Подтверждение куратором |
|---|---|---|---|---|
| **Заполнение карточки программы** | ID программы, название вуза; модель ходит в веб-поиск | `app/api/ai/fill-program/route.ts` (`maxDuration=300`), кнопка в `app/curator/clients/[id]/ClientWorkspace.tsx:1558` и на странице программы | `program_curator_data` (через `createParserClient` + admin), история — `program_curator_data_history` | **Нет автоматического гейта.** Пишет сразу, затем `revalidatePath`. Куратор правит вручную постфактум (`lib/curator-edit-actions.ts`, `app/_shared/CuratorEdit`) |
| **Заполнение карточки вуза** | ID вуза; веб-поиск + Wikimedia (свой User-Agent, `WIKI_UA`) | `app/api/ai/fill-school/route.ts` (`maxDuration=300`) | база parser-Supabase (`createParserAdminClient`): `qs_rank`, `the_rank`, `arwu_rank`, `logo_url`, `description`, `curator_note`, `video_link` | Нет гейта, правка постфактум |
| **Заполнение IDP-стипендии** | ID стипендии | `app/api/ai/fill-idp-scholarship/route.ts` (`maxDuration=300`) | база scholarships-Supabase: `description`, `eligibility`, `gpa_requirement`, `language_requirement`, `renewable` | Нет гейта |
| **Проверка стипендии** | ID стипендии | `app/api/ai/verify-scholarship/route.ts` (`maxDuration=300`) | scholarships-Supabase: `application_deadline`, `deadline_note`, `official_url`, `application_url`, `info_url`. В промпте явный запрет на агрегаторы (unipage, scholars4dev, scholarshipportal) | Нет гейта |
| **Подсказка менеджеру по сделке** | `dealId` → сделка, этап, последние 40 сообщений `deal_messages` | `app/api/ai/suggest/route.ts` | Ничего не пишет — ответ отдаётся в интерфейс | Не требуется (read-only) |
| **Разбор разговора** | материал разговора (`lib/sales/conversation-source.ts`): переписка и/или расшифровка Zoom | `lib/sales/analyze-conversation.ts`, модель по умолчанию `claude-opus-5` | `public.deal_analyses` (`20260924130000_deal_analyses.sql`) | Нет гейта, но **каждое утверждение обязано быть с цитатой** — проверяемость вместо подтверждения |
| **Расшифровка звонка** | аудиофайл записи Zoom | `lib/zoom/transcribe.ts` через `lib/zoom/process-recording.ts`, вызывается из `app/api/zoom/webhook/route.ts` | `public.call_recordings` | Нет |
| **Распознавание голосовых финбота** | голосовое сообщение Telegram | `lib/finance/speech.ts` → `lib/finance/parse.ts` | `finance.drafts` → после подтверждения `finance.transactions` | **Да** — операция создаётся черновиком |

**Важное про подбор вузов и стипендий.** Подбор — **не ИИ**. `lib/scholarship-match.ts` — детерминированный алгоритм: связь по `idp_scholarships.school_id`, нечёткий match по нормализованному имени вуза для TopUni, по `country_code` для государственных. `lib/catalog-search.ts` — поиск по каталогу. ИИ участвует только в **обогащении карточек** справочника, не в подборе под клиента.

**CV / резюме и мотивационное письмо — тоже не ИИ.** `app/client/resume/ResumeEditor.tsx` — редактор; на строке 1093 есть подсказка `{key:'ai-summary', label:'Write your profile summary', type:'ai'}`, но это **подсказка в списке дел**, вызова модели за ней нет. `app/client/motivation`, `app/client/essays/actions.ts` — ручное редактирование с печатью (`/print`).

В SEO-контуре ИИ используется гораздо шире (`lib/seo/generate.ts`, `claim-verify.ts`, `review-protocol.ts`, `diagrams.ts`, `lib/content/adaptation-check.ts`), но это отдельная система, к кабинету куратора отношения не имеющая.

**Вывод по разделу:** в действующем кабинете куратора ИИ делает ровно одно — **заполняет и проверяет карточки справочника** (вуз, программа, стипендия). Плюс к продажам — подсказка и разбор разговора. Подтверждения куратором нигде, кроме финансовых черновиков, нет: модель пишет в базу сразу.

---

## 6. Деплой и окружения

### Хостинг

**Vercel.** `.vercel/project.json`: `projectName: goandstudy-crm`, `projectId: prj_fc9Ut9mr9Z72CbTaoo9sAkRypUth`, `orgId: team_RR3dmIpyUFo1KLkjipmgIZmr`. Боевой адрес — `https://crm.goandstudy.com` (зашит в `seo.settings.tick_url` и в `WIKI_UA`).

Отдельный сервер в Москве (Timeweb Cloud) держит сайт `goandstudy.com` на WordPress — туда ходят `wp-bridge/*.php` и `server-agent/*`.

### Staging / preview

**Отдельного staging-окружения не найдено.** Preview-деплои Vercel формально доступны (это дефолт платформы), но:
- `vercel.json` нет — настроек окружений в репозитории нет;
- в коде есть `process.env.VERCEL_ENV` и `process.env.VERCEL_REGION`, но отдельной ветки логики «если preview — другая база» не найдено;
- `docs/PLAN_CURATOR_V2.md`, этап 1: «Решение владельца 25.09.2026: **отдельная среда не заводится**. Работаем в боевой базе (`pxtwaxhmygnssyyowrgr`)». Пункт «Переменные `CARE_*` на Vercel, отдельный проект из ветки» стоит ☐, и в блокерах записано: «⛔ Нет отдельного проекта Vercel из ветки — вебхуки и расписание проверить негде».

**Отдельного Supabase-проекта для тестов нет.** Проектов Supabase три, но все боевые и по разному назначению: основной CRM, `parser` (справочник вузов), `GS_apply` / scholarships (каталог стипендий, `ymyzzdnmadtxzjuvpefq`).

### vercel.json / next.config

`vercel.json` — **не найден**. Значит: регионы, cron и глобальный `maxDuration` через него не заданы.

`next.config.ts`:
```ts
experimental: {
  serverActions: {
    bodySizeLimit: '15mb',                     // загрузка документов клиентов
    allowedOrigins: ['goandstudy.com', 'www.goandstudy.com', 'crm.goandstudy.com'],
  },
}
```
`allowedOrigins` нужен потому, что форма записи отдаётся с московского сайта, а CRM живёт на Vercel — Host приходит чужой.

`maxDuration` задаётся **пофайлово**:

| Маршрут | maxDuration |
|---|---|
| `app/api/ai/fill-idp-scholarship/route.ts` | 300 |
| `app/api/ai/fill-program/route.ts` | 300 |
| `app/api/ai/fill-school/route.ts` | 300 |
| `app/api/ai/verify-scholarship/route.ts` | 300 |
| `app/api/backup/export/route.ts` | 300 |
| `app/api/seo/tick/route.ts` | 300 |
| `app/api/zoom/webhook/route.ts` | 300 |
| `app/api/seo/publish/result/route.ts` | 60 |
| `app/api/content/reach/route.ts` | 30 |

300 секунд требует тарифа Vercel Pro (комментарий в `app/api/ai/fill-program/route.ts:10`).

### CI

**CI нет.** Каталога `.github/` не существует, файлов `*.yml` / `*.yaml` в корне и на два уровня вглубь не найдено. Нет ни GitHub Actions, ни GitLab CI, ни другого раннера.

- **Тесты:** тестового раннера нет, скрипта `test` в `package.json` нет, тестовых файлов не найдено.
- **Линт:** `npm run lint` → `eslint` (`eslint.config.mjs`, `eslint-config-next`). Запускается вручную, в pipeline не встроен.
- **Деплой main:** интеграция Vercel ↔ GitHub — пуш в `main` собирает и выкатывает прод. Подтверждения из репозитория нет (нет `vercel.json`, нет workflow); держится на настройке в панели Vercel.
- **Миграции БД к деплою не привязаны** — применяются отдельно и вручную (`scripts/apply-sql.ts`, `scripts/care/apply.ts`).

---

## 7. Риски для параллельной сборки

Что в текущем коде помешает собрать новый контур рядом со старым.

**1. Нет staging — ни приложения, ни базы.** Единственная база боевая, `feat/curator-v2` на `origin` нет, отдельного проекта Vercel нет. Вебхуки и расписание нового контура проверить негде: у них должен быть публичный адрес. Это же записано блокером №1 в `docs/PLAN_CURATOR_V2.md`. Всё, что трогает `/api/care/tick` и приём событий, до появления отдельного проекта не проверяется никак.

**2. Service-role в 128 файлах приложения.** `createAdminClient()` (`lib/supabase/server.ts:28`) обходит RLS и раздан почти всем Server Actions и страницам, включая публичные маршруты `app/book/*` и `app/invite/*`. Любой новый код, случайно импортировавший общий модуль (`lib/client-data.ts`, `lib/roadmap-actions.ts`, `lib/student-project-actions.ts`, `lib/curator-edit-actions.ts`), получает полный доступ на запись в боевые данные. Это осознано: `ARCH_CURATOR_V2.md` §3.2 вводит правило «из `lib/care/*` и `app/care/*` нельзя импортировать пишущие модули» с ESLint `no-restricted-imports`, но **правило пока не написано** — в `eslint.config.mjs` его нет. До тех пор изоляцию держит только роль `care_app` на уровне базы, и только если новый код действительно ходит через неё, а не через `createAdminClient()`.

**3. RLS выключен на 35 таблицах, включая все клиентские и кураторские.** `clients`, `client_documents`, `client_applications`, `curator_stages`, `deals` и остальные. Разграничение доступа живёт исключительно в коде — в проверках вида `checkAccess()` (`lib/roadmap-actions.ts:13`). Новый контур не может опереться на базу для проверки «этот куратор видит этого клиента», ему придётся повторять ту же логику; расхождение двух реализаций — вероятная дыра.

**4. Общие таблицы без версионирования.** У `clients`, `client_documents`, `client_applications` нет ни версии, ни признака «кем ведётся». Если новый кабинет начнёт писать в те же таблицы, различить записи старого и нового процесса будет нечем. Проект это решает архитектурно — своя схема `care` и `care.cases.automation_owner` (§9.3) — но пока в `care` одна таблица `env_marker`, а спроектированные `care.cases`, `care.facts`, `care.tasks` не созданы.

**5. План поступления лежит в JSON-колонке.** `clients.roadmap_data` и `clients.project_data` (`20260502010000`, `20260502020000`) — не таблицы, а JSON. Читают и пишут `lib/roadmap-actions.ts`, `lib/student-project-actions.ts`, `lib/roadmap-types.ts`. Два процесса, пишущих в одну JSON-колонку, затрут правки друг друга целиком, а не построчно. Синхронизация v2 ↔ старый кабинет (§6.6) упирается именно сюда.

**6. Единый Telegram-вебхук на один бот.** `app/api/telegram/webhook/route.ts` — один маршрут, один `TELEGRAM_BOT_TOKEN`, и Telegram позволяет только один активный `setWebhook` на бота. Новый контур не может получать те же сообщения, не перехватив их у старого. Архитектура планирует `app/api/care/webhooks/telegram/route.ts` — значит нужен **отдельный бот и отдельный токен**, иначе переключение односторонее и с простоем. То же у Wazzup: один `WAZZUP_API_KEY` и фиксированные ID каналов.

**7. Проверка подписи Telegram-вебхука выключается отсутствием переменной.** `route.ts:41–48`: нет `TELEGRAM_WEBHOOK_SECRET` — подпись не проверяется, только `console.warn`. Маршрут публичный (`middleware.ts`). Пока переменная не выставлена в боевом окружении, любой, кто знает адрес, может прислать сообщение от имени клиента; из репозитория проверить, выставлена ли она, нельзя.

**8. `care.env_marker` — рубильник один на всю систему.** `external_sends` глобален. Пока флагов по клиенту/куратору (`care.feature_flags`) нет, пилот на одном клиенте невозможен: либо отправки выключены у всех, либо включены у всех. Флаги спроектированы (§9.1), но не созданы.

**9. Одна строка правки общего кода всё же нужна.** `middleware.ts`, список публичных путей: `pathname.startsWith('/api/care')`. Риск низкий (добавление ветки в цепочку `||` не меняет ни один существующий путь), но это единственное место, где новый контур трогает работающий код, и оно попадёт в боевой деплой.

**10. Нет CI и нет тестов.** Ни линт, ни сборка не проверяются автоматически перед выкаткой `main`. Единственная защита от поломки соседнего контура — то, что новый код лежит в отдельных каталогах. Регрессию в общих модулях (`lib/supabase/*`, `middleware.ts`, `lib/auth/viewer.ts`) поймать нечем. Обратите внимание: `feat/curator-v2` **уже слита в `main`** (коммит `8cc16ac`) — то есть контур v2 уже едет в боевой деплой, пусть пока и пустой.

**11. Миграции применяются вручную и вне деплоя.** `scripts/apply-sql.ts` с личным токеном. Реестра применённого в репозитории нет — состояние боевой схемы известно только из текста `PLAN_CURATOR_V2.md`. Каталог `supabase/migrations/применить/` с тремя неприменёнными индексами даже не в git. Код и база расходятся по времени — это прямо описано в шапке самого скрипта.

**12. pg_cron стучится в боевой адрес.** `seo.settings.tick_url = https://crm.goandstudy.com/api/seo/tick`, `seo_tick` раз в минуту. Если новый контур заведёт своё расписание в той же базе, оно будет ходить туда же, куда старое — отдельного адреса под `/api/care/tick` без отдельного проекта Vercel нет.

**13. Бакет `deal-files` публичен по ссылке.** Все вложения из Telegram и Wazzup раздаются через `getPublicUrl()` (`app/api/telegram/webhook/route.ts:362,535`, `app/api/wazzup/webhook/route.ts:313`). Политик на `storage.objects` в миграциях нет. Новый кабинет с документами клиентов не должен повторять этот путь — для него запланирован `care-files`, но бакет не создан.

---

## Не удалось проверить

Требует доступа, которого у меня нет, либо выходит за рамки «только чтение репозитория».

1. **Какие миграции реально применены к боевой базе.** Нужен доступ к `pxtwaxhmygnssyyowrgr` (`supabase_migrations.schema_migrations` или Management API с `SUPABASE_ACCESS_TOKEN`). В репозитории реестра нет; информация о применении `care/001` взята из текста `docs/PLAN_CURATOR_V2.md`, независимо не подтверждена.
2. **Фактическое состояние RLS и политик в боевой базе.** Выводы сделаны по миграциям. Что включали или выключали вручную через Dashboard — не видно.
3. **Полный список Storage-бакетов и их политик.** `client-docs` и `deal-files` создавались вручную в Dashboard (прямо написано в комментарии `20260428000000_client_docs_storage.sql`), миграций на них нет. Реальные `public`-флаги, лимиты и политики не проверены.
4. **Какие pg_cron-задания сейчас активны.** Нужен `select * from cron.job`. Из миграций видно только, что `seo.schedule_all()` вызывается вручную; вызывали ли — неизвестно. Так же неизвестно, лежит ли `SEO_TICK_SECRET` в Supabase Vault.
5. **Переменные окружения на Vercel.** `.env.local` и `.env.development.local` не читались по вашему указанию. Какие ключи реально выставлены в проде — не проверено. Критично для: `TELEGRAM_WEBHOOK_SECRET` (риск №7), `RESEND_API_KEY`, `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`, `CARE_DB_KEY`.
6. **Настройки проекта Vercel:** регионы, включены ли preview-деплои, привязка `main` → production, тариф (Pro нужен для `maxDuration = 300`), домены. `vercel.json` отсутствует, из репозитория это не видно.
7. **Exposed schemas в настройках API Supabase.** По `scripts/care/expose-schema.ts` живой список должен быть `public, graphql_public, storage, seo, finance, content` (+ `care` после открытия). Текущее значение не проверено — скрипт не запускался.
8. **Схемы соседних баз** — parser-Supabase (справочник вузов и программ) и scholarships-Supabase / GS_apply (`ymyzzdnmadtxzjuvpefq`). В репозитории лежат только отдельные SQL-файлы (`supabase/parser-*.sql`, `supabase/scholarships-indexes.sql`), полной схемы нет. Таблицы `schools`, `programs`, `idp_scholarships`, `scholarships_topuni`, `government_scholarships` описаны только по обращениям из кода.
9. **Внешние сервисы:** настройки бота в BotFather, активный `setWebhook`, каналы Wazzup, приложение Zoom, домены Resend — всё за пределами репозитория.
10. **Содержимое четырёх больших документов v2** (`AUDIT_CURATOR_AI.md` 72 КБ, `DESIGN_CURATOR_V2.md` 56 КБ, `ARCH_CURATOR_V2.md` 58 КБ) прочитано выборочно — оглавление целиком, разделы 3 и 9 архитектуры полностью, план целиком. Сплошного чтения всех 186 КБ не делалось.
11. **Работает ли действующий кабинет фактически.** Приложение не запускалось, страницы не открывались, запросов к базе не делалось — по условию задачи.
