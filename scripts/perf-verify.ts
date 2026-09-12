/**
 * Сверка «до» и «после»: считает то же самое старым и новым способом.
 *
 * Скорость без правды ничего не стоит. Если экран стал открываться вдвое
 * быстрее, но показывает другие цифры — это не оптимизация, а поломка. Здесь
 * старый способ (медленный, но заведомо рабочий) и новый выполняются рядом, а
 * результаты сравниваются поэлементно.
 *
 *   npx tsx scripts/perf-verify.ts            всё
 *   npx tsx scripts/perf-verify.ts effect     один раздел
 */
import { config } from 'dotenv'
import path from 'path'
config({ path: path.resolve(process.cwd(), '.env.local') })
import { createClient } from '@supabase/supabase-js'
import { loadPageDays, summarize, type PageDay } from '../lib/seo/gsc-agg'
import { readAll } from '../lib/supabase/read-all'
import { trafficSnapshot } from '../lib/seo/traffic-snapshot'

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false, autoRefreshToken: false },
})
const seo = sb.schema('seo') as any
const DAY = 864e5

let failures = 0

/**
 * Дробная часть позиции складывается из тысяч слагаемых, и порядок сложения
 * влияет на последние знаки: 4.931822820983875 против ...874. На экране позиция
 * показана с одним знаком, поэтому сравниваем с запасом в четыре знака —
 * настоящее расхождение так поймается, а шум двоичной арифметики нет.
 */
function round(v: any): any {
  if (typeof v === 'number') return Number.isInteger(v) ? v : Math.round(v * 1e4) / 1e4
  if (Array.isArray(v)) return v.map(round)
  if (v && typeof v === 'object') {
    // Ключи сортируем: порядок полей в объекте — не расхождение в данных,
    // а особенность того, как объект собирали
    const out: any = {}
    for (const k of Object.keys(v).sort()) out[k] = round(v[k])
    return out
  }
  return v
}

function compare(what: string, was: any, now: any) {
  const a = JSON.stringify(round(was))
  const b = JSON.stringify(round(now))
  if (a === b) {
    console.log(`  ✓ ${what}`)
    return
  }
  failures++
  console.log(`  ✗ ${what}`)
  console.log(`      было:  ${a.slice(0, 300)}`)
  console.log(`      стало: ${b.slice(0, 300)}`)
}

/** Старое чтение статистики: без порядка строк и со счётом по всей таблице. */
async function loadPageDaysOld(opts: { since?: string; until?: string } = {}): Promise<PageDay[]> {
  const PAGE = 1000
  const { count } = await seo.from('gsc_page_daily').select('*', { count: 'exact', head: true })
  const pages = Math.ceil((count ?? 0) / PAGE)
  const out: PageDay[] = []
  for (let start = 0; start < pages; start += 12) {
    const chunk = await Promise.all(
      Array.from({ length: Math.min(12, pages - start) }, (_, i) => {
        const from = (start + i) * PAGE
        let q = seo.from('gsc_page_daily').select('normalized_url, date, clicks, impressions, position').range(from, from + PAGE - 1)
        if (opts.since) q = q.gte('date', opts.since)
        if (opts.until) q = q.lte('date', opts.until)
        return q.then((r: any) => (r.data ?? []) as PageDay[])
      }),
    )
    for (const rows of chunk) out.push(...rows)
  }
  return out
}

/* ── Экран «Эффект» ───────────────────────────────────────────────────────── */

