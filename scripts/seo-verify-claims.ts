// Проверить утверждения по тексту источника.
//
//   npx tsx scripts/seo-verify-claims.ts             # показать, ничего не менять
//   npx tsx scripts/seo-verify-claims.ts --apply     # записать подтверждения
//
// Снимает свежий снимок каждого активного источника и ищет в тексте дословное
// место, подтверждающее каждое утверждение. Подтверждением считается только
// совпадение, а не соседство со ссылкой: PRD говорит прямо, что наличие URL
// подтверждением не является.
//
// По умолчанию режим показа: сначала смотрим, что получится, и только потом
// решаем записывать. Проверка фактов — не то место, где стоит узнавать
// результат уже после записи.
import { config } from 'dotenv'; import path from 'path'
config({ path: path.resolve(process.cwd(), '.env.local') })
import { createClient } from '@supabase/supabase-js'
import { snapshotSource, findEvidence, verifyClaimAgainst } from '../lib/seo/provenance'

const seo = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } }).schema('seo')
const APPLY = process.argv.includes('--apply')

async function main() {
  console.log(APPLY ? 'РЕЖИМ ЗАПИСИ\n' : 'режим показа — ничего не меняется, для записи добавь --apply\n')

  const { data: sources } = await seo.from('sources')
    .select('id, url, domain, kind, source_type, subject_key, critical').eq('active', true).eq('source_type', 'web')
    .order('critical', { ascending: false }).order('id')
  if (!sources?.length) { console.log('активных веб-источников нет'); return }

  const { data: claims } = await seo.from('claims')
    .select('id, kind, subject_key, statement, value, value_num, unit, status').order('id')
  if (!claims?.length) { console.log('утверждений нет'); return }

  // Утверждения разложены по предмету заранее.
  //
  // Раньше режим показа гонял каждое утверждение по каждому источнику и печатал
  // «✓» на любом совпадении числа. Пока источник был один, это было почти
  // безобидно. С реестром по нескольким странам показ начал уверенно
  // подтверждать британскую сумму канадской страницей — а запись (--apply) тем
  // временем такую связь отвергала, потому что verifyClaimAgainst сверяет
  // предмет до всего остального. Показ, который расходится с записью, хуже
  // отсутствия показа: по нему принимают решение записывать.
  const поПредмету = new Map<string, any[]>()
  for (const c of claims as any[]) {
    const list = поПредмету.get(c.subject_key) ?? []
    list.push(c)
    поПредмету.set(c.subject_key, list)
  }

  let confirmed = 0, notFound = 0, проверено = 0

  for (const src of sources as any[]) {
    console.log(`── источник #${src.id} ${src.domain} (${src.kind})${src.critical ? ' [критичный]' : ''}`)
    console.log(`   ${src.url}`)
    const свои = src.subject_key ? (поПредмету.get(src.subject_key) ?? []) : []
    if (!свои.length) {
      console.log(src.subject_key
        ? `   утверждений про «${src.subject_key}» нет — подтверждать нечего\n`
        : '   у источника не заполнен subject_key — подтвердить им нельзя ничего\n')
      continue
    }
    console.log(`   предмет «${src.subject_key}», утверждений под ним: ${свои.length}`)

    let snap
    try {
      // Десять минут — чтобы прогон подряд не качал одну и ту же страницу заново.
      // Осмысленная проверка «а не изменилось ли» этим сроком не ломается.
      snap = await snapshotSource(seo, src.id, { maxAgeMin: 10 })
    } catch (e: any) {
      console.log(`   ✗ снимок не снялся: ${e?.message ?? e}\n`)
      continue
    }
    if (snap.error) {
      console.log(`   ✗ страница не прочиталась: ${snap.error}`)
      console.log('     (строка со снимком всё равно записана — недоступность это наблюдение)\n')
      continue
    }
    console.log(`   снимок #${snap.id}: HTTP ${snap.httpStatus}, ${snap.text.length} символов текста`)
    if (snap.finalUrl && snap.finalUrl !== src.url) console.log(`   после редиректов: ${snap.finalUrl}`)
    console.log('')

    for (const c of свои) {
      проверено++
      const found = findEvidence(snap.text, c)
      if (!found) { notFound++; continue }

      confirmed++
      console.log(`   ✓ #${c.id} [${c.kind}] ${c.statement.slice(0, 70)}`)
      console.log(`      способ: ${found.method}, ${found.locator}`)
      console.log(`      «${found.quote.slice(0, 160)}»`)

      if (APPLY) {
        const ev = await verifyClaimAgainst(seo, c.id, snap)
        console.log(`      ${ev ? 'записано' : 'не записалось'}`)
      }
      console.log('')
    }
  }

  console.log(`\nподтверждено: ${confirmed}`)
  console.log(`не нашлось в тексте своих источников: ${notFound} из ${проверено} проверенных пар`)
  console.log(`утверждений в реестре всего: ${claims.length} (остальные проверять не по чему — источника с тем же предметом нет)`)
  if (!APPLY && confirmed > 0) console.log('\nчтобы записать: npx tsx scripts/seo-verify-claims.ts --apply')
}

main().catch((e) => { console.error('✗', e.message || e); process.exit(1) })
