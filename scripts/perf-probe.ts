/**
 * Разведка перед правками: сколько стоит сам поход до базы и сколько — данные.
 *
 * Без этого замеры нечитаемы. Если пустой запрос идёт 90 мс, то экран из
 * двадцати запросов не может уложиться в 700 мс никакими индексами — лечится
 * только уменьшением числа походов. А если один запрос на сотню строк идёт
 * 700 мс, дело в самих данных.
 *
 *   npx tsx scripts/perf-probe.ts
 */
import { config } from 'dotenv'
import path from 'path'
config({ path: path.resolve(process.cwd(), '.env.local') })
import { createClient } from '@supabase/supabase-js'

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false, autoRefreshToken: false },
})
const seo = sb.schema('seo') as any

async function time<T>(label: string, fn: () => PromiseLike<T>, runs = 5): Promise<number> {
  const times: number[] = []
  let sample: any = null
  for (let i = 0; i < runs; i++) {
    const t0 = performance.now()
    sample = await fn()
    times.push(performance.now() - t0)
  }
  times.sort((a, b) => a - b)
  const best = times[0]
  const med = times[Math.floor(times.length / 2)]
  const rows = Array.isArray(sample?.data) ? sample.data.length : (sample?.count ?? '—')
  const bytes = sample?.data ? JSON.stringify(sample.data).length : 0
  console.log(
    `${label.padEnd(46)} лучшее ${String(Math.round(best)).padStart(5)} мс · медиана ${String(Math.round(med)).padStart(5)} мс`
    + ` · строк ${String(rows).padStart(6)}${bytes ? ` · ${(bytes / 1024).toFixed(0)} КБ` : ''}`,
  )
  return best
}

async function main() {
  console.log('\nСКОЛЬКО СТОИТ ОДИН ПОХОД ДО БАЗЫ')
  console.log('─'.repeat(96))
  const rtt = await time('пустой запрос (только накладные расходы)', () =>
    sb.from('users').select('id').limit(1).then((r: any) => r), 7)

  console.log('\nТАБЛИЦЫ CRM')
  console.log('─'.repeat(96))
  await time('deals · только id', () => sb.from('deals').select('id').is('deleted_at', null).then((r: any) => r))
  await time('deals · поля карточки', () => sb.from('deals')
    .select('id, title, stage_id, salesperson_id, contact_name, contact_phone, contact_telegram, contact_email, contact_whatsapp, budget, source, created_at, updated_at')
    .is('deleted_at', null).then((r: any) => r))
  await time('deals · со всеми полями (select *)', () => sb.from('deals').select('*').is('deleted_at', null).limit(200).then((r: any) => r))
  await time('deals · только custom_fields', () => sb.from('deals').select('id, custom_fields').is('deleted_at', null).then((r: any) => r))
  await time('deals · счёт по этапу', () => sb.from('deals').select('*', { count: 'exact', head: true }).is('deleted_at', null).then((r: any) => r))
  await time('clients · всё', () => sb.from('clients').select('*').then((r: any) => r))
  await time('payments_view · всё', () => sb.from('payments_view').select('*').then((r: any) => r))

  console.log('\nТАБЛИЦЫ SEO')
  console.log('─'.repeat(96))
  await time('gsc_page_daily · счёт', () => seo.from('gsc_page_daily').select('*', { count: 'exact', head: true }).then((r: any) => r))
  await time('gsc_page_daily · одна тысяча строк', () => seo.from('gsc_page_daily')
    .select('normalized_url, date, clicks, impressions, position').range(0, 999).then((r: any) => r))
  await time('gsc_page_daily · за 28 дней, одна тысяча', () => seo.from('gsc_page_daily')
    .select('normalized_url, date, clicks, impressions, position')
    .gte('date', new Date(Date.now() - 28 * 864e5).toISOString().slice(0, 10)).range(0, 999).then((r: any) => r))
  await time('gsc_daily · счёт', () => seo.from('gsc_daily').select('*', { count: 'exact', head: true }).then((r: any) => r))
  await time('article_versions · meta целиком (10 шт)', () => seo.from('article_versions').select('id, meta').limit(10).then((r: any) => r))
  await time('article_versions · только slug из meta (10 шт)', () => seo.from('article_versions')
    .select('id, article_id, slug:meta->publish->>slug').limit(10).then((r: any) => r))
  await time('articles · список', () => seo.from('articles').select('id, status, published_at, current_version_id').then((r: any) => r))
  await time('pages · список', () => seo.from('pages').select('id, normalized_url, page_type').is('removed_at', null).then((r: any) => r))
  await time('index_status · select *', () => seo.from('index_status').select('*').then((r: any) => r))

  console.log('\nПОДДЕРЖИВАЕТ ЛИ POSTGREST ГРУППИРОВКУ')
  console.log('─'.repeat(96))
  const agg = await seo.from('gsc_page_daily').select('normalized_url, clicks.sum(), impressions.sum()').limit(5)
  if (agg.error) {
    console.log('нет: ' + agg.error.message.slice(0, 120))
    console.log('значит суммы придётся считать в памяти или заводить представление в базе')
  } else {
    console.log('да — суммирование работает на стороне базы, пример строки:', JSON.stringify(agg.data?.[0]))
    await time('gsc_page_daily · суммы по страницам одним запросом', () => seo.from('gsc_page_daily')
      .select('normalized_url, clicks.sum(), impressions.sum()').then((r: any) => r))
  }

  console.log(`\nвывод: один поход до базы стоит ~${Math.round(rtt)} мс. Экран из N запросов`)
  console.log(`не может открыться быстрее, чем N походов, идущих не параллельно.\n`)
}

main().catch((e) => { console.error('✗', e?.message ?? e); process.exit(1) })