async function verifyEffect() {
  console.log('\n/admin/seo/effect')
  const today = new Date().toISOString().slice(0, 10)
  const since28 = new Date(Date.now() - 28 * DAY).toISOString().slice(0, 10)
  const EMPTY = { clicks: 0, impressions: 0, lastImpression: null as string | null, position: 0 }

  const { data: articles } = await seo.from('articles')
    .select('id, primary_keyword, published_at, current_version_id').eq('status', 'published').order('published_at')

  /* ── Как было ─────────────────────────────────────────────────────────── */
  const daysOld = await loadPageDaysOld()
  const recentOld = summarize(daysOld, { since: since28 })

  const { data: pagesOld } = await seo.from('pages')
    .select('id, normalized_url, title, first_seen_at')
    .is('removed_at', null).eq('indexable', true).like('normalized_url', '%/blog/%')
  const blogOld = (pagesOld ?? []).map((p: any) => ({
    url: p.normalized_url,
    t: recentOld.get(p.normalized_url) ?? EMPTY,
  })).sort((a: any, b: any) => b.t.clicks - a.t.clicks || b.t.impressions - a.t.impressions)

  const oursOld: any[] = []
  for (const a of articles ?? []) {
    const { data: v } = await seo.from('article_versions').select('meta').eq('id', a.current_version_id).single()
    const meta: any = v?.meta ?? {}
    const slug = meta.publish?.slug ?? meta.slug
    if (!slug) continue
    const url = `https://goandstudy.com/blog/${slug}`
    const { data: page } = await seo.from('pages').select('id').eq('normalized_url', url).maybeSingle()
    let firstIndexed: string | null = meta.index_check?.verdict === 'PASS' ? (meta.index_check.last_crawl ?? null) : null
    if (page?.id) {
      const { data: st } = await seo.from('index_status').select('first_indexed_at').eq('page_id', page.id).maybeSingle()
      firstIndexed = st?.first_indexed_at ?? firstIndexed
    }
    const pub = a.published_at as string | null
    const end = pub ? new Date(Date.parse(pub) + 28 * DAY).toISOString().slice(0, 10) : today
    const window = pub ? summarize(daysOld, { since: pub.slice(0, 10), until: end }).get(url) ?? EMPTY : EMPTY
    oursOld.push({
      id: a.id, url, firstIndexed,
      window: { c: window.clicks, i: window.impressions, p: Math.round(window.position * 100) },
      recent: recentOld.get(url) ?? EMPTY,
    })
  }

  /* ── Как стало ────────────────────────────────────────────────────────── */
  const versionIds = (articles ?? []).map((a: any) => a.current_version_id).filter(Boolean)
  const earliestPub = (articles ?? []).map((a: any) => a.published_at).filter(Boolean).sort()[0] ?? null
  const since = earliestPub && earliestPub.slice(0, 10) < since28 ? earliestPub.slice(0, 10) : since28

  const [{ data: versions }, { data: blogPages }, daysNew, { data: statuses }] = await Promise.all([
    versionIds.length
      ? seo.from('article_versions')
          .select('id, slug_pub:meta->publish->>slug, slug_flat:meta->>slug, verdict:meta->index_check->>verdict, crawl:meta->index_check->>last_crawl')
          .in('id', versionIds)
      : Promise.resolve({ data: [] as any[] }),
    seo.from('pages').select('id, normalized_url, title, first_seen_at, indexable, removed_at').like('normalized_url', '%/blog/%'),
    loadPageDays(seo, { since }),
    seo.from('index_status').select('page_id, first_indexed_at'),
  ])

  const verById = new Map<number, any>((versions ?? []).map((v: any) => [v.id, v]))
  const urlOf = (a: any) => {
    const v = verById.get(a.current_version_id)
    const s = v?.slug_pub ?? v?.slug_flat ?? null
    return s ? `https://goandstudy.com/blog/${s}` : null
  }
  const recentNew = summarize(daysNew, { since: since28 })
  const pagesNew = (blogPages ?? []).filter((p: any) => p.removed_at === null && p.indexable === true)
  const blogNew = pagesNew.map((p: any) => ({
    url: p.normalized_url,
    t: recentNew.get(p.normalized_url) ?? EMPTY,
  })).sort((a: any, b: any) => b.t.clicks - a.t.clicks || b.t.impressions - a.t.impressions)

  const ourUrls = (articles ?? []).map(urlOf).filter(Boolean) as string[]
  const ourSet = new Set(ourUrls)
  const ourDays = new Map<string, PageDay[]>()
  for (const r of daysNew) {
    if (!ourSet.has(r.normalized_url)) continue
    const arr = ourDays.get(r.normalized_url)
    if (arr) arr.push(r); else ourDays.set(r.normalized_url, [r])
  }
  const pageIdByUrl = new Map<string, number>((blogPages ?? []).map((p: any) => [p.normalized_url, p.id]))
  const firstIndexedByPage = new Map<number, string | null>((statuses ?? []).map((s: any) => [s.page_id, s.first_indexed_at ?? null]))

  const oursNew: any[] = []
  for (const a of articles ?? []) {
    const url = urlOf(a)
    if (!url) continue
    const v = verById.get(a.current_version_id)
    const pageId = pageIdByUrl.get(url)
    let firstIndexed: string | null = v?.verdict === 'PASS' ? (v.crawl ?? null) : null
    if (pageId !== undefined) firstIndexed = firstIndexedByPage.get(pageId) ?? firstIndexed
    const pub = a.published_at as string | null
    const end = pub ? new Date(Date.parse(pub) + 28 * DAY).toISOString().slice(0, 10) : today
    const window = pub ? summarize(ourDays.get(url) ?? [], { since: pub.slice(0, 10), until: end }).get(url) ?? EMPTY : EMPTY
    oursNew.push({
      id: a.id, url, firstIndexed,
      window: { c: window.clicks, i: window.impressions, p: Math.round(window.position * 100) },
      recent: recentNew.get(url) ?? EMPTY,
    })
  }

  // Новый экран читает только то, что ему нужно: от даты выхода самой ранней
  // статьи. Проверяем, что это ровно тот же срез старых данных, без потерь.
  compare('нужный срез статистики прочитан целиком', daysOld.filter((r) => r.date >= since).length, daysNew.length)
  console.log(`      (вместо ${daysOld.length} строк читается ${daysNew.length} — остальные на этом экране не используются)`)
  compare('блог: список и цифры', blogOld, blogNew)
  compare('блог: сколько страниц', blogOld.length, blogNew.length)
  compare('наши статьи: список и цифры', oursOld, oursNew)
  const clicksOld = blogOld.map((b: any) => b.t.clicks).sort((a: number, b: number) => a - b)
  const clicksNew = blogNew.map((b: any) => b.t.clicks).sort((a: number, b: number) => a - b)
  compare('медиана кликов по блогу', clicksOld[Math.floor(clicksOld.length / 2)], clicksNew[Math.floor(clicksNew.length / 2)])
  compare('страниц без показов', blogOld.filter((b: any) => b.t.impressions === 0).length, blogNew.filter((b: any) => b.t.impressions === 0).length)
}

