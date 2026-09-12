/**
 * Замер времени обращений к базе по каждому экрану админки.
 *
 * Зачем. «Стало быстрее» — не результат, пока рядом нет цифры. Этот скрипт
 * прогоняет те же запросы, что делает экран при открытии, и показывает время
 * каждого и сумму. Повторять можно в любой момент: до правки и после.
 *
 *   npx tsx scripts/perf-audit.ts                 все экраны
 *   npx tsx scripts/perf-audit.ts --only seo      экраны, где в имени есть seo
 *   npx tsx scripts/perf-audit.ts --steps         шаги фонового воркера
 *   npx tsx scripts/perf-audit.ts --json out.json сохранить для сравнения
 *   npx tsx scripts/perf-audit.ts --diff was.json сравнить с прошлым замером
 *   npx tsx scripts/perf-audit.ts --runs 3        взять лучшее из трёх прогонов
 *
 * ЧТО ИМЕННО ЗАМЕРЯЕТСЯ. Время обращений к базе, а не отрисовка React. На этих
 * экранах рендер — это сборка HTML из готовых массивов, десятки миллисекунд;
 * всё остальное время уходит на ожидание ответов Postgres. Оптимизируем и
 * меряем именно его.
 *
 * ПОЧЕМУ СЕРВИСНЫЙ КЛЮЧ ЧЕСТЕН. Экраны админки читают под пользователем, то
 * есть через RLS. Политики в `20260410000000_init.sql` — «Authenticated read
 * USING (true)»: предиката нет, лишнего прохода по таблице он не добавляет.
 * Значит план запроса и время те же. Если политики когда-нибудь станут
 * условными, эта оговорка перестанет быть верной и замер придётся переделать.
 *
 * ЧЕГО ЗАМЕР НЕ ВИДИТ. Вход (`auth.getUser()`) — отдельный поход в Auth API,
 * он измеряется отдельной строкой «проверка входа» и одинаков для всех экранов.
 */
import { config } from 'dotenv'
import path from 'path'
config({ path: path.resolve(process.cwd(), '.env.local') })

import fs from 'fs'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { readAll } from '../lib/supabase/read-all'

/* ── Перехват обращений ─────────────────────────────────────────────────────
   Каждый запрос supabase-js — это HTTP-вызов PostgREST. Подменяем fetch и
   записываем время и число строк. Так видно не только сумму, но и кто именно
   в ней виноват. */

type Call = {
  table: string
  ms: number
  rows: number | null
  /** Запрошен ли явный диапазон строк: без него тысяча строк — это обрезка. */
  ranged: boolean
  head: boolean
  /** Сколько строк всего подходит под условие, если база это сообщила. */
  total: number | null
  /** Условия запроса — чтобы в отчёте было видно, кто именно тормозит. */
  detail: string
}

let log: Call[] = []
let capturing = false

const realFetch = globalThis.fetch

