/**
 * План мержа дублей schools. Только diagnostic — ничего не меняет в БД.
 *
 *   npx tsx scripts/plan-school-merge.ts
 *
 * Группируем по нормализованному имени + стране, для каждой группы решаем:
 *   - MERGE — все имена сводятся к одной базе, суффиксы из NOISE-листа
 *     (postgraduate/online/опечатки/пунктуация/язык). Один master + дубли.
 *   - KEEP — суффиксы содержат разные кампусы (города) или факультеты.
 *
 * Master row выбирается по: больше программ → есть фото → есть описание → ID.
 */

import { config } from 'dotenv'
import path from 'path'
import { createClient } from '@supabase/supabase-js'

config({ path: path.resolve(process.cwd(), '.env.local') })

const sb = createClient(
  process.env.NEXT_PUBLIC_PARSER_SUPABASE_URL!,
  process.env.PARSER_SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
)

type School = {
  id: number
  name: string
  country_code: string | null
  source: string | null
  campus_photo_url: string | null
  description: string | null
  logo_url: string | null
  qs_rank: number | null
  university_type: string | null
  founded_in: number | null
  curator_note: string | null
  programCount?: number
}

// Только grammar-словa. Слова academy/college/school/institute/university —
// различающие (RAM vs RCM, Lincoln College vs University of Lincoln).
const STOP_WORDS = new Set([
  'of', 'the', 'and', 'für', 'für', 'für', 'для', 'имени', 'им',
])

/** Жёсткая нормализация — нужна только для группировки.
 *  Сортируем токены чтобы порядок слов не имел значения
 *  (University of X vs X University → одно). */