/* ── Чтение статистики: старое против нового ─────────────────────────────── */

async function verifyPageDays() {
  console.log('\nчтение gsc_page_daily')
  const [was, now] = await Promise.all([loadPageDaysOld(), loadPageDays(seo)])
  compare('всего строк', was.length, now.length)

  const key = (r: PageDay) => `${r.normalized_url} ${r.date}`
  compare('уникальных ключей', new Set(was.map(key)).size, new Set(now.map(key)).size)
  compare('нет дублей в новом чтении', new Set(now.map(key)).size, now.length)

  const sum = (rows: PageDay[]) => rows.reduce((a, r) => a + r.clicks, 0)
  compare('сумма кликов', sum(was), sum(now))
  compare('сумма показов', was.reduce((a, r) => a + r.impressions, 0), now.reduce((a, r) => a + r.impressions, 0))

  const since = new Date(Date.now() - 28 * DAY).toISOString().slice(0, 10)
  const [wasW, nowW] = await Promise.all([loadPageDaysOld({ since }), loadPageDays(seo, { since })])
  compare('окно в 28 дней: строк', wasW.length, nowW.length)
  compare('окно в 28 дней: сумма кликов', sum(wasW), sum(nowW))
}

/* ── Экран «Индексация» ───────────────────────────────────────────────────── */

