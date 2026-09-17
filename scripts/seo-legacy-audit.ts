// Ревизия опубликованного архива (E3): что утверждают статьи, вышедшие до гейта.
//
// Ничего не правит. Читает живые страницы блога, ищет в них утверждения без
// подтверждения, размечает риск и пишет отчёт для человека.
//
// Запуск:
//   npx tsx scripts/seo-legacy-audit.ts                 — прогон и отчёт
//   npx tsx scripts/seo-legacy-audit.ts --limit 5       — быстрая проба
//   npx tsx scripts/seo-legacy-audit.ts --import        — плюс запись в seo.claims
//
// Запись в claims требует миграции docs/sql/утверждения-из-архива.sql: без
// колонок article_id/page_id/body_offset находку некуда привязать, а утверждение
// без места в тексте — это мнение, а не находка.
import { config } from 'dotenv'; import path from 'path'
config({ path: path.resolve(process.cwd(), '.env.local') })
import fs from 'fs'
import { createClient } from '@supabase/supabase-js'
import { safeFetch } from '../lib/seo/safe-fetch'
import { auditArticle, extractArticleBody, verifyOffsets, RISK_ORDER, type LegacyFinding, type RiskLevel } from '../lib/seo/legacy-audit'
import { trafficByPage } from '../lib/seo/gsc-agg'

const CACHE = path.resolve(process.cwd(), '.cache/legacy-audit')
const REPORT = path.resolve(process.cwd(), 'docs/legacy-content-risk.md')

type PageRow = { id: number; normalized_url: string; title: string | null }
type Audited = { page: PageRow; slug: string; findings: LegacyFinding[]; bodyChars: number; impressions: number }

/** Страницу читаем один раз: восемьдесят запросов к своему сайту — это вежливо, восемьсот — нет. */
async function fetchBody(url: string, slug: string): Promise<string | null> {
  fs.mkdirSync(CACHE, { recursive: true })
  const file = path.join(CACHE, `${slug}.html`)
  if (fs.existsSync(file)) return fs.readFileSync(file, 'utf8')

  const res = await safeFetch(`${url}/`, process.env.SEO_CRAWL_USER_AGENT || 'goandstudy-seo-bot')
  if (!res.ok) { console.error(`  ✗ ${slug}: ${res.reason}`); return null }
  const html = res.body.toString('utf8')
  fs.writeFileSync(file, html)
  return html
}

async function main() {
  const limit = Number(process.argv.find((a) => a.startsWith('--limit'))?.split('=')[1]
    ?? (process.argv.includes('--limit') ? process.argv[process.argv.indexOf('--limit') + 1] : 0)) || 0
  const doImport = process.argv.includes('--import')

  const seo = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!).schema('seo')

  const { data: pages, error } = await seo.from('pages')
    .select('id, normalized_url, title')
    .eq('page_type', 'article').is('removed_at', null).eq('indexable', true).eq('http_status', 200)
    .like('normalized_url', '%/blog/%').order('id')
  if (error) { console.error('✗', error.message); process.exit(1) }

  const list = (pages ?? []).filter((p: PageRow) => !p.normalized_url.endsWith('/blog'))
  const targets = limit ? list.slice(0, limit) : list
  console.log(`страниц в ревизии: ${targets.length}${limit ? ` (из ${list.length})` : ''}\n`)

  // Показы за 28 дней: риск без читателей — это не то же самое, что риск на
  // странице, которую открывают тысячу раз в месяц. Без этого числа по отчёту
  // нельзя ответить на главный вопрос — бросать дела или нет
  const since = new Date(Date.now() - 28 * 864e5).toISOString().slice(0, 10)
  const traffic = await trafficByPage(seo, { since }).catch(() => new Map())

  const audited: Audited[] = []
  for (const page of targets as PageRow[]) {
    const slug = page.normalized_url.replace(/.*\/blog\//, '')
    const html = await fetchBody(page.normalized_url, slug)
    if (!html) continue

    const body = extractArticleBody(html)
    const findings = auditArticle(body)

    // Смещение обязано указывать на настоящее место: иначе человек пойдёт искать
    // его в статье, не найдёт, и отчёту перестанут верить
    for (const p of verifyOffsets(body, findings)) console.error(`  ⚠ ${slug}: ${p}`)
    // Цитата без самой находки бесполезна: человек прочитает строку и не поймёт,
    // о чём она. Это ловилось на первом прогоне и должно ловиться дальше
    for (const f of findings) {
      if (!f.statement.includes(f.trigger.split('\n')[0].trim())) {
        console.error(`  ⚠ ${slug}: в цитате нет находки «${f.trigger}» — ${f.statement.slice(0, 80)}`)
      }
    }

    audited.push({
      page, slug, findings, bodyChars: body.length,
      impressions: traffic.get(page.normalized_url)?.impressions ?? 0,
    })
    const crit = findings.filter((f) => f.risk === 'критично').length
    console.log(`${slug} — находок ${findings.length}${crit ? `, критичных ${crit}` : ''}`)
  }

  const all = audited.flatMap((a) => a.findings.map((f) => ({ ...f, slug: a.slug, pageId: a.page.id })))
  const byRisk = (r: RiskLevel) => all.filter((f) => f.risk === r)
  console.log(`\nвсего находок ${all.length}: критично ${byRisk('критично').length}, `
    + `средне ${byRisk('средне').length}, низко ${byRisk('низко').length}`)

  writeReport(audited, all)
  console.log(`отчёт: ${path.relative(process.cwd(), REPORT)}`)

  if (doImport) await importClaims(seo, audited)
  else console.log('\nв seo.claims не писал: нужен --import и применённая миграция docs/sql/утверждения-из-архива.sql')
}

