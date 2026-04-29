/**
 * Импорт куратор-БД вузов и программ из ~/Documents/uni-db.html (var DB=[...]) в parser-Supabase.
 *
 * Логика:
 *   - Каждая строка GitHub = (uni × specialty_group)
 *   - Школы дедуплицируются по (LOWER(name), country_code) — Harvard в БД останется один
 *   - Программы уникальны по gh_source_id → идемпотентный re-import
 *
 * Запуск:
 *   npx tsx scripts/import-curator-universities.ts          # реальный импорт
 *   npx tsx scripts/import-curator-universities.ts --dry    # без записи в БД
 */

import { config } from 'dotenv'
import path from 'path'
import fs from 'fs'
import { createClient } from '@supabase/supabase-js'

config({ path: path.resolve(process.cwd(), '.env.local') })

const isDry = process.argv.includes('--dry')
const HTML_PATH = process.argv.find(a => a.startsWith('--html='))?.slice(7)
  || '/tmp/uni-db.html'

const sb = createClient(
  process.env.NEXT_PUBLIC_PARSER_SUPABASE_URL!,
  process.env.PARSER_SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } },
)

// Маппинг country code из GitHub в наш ISO alpha-2 (lowercase)
const COUNTRY_MAP: Record<string, string> = {
  US: 'us', UK: 'gb', CA: 'ca', AE: 'ae', DE: 'de',
  AT: 'at', HU: 'hu', FR: 'fr', IT: 'it', NL: 'nl', ES: 'es',
}

type GhRow = {
  id: number
  u: string
  c: string  // city + region + country
  co: string  // country (Russian name)
  country: string  // code US/UK/CA...
  f: string  // flag
  d: string  // degree
  p: string  // program description
  spg: string  // specialty group
  ut: string  // university type (Частный/Государственный)
  qs: number
  l: string
  dur: string
  st: string
  dl: string
  t: string
  tr: number
  lv: string
  ll: string
  w: string
  req: string[]
  res: string[]
  gr: any  // {g, u} or string
  n: string
}

function extractDB(htmlText: string): GhRow[] {
  const start = htmlText.indexOf('var DB=[')
  if (start === -1) throw new Error('var DB=[ not found in HTML')
  // Find matching closing ];  — careful with nested brackets in strings
  // Simpler: scan from after 'var DB='
  let i = start + 'var DB='.length
  // Now should be '['; collect until matching ']' considering string contexts
  if (htmlText[i] !== '[') throw new Error('expected [ after var DB=')
  let depth = 0
  let inString: '"' | "'" | '`' | null = null
  let escape = false
  let end = -1
  for (; i < htmlText.length; i++) {
    const ch = htmlText[i]
    if (escape) { escape = false; continue }
    if (inString) {
      if (ch === '\\') { escape = true; continue }
      if (ch === inString) { inString = null }
      continue
    }
    if (ch === '"' || ch === "'" || ch === '`') { inString = ch; continue }
    if (ch === '[') depth++
    else if (ch === ']') {
      depth--
      if (depth === 0) { end = i + 1; break }
    }
  }
  if (end === -1) throw new Error('unterminated DB array')
  const arrayLiteral = htmlText.slice(start + 'var DB='.length, end)
  // eslint-disable-next-line @typescript-eslint/no-implied-eval
  const DB = (new Function('return ' + arrayLiteral))() as GhRow[]
  return DB
}

function parseCity(c: string): string | null {
  // "Cambridge, MA, США" → "Cambridge, MA"
  // "London, UK" → "London"
  // "Oviedo (Asturias), Испания" → "Oviedo (Asturias)"
  if (!c) return null
  const parts = c.split(',').map(s => s.trim())
  // last part — country (Russian name) — drop
  if (parts.length > 1) parts.pop()
  return parts.join(', ') || null
}

function scholarshipsToText(gr: any): string | null {
  if (!gr) return null
  if (typeof gr === 'string') return gr
  if (typeof gr === 'object') {
    const parts: string[] = []
    if (gr.g) parts.push(String(gr.g))
    if (gr.u) parts.push(String(gr.u))
    return parts.join(' · ') || null
  }
  return null
}