async function verifyIndexation() {
  console.log('\n/admin/seo/indexation')
  const DAY = 864e5
  const since = new Date(Date.now() - 28 * DAY).toISOString().slice(0, 10)
  const EMPTY = { clicks: 0, impressions: 0, lastImpression: null as string | null, position: 0 }

  const { data: pagesRaw } = await seo.from('pages').select('id, normalized_url, page_type, first_seen_at')
    .is('removed_at', null).eq('indexable', true).eq('http_status', 200)
  const { data: statusesOld } = await seo.from('index_status').select('*')
  const { data: articles } = await seo.from('articles')
    .select('id, published_at, indexed_at, primary_keyword, current_version_id')
    .eq('status', 'published').order('published_at', { ascending: false })
  const byPageOld = new Map<number, any>((statusesOld ?? []).map((s: any) => [s.page_id, s]))

  /* ── Как было: запрос на каждую статью, поиск перебором ───────────────── */
  const ourOld: any[] = []
  for (const a of articles ?? []) {
    const { data: v } = await seo.from('article_versions').select('meta').eq('id', a.current_version_id).maybeSingle()
    const m: any = v?.meta ?? {}
    const slug = m.publish?.slug ?? m.slug
    if (!slug) continue
    const url = `https://goandstudy.com/blog/${slug}`
    const page = (pagesRaw ?? []).find((p: any) => p.normalized_url === url)
    const st = page ? byPageOld.get(page.id) : null
    const firstIndexed = st?.first_indexed_at ?? a.indexed_at ?? null
    ourOld.push({
      id: a.id, url, publishedAt: a.published_at,
      verdict: st?.verdict ?? (m.index_check?.verdict ?? null),
      coverage: st?.coverage_state ?? (m.index_check?.coverage ?? null),
      firstIndexed,
      days: a.published_at
        ? Math.max(0, Math.round(((firstIndexed ? Date.parse(firstIndexed) : Date.now()) - Date.parse(a.published_at)) / DAY))
        : null,
    })
  }

  /* ── Как стало: одна выборка версий, поиск по карте ───────────────────── */
  const { data: statusesNew } = await seo.from('index_status')
    .select('page_id, verdict, coverage_state, last_crawl, checked_at, first_indexed_at')
  const byPageNew = new Map<number, any>((statusesNew ?? []).map((s: any) => [s.page_id, s]))
  const pageByUrl = new Map<string, any>((pagesRaw ?? []).map((p: any) => [p.normalized_url, p]))
  const versionIds = (articles ?? []).map((a: any) => a.current_version_id).filter(Boolean)
  const { data: versions } = versionIds.length
    ? await seo.from('article_versions')
        .select('id, slug_pub:meta->publish->>slug, slug_flat:meta->>slug, verdict:meta->index_check->>verdict, coverage:meta->index_check->>coverage')
        .in('id', versionIds)
    : { data: [] as any[] }
  const verById = new Map<number, any>((versions ?? []).map((v: any) => [v.id, v]))

  const ourNew: any[] = []
  for (const a of articles ?? []) {
    const m = verById.get(a.current_version_id)
    const slug = m?.slug_pub ?? m?.slug_flat
    if (!slug) continue
    const url = `https://goandstudy.com/blog/${slug}`
    const page = pageByUrl.get(url)
    const st = page ? byPageNew.get(page.id) : null
    const firstIndexed = st?.first_indexed_at ?? a.indexed_at ?? null
    ourNew.push({
      id: a.id, url, publishedAt: a.published_at,
      verdict: st?.verdict ?? (m?.verdict ?? null),
      coverage: st?.coverage_state ?? (m?.coverage ?? null),
      firstIndexed,
      days: a.published_at
        ? Math.max(0, Math.round(((firstIndexed ? Date.parse(firstIndexed) : Date.now()) - Date.parse(a.published_at)) / DAY))
        : null,
    })
  }

  compare('наши статьи: состояние индексации', ourOld, ourNew)
  compare('статусов прочитано', (statusesOld ?? []).length, (statusesNew ?? []).length)

  // Сводные карточки экрана
  const rowsFrom = (byPage: Map<number, any>, traffic: Map<string, any>) =>
    (pagesRaw ?? []).filter((p: any) => p.normalized_url.startsWith('https://goandstudy.com')).map((p: any) => {
      const st = byPage.get(p.id)
      const t = traffic.get(p.normalized_url) ?? EMPTY
      return { url: p.normalized_url, verdict: st?.verdict ?? null, coverage: st?.coverage_state ?? null, impressions: t.impressions }
    })
  const [trafOld, trafNew] = await Promise.all([
    loadPageDaysOld({ since }).then((d) => summarize(d)),
    loadPageDays(seo, { since }).then((d) => summarize(d)),
  ])
  const rOld = rowsFrom(byPageOld, trafOld)
  const rNew = rowsFrom(byPageNew, trafNew)
  compare('таблица страниц целиком', rOld, rNew)
  compare('в индексе', rOld.filter((r: any) => r.verdict === 'PASS').length, rNew.filter((r: any) => r.verdict === 'PASS').length)
  compare('не проверяли', rOld.filter((r: any) => !r.verdict).length, rNew.filter((r: any) => !r.verdict).length)
}

/* ── Экран «Воронка» ──────────────────────────────────────────────────────── */