globalThis.fetch = (async (input: any, init: any = {}) => {
  if (!capturing) return realFetch(input, init)

  const url = String(typeof input === 'string' ? input : input?.url ?? input)
  const started = performance.now()
  const res = await realFetch(input, init)
  const ms = performance.now() - started

  const m = url.match(/\/rest\/v1\/(?:rpc\/)?([a-zA-Z0-9_]+)/)
  const auth = url.includes('/auth/v1/')
  if (!m && !auth) return res

  const reqHeaders = init?.headers ?? (typeof input === 'object' ? input?.headers : null) ?? {}
  const headers = new Headers(reqHeaders as any)
  // Content-Range: «0-999/17956» — отдано тысяча из почти восемнадцати тысяч.
  // Вторая половина и есть доказательство обрезки, когда она известна.
  const cr = res.headers.get('content-range')
  let rows: number | null = null
  let total: number | null = null
  if (cr) {
    const mm = cr.match(/^(\d+)-(\d+)/)
    if (mm) rows = Number(mm[2]) - Number(mm[1]) + 1
    else if (/^\*\//.test(cr)) rows = 0
    const tt = cr.match(/\/(\d+)$/)
    if (tt) total = Number(tt[1])
  }

  // Из адреса убираем длинный список колонок: важны условия, а не select
  const qs = decodeURIComponent(url.split('?')[1] ?? '')
    .split('&').filter((p) => !p.startsWith('select=')).join(' ')

  log.push({
    table: auth ? 'auth' : (url.includes('/rpc/') ? `rpc:${m![1]}` : m![1]),
    ms,
    rows,
    total,
    ranged: headers.has('range') || /[?&]offset=|[?&]limit=/.test(url),
    head: (init?.method ?? (typeof input === 'object' ? input?.method : null) ?? 'GET') === 'HEAD',
    detail: qs.slice(0, 110),
  })
  return res
}) as typeof fetch

/* ── Клиенты ──────────────────────────────────────────────────────────────── */

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL!
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!
if (!URL_ || !KEY) {
  console.error('✗ нет NEXT_PUBLIC_SUPABASE_URL или SUPABASE_SERVICE_ROLE_KEY в .env.local')
  process.exit(1)
}

const sb: SupabaseClient = createClient(URL_, KEY, { auth: { persistSession: false, autoRefreshToken: false } })
const seo = sb.schema('seo') as any

/* ── Экраны ───────────────────────────────────────────────────────────────── */

type Screen = {
  /** Адрес экрана — он же имя в отчёте. */
  name: string
  /** Файл, из которого списаны запросы: чтобы можно было сверить при изменениях. */
  source: string
  run: () => Promise<void>
}

/** Запустить пачку запросов одновременно — как это делает Promise.all на экране. */
const all = (...qs: any[]) => Promise.all(qs)

const SCREENS: Screen[] = [
  {
    name: '/admin',
    source: 'app/admin/page.tsx',
    run: async () => {
      await sb.from('users').select('name, role').limit(1)
      await all(
        sb.from('clients').select('id, name, country, status, salesperson_id, created_at'),
        sb.from('payments_view').select('id, client_id, plan_sum, fact_sum, is_paid, status, plan_date, fact_date'),
        sb.from('expenses').select('id, client_id, plan_sum, fact_sum, is_paid, article, who, plan_date, fact_date'),
        sb.from('users').select('id, name, is_active').eq('role', 'salesperson').order('name'),
        sb.from('fixed_expenses').select('id, name, amount, period, article, is_active').eq('is_active', true),
      )
    },
  },
  {
    name: '/admin/clients',
    source: 'app/admin/clients/page.tsx',
    run: async () => {
      await sb.from('users').select('name, role').limit(1)
      await all(
        sb.from('clients').select('id, name, phone, email, telegram, country, university, status, months, created_at, salesperson_id, curator_id, tg_group_chat_id, tg_group_title, expected_offer_month').order('created_at', { ascending: false }),
        sb.from('payments_view').select('id, client_id, num, plan_date, plan_sum, fact_sum, is_paid, status'),
        sb.from('users').select('id, name'),
        sb.from('curators').select('id, name'),
        sb.from('users').select('id, name').eq('role', 'salesperson').eq('is_active', true).order('name'),
        sb.from('curators').select('id, name').eq('is_active', true).order('name'),
        sb.from('expenses').select('id, client_id, article, plan_sum, fact_sum, is_paid, plan_date'),
        sb.from('invoices').select('id, client_id, amount, description, status, payment_url, created_at'),
      )
    },
  },
  {
    name: '/admin/payments',
    source: 'app/admin/payments/page.tsx',
    run: async () => {
      await sb.from('users').select('name, role').limit(1)
      await all(
        sb.from('clients').select('id, name, phone, country, status, salesperson_id, curator_id'),
        sb.from('users').select('id, name'),
        sb.from('curators').select('id, name'),
        sb.from('payments_view').select('id, client_id, num, plan_date, plan_sum, fact_sum, fact_date, is_paid, status, comment').order('plan_date', { ascending: true }),
        sb.from('users').select('id, name').eq('role', 'salesperson').eq('is_active', true).order('name'),
        sb.from('curators').select('id, name').eq('is_active', true).order('name'),
      )
    },
  },
  {
    name: '/admin/expenses',
    source: 'app/admin/expenses/page.tsx',
    run: async () => {
      await sb.from('users').select('name, role').limit(1)
      await all(
        sb.from('clients').select('id, name, country, status').order('created_at', { ascending: false }),
        sb.from('expenses').select('id, client_id, article, who, plan_date, plan_sum, fact_date, fact_sum, is_paid, status, note').order('created_at', { ascending: false }),
        sb.from('fixed_expenses').select('*').eq('is_active', true).order('created_at', { ascending: true }),
        sb.from('fixed_expense_records').select('*, fixed_expenses(name, article)').order('month', { ascending: false }),
      )
    },
  },
  {
    name: '/admin/funnel',
    source: 'app/admin/funnel/page.tsx',
    run: async () => {
      await sb.from('users').select('name, role').limit(1)
      await all(
        sb.from('pipeline_stages').select('*').eq('is_active', true).order('position'),
        sb.from('users').select('id, name').eq('role', 'salesperson').eq('is_active', true).order('name'),
        sb.from('deals').select('id, contact_name, contact_phone, budget, stage_id, deleted_at').not('deleted_at', 'is', null).order('deleted_at', { ascending: false }).limit(50),
        sb.from('deals').select('*', { count: 'exact', head: true }).is('deleted_at', null),
        sb.from('curators').select('id, name').eq('is_active', true).order('name'),
        readAll(() => sb.from('deals').select('id, title, custom_fields')
          .not('custom_fields->>group_chat_id', 'is', null).is('deleted_at', null).order('id')),
        // Сделки — одним постраничным чтением вместо двух запросов на этап
        readAll(() => sb.from('deals')
          .select('id, title, stage_id, salesperson_id, contact_name, contact_phone, contact_telegram, contact_email, contact_whatsapp, budget, source, created_at, updated_at')
          .is('deleted_at', null).order('updated_at', { ascending: false }).order('id', { ascending: false })),
      )
    },
  },
  {
    name: '/admin/sales',
    source: 'app/admin/sales/page.tsx',
    run: async () => {
      await sb.from('users').select('name, role').limit(1)
      await all(
        sb.from('users').select('id, name, email, is_active').eq('role', 'salesperson').order('name'),
        sb.from('clients').select('id, name, country, status, salesperson_id, created_at, months'),
        sb.from('payments_view').select('id, client_id, plan_sum, fact_sum, is_paid, status, plan_date, fact_date'),
        sb.from('bookings').select('id, salesperson_id, status, booking_date'),
        sb.from('sales_plans').select('month, salesperson_id, plan_amount'),
      )
    },
  },
  {
    name: '/admin/analytics',
    source: 'app/admin/analytics/page.tsx',
    run: async () => {
      await sb.from('users').select('name, role').limit(1)
      const { data: expenses } = await sb.from('expenses')
        .select('id, client_id, who, plan_sum, plan_date, note')
        .eq('article', 'curator').eq('is_paid', false).eq('note', 'Куратор — этап 2')
      const ids = [...new Set((expenses ?? []).map((e: any) => e.client_id))]
      await all(
        ids.length
          ? sb.from('clients').select('id, name, country, curator_id, expected_offer_month, status').in('id', ids)
          : Promise.resolve({ data: [] }),
        sb.from('curators').select('id, name'),
      )
    },
  },
  {
    name: '/admin/invoices',
    source: 'app/admin/invoices/page.tsx',
    run: async () => {
      await sb.from('users').select('name, role').limit(1)
      await all(
        sb.from('invoices').select('id, client_id, amount, description, order_id, payment_id, payment_url, sbp_payload, status, created_by, created_at, clients(name), users:created_by(name)').order('created_at', { ascending: false }),
        sb.from('clients').select('id, name').neq('status', 'completed').order('name'),
      )
    },
  },
  {
    name: '/admin/calendar',
    source: 'app/admin/calendar/page.tsx',
    run: async () => {
      await sb.from('users').select('name, role').limit(1)
      await all(
        sb.from('clients').select('id, name, phone, country, status, salesperson_id, curator_id'),
        sb.from('users').select('id, name'),
        sb.from('curators').select('id, name'),
        sb.from('payments_view').select('id, client_id, num, plan_date, plan_sum, fact_sum, fact_date, is_paid, status, comment').order('plan_date', { ascending: true }),
        sb.from('users').select('id, name').eq('role', 'salesperson').eq('is_active', true).order('name'),
      )
    },
  },
  {
    name: '/admin/curators',
    source: 'app/admin/curators/page.tsx',
    run: async () => {
      await sb.from('users').select('name, role').limit(1)
      await all(
        sb.from('curators').select('id, name, contact, email, is_active, user_id, specializations, languages, max_clients, telegram_username, created_at').order('name'),
        sb.from('clients').select('id, curator_id, status').eq('status', 'active'),
        sb.from('users').select('id, email, role').eq('role', 'curator'),
      )
    },
  },
  {
    name: '/admin/settings',
    source: 'app/admin/settings/page.tsx',
    run: async () => {
      await sb.from('users').select('name, role').limit(1)
      await all(
        sb.from('users').select('id, name, email, is_active, telegram_username, created_at').eq('role', 'salesperson').order('created_at', { ascending: true }),
        sb.from('curators').select('id, name, email, user_id, is_active, created_at').order('created_at', { ascending: true }),
        sb.from('fixed_expenses').select('*').order('created_at', { ascending: true }),
        sb.from('bookings').select('id, salesperson_id, booking_date, start_time, end_time, client_name, client_phone, client_telegram, status, created_at').order('booking_date', { ascending: false }).limit(500),
        sb.from('sales_plans').select('month, salesperson_id, plan_amount'),
      )
    },
  },
  /* ── Экраны РОПа и продажника. В список из задания они не входили, но именно
     здесь нашлись самые тяжёлые таблицы: сообщения и действия по сделкам. ── */
  {
    name: '/rop',
    source: 'app/rop/page.tsx',
    run: async () => {
      await sb.from('users').select('name, role').limit(1)
      await all(
        sb.from('users').select('id, name, is_active').eq('role', 'salesperson').order('name'),
        sb.from('sales_plans').select('*'),
        sb.from('clients').select('id, name, salesperson_id, status'),
        readAll(() => sb.from('deals').select('id, title, stage_id, salesperson_id, source, budget, is_critical, custom_fields, created_at, updated_at, deleted_at').is('deleted_at', null).order('id')),
        sb.from('pipeline_stages').select('id, name, position, stage_type, color, weight').eq('is_active', true).order('position'),
        readAll(() => sb.from('deal_messages').select('id, deal_id, direction, created_at').order('created_at', { ascending: false }).order('id')),
        readAll(() => sb.from('deal_tasks').select('id, deal_id, title, deadline, is_done, assigned_to, task_type').eq('is_done', false).order('id')),
        sb.from('rop_settings').select('key, value'),
      )
    },
  },
  {
    name: '/rop/analytics',
    source: 'app/rop/analytics/page.tsx',
    run: async () => {
      await sb.from('users').select('name, role').limit(1)
      await all(
        sb.from('users').select('id, name, is_active').eq('role', 'salesperson').order('name'),
        readAll(() => sb.from('deals').select('id, title, stage_id, salesperson_id, source, lost_reason, created_at, closed_at, deleted_at').is('deleted_at', null).order('id')),
        sb.from('pipeline_stages').select('id, name, stage_type').eq('is_active', true).order('position'),
        readAll(() => sb.from('deal_activities').select('id, deal_id, activity_type, content, metadata, created_at').eq('activity_type', 'stage_change').order('id')),
      )
    },
  },
  {
    name: '/rop/response-times',
    source: 'app/rop/response-times/page.tsx',
    run: async () => {
      await sb.from('users').select('name, role').limit(1)
      await all(
        sb.from('users').select('id, name, is_active').eq('role', 'salesperson').order('name'),
        readAll(() => sb.from('deal_messages').select('id, deal_id, direction, created_at').order('created_at').order('id')),
        readAll(() => sb.from('deals').select('id, title, salesperson_id, stage_id, updated_at, deleted_at').is('deleted_at', null).order('id')),
        sb.from('pipeline_stages').select('id, name, stage_type').eq('is_active', true).order('position'),
        sb.from('rop_settings').select('key, value'),
      )
    },
  },
  {
    name: '/rop/conversions',
    source: 'app/rop/conversions/page.tsx',
    run: async () => {
      await sb.from('users').select('name, role').limit(1)
      await all(
        sb.from('users').select('id, name, is_active').eq('role', 'salesperson').order('name'),
        readAll(() => sb.from('deals').select('id, title, stage_id, salesperson_id, source, budget, created_at, updated_at, closed_at, lost_reason, deleted_at').is('deleted_at', null).order('id')),
        sb.from('pipeline_stages').select('id, name, stage_type, position').eq('is_active', true).order('position'),
        readAll(() => sb.from('deal_messages').select('deal_id').order('id')),
        readAll(() => sb.from('deal_activities').select('id, deal_id, activity_type, content, metadata, created_at').eq('activity_type', 'stage_change').order('id')),
      )
    },
  },
]

/* ── SEO-экраны: вызывают настоящий код, а не его копию ──────────────────── */

async function seoScreens(): Promise<Screen[]> {
  const { loadPageDays, trafficByPage } = await import('../lib/seo/gsc-agg')
  const { trafficSnapshot } = await import('../lib/seo/traffic-snapshot')
  const { flowSnapshot } = await import('../lib/seo/flow')

  const fetchAll = async (table: string, cols: string, apply?: (q: any) => any) => {
    const out: any[] = []
    for (let from = 0; ; from += 1000) {
      let q = seo.from(table).select(cols).range(from, from + 999)
      if (apply) q = apply(q)
      const { data } = await q
      out.push(...(data ?? []))
      if (!data || data.length < 1000) break
    }
    return out
  }

  return [
    {
      name: '/admin/seo',
      source: 'app/admin/seo/page.tsx',
      run: async () => {
        await all(
          trafficSnapshot(seo),
          seo.from('pages').select('id', { count: 'exact', head: true }).is('removed_at', null),
          fetchAll('findings', 'kind', (q: any) => q.eq('status', 'open')),
          fetchAll('opportunities', 'decision, risk, priority, forecast, evidence, status'),
          seo.from('experiments').select('id', { count: 'exact', head: true }),
          seo.from('page_schema').select('id', { count: 'exact', head: true }).eq('status', 'proposed'),
        )
      },
    },
    {
      name: '/admin/seo/articles',
      source: 'app/admin/seo/articles/page.tsx',
      run: async () => {
        const { data: articles } = await seo.from('articles')
          .select('id, topic_id, primary_keyword, status, current_version_id, published_at, created_at')
          .order('created_at', { ascending: false })
        const ids = (articles ?? []).map((a: any) => a.current_version_id).filter(Boolean)
        const articleIds = (articles ?? []).map((a: any) => a.id)
        await all(
          ids.length ? seo.from('article_versions').select('id, article_id, version_no, title, origin, qa_report, images:meta->images').in('id', ids) : Promise.resolve({ data: [] }),
          articleIds.length ? seo.from('article_versions').select('article_id').in('article_id', articleIds) : Promise.resolve({ data: [] }),
          seo.from('jobs').select('id, step, status, article_id, last_error, attempts, next_run_at').like('step', 'article_%').order('id', { ascending: false }).limit(40),
          seo.from('topics').select('id, title, primary_keyword, search_volume, priority, status').order('priority', { ascending: false, nullsFirst: false }).limit(10),
          flowSnapshot(seo),
        )
      },
    },
    {
      name: '/admin/seo/pages',
      source: 'app/admin/seo/pages/page.tsx',
      run: async () => {
        await all(
          fetchAll('pages', 'id, normalized_url, page_type, http_status, indexable, title, word_count, cluster', (q: any) => q.is('removed_at', null)),
          readAll(() => seo.from('jobs').select('status').in('step', ['inventory_sitemap', 'crawl_page']).order('id')),
          trafficSnapshot(seo),
          fetchAll('findings', 'page_ids', (q: any) => q.eq('status', 'open')),
        )
      },
    },
    {
      name: '/admin/seo/effect',
      source: 'app/admin/seo/effect/page.tsx',
      run: async () => {
        const since28 = new Date(Date.now() - 28 * 864e5).toISOString().slice(0, 10)
        const { data: articles } = await seo.from('articles')
          .select('id, primary_keyword, published_at, current_version_id').eq('status', 'published').order('published_at')
        const versionIds = (articles ?? []).map((a: any) => a.current_version_id).filter(Boolean)
        const earliestPub = (articles ?? []).map((a: any) => a.published_at).filter(Boolean).sort()[0] ?? null
        const since = earliestPub && earliestPub.slice(0, 10) < since28 ? earliestPub.slice(0, 10) : since28
        await all(
          versionIds.length
            ? seo.from('article_versions')
                .select('id, slug_pub:meta->publish->>slug, slug_flat:meta->>slug, verdict:meta->index_check->>verdict, crawl:meta->index_check->>last_crawl')
                .in('id', versionIds)
            : Promise.resolve({ data: [] }),
          seo.from('pages').select('id, normalized_url, title, first_seen_at, indexable, removed_at').like('normalized_url', '%/blog/%'),
          seo.from('lead_identities').select('first_touch_page, deal_id, lead_at').not('first_touch_page', 'is', null),
          loadPageDays(seo, { since }),
          seo.from('index_status').select('page_id, first_indexed_at'),
        )
      },
    },
    {
      name: '/admin/seo/indexation?google',
      source: 'app/admin/seo/indexation/page.tsx',
      run: async () => {
        const since = new Date(Date.now() - 28 * 864e5).toISOString().slice(0, 10)
        const [, , { data: articles }] = await all(
          seo.from('pages').select('id, normalized_url, page_type, first_seen_at')
            .is('removed_at', null).eq('indexable', true).eq('http_status', 200),
          seo.from('index_status').select('page_id, verdict, coverage_state, last_crawl, checked_at, first_indexed_at'),
          seo.from('articles').select('id, published_at, indexed_at, primary_keyword, current_version_id')
            .eq('status', 'published').order('published_at', { ascending: false }),
          trafficByPage(seo, { since }),
          seo.from('settings').select('value').eq('key', 'yandex_snapshot').maybeSingle(),
        )
        const versionIds = (articles ?? []).map((a: any) => a.current_version_id).filter(Boolean)
        if (versionIds.length) {
          await seo.from('article_versions')
            .select('id, slug_pub:meta->publish->>slug, slug_flat:meta->>slug, verdict:meta->index_check->>verdict, coverage:meta->index_check->>coverage')
            .in('id', versionIds)
        }
      },
    },
    {
      name: '/admin/seo/indexation?yandex',
      source: 'app/admin/seo/indexation/page.tsx',
      run: async () => {
        await seo.from('settings').select('value').eq('key', 'yandex_snapshot').maybeSingle()
      },
    },
    {
      name: '/admin/seo/positions?google',
      source: 'app/admin/seo/positions/page.tsx',
      run: async () => {
        await seo.from('settings').select('value').eq('key', 'positions_snapshot').maybeSingle()
      },
    },
    {
      name: '/admin/seo/positions?yandex',
      source: 'app/admin/seo/positions/page.tsx',
      run: async () => {
        await all(
          seo.from('settings').select('value').eq('key', 'yandex_snapshot').maybeSingle(),
          seo.from('settings').select('value').eq('key', 'yandex_snapshot_prev').maybeSingle(),
        )
      },
    },
    {
      name: '/admin/seo/topics',
      source: 'app/admin/seo/topics/page.tsx',
      run: async () => {
        await seo.from('topics').select('id, title, primary_keyword, cluster, search_volume, business_value, priority, status, origin, created_at')
          .order('created_at', { ascending: false }).limit(500)
      },
    },
    {
      name: '/admin/seo/clusters',
      source: 'app/admin/seo/clusters/page.tsx',
      run: async () => {
        await fetchAll('pages', 'id, normalized_url, title, cluster, page_type, word_count', (q: any) => q.is('removed_at', null))
      },
    },
    {
      name: '/admin/seo/findings',
      source: 'app/admin/seo/findings/page.tsx',
      run: async () => {
        await seo.from('findings').select('id, kind, confidence, page_ids, evidence, status').eq('status', 'open').order('kind').limit(2000)
      },
    },
    {
      name: '/admin/seo/opportunities',
      source: 'app/admin/seo/opportunities/page.tsx',
      run: async () => {
        await seo.from('opportunities').select('id, page_id, query, decision, risk, priority, forecast, evidence, status')
          .order('priority', { ascending: false }).limit(1000)
      },
    },
    {
      name: '/admin/seo/schema',
      source: 'app/admin/seo/schema/page.tsx',
      run: async () => {
        const { data } = await seo.from('page_schema').select('id, page_id, schema_type, jsonld, status').eq('status', 'proposed').limit(500)
        const ids = [...new Set((data ?? []).map((r: any) => r.page_id))]
        for (let i = 0; i < ids.length; i += 300) {
          await seo.from('pages').select('id, normalized_url').in('id', ids.slice(i, i + 300))
        }
      },
    },
    {
      name: '/admin/seo/experiments',
      source: 'app/admin/seo/experiments/page.tsx',
      run: async () => {
        await seo.from('experiments').select('id, page_id, hypothesis, change_type, status, started_at, ended_at, result')
          .order('started_at', { ascending: false }).limit(200)
      },
    },
  ]
}

/* ── Шаги воркера: замеряем только чтение, ничего не меняя ───────────────── */

type Step = { name: string; source: string; run: () => Promise<void> }

async function workerSteps(): Promise<Step[]> {
  const { loadPageDays } = await import('../lib/seo/gsc-agg')
  const { loadQueryDays } = await import('../lib/seo/positions')
  const { loadQueryRows, loadPageTypes } = await import('../lib/seo/cannibal')
  const { metaByVersion } = await import('../lib/seo/article-meta')
  const { fetchAll } = await import('../lib/seo/steps-article')
  const { loadSiteTargets } = await import('../lib/seo/blog-style')
  const { loadClaims } = await import('../lib/seo/claims')

  // Образец статьи и версии — их читают почти все шаги статьи
  const sample = async () => {
    const { data: a } = await seo.from('articles').select('id, current_version_id, topic_id, status')
      .not('current_version_id', 'is', null).limit(1).maybeSingle()
    return a
  }
  const readVersion = async (cols: string) => {
    const a = await sample()
    if (!a?.current_version_id) return
    await seo.from('article_versions').select(cols).eq('id', a.current_version_id).maybeSingle()
  }

  return [
    /* ── Производство статьи ─────────────────────────────────────────────── */
    { name: 'article_brief', source: 'lib/seo/steps-article.ts', run: async () => {
      const a = await sample()
      await seo.from('topics').select('id,title,primary_keyword,cluster').eq('id', a?.topic_id ?? 0).maybeSingle()
      await seo.from('articles').select('id, primary_keyword').neq('status', 'rejected')
      // buildContext: запросная статистика целиком плюс страницы с векторами
      await fetchAll(seo, 'gsc_daily', 'query,clicks,impressions,position')
      await fetchAll(seo, 'pages', 'id,url,normalized_url,title,page_type,embedding',
        (q: any) => q.is('removed_at', null).not('embedding', 'is', null))
    } },
    { name: 'article_draft', source: 'lib/seo/steps-article.ts', run: async () => {
      await readVersion('id,version_no,body,meta')
      await all(loadSiteTargets(seo), loadClaims(seo, ['goandstudy']))
    } },
    { name: 'article_qa', source: 'lib/seo/steps-article.ts', run: async () => {
      await readVersion('id,version_no,body,meta')
      await loadSiteTargets(seo)
    } },
    { name: 'article_cover', source: 'lib/seo/steps-article.ts', run: async () => {
      await readVersion('id, title, body, meta')
    } },
    { name: 'article_linkplan', source: 'lib/seo/steps-article.ts', run: async () => {
      await fetchAll(seo, 'pages', 'id,url,normalized_url,title,embedding,h1,meta_desc',
        (q: any) => q.is('removed_at', null).not('embedding', 'is', null))
    } },
    { name: 'article_publish_blog', source: 'lib/seo/steps-article.ts', run: async () => {
      await readVersion('id, title, body, meta')
    } },
    { name: 'article_verify', source: 'lib/seo/steps-article.ts', run: async () => {
      await readVersion('title, body, meta')
    } },
    { name: 'article_fix', source: 'lib/seo/steps-article.ts', run: async () => {
      const a = await sample()
      await seo.from('article_versions').select('id, title, body, meta, qa_report').eq('id', a?.current_version_id ?? 0).maybeSingle()
      await seo.from('topics').select('id,title,primary_keyword,cluster').eq('id', a?.topic_id ?? 0).maybeSingle()
      await loadSiteTargets(seo)
    } },

    /* ── Наблюдение и самостоятельная работа ─────────────────────────────── */
    { name: 'article_index_check', source: 'lib/seo/steps-article.ts', run: async () => {
      const { data: articles } = await seo.from('articles')
        .select('id, current_version_id, indexed_at').eq('status', 'published').order('id')
      await metaByVersion(seo, (articles ?? []).map((a: any) => a.current_version_id))
    } },
    { name: 'index_check_site', source: 'lib/seo/steps-article.ts', run: async () => {
      await all(
        seo.from('pages').select('id, normalized_url').is('removed_at', null).eq('indexable', true).eq('http_status', 200),
        seo.from('index_status').select('page_id, checked_at'),
      )
    } },
    { name: 'article_autostart', source: 'lib/seo/steps-article.ts', run: async () => {
      await all(loadQueryRows(seo, 90), loadPageTypes(seo))
    } },
    { name: 'article_autopublish', source: 'lib/seo/steps-article.ts', run: async () => {
      const { data: cands } = await seo.from('articles')
        .select('id, current_version_id, status').eq('status', 'ready_for_review')
      const ids = (cands ?? []).map((c: any) => c.current_version_id).filter(Boolean)
      if (ids.length) await seo.from('article_versions').select('id, title, body, meta, qa_report').in('id', ids)
      await loadSiteTargets(seo)
    } },
    { name: 'article_update_plan', source: 'lib/seo/steps-article.ts', run: async () => { await loadPageDays(seo) } },
    { name: 'positions_snapshot', source: 'lib/seo/steps-article.ts', run: async () => {
      const { data: arts } = await seo.from('articles').select('current_version_id').eq('status', 'published')
      await metaByVersion(seo, (arts ?? []).map((a: any) => a.current_version_id))
      await loadQueryDays(seo, 21)
    } },
    { name: 'yandex_sync', source: 'lib/seo/steps-article.ts', run: async () => {
      const { data: arts } = await seo.from('articles')
        .select('id, primary_keyword, current_version_id, published_at').eq('status', 'published')
      await metaByVersion(seo, (arts ?? []).map((a: any) => a.current_version_id))
      await all(
        seo.from('pages').select('id, normalized_url').is('removed_at', null),
        seo.from('settings').select('value').eq('key', 'yandex_snapshot').maybeSingle(),
      )
    } },
    { name: 'topics_from_gsc', source: 'lib/seo/steps-article.ts', run: async () => {
      await fetchAll(seo, 'gsc_daily', 'normalized_url,query,clicks,impressions,position')
      await fetchAll(seo, 'topics', 'title,primary_keyword')
    } },
    { name: 'attribution_stitch', source: 'lib/seo/attribution.ts', run: async () => {
      const { data: unmatched } = await seo.from('lead_identities')
        .select('id, external_lead_id').is('deal_id', null).eq('lead_source', 'book').limit(500)
      const ids = (unmatched ?? []).map((l: any) => l.external_lead_id)
      if (ids.length) await sb.from('deals').select('id, booking_id, client_id').in('booking_id', ids)
    } },
    { name: 'alerts_check', source: 'lib/seo/alerts.ts', run: async () => {
      await all(
        seo.from('jobs').select('id, step, status, attempts, last_error, locked_at, next_run_at').in('status', ['failed', 'running']),
        seo.from('articles').select('id, status').eq('status', 'ready_for_review'),
      )
    } },
    { name: 'gsc_import (чтение)', source: 'lib/seo/steps.ts', run: async () => {
      await all(
        seo.from('gsc_daily').select('date').order('date', { ascending: false }).limit(1),
        seo.from('gsc_page_daily').select('date').order('date', { ascending: false }).limit(1),
      )
    } },
    { name: 'traffic_snapshot', source: 'lib/seo/traffic-snapshot.ts', run: async () => { await loadPageDays(seo) } },
  ]
}

/* ── Прогон и отчёт ──────────────────────────────────────────────────────── */

const ms = (n: number) => `${Math.round(n)}`.padStart(5) + ' мс'

type Result = {
  name: string
  source: string
  total: number
  calls: Call[]
  slowest: Call | null
  truncated: Call[]
}

async function measure(name: string, source: string, run: () => Promise<void>, runs: number): Promise<Result> {
  let best: { total: number; calls: Call[] } | null = null
  for (let i = 0; i < runs; i++) {
    log = []
    capturing = true
    const t0 = performance.now()
    try {
      await run()
    } catch (e: any) {
      capturing = false
      console.log(`  ✗ ${name}: ${e?.message ?? e}`)
      return { name, source, total: -1, calls: [], slowest: null, truncated: [] }
    }
    const total = performance.now() - t0
    capturing = false
    if (!best || total < best.total) best = { total, calls: log.slice() }
  }
  const calls = best!.calls
  const slowest = calls.length ? calls.reduce((a, b) => (b.ms > a.ms ? b : a)) : null
  // Обрезка — это выдача ровно в тысячу строк там, где диапазон не запрашивали.
  // Запросы-счётчики (HEAD) сюда не относятся: они и не должны отдавать строки.
  const truncated = calls.filter((c) => !c.head && c.rows === 1000 && !c.ranged)
  return { name, source, total: best!.total, calls, slowest, truncated }
}

async function main() {
  const argv = process.argv.slice(2)
  const only = argv.includes('--only') ? argv[argv.indexOf('--only') + 1] : null
  const runs = argv.includes('--runs') ? Math.max(1, Number(argv[argv.indexOf('--runs') + 1])) : 2
  const jsonOut = argv.includes('--json') ? argv[argv.indexOf('--json') + 1] : null
  const diffWith = argv.includes('--diff') ? argv[argv.indexOf('--diff') + 1] : null
  const stepsMode = argv.includes('--steps')
  const verbose = argv.includes('--verbose')

  const targets: { name: string; source: string; run: () => Promise<void> }[] = stepsMode
    ? await workerSteps()
    : [...SCREENS, ...(await seoScreens())]

  const list = only ? targets.filter((t) => t.name.includes(only)) : targets

  console.log(`\n${stepsMode ? 'ШАГИ ВОРКЕРА' : 'ЭКРАНЫ'} · лучшее из ${runs} прогонов · ${new Date().toLocaleString('ru-RU')}`)
  console.log('─'.repeat(78))

  const results: Result[] = []
  for (const t of list) {
    const r = await measure(t.name, t.source, t.run, runs)
    results.push(r)
    if (r.total < 0) continue

    const limit = stepsMode ? 3000 : 700
    const mark = r.total > limit ? '✗' : r.total > limit * 0.7 ? '·' : '✓'
    console.log(`${mark} ${r.name.padEnd(34)} ${ms(r.total)}   запросов: ${String(r.calls.length).padStart(3)}`)

    if (verbose) {
      for (const c of r.calls.sort((a, b) => b.ms - a.ms)) {
        console.log(`      ${c.table.padEnd(18)} ${ms(c.ms)}  строк: ${String(c.rows ?? '—').padStart(5)}`
          + `${c.total !== null ? ` из ${c.total}` : ''}  ${c.detail}`)
      }
    }
    const slow = verbose ? [] : r.calls.filter((c) => c.ms > 200).sort((a, b) => b.ms - a.ms)
    for (const c of slow.slice(0, 4)) {
      console.log(`      медленный: ${c.table.padEnd(18)} ${ms(c.ms)}  строк: ${String(c.rows ?? '—').padStart(5)}  ${c.detail}`)
    }
    for (const c of r.truncated) {
      console.log(`      ⚠ обрезано на тысяче строк: ${c.table}  ${c.detail}`)
    }
  }

  console.log('─'.repeat(78))
  const ok = results.filter((r) => r.total >= 0)
  const over = ok.filter((r) => r.total > (stepsMode ? 3000 : 700))
  const slowQ = ok.flatMap((r) => r.calls.filter((c) => c.ms > 200).map((c) => ({ screen: r.name, ...c })))
  const trunc = ok.flatMap((r) => r.truncated.map((c) => ({ screen: r.name, ...c })))

  console.log(`итого: ${ok.length} проверено · дольше нормы: ${over.length} · запросов дольше 200 мс: ${slowQ.length} · молча обрезано: ${trunc.length}`)
  if (over.length) console.log(`не укладываются: ${over.map((r) => `${r.name} (${Math.round(r.total)} мс)`).join(', ')}`)

  if (diffWith && fs.existsSync(diffWith)) {
    const was: Result[] = JSON.parse(fs.readFileSync(diffWith, 'utf8'))
    console.log('\nСРАВНЕНИЕ С ПРОШЛЫМ ЗАМЕРОМ')
    console.log('─'.repeat(78))
    for (const r of ok) {
      const w = was.find((x) => x.name === r.name)
      if (!w || w.total < 0) continue
      const d = r.total - w.total
      const pct = w.total > 0 ? Math.round((d / w.total) * 100) : 0
      const arrow = d < -30 ? '↓' : d > 30 ? '↑' : '='
      console.log(`${arrow} ${r.name.padEnd(34)} ${ms(w.total)} → ${ms(r.total)}  ${pct > 0 ? '+' : ''}${pct}%`)
    }
  }

  if (jsonOut) {
    fs.writeFileSync(jsonOut, JSON.stringify(results, null, 2))
    console.log(`\nзамер сохранён: ${jsonOut}`)
  }
  console.log()
}

main().catch((e) => { console.error('✗', e?.message ?? e); process.exit(1) })
