// Карточка публикации: что показывается про один вышедший пост (E4.10).
//
//   npx tsx scripts/content-publication-card-test.ts
//
// Тест ставит цепочку целиком — источник, утверждение с выдержкой, пакет,
// адаптацию, публикацию, попытку, две проверки и метрики — и смотрит, что
// карточка не подменяет пробелы нулями: недоступная метрика остаётся «нет
// данных», непроверенная ссылка не даёт переходов, а непройденная проверка
// выхода отличается от непроведённой.
//
// Всё заводится с пометками и прибирается в конце.
import { config } from 'dotenv'; import path from 'path'
config({ path: path.resolve(process.cwd(), '.env.local') })
import { createClient } from '@supabase/supabase-js'
import { карточкаПубликации } from '../lib/content/publication-card'

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
)
const content = sb.schema('content' as any)
const seo = sb.schema('seo')

let passed = 0, failed = 0
function ok(name: string, cond: boolean, note = '') {
  if (cond) { passed++; console.log(`✓ ${name}${note ? ' — ' + note : ''}`) }
  else { failed++; console.log(`✗ ${name}${note ? ' — ' + note : ''}`) }
}

const АККАУНТ = 'проверка-карточки-публикации'
const СТАТЬЯ = -780
const АДРЕС = 'https://example.test/проверка-карточки'
const ПРЕДМЕТ = 'проверка-карточки-публикации'

async function убрать() {
  const { data: chans } = await content.from('channels').select('id').eq('account_external_id', АККАУНТ)
  for (const c of (chans ?? []) as any[]) {
    const { data: pubs } = await content.from('publications').select('id').eq('channel_id', c.id)
    for (const p of (pubs ?? []) as any[]) {
      await content.from('metrics_daily').delete().eq('publication_id', p.id)
      await content.from('publication_attempts').delete().eq('publication_id', p.id)
    }
    await content.from('publications').delete().eq('channel_id', c.id)
    await content.from('channels').delete().eq('id', c.id)
  }
  const { data: pkgs } = await content.from('packages').select('id').eq('seo_article_id', СТАТЬЯ)
  for (const p of (pkgs ?? []) as any[]) {
    const { data: vars } = await content.from('variants').select('id').eq('package_id', p.id)
    for (const v of (vars ?? []) as any[]) {
      const { data: vvs } = await content.from('variant_versions').select('id').eq('variant_id', v.id)
      const ids = (vvs ?? []).map((x: any) => x.id)
      if (ids.length) await content.from('reviews').delete().eq('target_type', 'variant_version').in('target_id', ids)
    }
    const r = await content.rpc('purge_package', { p_package_id: p.id, p_reason: 'уборка после проверки карточки', p_actor: 'тест' })
    if (r.error) console.log(`  пакет ${p.id} не прибрался: ${r.error.message}`)
  }
  const { data: src } = await seo.from('sources').select('id').eq('url', АДРЕС)
  for (const s of (src ?? []) as any[]) {
    const { data: snaps } = await seo.from('source_snapshots').select('id').eq('source_id', s.id)
    const ids = (snaps ?? []).map((x: any) => x.id)
    if (ids.length) await seo.from('claim_sources').delete().in('snapshot_id', ids)
    await seo.from('source_snapshots').delete().eq('source_id', s.id)
    await seo.from('sources').delete().eq('id', s.id)
  }
  await seo.from('claims').delete().eq('subject_key', ПРЕДМЕТ)
}

