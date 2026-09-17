// Проверки адаптации поста (E4.8).
//
// Главная проверка здесь одна: провайдер не ответил — исход «ждёт», а не
// «пройдено». Ради неё в adaptationReview есть подмена вызова: тест подсовывает
// отказ и смотрит, чем это кончилось. Без такой проверки правило живёт только в
// комментарии, а комментарий не выполняется.
//
// Часть проверок идёт к живой базе (запись в content.reviews и уборка через
// content.purge_package). Если схема недоступна, они честно пропускаются.
//
// Запуск: npx tsx scripts/content-adaptation-selfcheck.ts
import { config } from 'dotenv'; import path from 'path'
config({ path: path.resolve(process.cwd(), '.env.local') })
import { createClient } from '@supabase/supabase-js'
import {
  codeChecks, reviewScope, adaptationReview, recordAdaptationReview,
  significantNumbers, linksIn,
  type AdaptationInput, type ReviewerAnswer,
} from '../lib/content/adaptation-check'
import { composePost } from '../lib/content/social-compose'

let passed = 0, failed = 0
async function test(name: string, fn: () => Promise<string | void> | string | void) {
  try {
    const note = await fn()
    passed++; console.log(`✓ ${name}${note ? ` — ${note}` : ''}`)
  } catch (e) {
    failed++; console.log(`✗ ${name}\n    ${e instanceof Error ? e.message : String(e)}`)
  }
}
function assert(cond: unknown, msg: string) { if (!cond) throw new Error(msg) }

/* ── Материал и пост ──────────────────────────────────────────────────────── */

const packageText = `Подача на грант DSU в Италии закрывается раньше, чем приём документов в вузе.
Заявка на грант подаётся в региональное агентство, срок приёма 2026 — обычно до 25 августа.
Стоимость обучения в государственном вузе — от 900 до 4 000 евро в год, зависит от ISEE.
Легализация диплома занимает несколько недель.
Подробный разбор: https://goandstudy.com/blog/kak-poehat-uchitsya-v-italiyu/`

const goodParts = {
  hook: 'Грант DSU закрывается раньше, чем приём документов.',
  thesis: 'Заявка на грант подаётся в региональное агентство отдельно и раньше, чем документы в вуз.',
  body: [
    'Срок подачи на грант — обычно до 25 августа.',
    'Документы для вуза собираются параллельно, а не после.',
    'Легализация диплома занимает несколько недель.',
  ],
  cta: 'Разобрали порядок по шагам',
  link: 'https://goandstudy.com/blog/kak-poehat-uchitsya-v-italiyu/?utm_source=telegram&utm_medium=post&utm_content=1201',
  // Пост называет срок, значит обязан нести оговорку про год: приёмная кампания
  // сдвигается, а пост остаётся в ленте и в поиске
  disclosures: [
    'Не оферта: условия поступления определяет вуз.',
    'Срок приёма 2026 — на следующий год сверяйтесь с сайтом вуза.',
  ],
}

const base = (): AdaptationInput => ({
  platform: 'telegram',
  packageText,
  post: composePost('telegram', goodParts),
  parts: goodParts,
})

/* ── Кодовые проверки ─────────────────────────────────────────────────────── */

