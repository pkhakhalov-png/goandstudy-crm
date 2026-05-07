/**
 * Помечает schools.is_hidden=true для VET-провайдеров и аналогичных
 * прикладных колледжей которые не имеют мирового рейтинга. Языковые школы
 * остаются видимыми всегда.
 *
 * Run dry:    npx tsx scripts/hide-vet-providers.ts
 * Run apply:  npx tsx scripts/hide-vet-providers.ts --apply
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

// Whitelist — НЕ скрываем (университеты, политехи, специализированные элитные школы,
// языковые школы, медицинские/арт/музыкальные/кулинарные академии).
const KEEP_PATTERNS = [
  /\buniversity\b/i,
  /universit(é|ä|y|et|at|à|ad|atea)/i, // EN/DE/FR/IT/ES/PT
  /\bUni\.?\s/i, /\bUni-/i,
  /Hochschule/i, /Universidad/i, /Università/i, /Université/i,
  /\bpolytechn/i, /\bpolytechnic\b/i,
  /\binstitute\s+of\s+technology\b/i, // MIT, IIT
  /\bIIT\b/i, /\bMIT\b/i,
  /\bcommunity\s+college\b/i, // оставляем (Lone Star, Houston и т.п. — это accredited)
  /\blanguage\b/i, /\bsprach/i, /\bidiom/i,
  /\benglish\s+(school|centre|center)\b/i,
  /\bESL\b/i, /\bIELTS\b/i, /\bTOEFL\b/i,
  /\bschool\s+of\s+(film|art|design|music|architecture|fashion|theatre|drama|business|economics|medicine|nursing|law)\b/i,
  /\bfilm\b/i, /\bconservatory\b/i, /\bconservatoire\b/i,
  /\bart\b/i, /\bdesign\b/i, /\bmusic\b/i, /\bculinary\b/i,
  /\bmedical\b/i, /\bbusiness\s+school\b/i,
  /\bRoyal\s+/i, /\bImperial\b/i,
]

async function main() {
  const apply = process.argv.includes('--apply')

  // Все schools, выбираем в RAM — у нас всего ~3500
  // is_hidden может ещё не быть — пробуем без него если колонки нет
  let all: any[] | null = null
  let hasHiddenCol = true
  {
    const r = await sb.from('schools')
      .select('id, name, country_code, university_type, qs_rank, is_hidden, raw_data')
      .order('id')
    if (r.error && /is_hidden/.test(r.error.message)) {
      hasHiddenCol = false
      const r2 = await sb.from('schools')
        .select('id, name, country_code, university_type, qs_rank, raw_data')
        .order('id')
      all = r2.data || null
      if (r2.error) { console.error(r2.error.message); process.exit(1) }
    } else if (r.error) {
      console.error(r.error.message); process.exit(1)
    } else {
      all = r.data
    }
  }
  if (!all) { console.error('no schools'); process.exit(1) }
  if (!hasHiddenCol) {
    console.log('⚠️  Колонки schools.is_hidden ещё нет. Сначала прогонии supabase/parser-hidden-and-language.sql в SQL Editor парсера.')
    console.log('Сейчас покажу что хотел бы скрыть (dry-run).\n')
  }

  const toHide: { id: number; name: string; country: string }[] = []
  for (const s of all) {
    if (s.is_hidden) continue
    const ex = (s.raw_data as any)?.curator_extras || {}
    const hasAnyRank = s.qs_rank || ex.the_rank || ex.arwu_rank || ex.usnews_rank || ex.webometrics_rank
    if (hasAnyRank) continue // ранкованные точно не VET — оставляем

    const matchKeep = KEEP_PATTERNS.some(re => re.test(s.name))
    if (matchKeep) continue

    // Сильные VET-индикаторы в названии — скрываем всегда
    const STRONG_VET = [
      /\btraining\b/i,
      /\bRTO\b/i,
      /\bvocational\b/i,
      /\bcareer\s+(college|institute|academy)\b/i,
      /\bemployment\s+australia\b/i,
      /\btrade\s+(college|institute|school)\b/i,
      /\bbusiness\s+college\b/i,
      /\bmanagement\s+college\b/i,
      /\bskill(s)?\s+(institute|academy|college)\b/i,
      /\btechnical\s+(institute|college)\s+of\b/i,
    ]
    const isStrongVet = STRONG_VET.some(re => re.test(s.name))
    const isPrivate = s.university_type === 'Частный'
    // Скрываем если: явный VET-токен ИЛИ частный без ранка
    if (!isStrongVet && !isPrivate) continue

    toHide.push({ id: s.id, name: s.name, country: (s.country_code || '?').toUpperCase() })
  }

  console.log(`Кандидатов на скрытие: ${toHide.length}`)
  for (const x of toHide.slice(0, 30)) {
    console.log(`  ${x.id} | ${x.name} | ${x.country}`)
  }
  if (toHide.length > 30) console.log(`  …+${toHide.length - 30}`)

  if (!apply || !hasHiddenCol) {
    console.log('\nDRY RUN. Запусти с --apply чтобы пометить is_hidden=true (после миграции SQL).')
    return
  }

  const ids = toHide.map(x => x.id)
  const CHUNK = 200
  for (let i = 0; i < ids.length; i += CHUNK) {
    const slice = ids.slice(i, i + CHUNK)
    const { error } = await sb.from('schools').update({ is_hidden: true }).in('id', slice)
    if (error) console.error(`chunk ${i}: ${error.message}`)
    else console.log(`chunk ${i}-${i + slice.length}: ok`)
  }
  console.log(`\n✅ Скрыто ${ids.length} вузов. Можно вернуть UPDATE schools SET is_hidden=false WHERE id IN (...).`)
}
main().catch(e => { console.error(e); process.exit(1) })
