// Планирование выпуска (E4.9).
//
//   npx tsx scripts/content-schedule-test.ts
//
// Проверяется не то, что пост встаёт в календарь, а то, что он НЕ встаёт,
// когда не должен: слот занят, темп исчерпан, материал устарел, тезис уже
// был. И что сутки простоя не выливаются в ленту из двадцати постов.
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

const ART = -779
const H1 = 'тест-плана-версия-1'
const H2 = 'тест-плана-версия-2'
const CHAN = 'тест-плана-канал'

type Slot = { publicationId: number | null; slotDay: string | null; skipped: string | null }

async function schedule(channelId: number, vvId: number, at: Date, key: string, fp?: string, slotNo = 0): Promise<Slot> {
  const { data, error } = await content.rpc('schedule_publication', {
    p_channel_id: channelId, p_variant_version_id: vvId, p_desired_at: at.toISOString(),
    p_idempotency_key: key, p_fingerprint: fp ?? null, p_slot_no: slotNo,
  })
  if (error) throw new Error(error.message)
  const r = Array.isArray(data) ? data[0] : data
  return { publicationId: r?.out_publication_id ?? null, slotDay: r?.out_slot_day ?? null, skipped: r?.out_skipped ?? null }
}

async function cleanup() {
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
    const r = await content.rpc('purge_package', { p_package_id: p.id, p_reason: 'уборка после проверки плана', p_actor: 'тест' })
    if (r.error) console.log(`  пакет ${p.id} не прибрался: ${r.error.message}`)
  }
  await content.from('channels').delete().eq('account_external_id', CHAN)
  const { data: evs } = await content.from('outbox_events').select('event_id').in('payload->>content_hash', [H1, H2])
  const ids = (evs ?? []).map((e: any) => e.event_id)
  if (ids.length) await content.from('event_receipts').delete().in('event_id', ids)
  await content.from('outbox_events').delete().in('payload->>content_hash', [H1, H2])
  await content.from('reviews').delete().in('target_hash', [H1, H2])
}

async function makeVariantVersion(packageVersionId: number, tag: string) {
  const { data: pv } = await content.from('package_versions').select('package_id').eq('id', packageVersionId).single()
  const { data: variant } = await content.from('variants')
    .insert({ package_id: pv.package_id, format: 'social_post', editorial_angle: tag }).select('id').single()
  const { data: vv } = await content.from('variant_versions').insert({
    variant_id: variant.id, version: 1, package_version_id: packageVersionId,
    body_json: { text: tag }, content_hash: `хеш-${tag}`,
  }).select('id').single()
  return vv.id as number
}

