// Кэш проверок: одна пара «версия утверждения × версия источника» проверяется
// один раз (E2.6).
//
//   npx tsx scripts/seo-cache-test.ts
//
// Проверяется на живой базе, но своими строками: все записи помечены
// проверяющим `тест/…` и удаляются в конце, даже если проверка упала. Урок
// прошлого раза — тестовый мусор в рабочей таблице потом читается как расходы.
import { config } from 'dotenv'; import path from 'path'
config({ path: path.resolve(process.cwd(), '.env.local') })
import { createClient } from '@supabase/supabase-js'
import { cachedVerify, cacheStats, __resetCacheProbe, type VerifyResult } from '../lib/seo/verify-cache'

const seo = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } }).schema('seo')

let passed = 0, failed = 0
function ok(name: string, cond: boolean, note = '') {
  if (cond) { passed++; console.log(`✓ ${name}${note ? ' — ' + note : ''}`) }
  else { failed++; console.log(`✗ ${name}${note ? ' — ' + note : ''}`) }
}

const HASH_A = 'тест-страница-до-правки'
const HASH_B = 'тест-страница-после-правки'
const supports = (): VerifyResult => ({
  outcome: 'supports', evidence: { quote: 'стоимость обучения 2500 юаней', locator: 'offset:100', method: 'exact_number' }, costUsd: 0.012,
})
const notFound = (): VerifyResult => ({ outcome: 'not_found', evidence: null, costUsd: 0.009 })

async function main() {
  __resetCacheProbe()

  const probe = await seo.from('verification_cache').select('id').limit(1)
  if (probe.error) {
    console.log('таблицы кэша нет — миграция 20260917080000 не применена.')
    console.log('Файл: docs/sql/кэш-проверок.sql. Без неё проверка идёт каждый раз, как и раньше.')
    process.exit(2)
  }

  const { data: claim } = await seo.from('claims').select('id').order('id').limit(1).single()
  const { data: src } = await seo.from('sources').select('id').order('id').limit(1).single()
  if (!claim || !src) { console.log('нет утверждений или источников — проверять нечего'); process.exit(2) }

  const base = { claimId: claim.id, sourceId: src.id, snapshotId: null }
  let runs = 0
  const counted = (r: () => VerifyResult) => async () => { runs++; return r() }

  try {
    // 1. Второй раз то же самое не считается.
    runs = 0
    const first = await cachedVerify(seo, { ...base, claimVersion: 1, contentHash: HASH_A, checker: 'тест/v1' }, counted(supports))
    const second = await cachedVerify(seo, { ...base, claimVersion: 1, contentHash: HASH_A, checker: 'тест/v1' }, counted(supports))
    ok('повторная проверка не запускается', runs === 1 && second.fromCache && !first.fromCache, `запусков ${runs}`)
    ok('из кэша приходит та же выдержка', second.evidence?.quote === first.evidence?.quote)

    // 2. Правка утверждения не наследует старое подтверждение.
    runs = 0
    const v2 = await cachedVerify(seo, { ...base, claimVersion: 2, contentHash: HASH_A, checker: 'тест/v1' }, counted(supports))
    ok('правка утверждения сбрасывает ответ', runs === 1 && !v2.fromCache, `запусков ${runs}`)

    // 3. Изменилась страница — проверяем заново.
    runs = 0
    const other = await cachedVerify(seo, { ...base, claimVersion: 1, contentHash: HASH_B, checker: 'тест/v1' }, counted(supports))
    ok('изменение страницы сбрасывает ответ', runs === 1 && !other.fromCache, `запусков ${runs}`)

    // 4. Новый промпт — это новая проверка, а не тот же ответ.
    runs = 0
    const v2prompt = await cachedVerify(seo, { ...base, claimVersion: 1, contentHash: HASH_A, checker: 'тест/v2' }, counted(supports))
    ok('другая версия промпта сбрасывает ответ', runs === 1 && !v2prompt.fromCache, `запусков ${runs}`)

    // 5. «Искали и не нашли» запоминается наравне с находкой — именно этот
    //    случай повторяется перед каждой следующей попыткой выпуска.
    runs = 0
    const miss1 = await cachedVerify(seo, { ...base, claimVersion: 9, contentHash: HASH_A, checker: 'тест/v1' }, counted(notFound))
    const miss2 = await cachedVerify(seo, { ...base, claimVersion: 9, contentHash: HASH_A, checker: 'тест/v1' }, counted(notFound))
    ok('«не нашли» тоже запоминается', runs === 1 && miss2.fromCache && miss2.outcome === 'not_found', `запусков ${runs}`)
    ok('из кэша не приходит подтверждения там, где его не было', miss2.evidence === null)
    void miss1

    // 6. Снимок не снялся — версии источника нет, кэшировать нечего.
    runs = 0
    await cachedVerify(seo, { ...base, claimVersion: 1, contentHash: null, checker: 'тест/v1' }, counted(supports))
    await cachedVerify(seo, { ...base, claimVersion: 1, contentHash: null, checker: 'тест/v1' }, counted(supports))
    ok('без снимка ответ не кэшируется', runs === 2, `запусков ${runs}`)

    // 7. Попадания считаются: без них не ответить, окупается ли кэш.
    const { data: row } = await seo.from('verification_cache').select('hits, cost_usd')
      .eq('claim_id', claim.id).eq('claim_version', 1).eq('content_hash', HASH_A).eq('checker', 'тест/v1').single()
    ok('попадания считаются', Number(row?.hits ?? 0) === 1, `попаданий ${row?.hits}`)

    const stats = await cacheStats(seo)
    ok('сводка по кэшу читается', stats.available && stats.entries > 0, `записей ${stats.entries}, попаданий ${stats.hits}, сэкономлено $${stats.savedUsd.toFixed(3)}`)
  } finally {
    const { count } = await seo.from('verification_cache').delete({ count: 'exact' }).like('checker', 'тест/%')
    console.log(`\nприбрано тестовых записей: ${count ?? 0}`)
    const { data: left } = await seo.from('verification_cache').select('id').like('checker', 'тест/%')
    if (left?.length) console.log(`ВНИМАНИЕ: осталось ${left.length} тестовых записей`)
  }

  console.log(`\n${passed} пройдено, ${failed} провалено`)
  process.exit(failed ? 1 : 0)
}
main()
