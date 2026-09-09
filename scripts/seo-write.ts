// Урезанный конвейер производства: одна тема → одна статья-черновик.
//
//   npx tsx scripts/seo-write.ts --query "высшее образование в австрии"
//   npx tsx scripts/seo-write.ts --topic 51
//   npx tsx scripts/seo-write.ts --query "..." --dry     # только бриф, без статьи
//   npx tsx scripts/seo-write.ts --query "..." --context # только контекст, без модели
//   npx tsx scripts/seo-write.ts --query "..." --publish # + черновик в WordPress (§12)
//
// Пишет seo.articles + seo.article_versions и кладёт HTML в out/seo/. В WordPress
// НЕ публикует: сначала человек читает. Публикация — отдельный шаг (seo-wp-test.ts
// показывает, что мост умеет создавать черновики).
import { config } from 'dotenv'; import path from 'path'; import fs from 'fs'
import { createClient } from '@supabase/supabase-js'
import { getAuthor } from '../lib/seo/authors'
import { parse as parseHtml } from 'node-html-parser'
config({ path: path.resolve(process.cwd(), '.env.local') })
import {
  generateBrief, generateDraft, qaWithModel, qaDeterministic,
  summarize, GEN_MODEL, PROMPT_VERSION,
  type GenContext, type PageRef, type QueryRef, type QaReport,
} from '../lib/seo/generate'
import { embed } from '../lib/seo/embeddings'
import { reviseDraft } from '../lib/seo/generate'
import { planIncomingLinks, saveLinkPlan } from '../lib/seo/linkplan'
import { finalPreflight, checkPublishRate, publishDraft, postPublishVerify } from '../lib/seo/publish'
import { summarize as summarizeChecks } from '../lib/seo/standard'

const seo = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } }).schema('seo')

const arg = (name: string) => { const i = process.argv.indexOf(name); return i > -1 ? process.argv[i + 1] : undefined }
const DRY = process.argv.includes('--dry')
const CONTEXT_ONLY = process.argv.includes('--context')   // собрать контекст и выйти, без обращений к модели
const PUBLISH = process.argv.includes('--publish')        // довести до черновика в WordPress
const MAX_REVISIONS = 2                                   // §12.2: две попытки починки, дальше человек