async function main() {
  const probe = await content.rpc('schedule_publication', {
    p_channel_id: -1, p_variant_version_id: -1, p_desired_at: new Date().toISOString(), p_idempotency_key: 'проба',
  })
  if (probe.error && /function|does not exist|schema cache/i.test(probe.error.message)) {
    console.log(`функции планирования нет: ${probe.error.message}`)
    console.log('нужна миграция docs/sql/планирование.sql')
    process.exit(2)
  }

  await cleanup()
  try {
    const { data: chan } = await content.from('channels').insert({
      platform: 'telegram', account_external_id: CHAN, title: 'канал для проверки плана',
      timezone: 'Europe/Moscow', mode: 'active', daily_cap: 1, max_catch_up: 1,
    }).select('id').single()

    await recordVerified(seo, { articleId: ART, version: 1, contentHash: H1, verdict: 'passed' })
    await consumeVerified(seo, 'тест-план')
    const { data: pkg } = await content.from('packages').select('id, current_version_id').eq('seo_article_id', ART).single()
    const v1 = pkg.current_version_id

    const vvA = await makeVariantVersion(v1, 'первый')
    const vvB = await makeVariantVersion(v1, 'второй')

    // Время намеренно позднее по Москве: проверяем, что день слота считается
    // в зоне канала, а не в UTC — в UTC это уже следующие сутки.
    const late = new Date('2026-10-01T20:30:00Z')   // 23:30 по Москве 1 октября
    const first = await schedule(chan.id, vvA, late, 'первый-пост', 'отпечаток-А')
    ok('пост встал в слот', !!first.publicationId, `слот ${first.slotDay}`)
    ok('день слота считается в зоне канала', first.slotDay === '2026-10-01',
      `в зоне канала ${first.slotDay}, в UTC было бы 2026-10-01T20:30 → но 23:30 по Москве`)

    // Второй пост в тот же день — темп исчерпан.
    const second = await schedule(chan.id, vvB, new Date('2026-10-01T09:00:00Z'), 'второй-пост', 'отпечаток-Б')
    ok('второй пост в тот же день не встал', !second.publicationId && /темп/.test(second.skipped ?? ''),
      second.skipped ?? '')

    // Повтор по ключу — та же публикация, а не вторая.
    const again = await schedule(chan.id, vvA, late, 'первый-пост', 'отпечаток-А')
    ok('повтор по ключу не создаёт вторую публикацию', again.publicationId === first.publicationId,
      again.skipped ?? '')

    // Тот же тезис другим текстом, другой день — всё равно не встаёт.
    const sameIdea = await schedule(chan.id, vvB, new Date('2026-10-02T09:00:00Z'), 'третий-пост', 'отпечаток-А')
    ok('тот же тезис другим текстом не встаёт', !sameIdea.publicationId && /тезис/.test(sameIdea.skipped ?? ''),
      sameIdea.skipped ?? '')

    // Статью поправили: вариант по первой версии стал устаревшим.
    await recordVerified(seo, { articleId: ART, version: 2, contentHash: H2, verdict: 'passed' })
    await consumeVerified(seo, 'тест-план')
    const stale = await schedule(chan.id, vvB, new Date('2026-10-03T09:00:00Z'), 'четвёртый-пост', 'отпечаток-В')
    ok('устаревший материал в план не встаёт — слот пропускается',
      !stale.publicationId && /устарел/.test(stale.skipped ?? ''), stale.skipped ?? '')

    // Приостановленный канал.
    await content.from('channels').update({ mode: 'paused' }).eq('id', chan.id)
    const { data: pkg2 } = await content.from('packages').select('current_version_id').eq('seo_article_id', ART).single()
    const vvC = await makeVariantVersion(pkg2.current_version_id, 'третий')
    const paused = await schedule(chan.id, vvC, new Date('2026-10-04T09:00:00Z'), 'пятый-пост', 'отпечаток-Г')
    ok('на приостановленный канал не ставится', !paused.publicationId && /paused/.test(paused.skipped ?? ''),
      paused.skipped ?? '')
    await content.from('channels').update({ mode: 'active' }).eq('id', chan.id)

    // ── Простой: пять просроченных слотов, догнать разрешено один.
    await content.from('publications').delete().eq('channel_id', chan.id)
    const past = ['2026-09-10', '2026-09-11', '2026-09-12', '2026-09-13', '2026-09-14']
    // Каждому просроченному — своя версия варианта. Пять постов на три версии
    // не встанут: уникальный индекс не даёт двум активным публикациям одной
    // версии на одном канале, и это правильно — в первом прогоне на этом
    // тихо терялись две строки, отчего проверка считала не то, что думала.
    const { data: pkgNow } = await content.from('packages').select('current_version_id').eq('seo_article_id', ART).single()
    const vvs: number[] = []
    for (let i = 0; i < past.length; i++) vvs.push(await makeVariantVersion(pkgNow.current_version_id, `просрочен-${i}`))
    for (let i = 0; i < past.length; i++) {
      const ins = await content.from('publications').insert({
        channel_id: chan.id, variant_version_id: vvs[i],
        scheduled_at: `${past[i]}T09:00:00Z`, status: 'scheduled',
        idempotency_key: `просрочен-${i}`, slot_day: past[i], slot_no: i,
      })
      if (ins.error) console.log(`  строка ${i} не встала: ${ins.error.message}`)
    }
    const { count: plannedCount } = await content.from('publications')
      .select('*', { count: 'exact', head: true }).eq('channel_id', chan.id).eq('status', 'scheduled')
    ok('пять просроченных слотов заведены', plannedCount === 5, `заведено ${plannedCount}`)
    const { data: cu } = await content.rpc('catch_up', { p_channel_id: chan.id })
    const row = Array.isArray(cu) ? cu[0] : cu
    ok('после простоя выпущен только один просроченный', row?.out_released === 1,
      `выпущено ${row?.out_released}, отложено ${row?.out_deferred}`)
    ok('остальные просроченные вынесены человеку', row?.out_deferred === 4,
      'а не сдвинуты молча')

    const { data: att } = await content.from('attention_items')
      .select('id, suggested_action').eq('reason_code', 'slot_expired')
    ok('в вопросе названы варианты решения', /Решить/.test((att ?? [])[0]?.suggested_action ?? ''),
      String((att ?? [])[0]?.suggested_action ?? '').slice(0, 60))

    const { data: cu2 } = await content.rpc('catch_up', { p_channel_id: chan.id })
    const row2 = Array.isArray(cu2) ? cu2[0] : cu2
    ok('повторный проход не заводит вторые вопросы', row2?.out_deferred === 0,
      `отложено ${row2?.out_deferred}`)
    ok('и не догоняет догнанное второй раз', row2?.out_released === 0,
      `выпущено ${row2?.out_released} — догонять дважды нечего`)
  } finally {
    await cleanup()
    const { data: left } = await content.from('packages').select('id').eq('seo_article_id', ART)
    const { data: leftCh } = await content.from('channels').select('id').eq('account_external_id', CHAN)
    const { data: leftAtt } = await content.from('attention_items').select('id').eq('reason_code', 'slot_expired')
    console.log(`\nприбрано. осталось: пакетов ${(left ?? []).length}, каналов ${(leftCh ?? []).length}, вопросов ${(leftAtt ?? []).length}`)
  }

  console.log(`\n${passed} пройдено, ${failed} провалено`)
  process.exit(failed ? 1 : 0)
}
main()