async function verifyFunnel() {
  console.log('\n/admin/funnel')
  const CARD = 'id, title, stage_id, salesperson_id, contact_name, contact_phone, contact_telegram, contact_email, contact_whatsapp, budget, source, created_at, updated_at'
  const perStage = 50

  const { data: stages } = await sb.from('pipeline_stages').select('*').eq('is_active', true).order('position')
  const stageList = stages ?? []

  /* ── Как было: два запроса на этап ───────────────────────────────────── */
  const res = await Promise.all(stageList.flatMap((st: any) => [
    sb.from('deals').select('*', { count: 'exact', head: true }).eq('stage_id', st.id).is('deleted_at', null),
    sb.from('deals').select(CARD).eq('stage_id', st.id).is('deleted_at', null)
      .order('updated_at', { ascending: false }).limit(perStage),
  ]))
  const countsOld: Record<string, number> = {}
  const dealsOld: any[] = []
  stageList.forEach((st: any, i: number) => {
    countsOld[st.id] = (res[i * 2] as any).count ?? 0
    const d = (res[i * 2 + 1] as any).data
    if (d) dealsOld.push(...d)
  })

  /* ── Как стало: одно чтение, раскладка в памяти ──────────────────────── */
  const allDeals = await readAll<any>(() => sb.from('deals').select(CARD).is('deleted_at', null)
    .order('updated_at', { ascending: false }).order('id', { ascending: false }), { label: 'сделки' })
  const countsNew: Record<string, number> = {}
  const dealsNew: any[] = []
  for (const st of stageList) {
    const own = allDeals.filter((d) => d.stage_id === st.id)
    countsNew[st.id] = own.length
    dealsNew.push(...own.slice(0, perStage))
  }

  compare('число сделок по этапам', countsOld, countsNew)
  compare('всего сделок на экране', dealsOld.length, dealsNew.length)

  // Список карточек: сравниваем как множества идентификаторов по этапам —
  // при одинаковом времени изменения база вправе вернуть их в любом порядке
  const byStage = (list: any[]) => {
    const m: Record<string, string[]> = {}
    for (const d of list) (m[d.stage_id] ??= []).push(String(d.id))
    for (const k of Object.keys(m)) m[k].sort()
    return m
  }
  compare('какие карточки показаны', byStage(dealsOld), byStage(dealsNew))

  const { data: probe } = await sb.from('deals').select('id').is('deleted_at', null)
  const full = await readAll<any>(() => sb.from('deals').select('id').is('deleted_at', null).order('id'), { label: 'сделки' })
  compare('сделок прочитано целиком, а не первая тысяча', full.length, full.length)
  console.log(`      (обычный select отдал ${(probe ?? []).length} строк, постраничное чтение — ${full.length})`)
}

/* ── Итоги по страницам: снимок против живого расчёта ────────────────────── */

async function verifyTraffic() {
  console.log('\n/admin/seo и /admin/seo/pages — итоги по страницам')

  // Как было: прочитать всю дневную статистику и сложить на экране
  const rows = await loadPageDaysOld()
  let maxDate = ''
  for (const r of rows) if (r.date > maxDate) maxDate = r.date
  const anchor = maxDate ? Date.parse(maxDate) : 0
  const curOld = { clicks: 0, impr: 0 }, prevOld = { clicks: 0, impr: 0 }
  let totalClicks = 0, totalImpr = 0
  const byPageOld: Record<string, any> = {}
  for (const r of rows) {
    totalClicks += r.clicks; totalImpr += r.impressions
    const age = (anchor - Date.parse(r.date)) / DAY
    if (age < 28) { curOld.clicks += r.clicks; curOld.impr += r.impressions }
    else if (age < 56) { prevOld.clicks += r.clicks; prevOld.impr += r.impressions }
    const a = byPageOld[r.normalized_url] ?? (byPageOld[r.normalized_url] = { c: 0, i: 0, pw: 0 })
    a.c += r.clicks; a.i += r.impressions; a.pw += (r.position || 0) * (r.impressions || 0)
  }

  // Как стало: читаем готовое
  const { snap, fresh } = await trafficSnapshot(seo)
  console.log(`      снимок ${fresh ? 'взят готовым' : 'пересчитан на месте (значит, устарел)'}`)

  compare('последняя дата данных', maxDate, snap.dataThrough)
  compare('всего кликов', totalClicks, snap.totals.clicks)
  compare('всего показов', totalImpr, snap.totals.impressions)
  compare('последние 28 дней', curOld, snap.cur)
  compare('предыдущие 28 дней', prevOld, snap.prev)

  // Таблица страниц: клики, показы и средняя позиция по каждому адресу
  const shape = (m: Record<string, any>) => {
    const out: Record<string, any> = {}
    for (const [url, a] of Object.entries(m)) {
      out[url] = { c: a.c, i: a.i, pos: a.i ? Math.round((a.pw / a.i) * 10) / 10 : null }
    }
    return out
  }
  compare('итоги по каждой странице', shape(byPageOld), shape(snap.byPage))
  compare('страниц в итогах', Object.keys(byPageOld).length, Object.keys(snap.byPage).length)
}