async function main() {

await test('числа поста — подмножество чисел пакета', () => {
  const ok = codeChecks(base())
  assert(ok.ok, `честный пост не прошёл: ${ok.findings.map((f) => f.what).join('; ')}`)

  const withNewPrice = {
    ...base(),
    post: composePost('telegram', { ...goodParts, body: [...goodParts.body, 'Общежитие обойдётся в 350 евро в месяц.'] }),
  }
  const bad = codeChecks(withNewPrice)
  assert(!bad.ok, 'пост с ценой, которой нет в пакете, прошёл проверку')
  assert(bad.findings.some((f) => f.what.includes('350')), 'не названо само число')
  return 'новая цена в посте блокирует выпуск'
})

await test('ссылка обязана быть из пакета, метки при сравнении не мешают', () => {
  const ok = codeChecks(base())
  assert(ok.ok, 'ссылка из пакета с метками признана чужой — utm должны отбрасываться при сравнении')

  const foreign = {
    ...base(),
    post: composePost('telegram', { ...goodParts, link: 'https://example.com/promo/?utm_source=telegram&utm_medium=post' }),
  }
  const bad = codeChecks(foreign)
  assert(!bad.ok, 'чужая ссылка прошла проверку')
  assert(bad.findings.some((f) => f.what.includes('example.com')), 'не названа сама ссылка')
  return 'своя ссылка с метками проходит, чужая — нет'
})

await test('новая категоричная формулировка не проходит', () => {
  const bad = {
    ...base(),
    post: composePost('telegram', { ...goodParts, thesis: 'Виза в Италию для этой поездки не нужна.' }),
  }
  const r = codeChecks(bad)
  assert(!r.ok, 'визовое утверждение, которого нет в пакете, прошло проверку')
  assert(r.findings.some((f) => f.what.includes('visa')), 'формулировка не опознана как визовая')
  return 'при сокращении оговорки теряются первыми — это ловится кодом'
})

await test('числа и ссылки разбираются в сравнимый вид', () => {
  const n = significantNumbers('Стоимость — от 900 до 4 000 евро, срок до 25 августа 2026.')
  assert(n.has('4000'), `«4 000 евро» не разобрано: ${[...n].join(', ')}`)
  assert(n.has('2026'), 'год не считается значимым числом, хотя он и есть условие')
  const l = linksIn('текст https://goandstudy.com/blog/x/?utm_source=vk и https://goandstudy.com/blog/x')
  assert(l.size === 1, `один адрес с меткой и без превратился в ${l.size} разных`)
  return `${n.size} чисел, адрес один`
})

/* ── Глубина проверки ─────────────────────────────────────────────────────── */

await test('перевод возвращает полную проверку', () => {
  const r = reviewScope({ ...base(), packageLanguage: 'ru', postLanguage: 'en' })
  assert(r.scope === 'полная', 'перевод проверяется сокращённо')
  assert(/перевод/.test(r.why), 'причина не названа')
  return r.why
})

await test('новое утверждение возвращает полную проверку', () => {
  const r = reviewScope({
    ...base(),
    post: composePost('telegram', { ...goodParts, body: [...goodParts.body, 'Общежитие — 350 евро в месяц.'] }),
    previousVerifiedText: 'что угодно, лишь бы проверка была не первой',
  })
  assert(r.scope === 'полная', 'пост с новым числом ушёл на сокращённую проверку')
  return r.why
})

await test('пересборка из проверенного — сокращённая проверка', () => {
  const r = reviewScope({ ...base(), previousVerifiedText: 'прошлый проверенный текст того же варианта' })
  assert(r.scope === 'сокращённая', `пересборка требует полной проверки: ${r.why}`)
  return r.why
})

await test('первая проверка варианта — всегда полная', () => {
  const r = reviewScope({ ...base(), previousVerifiedText: null })
  assert(r.scope === 'полная', 'вариант проверяется впервые, а проверка сокращённая')
  return r.why
})

/* ── Главное: отказ провайдера ────────────────────────────────────────────── */

const answer = (role: 'fact_reviewer' | 'context_reviewer', verdict: ReviewerAnswer['verdict']): ReviewerAnswer =>
  ({ role, provider: 'anthropic', model: 'claude-opus-5', verdict, explanation: 'проверено' })

await test('оба провайдера не ответили — исход «ждёт», а не «пройдено»', async () => {
  const r = await adaptationReview(null, base(), {
    ask: async (role) => ({
      role, provider: 'anthropic', model: 'claude-opus-5', verdict: 'insufficient',
      explanation: 'провайдер не ответил', unavailable: true, error: 'fetch failed',
    }),
  })
  assert(r.outcome === 'waiting', `исход «${r.outcome}» вместо «waiting» — отказ провайдера превратился в результат`)
  assert(r.verdict === null, `у несостоявшейся проверки появился вердикт «${r.verdict}»`)
  assert(/не ответил/.test(r.why), `в объяснении нет причины: ${r.why}`)
  return r.why.slice(0, 80)
})

await test('один ответил, второй нет — всё равно «ждёт»', async () => {
  const r = await adaptationReview(null, base(), {
    ask: async (role) => role === 'fact_reviewer'
      ? answer(role, 'supported')
      : { ...answer(role, 'insufficient'), unavailable: true, error: '503 upstream' },
  })
  assert(r.outcome === 'waiting', `исход «${r.outcome}»: одной проверки достаточно — значит, второй можно не делать вовсе`)
  assert(r.reviewers.length === 2, 'в отчёте не видно, кто именно не ответил')
  return 'одна проверка из двух — это не две проверки'
})

await test('обе подтвердили — пройдено', async () => {
  const r = await adaptationReview(null, base(), { ask: async (role) => answer(role, 'supported') })
  assert(r.outcome === 'passed' && r.verdict === 'passed', `исход «${r.outcome}» при двух supported`)
  return `проверка ${r.scope.scope}`
})

await test('расхождение проверок решается в пользу тяжёлого вердикта', async () => {
  const r = await adaptationReview(null, base(), {
    ask: async (role) => answer(role, role === 'fact_reviewer' ? 'supported' : 'contradicted'),
  })
  assert(r.outcome === 'failed' && r.verdict === 'contradicted',
    `исход «${r.outcome}/${r.verdict}»: из двух вердиктов должен браться тяжёлый`)
  return 'проверка может ухудшить вердикт и не может его улучшить'
})

await test('код блокирует — провайдеров не зовём вовсе', async () => {
  let calls = 0
  const r = await adaptationReview(null, {
    ...base(),
    post: composePost('telegram', { ...goodParts, body: [...goodParts.body, 'Общежитие — 350 евро в месяц.'] }),
  }, { ask: async (role) => { calls++; return answer(role, 'supported') } })
  assert(r.outcome === 'failed', `исход «${r.outcome}» при блокирующей находке кода`)
  assert(calls === 0, `провайдеров вызвали ${calls} раз за пост, который не пройдёт при любом ответе`)
  return 'кодовые проверки бесплатные и идут первыми'
})

await test('теневой прогон — это «ещё не проверено», а не «пройдено»', async () => {
  const r = await adaptationReview(null, base(), { askModels: false })
  assert(r.outcome === 'waiting', `теневой прогон дал «${r.outcome}» — код в одиночку не выносит «пройдено»`)
  return r.why
})

/* ── Запись результата ────────────────────────────────────────────────────── */

await test('у несостоявшейся проверки не появляется строки в reviews', async () => {
  const r = await adaptationReview(null, base(), {
    ask: async (role) => ({ ...answer(role, 'insufficient'), unavailable: true, error: 'timeout' }),
  })
  const written = await recordAdaptationReview(null, 1, r)
  assert(written.written === false, 'проверка, которой не было, записана в журнал как состоявшаяся')
  return written.why
})

/* ── Живая база ───────────────────────────────────────────────────────────── */

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
const content = url && key ? createClient(url, key).schema('content') : null

await test('результат ложится в content.reviews и убирается за собой', async () => {
  if (!content) return 'нет доступа к базе — проверка пропущена'

  const probe = await content.from('reviews').select('id', { head: true, count: 'exact' })
  if (probe.error) return `схема content недоступна (${probe.error.message.slice(0, 40)}) — проверка пропущена`

  const { data: pkg, error: e1 } = await content.from('packages')
    .insert({ intent: 'проверка E4.8', audience: 'тест', status: 'draft' }).select('id').single()
  assert(!e1 && pkg, `пакет не создался: ${e1?.message}`)
  const packageId = pkg!.id

  let variantVersionId: number | null = null
  let reviewId: number | null = null
  try {
    const { data: pv } = await content.from('package_versions')
      .insert({ package_id: packageId, version: 1, body: packageText, content_hash: 'test-hash-e48' })
      .select('id').single()
    const { data: variant } = await content.from('variants')
      .insert({ package_id: packageId, format: 'social_post', editorial_angle: 'что делать прямо сейчас' })
      .select('id').single()
    const { data: vv, error: e2 } = await content.from('variant_versions')
      .insert({
        variant_id: variant!.id, version: 1, package_version_id: pv?.id ?? null,
        body_json: { text: composePost('telegram', goodParts).text }, content_hash: 'test-hash-vv-e48',
      }).select('id').single()
    assert(!e2 && vv, `версия варианта не создалась: ${e2?.message}`)
    variantVersionId = vv!.id

    const report = await adaptationReview(null, base(), { ask: async (role) => answer(role, 'supported') })
    const written = await recordAdaptationReview(content, vv!.id, report, { version: 1 })
    assert(written.written, `проверка не записалась: ${written.why}`)

    const { data: row } = await content.from('reviews').select('*').eq('id', written.id).single()
    assert(row.target_type === 'variant_version', `target_type = ${row.target_type}`)
    assert(row.verdict === 'passed', `вердикт ${row.verdict}`)
    assert(row.target_hash === report.targetHash, 'хеш проверенного текста не сошёлся')
    assert(row.findings_json?.scope?.scope, 'в находках не сохранилась глубина проверки')

    reviewId = written.id ?? null
  } finally {
    // Уборка в finally, а не после проверок: упавшая проверка оставляла строку
    // в reviews, и это выяснилось ровно так — двумя осиротевшими записями
    if (reviewId) await content.from('reviews').delete().eq('id', reviewId)
    // Прямое удаление версий запрещено триггером — и это не баг
    const direct = await content.from('package_versions').delete().eq('package_id', packageId)
    assert(direct.error, 'версию пакета удалили напрямую — значит, защита неизменяемости не работает')

    const { error } = await content.rpc('purge_package', {
      p_package_id: packageId, p_reason: 'уборка за проверкой адаптации E4.8', p_actor: 'selfcheck',
    })
    assert(!error, `purge_package не отработал: ${error?.message}`)
  }
  return `запись и уборка прошли, вариант ${variantVersionId}`
})

console.log(`\n${passed} пройдено, ${failed} провалено`)
process.exit(failed ? 1 : 0)
}

main().catch((e) => { console.error('✗ проверки не запустились:', e instanceof Error ? e.message : e); process.exit(1) })
