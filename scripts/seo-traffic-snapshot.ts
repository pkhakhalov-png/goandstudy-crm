// Посчитать и сохранить итоги по страницам вручную.
// Обычно это делает шаг gsc_import сразу после записи данных; здесь — на случай,
// когда снимок нужен немедленно (например, сразу после правок в коде).
import { config } from 'dotenv'; import path from 'path'
config({ path: path.resolve(process.cwd(), '.env.local') })
import { createClient } from '@supabase/supabase-js'
import { computeTrafficSnapshot, saveTrafficSnapshot } from '../lib/seo/traffic-snapshot'

async function main() {
  const seo = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  }).schema('seo') as any
  const t0 = Date.now()
  const snap = await computeTrafficSnapshot(seo)
  await saveTrafficSnapshot(seo, snap)
  console.log(`снимок сохранён за ${Date.now() - t0} мс`)
  console.log(`  строк учтено : ${snap.rowCount.toLocaleString('ru')}`)
  console.log(`  страниц      : ${Object.keys(snap.byPage).length}`)
  console.log(`  данные по    : ${snap.dataThrough}`)
  console.log(`  всего кликов : ${snap.totals.clicks.toLocaleString('ru')}, показов ${snap.totals.impressions.toLocaleString('ru')}`)
  console.log(`  28 дней      : ${snap.cur.clicks} кликов против ${snap.prev.clicks} за предыдущие 28`)
}
main().catch((e) => { console.error('✗', e?.message ?? e); process.exit(1) })
