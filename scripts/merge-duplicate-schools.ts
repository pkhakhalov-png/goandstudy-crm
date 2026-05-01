/**
 * Мерж дублей schools (parser DB).
 *
 * Использует тот же классификатор что plan-school-merge.ts.
 *
 * Запуск (DRY-RUN — только показывает что бы сделал):
 *   npx tsx scripts/merge-duplicate-schools.ts
 *
 * Боевой запуск:
 *   npx tsx scripts/merge-duplicate-schools.ts --execute
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

const STOP_WORDS = new Set(['of', 'the', 'and', 'für', 'для', 'имени', 'им'])

function normalize(name: string): string {
  return name.toLowerCase().replace(/—.*$/, '').replace(/['"`’]/g, '')
    .split(/[\s\-,.()/]+/).filter(t => t && !STOP_WORDS.has(t))
    .sort().join('').replace(/[^\p{L}\p{N}]+/gu, '')
}

function ultraNormalize(name: string): string {
  return name.toLowerCase().replace(/[^a-zа-яё0-9]/gi, '')
}

function nameSuffix(name: string): string {
  const m1 = /[—–]\s*(.+)$/.exec(name)
  if (m1) return m1[1].trim().toLowerCase()
  const m2 = /\(([^)]+)\)\s*$/.exec(name)
  if (m2) return m2[1].trim().toLowerCase()
  const m3 = /,\s*(.+)$/.exec(name)
  if (m3) return m3[1].trim().toLowerCase()
  return ''
}

const NOISE_SUFFIX_PATTERNS: RegExp[] = [
  /^$/, /^постgraduate$/i, /^постграджуат$/i, /^постграджуат\s/i,
  /^postgraduate$/i, /^postgrad$/i, /^pg$/i,
  /^postgraduate programs?$/i, /^postgrad programs?$/i,
  /^undergraduate$/i, /^undergrad$/i, /^ug$/i,
  /^undergraduate programs?$/i, /^undergrad programs?$/i,
  /^graduate$/i, /^grad$/i,
  /^graduate programs?$/i, /^grad programs?$/i,
  /^doctoral programs?$/i, /^phd programs?$/i,
  /^master programs?$/i, /^masters? programs?$/i,
  /^bachelor programs?$/i, /^bachelors? programs?$/i,
  /^online programs?$/i, /^online$/i,
  /^weitere programme$/i, /^additional programs?$/i, /^extra programs?$/i,
  /^en\/?\s?d?e?$/i, /^english$/i, /^english programs?$/i, /^in english$/i,
  /^en$/i, /^de$/i, /^fr$/i, /^es$/i, /^it$/i,
  /^international$/i,
]

const FACULTY_KEYWORDS = [
  'faculty of', 'school of', 'department of', 'college of', 'institute of',
  'medicine', 'medical', 'dentistry', 'pharmacy', 'engineering',
  'law', 'rechtswissenschaft', 'jura',
  'business', 'management', 'mba',
  'arts', 'design', 'psychology', 'psychologie', 'theology', 'philosophy',
  'sciences politiques', 'politicas',
]

function suffixIsNoise(s: string): boolean {
  if (!s) return true
  for (const p of NOISE_SUFFIX_PATTERNS) if (p.test(s)) return true
  return false
}

function suffixHasFaculty(s: string): boolean {
  if (!s) return false
  for (const kw of FACULTY_KEYWORDS) if (s.toLowerCase().includes(kw)) return true
  return false
}

type GroupClass = 'merge' | 'keep'

function classifyGroup(members: any[]): GroupClass {
  const ultra = members.map(m => ultraNormalize(m.name))
  if (new Set(ultra).size === 1) return 'merge'
  const suffixes = members.map(m => nameSuffix(m.name))
  if (suffixes.some(s => suffixHasFaculty(s))) return 'keep'
  if (suffixes.every(s => suffixIsNoise(s))) return 'merge'
  return 'keep'
}

function pickMaster(members: any[]): any {
  return [...members].sort((a, b) => {
    const score = (s: any) => (s.programCount || 0) * 100
      + (s.campus_photo_url ? 30 : 0) + (s.description ? 20 : 0)
      + (s.logo_url ? 10 : 0) + (s.qs_rank ? 5 : 0)
    const d = score(b) - score(a)
    return d !== 0 ? d : a.id - b.id
  })[0]
}

const FIELDS_TO_FILL_FROM_DUPS: string[] = [
  'campus_photo_url', 'description', 'logo_url', 'curator_note', 'video_link',
  'qs_rank', 'university_type', 'founded_in', 'website',
  'address', 'city', 'province', 'postal_code', 'latitude', 'longitude',
  'avg_tuition', 'cost_of_living', 'application_fee_range',
  'intakes_summary', 'top_disciplines', 'institution_type',
]

async function main() {
  const execute = process.argv.includes('--execute')
  console.log(execute ? '🔥 БОЕВОЙ ЗАПУСК' : '🧪 DRY-RUN (без --execute)')

  const all: any[] = []
  for (let off = 0; off < 100000; off += 1000) {
    const { data } = await sb.from('schools').select('*').order('id').range(off, off + 999)
    if (!data || data.length === 0) break
    all.push(...data)
    if (data.length < 1000) break
  }
  console.log(`Загружено ${all.length} school-row'ов`)

  // Группировка
  const groups = new Map<string, any[]>()
  for (const s of all) {
    const norm = normalize(s.name)
    if (!norm) continue
    const key = `${norm}__${(s.country_code || '').toLowerCase()}`
    const arr = groups.get(key) || []
    arr.push(s)
    groups.set(key, arr)
  }
  const dupGroups = Array.from(groups.values()).filter(g => g.length >= 2)

  // Кол-во программ
  const involvedIds = dupGroups.flatMap(g => g.map(s => s.id))
  const programCounts = new Map<number, number>()
  for (let i = 0; i < involvedIds.length; i += 200) {
    const slice = involvedIds.slice(i, i + 200)
    const { data } = await sb.from('programs').select('school_id').in('school_id', slice)
    for (const r of data || []) programCounts.set(r.school_id, (programCounts.get(r.school_id) || 0) + 1)
  }
  for (const g of dupGroups) for (const m of g) m.programCount = programCounts.get(m.id) || 0

  // Берём только MERGE-группы
  const toMerge = dupGroups.filter(g => classifyGroup(g) === 'merge')
  console.log(`К мержу: ${toMerge.length} групп\n`)

  let totalProgUpdated = 0
  let totalIdpUpdated = 0
  let totalDupsDeleted = 0
  let totalFieldsCopied = 0

  for (const group of toMerge) {
    const master = pickMaster(group)
    const dups = group.filter(s => s.id !== master.id)
    console.log(`🔗 master #${master.id} «${master.name}» ←`)

    // Step 1: заполнить master недостающими полями из dups
    const fieldsUpdate: Record<string, unknown> = {}
    for (const f of FIELDS_TO_FILL_FROM_DUPS) {
      if (master[f] != null && master[f] !== '') continue
      for (const d of dups) {
        if (d[f] != null && d[f] !== '') {
          fieldsUpdate[f] = d[f]
          break
        }
      }
    }
    if (Object.keys(fieldsUpdate).length > 0) {
      console.log(`     заполнить master: ${Object.keys(fieldsUpdate).join(', ')}`)
      totalFieldsCopied += Object.keys(fieldsUpdate).length
      if (execute) {
        const { error } = await sb.from('schools').update(fieldsUpdate).eq('id', master.id)
        if (error) console.log('     ❌ schools.update', error.message)
      }
    }

    for (const d of dups) {
      console.log(`     #${d.id} «${d.name}» (${d.programCount} прог в plan)`)

      // Считаем реальные программы и стипендии у дубля (head:true count:exact)
      const { count: realProg } = await sb.from('programs').select('id', { count: 'exact', head: true }).eq('school_id', d.id)
      const { count: realIdp } = await sb.from('idp_scholarships').select('id', { count: 'exact', head: true }).eq('school_id', d.id)
      const { count: realPhotos } = await sb.from('school_photos').select('id', { count: 'exact', head: true }).eq('school_id', d.id).then(r => r, () => ({ count: 0 }))

      // Step 2: переподвязать programs (всегда, не полагаемся на planned counter)
      if (execute) {
        const { error } = await sb.from('programs').update({ school_id: master.id }).eq('school_id', d.id)
        if (error) console.log('     ❌ programs.update', error.message)
      }
      if (realProg) totalProgUpdated += realProg

      // Step 3: idp_scholarships
      if (execute) {
        const { error } = await sb.from('idp_scholarships').update({ school_id: master.id }).eq('school_id', d.id)
        if (error) console.log('     ❌ idp_scholarships.update', error.message)
      }
      if (realIdp) totalIdpUpdated += realIdp

      // Step 3b: school_photos — если таблица есть и записи есть
      if (realPhotos && execute) {
        const { error } = await sb.from('school_photos').update({ school_id: master.id }).eq('school_id', d.id)
        if (error) console.log('     ❌ school_photos.update', error.message)
      }

      // Step 4: удалить дубль
      if (execute) {
        const { error } = await sb.from('schools').delete().eq('id', d.id)
        if (error) {
          console.log('     ❌ schools.delete', error.message)
          continue
        }
      }
      totalDupsDeleted += 1
    }
  }

  console.log(`\n${execute ? '✅ Выполнено' : '🧪 Было бы выполнено'}:`)
  console.log(`  • Заполнено полей в master-row'ах: ${totalFieldsCopied}`)
  console.log(`  • Переподвязано программ: ${totalProgUpdated}`)
  console.log(`  • Переподвязано IDP-стипендий: ${totalIdpUpdated}`)
  console.log(`  • Удалено school-row'ов: ${totalDupsDeleted}`)
  if (!execute) console.log('\n  Запусти с --execute чтобы применить.')
}
main()