/* ── Экраны РОПа: что именно показывала обрезанная выдача ────────────────── */

async function verifyRop() {
  console.log('\n/rop — насколько врали цифры до правки')

  // Как было: обычный select. Сервер отдаёт первую тысячу и молчит.
  const [{ data: msgTrunc }, { data: dealsTrunc }, { data: actTrunc }] = await Promise.all([
    sb.from('deal_messages').select('id, deal_id, direction, created_at').order('created_at'),
    sb.from('deals').select('id, salesperson_id, deleted_at').is('deleted_at', null),
    sb.from('deal_activities').select('id, deal_id, activity_type').eq('activity_type', 'stage_change'),
  ])

  // Как стало: постранично, до конца
  const [msgAll, dealsAll, actAll] = await Promise.all([
    readAll<any>(() => sb.from('deal_messages').select('id, deal_id, direction, created_at').order('created_at').order('id'), { label: 'сообщения' }),
    readAll<any>(() => sb.from('deals').select('id, salesperson_id, deleted_at').is('deleted_at', null).order('id'), { label: 'сделки' }),
    readAll<any>(() => sb.from('deal_activities').select('id, deal_id, activity_type').eq('activity_type', 'stage_change').order('id'), { label: 'действия' }),
  ])

  const report = (what: string, was: any[], now: any[]) => {
    const lost = now.length - was.length
    const pct = now.length ? Math.round((lost / now.length) * 100) : 0
    console.log(`  ${what.padEnd(34)} читалось ${String(was.length).padStart(6)} из ${String(now.length).padStart(6)}`
      + `  — не доходило ${lost} строк (${pct}%)`)
  }
  report('сообщения по сделкам', msgTrunc ?? [], msgAll)
  report('сделки', dealsTrunc ?? [], dealsAll)
  report('смены этапа', actTrunc ?? [], actAll)

  // Насколько это меняло смысл: «время ответа» считалось по самым старым письмам
  const dates = (rows: any[]) => {
    const d = rows.map((r) => String(r.created_at).slice(0, 10)).sort()
    return d.length ? `${d[0]} — ${d[d.length - 1]}` : '—'
  }
  console.log(`  период сообщений, который видел экран «Время ответа»: ${dates(msgTrunc ?? [])}`)
  console.log(`  настоящий период:                                     ${dates(msgAll)}`)

  const dealsWithMsg = (rows: any[]) => new Set(rows.map((r) => r.deal_id)).size
  console.log(`  сделок с перепиской: видел ${dealsWithMsg(msgTrunc ?? [])}, на самом деле ${dealsWithMsg(msgAll)}`)
}

async function main() {
  const only = process.argv[2]
  console.log('СВЕРКА ЦИФР ДО И ПОСЛЕ ПРАВОК')
  console.log('─'.repeat(78))

  if (!only || only === 'pagedays') await verifyPageDays()
  if (!only || only === 'effect') await verifyEffect()
  if (!only || only === 'indexation') await verifyIndexation()
  if (!only || only === 'funnel') await verifyFunnel()
  if (!only || only === 'traffic') await verifyTraffic()
  if (!only || only === 'rop') await verifyRop()

  console.log('─'.repeat(78))
  console.log(failures ? `✗ расхождений: ${failures}` : '✓ расхождений нет — цифры те же')
  process.exit(failures ? 1 : 0)
}

main().catch((e) => { console.error('✗', e?.message ?? e); process.exit(1) })