async function main() {
  await убрать()

  /* ── Источник и два утверждения: одно с выдержкой, одно без ──────────── */

  const { data: ист, error: e0 } = await seo.from('sources')
    .insert({ source_type: 'web', url: АДРЕС, domain: 'example.test', kind: 'university_program', active: true })
    .select('id').single() as any
  if (e0) { console.error(`источник не завёлся: ${e0.message}`); process.exit(1) }

  const { data: снимок } = await seo.from('source_snapshots')
    .insert({ source_id: ист.id, http_status: 200, content_hash: 'карточка-хеш', changed: null, raw_text: 'tuition fee 14 250 EUR per year' })
    .select('id').single() as any

  const годен = new Date(Date.now() + 86_400_000).toISOString()
  const { data: сВыдержкой } = await seo.from('claims').insert({
    kind: 'tuition_fee', subject: 'Проверка карточки', subject_key: ПРЕДМЕТ,
    statement: 'Стоимость программы — 14 250 € в год', value: '14250', value_num: 14250,
    unit: 'eur', status: 'active', expires_at: годен,
  }).select('id').single() as any
  const { data: безВыдержки } = await seo.from('claims').insert({
    kind: 'tuition_fee', subject: 'Проверка карточки', subject_key: ПРЕДМЕТ,
    statement: 'Срок рассмотрения — 6–8 недель', value: '6-8 недель',
    status: 'unverified', expires_at: годен,
  }).select('id').single() as any

  await seo.from('claim_sources').insert({
    claim_id: сВыдержкой.id, snapshot_id: снимок.id,
    quote: 'Tuition fees for non-EU students: € 14,250 per year.',
    agreement: 'supports', checked_at: new Date().toISOString(),
  }).throwOnError()

  /* ── Канал, пакет, две адаптации, публикация ─────────────────────────── */

  const { data: канал } = await content.from('channels').insert({
    platform: 'telegram', account_external_id: АККАУНТ, title: 'Проверка карточки',
    mode: 'paused', delivery: 'api',
  }).select('id').single() as any

  const { data: pkg } = await content.from('packages')
    .insert({ seo_article_id: СТАТЬЯ, status: 'verified' }).select('id').single() as any
  const { data: pv } = await content.from('package_versions')
    .insert({ package_id: pkg.id, version: 1, content_hash: 'карточка-пакет' }).select('id').single() as any

  const сделатьВариант = async (угол: string, i: number) => {
    const { data: v } = await content.from('variants')
      .insert({ package_id: pkg.id, format: 'social_post', editorial_angle: угол }).select('id').single() as any
    const { data: vv } = await content.from('variant_versions').insert({
      variant_id: v.id, version: 1, package_version_id: pv.id,
      body_json: { text: `Стоимость программы — 14 250 € в год. Вариант ${i}.` },
      claim_refs: [{ claim_id: сВыдержкой.id, version: 1 }, { claim_id: безВыдержки.id, version: 1 }],
      content_hash: `карточка-версия-${i}`,
    }).select('id').single() as any
    return vv.id
  }

  const основная = await сделатьВариант('цена и срок', 1)
  await сделатьВариант('истории студентов', 2)

  const { data: паб } = await content.from('publications').insert({
    channel_id: канал.id, variant_version_id: основная, scheduled_at: new Date(Date.now() - 3600_000).toISOString(),
    idempotency_key: `${АККАУНТ}-1`, status: 'published', remote_id: '4412',
    remote_url: 'https://t.me/x/4412', link_clickable: null,
  }).select('id').single() as any

  await content.from('publication_attempts').insert({
    publication_id: паб.id, attempt: 1, phase: 'ответ_получен', provider_request_id: 'tg-req-91ab',
    request_hash: 'хеш-запроса', result: '200 OK', started_at: new Date(Date.now() - 3600_000).toISOString(),
    finished_at: new Date(Date.now() - 3599_000).toISOString(),
  }).throwOnError()

  await content.from('reviews').insert([
    { target_type: 'variant_version', target_id: основная, provider: 'openai', model: 'gpt-4.1', prompt_version: 'v7', verdict: 'passed', findings_json: [{ quote: '…14 250 €…', why: 'сходится с источником' }] },
    { target_type: 'variant_version', target_id: основная, provider: 'anthropic', model: 'claude', prompt_version: 'v7', verdict: 'passed', findings_json: [{ quote: '…6–8 недель…', why: 'источник не указан' }] },
  ]).throwOnError()

  const сегодня = new Date().toISOString().slice(0, 10)
  await content.from('metrics_daily').insert([
    { publication_id: паб.id, date: сегодня, metric: 'reach', source: 'telegram', value: 3180, completeness: 'complete' },
    { publication_id: паб.id, date: сегодня, metric: 'reactions', source: 'telegram', value: null, completeness: 'unavailable' },
  ]).throwOnError()

  try {
    const к = (await карточкаПубликации(content, seo, паб.id))!
    ok('карточка собирается', Boolean(к), `публикация #${к?.id}`)

    ok('охват показан числом', к.охваты.find((о) => о.метрика === 'reach')?.значение === 3180)
    ok('недоступная метрика — «нет данных», а не ноль',
      к.охваты.find((о) => о.метрика === 'reactions')?.значение === null,
      'площадка ответила «нет данных»: ноль означал бы «реакций не было»')

    ok('без подтверждённой ссылки переходы не приписываются', к.переходы === null && к.заявки === null)

    const ступень = (имя: string) => к.ступени.find((с) => с.имя.startsWith(имя))!
    ok('ступень «запрос ушёл» пройдена', ступень('Запрос ушёл').состояние === 'пройдена')
    ok('ступень «площадка вернула идентификатор» пройдена', ступень('Площадка вернула').состояние === 'пройдена')
    ok('непроведённая проверка выхода — «не проверяли», а не «не пройдена»',
      ступень('Пост читается').состояние === 'не_проверяли',
      '«не смотрели» и «не видно» — разные новости')

    ok('оба факта подтянулись', к.факты.length === 2, `фактов ${к.факты.length}`)
    const сВ = к.факты.find((ф) => ф.id === сВыдержкой.id)!
    const безВ = к.факты.find((ф) => ф.id === безВыдержки.id)!
    ok('у факта с выдержкой есть дословная цитата и адрес источника',
      /14,250/.test(сВ.подтверждение?.цитата ?? '') && сВ.подтверждение?.источник === АДРЕС)
    ok('факт без источника так и помечен', безВ.подтверждение === null,
      'подтверждением считается выдержка, а не ссылка рядом')

    ok('обе проверки видны', к.проверки.length === 2, к.проверки.map((п) => п.provider).join(', '))
    ok('замечания проверок посчитаны', к.проверки.reduce((s, п) => s + п.замечаний, 0) === 2)

    ok('попытка отправки показана с идентификатором запроса',
      к.попытки.length === 1 && к.попытки[0].requestId === 'tg-req-91ab')

    ok('соседняя адаптация того же пакета видна', к.родня.length === 2, `адаптаций ${к.родня.length}`)
    ok('текущая адаптация помечена', к.родня.filter((р) => р.этот).length === 1)
    ok('незапланированная адаптация не выдаёт себя за вышедшую',
      к.родня.some((р) => !р.этот && р.канал === null && р.статус === null))

    // Подтверждаем кликабельность — теперь ноль переходов честный.
    await content.from('publications').update({ link_clickable: true }).eq('id', паб.id).throwOnError()
    const к2 = (await карточкаПубликации(content, seo, паб.id))!
    ok('с подтверждённой ссылкой переходы считаются', к2.переходы === 0 && к2.заявки === 0,
      'переходов правда не было — это результат, а не пробел')
  } finally {
    await убрать()
  }

  const { data: остались } = await content.from('channels').select('id').eq('account_external_id', АККАУНТ)
  const { data: клеймы } = await seo.from('claims').select('id').eq('subject_key', ПРЕДМЕТ)
  ok('тест прибрал за собой', !остались?.length && !клеймы?.length,
    `каналов ${остались?.length ?? 0}, утверждений ${клеймы?.length ?? 0}`)

  console.log(`\n${passed} пройдено, ${failed} провалено`)
  process.exit(failed ? 1 : 0)
}
main()