async function main() {
  if (!process.env.ANTHROPIC_API_KEY && !CONTEXT_ONLY) { console.error('✗ Нет ANTHROPIC_API_KEY в .env.local'); process.exit(1) }

  const topicId = arg('--topic') ? Number(arg('--topic')) : null
  const query = arg('--query')
  if (!topicId && !query) { console.error('Укажи --topic <id> или --query "запрос"'); process.exit(1) }

  // 1) Тема
  let topic: { id: number; title: string; primary_keyword: string | null; cluster: string | null }
  if (topicId) {
    const { data, error } = await seo.from('topics').select('id,title,primary_keyword,cluster').eq('id', topicId).single()
    if (error || !data) throw new Error(`тема ${topicId}: ${error?.message ?? 'не найдена'}`)
    topic = data as any
  } else {
    const { data, error } = await seo.from('topics')
      .insert({ title: query!, primary_keyword: query!, origin: 'manual', status: 'in_production' })
      .select('id,title,primary_keyword,cluster').single()
    if (error) throw new Error(`создание темы: ${error.message}`)
    topic = data as any
    console.log(`Тема создана: #${topic.id} «${topic.title}»`)
  }

  // 2) Контекст: запросы GSC + соседние страницы
  const ctx = await buildContext(topic)
  console.log(`Контекст: ${ctx.queries.length} запросов из GSC, ${ctx.related.length} соседних страниц`)
  if (ctx.queries.length) {
    const top = ctx.queries.slice(0, 5).map((q) => `«${q.query}» ${q.impressions} показ. поз=${q.position.toFixed(1)}`)
    console.log('  ' + top.join('\n  '))
  }

  if (CONTEXT_ONLY) {
    console.log('\nСоседние страницы:')
    for (const p of ctx.related) console.log(`  ${p.url} — ${p.title ?? '(без title)'}`)
    console.log('\n--context: до модели не дошли.')
    return
  }

  // 3) Бриф
  console.log('\n[1/3] Бриф…')
  const brief = await generateBrief(ctx)
  console.log(`  ${brief.title}`)
  console.log(`  чем отличается: ${brief.unique_value}`)
  console.log(`  разделов: ${brief.outline.length}, внутренних ссылок: ${brief.internal_links.length}, цель ${brief.word_count_target} слов`)
  if (DRY) { console.log('\n--dry: на брифе остановились.'); return }

  // 4) Черновик
  console.log('\n[2/3] Черновик… (это долго, модель думает)')
  const html = await generateDraft(ctx, brief)
  console.log(`  ${html.length} символов HTML`)

  // 5) QA с починкой — §12.2: максимум две попытки, дальше человеку.
  // Каждая итерация сохраняется отдельной версией: схема для того и держит
  // origin = generated | qa_fixed, а редактору нужно видеть, что именно поменялось.
  const pageEmbeddings = await loadEmbeddings()
  const site = await loadSiteStrings()

  const { data: article, error: aerr } = await seo.from('articles')
    .insert({ topic_id: topic.id, primary_keyword: brief.primary_keyword, status: 'in_production' })
    .select('id').single()
  if (aerr) throw new Error(`articles: ${aerr.message}`)

  const versions: { id: number; no: number; origin: string; html: string; verdict: string }[] = []
  let current = html
  let report!: QaReport
  let attempt = 0

  for (;;) {
    console.log(`\n[3/3] QA${attempt ? ` — после починки #${attempt}` : ''}…`)
    const det = await qaDeterministic(ctx, brief, current, { pageEmbeddings, ...site })
    const modelIssues = await qaWithModel(ctx, brief, current)
    const { failedB, failedW, passed, verdict } = summarizeChecks(det.checks)
    report = {
      checks: det.checks,
      issues: [...det.issues.filter((i) => i.kind !== 'structure'), ...modelIssues],
      verdict: verdict as QaReport['verdict'],
    }

    console.log(`  Стандарт (приложение F): пройдено ${passed}, провалено B — ${failedB.length}, W — ${failedW.length}`)
    for (const c of failedB) console.log(`  ✗ [B] ${c.id}: ${c.detail}`)
    for (const c of failedW) console.log(`  ~ [W] ${c.id}: ${c.detail}`)
    const blockingIssues = modelIssues.filter((i) => i.severity === 'blocker')
    for (const i of modelIssues) console.log(`  [${i.severity}/${i.kind}] ${i.why}\n      «${i.quote.slice(0, 120)}»`)

    const versionNo = attempt + 1
    const { data: v, error: verr } = await seo.from('article_versions').insert({
      article_id: article.id, version_no: versionNo,
      origin: attempt === 0 ? 'generated' : 'qa_fixed',
      title: brief.title, body: current,
      meta: { description: brief.meta_description, slug: brief.slug, brief },
      prompt_version: PROMPT_VERSION, model: GEN_MODEL, qa_version: 'v1', qa_report: report,
    }).select('id').single()
    if (verr) throw new Error(`article_versions: ${verr.message}`)
    versions.push({ id: v.id, no: versionNo, origin: attempt === 0 ? 'generated' : 'qa_fixed', html: current, verdict: report.verdict })
    console.log(`  Версия ${versionNo} сохранена (id=${v.id}, ${attempt === 0 ? 'generated' : 'qa_fixed'})`)

    const needFix = failedB.length > 0 || blockingIssues.length > 0
    if (!needFix) { console.log('  Всё чисто.'); break }
    if (attempt >= MAX_REVISIONS) {
      console.log(`\n  Две попытки починки не закрыли замечания — по §12.2 статья уходит человеку.`)
      break
    }
    attempt++
    console.log(`\n  Чиню (попытка ${attempt} из ${MAX_REVISIONS})…`)
    current = await reviseDraft(ctx, brief, current, failedB.map((c) => ({ id: c.id, detail: c.detail })), modelIssues)
  }
  const finalHtml = current

  // 6) Итог: последняя версия становится текущей
  const last = versions[versions.length - 1]
  await seo.from('articles').update({
    current_version_id: last.id,
    status: report.verdict === 'ready_for_review' ? 'ready_for_review' : 'draft',
  }).eq('id', article.id)
  await seo.from('topics').update({ status: 'produced' }).eq('id', topic.id)

  const dir = path.resolve(process.cwd(), 'out/seo')
  fs.mkdirSync(dir, { recursive: true })
  const base = brief.slug || `article-${article.id}`
  let file = ''
  for (const v of versions) {
    const name = versions.length > 1 ? `${base}.v${v.no}-${v.origin}.html` : `${base}.html`
    file = path.join(dir, name)
    fs.writeFileSync(file, `<!-- ${brief.title} | article=${article.id} version=${v.id} (${v.origin}) | вердикт: ${v.verdict} -->\n<h1>${brief.h1}</h1>\n${v.html}\n`)
  }

  console.log(`\nВердикт: ${report.verdict}`)
  console.log(`Сохранено: article=${article.id}, версий ${versions.length} (${versions.map((v) => `${v.no}:${v.origin}`).join(', ')})`)
  console.log(`Прочитать: ${path.dirname(file)}/`)

  // 7) План входящих ссылок — §8.9: без двух входящих статья выходит сиротой
  console.log('\n[Ссылки] Подбираю доноров…')
  const donorPages = await loadDonorPages()
  const donors = await planIncomingLinks({
    targetTitle: brief.title, targetH1: brief.h1, targetSlug: brief.slug,
    anchorCandidates: [brief.h1, brief.primary_keyword, ...brief.secondary_keywords],
    pages: donorPages, alreadyLinking: new Set(), min: 2,
    fetchText: fetchPageText,
  })
  await saveLinkPlan(seo, donors, { topicId: topic.id, pageId: null })
  for (const d of donors) {
    console.log(`  ${d.status === 'proposed' ? '✓' : '~'} ${d.url.replace('https://goandstudy.com', '')} — анкор «${d.anchor}» (${d.similarity})`)
    if (d.insertionPoint) console.log(`      куда: «${d.insertionPoint.slice(0, 110)}»`)
    else console.log(`      ${d.reason}`)
  }
  const ready = donors.filter((d) => d.status === 'proposed').length
  if (ready < 2) console.log(`  ⚠ подходящих мест только ${ready} из 2 — по §8.9 статья выйдет сиротой, нужна правка руками`)

  // 8) Публикация черновиком (§12) — только по флагу
  if (!PUBLISH) {
    console.log('\nВ WordPress ничего не отправлял. Нужен черновик на сайте — добавь --publish.')
    return
  }
  if (report.verdict !== 'ready_for_review') {
    console.log('\n--publish пропущен: статья не прошла B-проверки, публиковать нельзя (§12.2).')
    return
  }

  console.log('\n[Публикация] final_preflight…')
  const payload = {
    articleId: article.id, versionId: last.id,
    title: brief.title, h1: brief.h1, description: brief.meta_description, slug: brief.slug,
    html: finalHtml, primaryKeyword: brief.primary_keyword,
    imageUrl: null, author: getAuthor(),
    breadcrumbs: [
      { name: 'Главная', url: 'https://goandstudy.com/' },
      { name: 'Блог', url: 'https://goandstudy.com/blog/' },
      { name: brief.h1, url: `https://goandstudy.com/blog/${brief.slug}/` },
    ],
  }
  const pre = finalPreflight(payload, site)
  if (!pre.ok) {
    console.log('  ✗ preflight не пройден, публикация запрещена (§12.2):')
    for (const c of pre.blockers) console.log(`    ${c.id}: ${c.detail}`)
    return
  }
  console.log('  ✓ preflight пройден')

  const rate = await checkPublishRate(seo)
  console.log(`  темп публикаций: ${rate.ok ? '✓' : '✗'} ${rate.reason}`)
  if (!rate.ok) return

  const res = await publishDraft(seo, payload)
  if (!res.ok) { console.log(`  ✗ ${res.reason}`); return }
  console.log(`  ✓ черновик в WordPress: post_id=${res.postId}`)
  for (const p of res.schemaProblems ?? []) console.log(`  ⚠ разметка: ${p}`)

  const verify = await postPublishVerify(res.postId!, payload)
  for (const c of verify.critical) console.log(`  ✗ ${c}`)
  for (const w of verify.warnings) console.log(`  ~ ${w}`)
  console.log('\nСтатья лежит черновиком в WordPress. Дальше — вычитка человеком.')
  console.log('Перевод в публикацию — отдельная операция promoteToPublish (§12.1.1); она же')
  console.log('через 60 секунд проверит страницу глазами бота и вернёт в черновик, если что-то сломалось.')
}

async function buildContext(topic: { title: string; primary_keyword: string | null; cluster: string | null }): Promise<GenContext> {
  const kw = (topic.primary_keyword || topic.title).toLowerCase()
  // Грубый стемминг обрезкой: «австрии»/«австрия»/«австрию» → «австр». Морфологии тут не нужно,
  // достаточно отсечь окончания, иначе запросы по теме теряются.
  const stems = kw.split(/[^\p{L}\d]+/u).filter((w) => w.length >= 4).map((w) => w.slice(0, 5))

  // 1) Запросы GSC: доля совпавших стемов, не «есть хоть одно слово» —
  //    иначе на «высшее образование в австрии» приезжает «колледж в сша ... образование».
  const agg = new Map<string, { imp: number; clicks: number; pos: number; n: number; score: number }>()
  for (let from = 0; ; from += 1000) {
    const { data, error } = await seo.from('gsc_daily').select('query,clicks,impressions,position').range(from, from + 999)
    if (error) throw new Error(`gsc_daily: ${error.message}`)
    for (const r of data ?? []) {
      const q = String(r.query).toLowerCase()
      const score = stems.length ? stems.filter((st) => q.includes(st)).length / stems.length : 0
      if (score < 0.5) continue
      const a = agg.get(q) ?? { imp: 0, clicks: 0, pos: 0, n: 0, score }
      a.imp += r.impressions ?? 0; a.clicks += r.clicks ?? 0; a.pos += Number(r.position ?? 0); a.n++
      agg.set(q, a)
    }
    if (!data || data.length < 1000) break
  }
  const queries: QueryRef[] = [...agg.entries()]
    .map(([query, a]) => ({ query, impressions: a.imp, clicks: a.clicks, position: a.pos / a.n, score: a.score }))
    .sort((a, b) => (b.score - a.score) || (b.impressions - a.impressions))
    .slice(0, 25)
    .map(({ query, impressions, clicks, position }) => ({ query, impressions, clicks, position }))

  // 2) Соседние страницы: по эмбеддингу темы. Сопоставление по словам тут не работает —
  //    URL транслитом («avstriyu»), заголовки кириллицей.
  const embeddings = await loadEmbeddings()
  const [topicVec] = await embed([`${topic.title}. ${queries.slice(0, 10).map((q) => q.query).join('. ')}`])
  const byId = new Map(embeddings.map((e) => [e.url, e]))
  const nearest = embeddings
    .map((e) => ({ e, sim: cosine(topicVec, e.vec) }))
    .sort((a, b) => b.sim - a.sim)
    .slice(0, 20)

  // Эмбеддинги тянут к общим страницам («за границей»), а узкие страницы по стране
  // могут не попасть в топ-20 — добираем прямым совпадением по заголовку.
  const exact: PageRef[] = []
  for (const st of stems) {
    const { data } = await seo.from('pages').select('id,url,title,page_type')
      .is('removed_at', null).ilike('title', `%${st}%`).limit(15)
    for (const p of (data ?? []) as PageRef[]) if (!exact.some((e) => e.id === p.id)) exact.push(p)
  }

  const urls = nearest.map((n) => n.e.url)
  const { data: pageRows } = await seo.from('pages').select('id,url,title,page_type').in('url', urls)
  const order = new Map(urls.map((u, i) => [u, i]))
  const near = ((pageRows ?? []) as PageRef[]).sort((a, b) => (order.get(a.url) ?? 99) - (order.get(b.url) ?? 99))

  const related: PageRef[] = []
  for (const p of [...exact, ...near]) if (!related.some((e) => e.id === p.id)) related.push(p)
  void byId

  return { topicTitle: topic.title, primaryKeyword: topic.primary_keyword || topic.title, cluster: topic.cluster, related, queries }
}

function cosine(a: number[], b: number[]): number {
  let dot = 0, na = 0, nb = 0
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i] }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) || 1)
}