/* ── Отчёт ────────────────────────────────────────────────────────────────── */

type Flat = LegacyFinding & { slug: string; pageId: number }

function writeReport(audited: Audited[], all: Flat[]) {
  const today = new Date().toISOString().slice(0, 10)
  const pagesWithCrit = new Set(all.filter((f) => f.risk === 'критично').map((f) => f.slug))
  const L: string[] = []

  L.push('# Риск в опубликованном архиве')
  L.push('')
  L.push(`Ревизия ${today}. Просмотрено статей: ${audited.length}. Найдено утверждений без`)
  L.push(`подтверждения: ${all.length} — критичных ${all.filter((f) => f.risk === 'критично').length},`)
  L.push(`средних ${all.filter((f) => f.risk === 'средне').length},`)
  L.push(`низких ${all.filter((f) => f.risk === 'низко').length}.`)
  L.push('')
  L.push('Это ревизия, а не правка: ни одна статья не изменена. Отчёт отвечает на один')
  L.push('вопрос — что из уже опубликованного стоит чинить сегодня, а что подождёт.')
  L.push('')
  L.push('Риск размечен по цене ошибки для читателя, а не по нашей уверенности в находке:')
  L.push('')
  L.push('- **критично** — виза, право на работу, обещание поступления, стоимость обучения.')
  L.push('  Ошибка стоит читателю денег, года или отказа на границе.')
  L.push('- **средне** — сроки подачи, требования и состав программы. Ошибка стоит пересдачи')
  L.push('  или пропущенного набора.')
  L.push('- **низко** — числа в общих описаниях. Неточность, которая решения не меняет.')
  L.push('')
  L.push(`Страниц с критичными находками: **${pagesWithCrit.size}** из ${audited.length}.`)
  L.push('')
  L.push('## Куда идти первым делом')
  L.push('')
  L.push('Риск умножен на читателей: устаревшая цена на странице, которую открывают тысячу')
  L.push('раз в месяц, и та же цена на странице без показов — это разные задачи. Показы за')
  L.push('28 дней по Search Console.')
  L.push('')
  L.push('| Страница | Критичных | Показов за 28 дней |')
  L.push('|---|---|---|')
  const urgent = audited
    .map((a) => ({ a, crit: a.findings.filter((f) => f.risk === 'критично').length }))
    .filter((x) => x.crit > 0)
    .sort((x, y) => y.a.impressions - x.a.impressions || y.crit - x.crit)
    .slice(0, 10)
  for (const { a, crit } of urgent) {
    L.push(`| [${a.slug}](https://goandstudy.com/blog/${a.slug}/) | ${crit} | ${a.impressions || '—'} |`)
  }
  L.push('')
  if (urgent.every((x) => x.a.impressions === 0)) {
    L.push('Показов нет ни у одной страницы с критичными находками: либо данные Search Console')
    L.push('ещё не подъехали, либо эти статьи пока не получают трафика. Тогда порядок правок')
    L.push('определяется не спешкой, а темой.')
    L.push('')
  }

  for (const risk of RISK_ORDER) {
    const items = all.filter((f) => f.risk === risk)
    if (!items.length) continue

    L.push(`## ${risk[0].toUpperCase()}${risk.slice(1)} · ${items.length}`)
    L.push('')

    if (risk === 'низко') {
      // Низкий риск постранично: полсотни строк «число в общем описании» —
      // это шум, из-за которого не прочитают первые два раздела
      const byPage = new Map<string, number>()
      for (const f of items) byPage.set(f.slug, (byPage.get(f.slug) ?? 0) + 1)
      L.push('Постранично, без разбора: такие числа проверяют при плановой правке.')
      L.push('')
      L.push('| Страница | Находок |')
      L.push('|---|---|')
      for (const [slug, n] of [...byPage.entries()].sort((a, b) => b[1] - a[1])) {
        L.push(`| [${slug}](https://goandstudy.com/blog/${slug}/) | ${n} |`)
      }
      L.push('')
      continue
    }

    // По страницам, а не сплошным списком: чинят страницу целиком, и решение
    // «идти сейчас или потом» принимают про страницу, а не про отдельное число
    const byPage = new Map<string, Flat[]>()
    for (const f of items) {
      const list = byPage.get(f.slug) ?? []
      list.push(f)
      byPage.set(f.slug, list)
    }
    // Порядок страниц — по читателям, потом по количеству находок: сверху то,
    // что видят чаще всего
    const seenBy = new Map(audited.map((a) => [a.slug, a.impressions]))
    const pages = [...byPage.entries()].sort((a, b) =>
      (seenBy.get(b[0]) ?? 0) - (seenBy.get(a[0]) ?? 0) || b[1].length - a[1].length || a[0].localeCompare(b[0]))

    for (const [slug, list] of pages) {
      const imp = seenBy.get(slug) ?? 0
      L.push(`### [${slug}](https://goandstudy.com/blog/${slug}/) · ${list.length}${imp ? ` · ${imp} показов за 28 дней` : ''}`)
      L.push('')
      L.push('| Утверждение | Почему это риск | Что сделать |')
      L.push('|---|---|---|')
      for (const f of [...list].sort((a, b) => a.offset - b.offset)) {
        const quote = f.statement.replace(/\|/g, '\\|').replace(/\s+/g, ' ').slice(0, 240)
        const where = f.section ? `раздел «${f.section.replace(/\|/g, '\\|')}», ` : ''
        L.push(`| «${quote}»<br><sub>${where}${f.source}, позиция ${f.offset} · сработало: ${f.trigger.replace(/\|/g, '\\|').replace(/\s+/g, ' ')}</sub> `
          + `| ${f.why} | ${f.action} |`)
      }
      L.push('')
    }
  }

  L.push('---')
  L.push('')
  L.push('## Как это собрано')
  L.push('')
  L.push('`npx tsx scripts/seo-legacy-audit.ts` — читает живые страницы блога, берёт тело')
  L.push('статьи (контейнер содержимого, без шапки и подвала) и прогоняет по нему три поиска:')
  L.push('')
  L.push('1. числа с деньгами, процентами и баллами — `findUnbackedNumbers`;')
  L.push('2. формулировки без чисел — `findSemanticClaims`, те же правила, что стоят на')
  L.push('   воротах у новых статей;')
  L.push('3. сроки подачи словами — их числовой поиск не видел: «до 15 января» это не «15 лет».')
  L.push('')
  L.push('Позиция в каждой строке настоящая: текст очищается от разметки вместе с картой')
  L.push('смещений, и прогон проверяет срезом, что по смещению стоит ровно найденная фраза.')
  L.push('Расхождения печатаются в лог как предупреждения.')
  L.push('')

  fs.mkdirSync(path.dirname(REPORT), { recursive: true })
  fs.writeFileSync(REPORT, L.join('\n'))
}

