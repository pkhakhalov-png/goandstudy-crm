// Восстановить посадочные страницы у заявок, где они потерялись.
//
//   npx tsx scripts/seo-attribution-backfill.ts            # показать
//   npx tsx scripts/seo-attribution-backfill.ts --apply    # записать
//
// Посадочная не сохранялась из-за ошибки в порядке попыток: адрес формы
// приходит всегда, он же отсекался как непосадочный, и до referrer дело не
// доходило. Сам источник при этом уцелел — он лежит в deals.custom_fields,
// куда его клала запись брони. Значит потерянное восстановимо.
import { config } from 'dotenv'; import path from 'path'
config({ path: path.resolve(process.cwd(), '.env.local') })
import { createClient } from '@supabase/supabase-js'
import { landingPathOf, pageIdForPath } from '../lib/seo/attribution'

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
const seo = sb.schema('seo')
const APPLY = process.argv.includes('--apply')

async function main() {
  console.log(APPLY ? 'РЕЖИМ ЗАПИСИ\n' : 'режим показа — для записи добавь --apply\n')

  const { data: leads } = await seo.from('lead_identities')
    .select('id, external_lead_id, lead_at, first_touch_page')
    .is('first_touch_page', null).order('lead_at', { ascending: false })
  if (!leads?.length) { console.log('заявок без посадочной нет'); return }

  const ids = leads.map((l: any) => l.external_lead_id).filter(Boolean)
  const { data: deals } = await sb.from('deals').select('booking_id, custom_fields').in('booking_id', ids)
  const utmByBooking = new Map<string, any>((deals ?? []).map((d: any) => [d.booking_id, d.custom_fields ?? {}]))

  let restored = 0, noSource = 0, notOurPage = 0
  for (const l of leads as any[]) {
    const utm = utmByBooking.get(l.external_lead_id)
    if (!utm) { noSource++; console.log(`  ${l.lead_at.slice(0, 16)} — источник не сохранился`); continue }

    const p = landingPathOf(utm)
    if (!p) {
      notOurPage++
      const from = utm.referrer ?? utm.landing_url ?? '—'
      console.log(`  ${l.lead_at.slice(0, 16)} — посадочной нет: ${String(from).slice(0, 62)}`)
      continue
    }

    const pageId = await pageIdForPath(seo, p)
    if (!pageId) {
      notOurPage++
      console.log(`  ${l.lead_at.slice(0, 16)} — страница ${p} есть в адресе, но не в реестре страниц`)
      continue
    }

    restored++
    console.log(`  ✓ ${l.lead_at.slice(0, 16)} → ${p} (страница #${pageId})`)
    if (APPLY) {
      await seo.from('lead_identities')
        .update({ first_touch_page: pageId, last_touch_page: pageId })
        .eq('id', l.id).throwOnError()
    }
  }

  console.log(`\nвосстановлено: ${restored}`)
  console.log(`источник не сохранился: ${noSource}`)
  console.log(`посадочной нет по существу: ${notOurPage}`)
  if (!APPLY && restored > 0) console.log('\nчтобы записать: npx tsx scripts/seo-attribution-backfill.ts --apply')
}

main().catch((e) => { console.error('✗', e.message || e); process.exit(1) })
