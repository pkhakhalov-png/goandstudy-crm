// Срок годности утверждения (E2.5).
//
//   npx tsx scripts/seo-expiry-test.ts
//
// Счёт проверяется чистой функцией — без базы и без записи. Потом то же
// считается по живым утверждениям и печатается: числа в тестах ничего не
// стоят, если на настоящих данных выходит бессмыслица.
import { config } from 'dotenv'; import path from 'path'
config({ path: path.resolve(process.cwd(), '.env.local') })
import { createClient } from '@supabase/supabase-js'
import { computeExpiry, needsPrepublishRecheck, ttlDays, expiryFor, type ClaimRow } from '../lib/seo/expiry'

const seo = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } }).schema('seo')

let passed = 0, failed = 0
function ok(name: string, cond: boolean, note = '') {
  if (cond) { passed++; console.log(`✓ ${name}${note ? ' — ' + note : ''}`) }
  else { failed++; console.log(`✗ ${name}${note ? ' — ' + note : ''}`) }
}

const NOW = new Date('2026-09-17T12:00:00Z')
const days = (n: number) => new Date(NOW.getTime() + n * 86_400_000).toISOString()

const claim = (over: Partial<ClaimRow> = {}): ClaimRow => ({
  id: 1, kind: 'tuition_fee', status: 'active',
  verified_at: days(-10), valid_to: null, value_date: null, intake_start: null, ...over,
})

async function main() {
  ok('интервалы разбираются', ttlDays('180 days') === 180 && ttlDays('6 mons') === 180 && ttlDays('1 year') === 365
    && ttlDays('30 days') === 30 && ttlDays(null) === null && ttlDays('всякое') === null)

  // 1. Обычный случай: срок считает политика.
  const a = computeExpiry(claim(), '180 days', null, NOW)
  ok('по умолчанию срок ставит политика', a.reason === 'политика' && !a.expired,
    `до ${a.at?.toISOString().slice(0, 10)}`)

  // 2. Источник изменился после проверки — годность кончилась тогда, а не по политике.
  const b = computeExpiry(claim(), '180 days', new Date(days(-2)), NOW)
  ok('изменение источника обрывает срок раньше политики', b.reason === 'источник' && b.expired,
    `истекло ${b.at?.toISOString().slice(0, 10)}`)

  // 3. Срок подачи раньше срока политики.
  const c = computeExpiry(claim({ kind: 'deadline', value_date: days(5) }), '180 days', null, NOW)
  ok('срок подачи раньше политики — берётся он', c.reason === 'срок подачи' && !c.expired,
    `до ${c.at?.toISOString().slice(0, 10)}`)

  // 4. Прошедший срок подачи — утверждение не устаревшее, а неверное.
  const d = computeExpiry(claim({ kind: 'deadline', value_date: days(-3) }), '30 days', null, NOW)
  ok('прошедший срок подачи истекает', d.expired && d.reason === 'срок подачи')

  // 5. Начавшийся набор обрывает годность цены прошлого набора.
  const e = computeExpiry(claim({ intake_start: days(-1) }), '180 days', null, NOW)
  ok('начавшийся набор обрывает годность', e.expired && e.reason === 'набор')

  // 6. Берётся самое раннее из всех, а не первое попавшееся.
  const f = computeExpiry(claim({ kind: 'deadline', value_date: days(20), intake_start: days(8) }), '180 days', new Date(days(30)), NOW)
  ok('берётся самое раннее ограничение', f.reason === 'набор', `${f.reason} ${f.at?.toISOString().slice(0, 10)}`)

  // 6b. Источник старше нашей проверки: годность считается от его даты.
  //
  //     Проверили сегодня страницу, которая датирует себя 2023 годом. Число на
  //     ней настоящее — но это не значит, что оно действует.
  const old = computeExpiry(claim(), '180 days', null, NOW, new Date('2023-04-12'))
  ok('источник со своей датой истекает от неё, а не от нашей проверки',
    old.expired && old.reason === 'источник',
    `истекло ${old.at?.toISOString().slice(0, 10)}, проверяли ${days(-10).slice(0, 10)}`)

  const recent = computeExpiry(claim(), '180 days', null, NOW, new Date(days(-30)))
  ok('свежий источник со своей датой годность не режет', !recent.expired,
    `до ${recent.at?.toISOString().slice(0, 10)} (${recent.reason})`)

  // 7. Непроверенное — это не «истекло вчера».
  const g = computeExpiry(claim({ verified_at: null, status: 'unverified' }), '180 days', null, NOW)
  ok('непроверенное отличается от истёкшего', g.neverVerified && g.expired && g.at === null)

  // 8. Изменчивый тип определяется политикой, а не списком в коде.
  const h = computeExpiry(claim({ kind: 'deadline', verified_at: days(-1) }), '30 days', null, NOW)
  const i = computeExpiry(claim(), '180 days', null, NOW)
  ok('изменчивость берётся из политики', h.volatile && !i.volatile, 'дедлайн изменчив, цена обучения нет')

  // 9. Перепроверка перед выпуском: изменчивому мало непросроченности.
  const stale = claim({ kind: 'deadline', verified_at: days(-10) })
  const fresh = claim({ kind: 'deadline', verified_at: days(-2) })
  const r1 = needsPrepublishRecheck(stale, computeExpiry(stale, '30 days', null, NOW), NOW)
  const r2 = needsPrepublishRecheck(fresh, computeExpiry(fresh, '30 days', null, NOW), NOW)
  const r3 = needsPrepublishRecheck(claim(), computeExpiry(claim(), '180 days', null, NOW), NOW)
  ok('изменчивое с недельной давностью просит перепроверки', r1.need, r1.why)
  ok('свежее изменчивое не просит', !r2.need, r2.why)
  ok('неизменчивое не просит', !r3.need, r3.why)

  // Живые данные.
  const { data: all } = await seo.from('claims').select('id, kind, subject_key, statement, status').order('id')
  const ids = (all ?? []).map((c: any) => c.id)
  const map = await expiryFor(seo, ids)
  ok('срок считается по живым утверждениям', map.size === ids.length, `${map.size} из ${ids.length}`)

  let never = 0, expired = 0, live = 0
  for (const [, e2] of map) { if (e2.neverVerified) never++; else if (e2.expired) expired++; else live++ }
  console.log(`\nживые утверждения: ${live} годны, ${expired} истекли, ${never} не проверялись ни разу`)
  for (const c2 of (all ?? []) as any[]) {
    const e2 = map.get(c2.id)!
    if (e2.neverVerified) continue
    console.log(`  #${c2.id} [${c2.kind}] ${String(c2.statement).slice(0, 44)}…`)
    console.log(`     годно до ${e2.at?.toISOString().slice(0, 10) ?? '—'} (${e2.reason}), перепроверка: ${needsPrepublishRecheck(
      { id: c2.id, kind: c2.kind, status: c2.status, verified_at: null, valid_to: null, value_date: null, intake_start: null },
      e2).need ? 'нужна' : 'не нужна'}`)
  }

  console.log(`\n${passed} пройдено, ${failed} провалено`)
  process.exit(failed ? 1 : 0)
}
main()