/* ── Запись в реестр ──────────────────────────────────────────────────────── */

async function importClaims(seo: any, audited: Audited[]) {
  const rows = audited.flatMap((a) => a.findings.map((f) => ({
    kind: f.kind,
    subject: a.page.title ?? a.slug,
    subject_key: `blog:${a.slug}`,
    statement: f.statement,
    page_id: a.page.id,
    body_offset: f.offset,
    confidence: 'single_source',
    status: 'unverified',
    // Утверждению из архива никто не давал срока: он появится, когда его
    // подтвердят. Ставим прошедшую дату, чтобы неподтверждённое не выглядело
    // действующим фактом ни секунды.
    expires_at: new Date(Date.now() - 1000).toISOString(),
    qualifiers: { risk: f.risk, source: f.source, trigger: f.trigger, why: f.why, action: f.action },
  })))

  console.log(`\nпишу в seo.claims: ${rows.length} утверждений со статусом unverified`)
  const { error } = await seo.from('claims').upsert(rows, { onConflict: 'page_id,kind,body_offset' })
  if (error) {
    console.error(`✗ не записалось: ${error.message}`)
    console.error('  Скорее всего не применена миграция docs/sql/утверждения-из-архива.sql')
    process.exit(1)
  }
  console.log('✓ записано')
}

main().catch((e) => { console.error('✗', e.message); process.exit(1) })