function normalize(name: string): string {
  return name
    .toLowerCase()
    .replace(/—.*$/, '')
    .replace(/['"`’]/g, '')
    .split(/[\s\-,.()/]+/)
    .filter(t => t && !STOP_WORDS.has(t))
    .sort()
    .join('')
    .replace(/[^\p{L}\p{N}]+/gu, '')
}

/** «База» имени до первого тире/запятой/скобки. */
function nameBase(name: string): string {
  return name
    .replace(/[—–]\s*.*$/, '')
    .replace(/\([^)]*\)/g, '')
    .replace(/,\s*.*$/, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
    .replace(/[^a-zа-яё0-9 ]/gi, '')
}

/** Что идёт после тире / в скобках / после запятой. */
function nameSuffix(name: string): string {
  const m1 = /[—–]\s*(.+)$/.exec(name)
  if (m1) return m1[1].trim().toLowerCase()
  const m2 = /\(([^)]+)\)\s*$/.exec(name)
  if (m2) return m2[1].trim().toLowerCase()
  const m3 = /,\s*(.+)$/.exec(name)
  if (m3) return m3[1].trim().toLowerCase()
  return ''
}

/** Суффиксы, означающие «тот же вуз/кампус, просто другой уровень/язык/опечатка». */
const NOISE_SUFFIX_PATTERNS: RegExp[] = [
  /^$/,
  /^постgraduate$/i, /^постграджуат$/i, /^постграджуат\s/i,
  /^postgraduate$/i, /^postgrad$/i, /^pg$/i,
  /^postgraduate programs?$/i, /^postgrad programs?$/i,
  /^undergraduate$/i, /^undergrad$/i, /^ug$/i,
  /^undergraduate programs?$/i, /^undergrad programs?$/i,
  /^graduate$/i, /^grad$/i,
  /^graduate programs?$/i, /^grad programs?$/i,
  /^doctoral programs?$/i, /^phd programs?$/i, /^master programs?$/i, /^masters? programs?$/i, /^bachelor programs?$/i, /^bachelors? programs?$/i,
  /^online programs?$/i, /^online$/i,
  /^weitere programme$/i, /^additional programs?$/i, /^extra programs?$/i,
  /^en\/?\s?d?e?$/i, /^english$/i, /^english programs?$/i, /^in english$/i,
  /^en$/i, /^de$/i, /^fr$/i, /^es$/i, /^it$/i,
  /^international$/i,
]

/** Признаки разных кампусов / факультетов — НЕ мерджить. */
const CAMPUS_KEYWORDS = [
  'campus', 'branch', 'centre', 'center',
  // города (англ/итал/нем/фр/сша/каб...) — берём из adventures known list
  'torino', 'roma', 'milano', 'firenze', 'naples', 'sicilia', 'genova',
  'paris', 'lyon', 'marseille', 'lille', 'nantes', 'toulouse',
  'berlin', 'munich', 'hamburg', 'frankfurt', 'cologne',
  'london', 'manchester', 'edinburgh', 'glasgow', 'cardiff', 'belfast',
  'oxford', 'cambridge', 'bristol', 'leeds', 'sheffield', 'nottingham',
  'sydney', 'melbourne', 'brisbane', 'perth', 'adelaide', 'gold coast',
  'mount gravatt', 'gold coast', 'logan', 'south bank',
  'toronto', 'vancouver', 'montreal', 'calgary', 'ottawa', 'quebec',
  'new york', 'los angeles', 'chicago', 'boston', 'miami', 'seattle',
  'dubai', 'abu dhabi', 'sharjah',
  'singapore', 'hong kong', 'shanghai', 'mumbai', 'delhi',
  'bloomsbury', 'soas', 'knoxville', 'cagliari',
]
const FACULTY_KEYWORDS = [
  'faculty of', 'school of', 'department of', 'college of', 'institute of',
  'medicine', 'medical', 'dentistry', 'pharmacy', 'engineering',
  'law', 'rechtswissenschaft', 'jura',
  'business', 'management', 'mba',
  'arts', 'design', 'psychology', 'psychologie', 'theology', 'philosophy',
  'sciences politiques', 'politicas', 'политические',
  'нейтральный',
]

function suffixIsNoise(s: string): boolean {
  if (!s) return true
  for (const p of NOISE_SUFFIX_PATTERNS) if (p.test(s)) return true
  return false
}

function suffixIsCampusOrFaculty(s: string): boolean {
  if (!s) return false
  const lower = s.toLowerCase()
  for (const kw of CAMPUS_KEYWORDS) if (lower.includes(kw)) return true
  for (const kw of FACULTY_KEYWORDS) if (lower.includes(kw)) return true
  return false
}

type GroupClass = 'merge' | 'keep' | 'manual'

function suffixHasFaculty(s: string): boolean {
  if (!s) return false
  const lower = s.toLowerCase()
  for (const kw of FACULTY_KEYWORDS) if (lower.includes(kw)) return true
  return false
}

/** Сжатие имени: только буквы и цифры, без регистра. */
function ultraNormalize(name: string): string {
  return name.toLowerCase().replace(/[^a-zа-яё0-9]/gi, '')
}

function classifyGroup(members: School[]): GroupClass {
  // 1. Если все имена идентичны после удаления пунктуации → MERGE (точный дубль)
  const ultra = members.map(m => ultraNormalize(m.name))
  if (new Set(ultra).size === 1) return 'merge'

  // 2. Хотя бы один суффикс — явный факультет → KEEP
  const suffixes = members.map(m => nameSuffix(m.name))
  if (suffixes.some(s => suffixHasFaculty(s))) return 'keep'

  // 3. Все суффиксы либо пустые, либо NOISE → MERGE
  if (suffixes.every(s => suffixIsNoise(s))) return 'merge'

  // 4. Иначе — нестандартный суффикс не из faculty (мог быть город из другого
  // кампуса). Чтобы не сжать разные филиалы — KEEP.
  return 'keep'
}

function pickMaster(members: School[]): School {
  // Больше программ → есть фото → есть описание → меньший ID (старше)
  const sorted = [...members].sort((a, b) => {
    const aScore = (a.programCount || 0) * 100
      + (a.campus_photo_url ? 30 : 0)
      + (a.description ? 20 : 0)
      + (a.logo_url ? 10 : 0)
      + (a.qs_rank ? 5 : 0)
    const bScore = (b.programCount || 0) * 100
      + (b.campus_photo_url ? 30 : 0)
      + (b.description ? 20 : 0)
      + (b.logo_url ? 10 : 0)
      + (b.qs_rank ? 5 : 0)
    if (bScore !== aScore) return bScore - aScore
    return a.id - b.id
  })
  return sorted[0]
}

async function main() {
  console.log('Тяну все schools…')
  const all: School[] = []
  for (let off = 0; off < 100000; off += 1000) {
    const { data } = await sb
      .from('schools')
      .select('id, name, country_code, source, campus_photo_url, description, logo_url, qs_rank, university_type, founded_in, curator_note')
      .order('id')
      .range(off, off + 999)
    if (!data || data.length === 0) break
    all.push(...(data as any))
    if (data.length < 1000) break
  }
  console.log(`Всего ${all.length} school-row'ов`)

  const groups = new Map<string, School[]>()
  for (const s of all) {
    const norm = normalize(s.name)
    if (!norm) continue
    const key = `${norm}__${(s.country_code || '').toLowerCase()}`
    const arr = groups.get(key) || []
    arr.push(s)
    groups.set(key, arr)
  }

  const dupGroups = Array.from(groups.entries()).filter(([, arr]) => arr.length >= 2)
  console.log(`Найдено ${dupGroups.length} групп дублей.\n`)

  // Подтянем кол-во программ для всех вовлечённых school_id одним SELECT
  const involvedIds = dupGroups.flatMap(([, arr]) => arr.map(s => s.id))
  const programCounts = new Map<number, number>()
  // Делаем партиями по 200 чтобы не превысить лимит .in()
  for (let i = 0; i < involvedIds.length; i += 200) {
    const slice = involvedIds.slice(i, i + 200)
    const { data } = await sb.from('programs').select('school_id').in('school_id', slice)
    for (const r of data || []) {
      programCounts.set(r.school_id as number, (programCounts.get(r.school_id as number) || 0) + 1)
    }
  }
  for (const [, members] of dupGroups) {
    for (const m of members) m.programCount = programCounts.get(m.id) || 0
  }

  const stats = { merge: [] as typeof dupGroups, keep: [] as typeof dupGroups, manual: [] as typeof dupGroups }
  for (const g of dupGroups) {
    const cls = classifyGroup(g[1])
    stats[cls].push(g)
  }

  console.log(`MERGE: ${stats.merge.length} групп`)
  console.log(`KEEP: ${stats.keep.length} групп (разные кампусы / факультеты — НЕ трогаем)`)
  console.log(`MANUAL: ${stats.manual.length} групп (нужно решать вручную)\n`)

  console.log('═══════════ MERGE ═══════════\n')
  let mergeProgramTotal = 0, mergeDupRows = 0
  for (const [, members] of stats.merge) {
    const master = pickMaster(members)
    const dups = members.filter(m => m.id !== master.id)
    mergeDupRows += dups.length
    for (const d of dups) mergeProgramTotal += (d.programCount || 0)
    console.log(`master #${master.id} (${master.programCount} прог) — ${master.name}`)
    for (const d of dups) console.log(`  → merge #${d.id} (${d.programCount} прог) — ${d.name}`)
    console.log()
  }
  console.log(`ИТОГО к мержу: ${stats.merge.length} групп, ${mergeDupRows} лишних row'ов, ${mergeProgramTotal} программ переподвяжем\n`)

  console.log('═══════════ KEEP (разные кампусы) ═══════════\n')
  for (const [, members] of stats.keep.slice(0, 15)) {
    console.log(`${members.length} row'ов:`)
    for (const m of members) console.log(`  #${m.id} — ${m.name}`)
    console.log()
  }
  if (stats.keep.length > 15) console.log(`... ещё ${stats.keep.length - 15} групп\n`)

  console.log('═══════════ MANUAL (нужна ручная проверка) ═══════════\n')
  for (const [, members] of stats.manual.slice(0, 15)) {
    console.log(`${members.length} row'ов:`)
    for (const m of members) console.log(`  #${m.id} — ${m.name}`)
    console.log()
  }
  if (stats.manual.length > 15) console.log(`... ещё ${stats.manual.length - 15} групп`)
}
main()