/** Строки существующих страниц — для проверок уникальности title/description/slug (§2.2, §2.7, §7.8). */
async function loadSiteStrings() {
  const knownUrls = new Set<string>()
  const existingTitles = new Set<string>()
  const existingDescriptions = new Set<string>()
  const existingSlugs = new Set<string>()
  const norm = (v: string) => v.toLowerCase().replace(/\s+/g, ' ').replace(/[«»"'’]/g, '').trim()
  for (let from = 0; ; from += 1000) {
    const { data, error } = await seo.from('pages').select('url,normalized_url,title,meta_desc').is('removed_at', null).range(from, from + 999)
    if (error) throw new Error(`pages: ${error.message}`)
    for (const p of data ?? []) {
      knownUrls.add(String(p.url).replace(/\/$/, ''))
      knownUrls.add(String(p.normalized_url).replace(/\/$/, ''))
      if (p.title) existingTitles.add(norm(String(p.title)))
      if (p.meta_desc) existingDescriptions.add(norm(String(p.meta_desc)))
      const seg = String(p.normalized_url).replace(/\/$/, '').split('/').pop()
      if (seg) existingSlugs.add(seg)
    }
    if (!data || data.length < 1000) break
  }
  return { knownUrls, existingTitles, existingDescriptions, existingSlugs }
}

/** Текст живой страницы — чтобы найти фразу, в которую встанет ссылка. */
async function fetchPageText(url: string): Promise<string | null> {
  const res = await fetch(url, { headers: { 'User-Agent': 'goandstudy-seo-linkplan' }, signal: AbortSignal.timeout(20000) }).catch(() => null)
  if (!res || !res.ok) return null
  const html = await res.text()
  const root = parseHtml(html)
  const container = root.querySelector('article') ?? root.querySelector('.entry-content') ?? root.querySelector('main') ?? root
  container.querySelectorAll('script, style, nav, header, footer').forEach((n) => n.remove())
  return container.textContent.replace(/\s+/g, ' ').trim()
}

/** Страницы с эмбеддингом и текстом — доноры входящих ссылок (§8.9). */
async function loadDonorPages() {
  const out: { id: number; url: string; title: string | null; vec: number[]; text: string | null }[] = []
  for (let from = 0; ; from += 500) {
    const { data, error } = await seo.from('pages').select('id,url,normalized_url,title,embedding,meta_desc,h1')
      .not('embedding', 'is', null).is('removed_at', null).range(from, from + 499)
    if (error) throw new Error(`pages: ${error.message}`)
    for (const r of data ?? []) {
      // Донор, который сам редиректит, бесполезен: ссылку туда никто не увидит
      if (String(r.url).replace(/\/$/, '') !== String(r.normalized_url).replace(/\/$/, '')) continue
      out.push({
        id: r.id as number, url: r.url as string, title: r.title as string | null,
        vec: typeof r.embedding === 'string' ? JSON.parse(r.embedding) : (r.embedding as number[]),
      // Полного текста страниц в инвентаре нет — для поиска места вставки берём то, что есть
        text: [r.title, r.h1, r.meta_desc].filter(Boolean).join('. ') || null,
      })
    }
    if (!data || data.length < 500) break
  }
  return out
}

let embCache: { url: string; title: string | null; vec: number[] }[] | null = null
async function loadEmbeddings() {
  if (embCache) return embCache
  const out: { url: string; title: string | null; vec: number[] }[] = []
  for (let from = 0; ; from += 500) {
    const { data, error } = await seo.from('pages').select('url,title,embedding').not('embedding', 'is', null).is('removed_at', null).range(from, from + 499)
    if (error) throw new Error(`pages: ${error.message}`)
    for (const r of data ?? []) out.push({ url: r.url as string, title: r.title as string | null, vec: typeof r.embedding === 'string' ? JSON.parse(r.embedding) : (r.embedding as number[]) })
    if (!data || data.length < 500) break
  }
  embCache = out
  return out
}

main().catch((e) => { console.error('✗', e.message || e); process.exit(1) })
