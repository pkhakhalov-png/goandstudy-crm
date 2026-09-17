// Правка статьи отменяет запланированное (E4.5).
//
//   npx tsx scripts/content-supersede-test.ts
//
// Три случая, которые нельзя путать: запланированное снимаем, отправляющееся
// не трогаем, вышедшее выносим человеку. Проверяется, что каждый разобран
// по-своему, а не одним махом.
import { config } from 'dotenv'; import path from 'path'
config({ path: path.resolve(process.cwd(), '.env.local') })
import { createClient } from '@supabase/supabase-js'
import { recordVerified, consumeVerified } from '../lib/content/bridge'

const seo = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
const content = seo.schema('content' as any)

let passed = 0, failed = 0
function ok(name: string, cond: boolean, note = '') {
  if (cond) { passed++; console.log(`✓ ${name}${note ? ' — ' + note : ''}`) }
  else { failed++; console.log(`✗ ${name}${note ? ' — ' + note : ''}`) }
}

const ART = -778
const H1 = 'тест-снятия-версия-1'
const H2 = 'тест-снятия-версия-2'
const CHAN = 'тест-снятия-канал'

async function cleanup() {
  const { data: chans } = await content.from('channels').select('id').eq('account_external_id', CHAN)
  const { data: pkgs } = await content.from('packages').select('id').eq('seo_article_id', ART)
  for (const p of (pkgs ?? []) as any[]) {
    const { data: vars } = await content.from('variants').select('id').eq('package_id', p.id)
    for (const v of (vars ?? []) as any[]) {
      const { data: vvs } = await content.from('variant_versions').select('id').eq('variant_id', v.id)
      const ids = (vvs ?? []).map((x: any) => x.id)
      if (ids.length) {
        const { data: pubs } = await content.from('publications').select('id').in('variant_version_id', ids)
        const pubIds = (pubs ?? []).map((x: any) => x.id)
        if (pubIds.length) await content.from('attention_items').delete().eq('entity_type', 'publication').in('entity_id', pubIds)
      }
    }
    const r = await content.rpc('purge_package', { p_package_id: p.id, p_reason: 'уборка после проверки снятия', p_actor: 'тест' })
    if (r.error) console.log(`  пакет ${p.id} не прибрался: ${r.error.message}`)
  }
  for (const c of (chans ?? []) as any[]) await content.from('channels').delete().eq('id', c.id)
  const { data: evs } = await content.from('outbox_events').select('event_id').in('payload->>content_hash', [H1, H2])
  const ids = (evs ?? []).map((e: any) => e.event_id)
  if (ids.length) await content.from('event_receipts').delete().in('event_id', ids)
  await content.from('outbox_events').delete().in('payload->>content_hash', [H1, H2])
  await content.from('reviews').delete().in('target_hash', [H1, H2])
}

/** Пост на канал по версии пакета: вариант, его версия и сама публикация. */
async function makePublication(packageVersionId: number, channelId: number, status: string, key: string) {
  const { data: pkgVer } = await content.from('package_versions').select('package_id').eq('id', packageVersionId).single()
  const { data: variant } = await content.from('variants')
    .insert({ package_id: pkgVer.package_id, format: 'social_post', editorial_angle: `угол ${key}` }).select('id').single()
  const { data: vv } = await content.from('variant_versions').insert({
    variant_id: variant.id, version: 1, package_version_id: packageVersionId,
    body_json: { text: `пост ${key}` }, content_hash: `хеш-${key}`,
  }).select('id').single()
  const { data: pub } = await content.from('publications').insert({
    channel_id: channelId, variant_version_id: vv.id,
    scheduled_at: new Date(Date.now() + 3600_000).toISOString(),
    status, idempotency_key: key,
  }).select('id, status').single()
  return pub
}

async function main() {
  const probe = await content.rpc('supersede_older', { p_package_id: -1, p_new_version_id: -1 })
  if (probe.error) {
    console.log(`функции снятия нет: ${probe.error.message}`)
    console.log('нужна миграция docs/sql/снятие-устаревшего.sql')
    process.exit(2)
  }

  await cleanup()
  try {
    const { data: chan } = await content.from('channels')
      .insert({ platform: 'telegram', account_external_id: CHAN, title: 'канал для проверки', mode: 'paused' })
      .select('id').single()

    // Первая версия пакета.
    await recordVerified(seo, { articleId: ART, version: 1, contentHash: H1, verdict: 'passed' })
    await consumeVerified(seo, 'тест-снятие')
    const { data: pkg } = await content.from('packages').select('id, current_version_id').eq('seo_article_id', ART).single()
    const v1 = pkg.current_version_id

    // Три поста по первой версии — в трёх разных состояниях.
    const planned = await makePublication(v1, chan.id, 'scheduled', 'запланирован')
    const sending = await makePublication(v1, chan.id, 'publishing', 'отправляется')
    const published = await makePublication(v1, chan.id, 'published', 'вышел')

    // Статью поправили: вторая версия.
    await recordVerified(seo, { articleId: ART, version: 2, contentHash: H2, verdict: 'passed' })
    const res = await consumeVerified(seo, 'тест-снятие')
    ok('разбор события вернул, что именно сделал', res.length === 1,
      `снято ${res[0]?.superseded}, вопросов ${res[0]?.attention}`)

    const st = async (id: number) => (await content.from('publications').select('status').eq('id', id).single()).data?.status
    ok('запланированный пост снят', await st(planned.id) === 'superseded', `стало ${await st(planned.id)}`)
    ok('отправляющийся не тронут', await st(sending.id) === 'publishing',
      `стало ${await st(sending.id)} — его мог уже получить Телеграм`)
    ok('вышедший остался вышедшим', await st(published.id) === 'published',
      'снять нельзя, и делать вид, что сняли, тоже')

    const { data: att } = await content.from('attention_items')
      .select('id, reason_code, severity, entity_id, suggested_action')
      .eq('entity_type', 'publication').eq('entity_id', published.id)
    ok('по вышедшему заведён вопрос', (att ?? []).length === 1, `вопросов ${(att ?? []).length}`)
    ok('вопрос помечен важным', (att ?? [])[0]?.severity === 'high')
    ok('в вопросе сказано, что решать человеку', /Решить/.test((att ?? [])[0]?.suggested_action ?? ''),
      String((att ?? [])[0]?.suggested_action ?? '').slice(0, 70))

    const { data: attPlanned } = await content.from('attention_items')
      .select('id').eq('entity_type', 'publication').eq('entity_id', planned.id)
    ok('по снятому вопрос не заводится', (attPlanned ?? []).length === 0, 'его снятие ничего не стоило')

    // Повторный разбор того же события.
    await content.from('event_receipts').delete().eq('consumer', 'тест-снятие')
    await consumeVerified(seo, 'тест-снятие')
    const { data: att2 } = await content.from('attention_items')
      .select('id').eq('entity_type', 'publication').eq('entity_id', published.id)
    ok('повторный разбор не заводит второй вопрос', (att2 ?? []).length === 1, `вопросов ${(att2 ?? []).length}`)
  } finally {
    await cleanup()
    const { data: left } = await content.from('packages').select('id').eq('seo_article_id', ART)
    const { data: leftAtt } = await content.from('attention_items').select('id').eq('reason_code', 'published_on_superseded_version')
    console.log(`\nприбрано. осталось: пакетов ${(left ?? []).length}, вопросов ${(leftAtt ?? []).length}`)
  }

  console.log(`\n${passed} пройдено, ${failed} провалено`)
  process.exit(failed ? 1 : 0)
}
main()