async function main() {
  console.log(`mode: ${isDry ? 'DRY RUN' : 'REAL IMPORT'}`)
  console.log(`parser url: ${process.env.NEXT_PUBLIC_PARSER_SUPABASE_URL}`)
  console.log(`html: ${HTML_PATH}`)

  if (!fs.existsSync(HTML_PATH)) {
    console.error(`❌ HTML file not found: ${HTML_PATH}`)
    process.exit(1)
  }
  const html = fs.readFileSync(HTML_PATH, 'utf8')
  const DB = extractDB(html)
  console.log(`parsed ${DB.length} rows from HTML`)

  // ── Этап 1: создание/нахождение школ ────────────────────────
  // Группируем по (name, country_code)
  const uniMap = new Map<string, { name: string; country: string; city: string | null; qs: number; ut: string; w: string; note: string }>()
  for (const r of DB) {
    const cc = COUNTRY_MAP[r.country]
    if (!cc) { console.warn(`unknown country: ${r.country}`); continue }
    const key = `${r.u.toLowerCase().trim()}|${cc}`
    if (!uniMap.has(key)) {
      uniMap.set(key, {
        name: r.u.trim(),
        country: cc,
        city: parseCity(r.c),
        qs: r.qs && r.qs < 999 ? r.qs : 0,
        ut: r.ut,
        w: r.w,
        note: r.n,
      })
    }
  }
  console.log(`unique schools to ensure: ${uniMap.size}`)

  // Найдём существующие школы (батчами по 200 имён)
  const schoolIdByKey = new Map<string, number>()
  const allKeys = Array.from(uniMap.keys())
  let foundExisting = 0
  // Простой подход: SELECT по country_code + ilike по имени для каждой партии стран
  const byCountry = new Map<string, typeof allKeys>()
  for (const k of allKeys) {
    const cc = k.split('|')[1]
    const arr = byCountry.get(cc) || []
    arr.push(k)
    byCountry.set(cc, arr)
  }
  for (const [cc, keys] of byCountry) {
    // достанем все школы этой страны разом — обычно сотни записей
    const { data: existing } = await sb
      .from('schools')
      .select('id, name')
      .eq('country_code', cc)
    const byLower = new Map<string, number>()
    for (const s of existing ?? []) {
      byLower.set(String(s.name).toLowerCase().trim(), s.id as number)
    }
    for (const k of keys) {
      const namePart = k.split('|')[0]
      const id = byLower.get(namePart)
      if (id) {
        schoolIdByKey.set(k, id)
        foundExisting++
      }
    }
  }
  console.log(`existing matches found: ${foundExisting} / ${uniMap.size}`)

  const toCreate: typeof uniMap = new Map()
  for (const [k, v] of uniMap) {
    if (!schoolIdByKey.has(k)) toCreate.set(k, v)
  }
  console.log(`new schools to insert: ${toCreate.size}`)

  if (!isDry && toCreate.size > 0) {
    const insertRows = Array.from(toCreate.entries()).map(([k, v]) => ({
      name: v.name,
      country_code: v.country,
      city: v.city,
      qs_rank: v.qs > 0 ? v.qs : null,
      university_type: v.ut || null,
      curator_note: v.note || null,
      website: v.w || null,
    }))
    // Insert батчами по 100
    for (let i = 0; i < insertRows.length; i += 100) {
      const batch = insertRows.slice(i, i + 100)
      const { data, error } = await sb.from('schools').insert(batch).select('id, name, country_code')
      if (error) { console.error(`insert schools err:`, error.message); process.exit(1) }
      for (const row of data ?? []) {
        const k = `${String(row.name).toLowerCase().trim()}|${row.country_code}`
        schoolIdByKey.set(k, row.id as number)
      }
      console.log(`  inserted ${Math.min(i + 100, insertRows.length)} / ${insertRows.length} schools`)
    }
  } else if (toCreate.size > 0) {
    console.log(`(dry) would insert ${toCreate.size} schools`)
  }

  // ── Этап 2: программы ────────────────────────
  // Для idempotency: подтягиваем уже импортированные gh_source_id
  const { data: existingGh } = await sb
    .from('programs')
    .select('gh_source_id')
    .not('gh_source_id', 'is', null)
  const existingGhIds = new Set((existingGh ?? []).map(r => r.gh_source_id))
  console.log(`already imported gh programs: ${existingGhIds.size}`)

  const toImport: any[] = []
  let skipped = 0
  let unmapped = 0
  for (const r of DB) {
    if (existingGhIds.has(r.id)) { skipped++; continue }
    const cc = COUNTRY_MAP[r.country]
    if (!cc) { unmapped++; continue }
    const key = `${r.u.toLowerCase().trim()}|${cc}`
    const schoolId = schoolIdByKey.get(key)
    if (!schoolId) { unmapped++; continue }

    toImport.push({
      school_id: schoolId,
      name: r.spg ? `${r.spg}` : `${r.d} (общее)`,
      specialty_group: r.spg || null,
      degree_text: r.d || null,
      program_description: r.p || null,
      language_text: r.l || null,
      duration_text: r.dur || null,
      start_date_text: r.st || null,
      deadline_text: r.dl || null,
      tuition: r.tr || null,
      tuition_text: r.t || null,
      living_cost_text: r.lv || null,
      living_cost_period: r.ll || null,
      entry_requirements: Array.isArray(r.req) ? r.req : null,
      accommodation_options: Array.isArray(r.res) ? r.res : null,
      scholarships_text: scholarshipsToText(r.gr),
      curator_note: r.n || null,
      source: 'curator_gh',
      gh_source_id: r.id,
    })
  }

  console.log(`programs to insert: ${toImport.length} (skipped already-imported: ${skipped}, unmapped school: ${unmapped})`)

  if (!isDry && toImport.length > 0) {
    for (let i = 0; i < toImport.length; i += 200) {
      const batch = toImport.slice(i, i + 200)
      const { error } = await sb.from('programs').insert(batch)
      if (error) { console.error(`insert programs err:`, error.message); process.exit(1) }
      console.log(`  inserted ${Math.min(i + 200, toImport.length)} / ${toImport.length} programs`)
    }
  } else if (toImport.length > 0) {
    console.log(`(dry) would insert ${toImport.length} programs`)
    console.log(`  sample row:`, JSON.stringify(toImport[0], null, 2).slice(0, 600))
  }

  console.log('\n✅ done')
}

main().catch(e => { console.error(e); process.exit(1) })
