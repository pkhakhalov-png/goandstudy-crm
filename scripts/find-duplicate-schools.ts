/**
 * Поиск дублей в schools (parser DB) по нормализованному имени + стране.
 * Только diagnostic — ничего не меняет.
 *
 *   npx tsx scripts/find-duplicate-schools.ts          # все дубли
 *   npx tsx scripts/find-duplicate-schools.ts --top 20 # первые 20 крупнейших групп
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

const STOP_WORDS = new Set([
  'university', 'universite', 'universidad', 'università', 'universität',
  'college', 'institute', 'institut', 'school', 'academy', 'academia',
  'of', 'the', 'and', 'для', 'имени', 'им', 'постgraduate', 'постграджуат',
  'undergraduate', 'graduate', 'undergrad', 'postgrad',
])

function normalize(name: string): string {
  return name
    .toLowerCase()
    .replace(/—.*$/, '')             // отрезаем суффикс после тире (постgraduate и т.п.)
    .replace(/['"`’]/g, '')
    .split(/[\s\-,.()/]+/)
    .filter(t => t && !STOP_WORDS.has(t))
    .join('')
    .replace(/[^\p{L}\p{N}]+/gu, '')
}

async function main() {
  const top = (() => {
    const i = process.argv.indexOf('--top')
    return i > 0 ? Number(process.argv[i + 1]) || 0 : 0
  })()

  console.log('Тяну все schools…')
  const all: { id: number; name: string; country_code: string | null; source: string | null; campus_photo_url: string | null; description: string | null; logo_url: string | null }[] = []
  for (let off = 0; off < 100000; off += 1000) {
    const { data } = await sb
      .from('schools')
      .select('id, name, country_code, source, campus_photo_url, description, logo_url')
      .order('id')
      .range(off, off + 999)
    if (!data || data.length === 0) break
    all.push(...(data as any))
    if (data.length < 1000) break
  }
  console.log(`Всего ${all.length} school-row'ов`)

  // Группируем по (normalized_name, country_code)
  const groups = new Map<string, typeof all>()
  for (const s of all) {
    const key = `${normalize(s.name)}__${(s.country_code || '').toLowerCase()}`
    if (!key.startsWith('__')) {
      const arr = groups.get(key) || []
      arr.push(s)
      groups.set(key, arr)
    }
  }

  const dupGroups = Array.from(groups.entries())
    .filter(([, arr]) => arr.length >= 2)
    .sort((a, b) => b[1].length - a[1].length)

  console.log(`\nНайдено ${dupGroups.length} групп дублей.`)

  // Для каждой группы — сколько программ
  const limit = top > 0 ? top : dupGroups.length
  console.log(`\nТоп ${Math.min(limit, dupGroups.length)} групп:\n`)

  let totalDups = 0
  let totalPrograms = 0
  for (let i = 0; i < Math.min(limit, dupGroups.length); i++) {
    const [key, members] = dupGroups[i]
    const [normKey, country] = key.split('__')
    console.log(`──── ${normKey} (${country}) — ${members.length} row'ов ────`)
    for (const m of members) {
      const { count } = await sb.from('programs').select('id', { count: 'exact', head: true }).eq('school_id', m.id)
      const flags = [
        m.campus_photo_url ? '📷' : ' ',
        m.description ? '📝' : ' ',
        m.logo_url ? '🏷️' : ' ',
      ].join('')
      console.log(`  ${flags} #${m.id} [${m.source || '?'}] ${count} прог · ${m.name}`)
      totalPrograms += count || 0
    }
    totalDups += members.length - 1
    console.log()
  }
  console.log(`\nИТОГО: ${dupGroups.length} групп · ${totalDups} лишних row'ов в показанной выборке · ${totalPrograms} программ затронуто`)
}
main()
