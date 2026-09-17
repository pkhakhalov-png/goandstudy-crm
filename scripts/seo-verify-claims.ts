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
    .select('id, url, domain, kind, source_type').eq('active', true).eq('source_type', 'web')
  if (!sources?.length) { console.log('активных веб-источников нет'); return }

  const { data: claims } = await seo.from('claims')
    .select('id, kind, subject_key, statement, value, value_num, unit, status').order('id')
  if (!claims?.length) { console.log('утверждений нет'); return }

  let confirmed = 0, notFound = 0

  for (const src of sources as any[]) {
    console.log(`── источник #${src.id} ${src.domain} (${src.kind})`)
    console.log(`   ${src.url}`)

    let snap
    try {
      snap = await snapshotSource(seo, src.id)
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

    for (const c of claims as any[]) {
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
  console.log(`не нашлось в источниках: ${claims.length - confirmed} из ${claims.length}`)
  if (!APPLY && confirmed > 0) console.log('\nчтобы записать: npx tsx scripts/seo-verify-claims.ts --apply')
}

main().catch((e) => { console.error('✗', e.message || e); process.exit(1) })
