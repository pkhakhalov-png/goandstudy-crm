// Контракт коннектора и коннектор Telegram (E5.10–E5.12).
//
//   npx tsx scripts/content-connector-test.ts
//
// Половина проверок идёт без базы и без сети: разбор ответов площадки, длины,
// метки. Вторая половина — дисциплина попытки на живой базе: порядок записи,
// поведение при обрыве, повтор.
//
// Настоящей публикации здесь нет и быть не может: нужен токен, он за Павлом.
// Поэтому проверяется то, что можно проверить честно, а чего нельзя — сказано
// вслух в конце.
import { config } from 'dotenv'; import path from 'path'
config({ path: path.resolve(process.cwd(), '.env.local') })
import { createClient } from '@supabase/supabase-js'
import {
  attemptPublish, requestHash, statusFor, capabilityConfidence,
  type PublishingConnector, type Capabilities, type Payload, type Outcome,
} from '../lib/content/connector'
import { TelegramConnector, разобратьОтвет, ссылкаСМетками, ссылкаНаПост } from '../lib/content/telegram'

const seo = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
const content = seo.schema('content' as any)

let passed = 0, failed = 0
function ok(name: string, cond: boolean, note = '') {
  if (cond) { passed++; console.log(`✓ ${name}${note ? ' — ' + note : ''}`) }
  else { failed++; console.log(`✗ ${name}${note ? ' — ' + note : ''}`) }
}

const CHAN = 'тест-коннектора-канал'
const ART = -780

/** Коннектор, который ведёт себя так, как скажут. Настоящий здесь не нужен. */
class Поддельный implements PublishingConnector {
  readonly platform = 'telegram' as const
  public вызовов = 0
  constructor(private readonly ответ: Outcome | (() => Promise<Outcome>)) {}
  async capabilities(): Promise<Capabilities> {
    return {
      platform: 'telegram', formats: ['social_post'], maxTextLength: 4096, supportsPhoto: true,
      linkBehaviour: 'как_есть', hasIdempotencyKey: false, canReadOwnHistory: false,
      proofRef: null, checkedAt: null,
    }
  }
  validate() { return [] }
  async prepareMedia(p: Payload) { return p }
  async publish(): Promise<Outcome> {
    this.вызовов++
    return typeof this.ответ === 'function' ? this.ответ() : this.ответ
  }
  async reconcile() { return { kind: 'выяснить_нечем' as const, why: 'подделка' } }
  async getStatus() { return { kind: 'не_проверить' as const, why: 'подделка' } }
  async fetchMetrics() { return [] }
}

async function cleanup() {
  const { data: chans } = await content.from('channels').select('id').eq('account_external_id', CHAN)
  for (const c of (chans ?? []) as any[]) {
    const { data: pubs } = await content.from('publications').select('id').eq('channel_id', c.id)
    const ids = (pubs ?? []).map((p: any) => p.id)
    if (ids.length) {
      await content.from('publication_attempts').delete().in('publication_id', ids)
      await content.from('attention_items').delete().eq('entity_type', 'publication').in('entity_id', ids)
      await content.from('publications').delete().in('id', ids)
    }
    await content.from('attention_items').delete().eq('entity_type', 'channel').eq('entity_id', c.id)
    await content.from('channels').delete().eq('id', c.id)
  }
  const { data: pkgs } = await content.from('packages').select('id').eq('seo_article_id', ART)
  for (const p of (pkgs ?? []) as any[]) {
    await content.rpc('purge_package', { p_package_id: p.id, p_reason: 'уборка после проверки коннектора', p_actor: 'тест' })
  }
}

async function main() {
  /* ── Без сети и без базы ──────────────────────────────────────────────── */

  ok('метки дописываются к ссылке',
    ссылкаСМетками('https://goandstudy.com/blog/thailand/', { utm_campaign: 'p7', utm_content: 'pub42' })
      === 'https://goandstudy.com/blog/thailand/?utm_campaign=p7&utm_content=pub42')

  ok('битая ссылка возвращается как была, а не портится',
    ссылкаСМетками('не ссылка', { utm_campaign: 'p7' }) === 'не ссылка',
    'испорченная ссылка хуже потерянных меток')

  ok('ссылка на пост строится только для канала с именем',
    ссылкаНаПост('@goandstudy', 42) === 'https://t.me/goandstudy/42' && ссылкаНаПост(null, 42) === null)

  // Разбор ответов площадки — на настоящих формах ответов Телеграма.
  const успех = разобратьОтвет(200, { ok: true, result: { message_id: 77 } }, '@goandstudy')
  ok('успех даёт идентификатор и ссылку',
    успех.kind === 'опубликовано' && успех.remoteId === '77' && успех.remoteUrl === 'https://t.me/goandstudy/77')

  const токен = разобратьОтвет(401, { ok: false, error_code: 401, description: 'Unauthorized' }, null)
  ok('401 — нужна авторизация, а не отказ', токен.kind === 'нужна_авторизация')

  const нетДоступа = разобратьОтвет(403, { ok: false, error_code: 403, description: 'bot is not a member' }, null)
  ok('403 тоже про доступ, но причина другая',
    нетДоступа.kind === 'нужна_авторизация' && /доступа к каналу нет/.test(нетДоступа.reason),
    'токен тот, а бота убрали из канала — чинится иначе')

  const часто = разобратьОтвет(429, { ok: false, error_code: 429, description: 'Too Many Requests', parameters: { retry_after: 17 } }, null)
  ok('429 берёт срок у площадки, а не выдумывает свой',
    часто.kind === 'повторить_позже' && часто.retryAfterSec === 17)

  const пятьсот = разобратьОтвет(502, {}, null)
  ok('5xx — повторить позже', пятьсот.kind === 'повторить_позже')

  const длинно = разобратьОтвет(400, { ok: false, error_code: 400, description: 'message is too long' }, null)
  ok('400 — отказ по существу, повтор не поможет', длинно.kind === 'отказано')

  // Длины и метки.
  const tg = new TelegramConnector('@тест', null, '@тест')
  const caps = await tg.capabilities()
  ok('возможности без подтверждения помечены как непроверенные',
    capabilityConfidence(caps) === 'записано_без_проверки', 'нет ссылки на успешный вызов')

  const длинный = 'я'.repeat(2000)
  ok('текст в 2000 знаков проходит без фото', tg.validate({ text: длинный }, caps).length === 0)
  const сФото = tg.validate({ text: длинный, photoUrl: 'https://x/y.jpg' }, caps)
  ok('тот же текст с фото не проходит', сФото.some((i) => i.blocking && /подпись к фото/.test(i.problem)),
    'предел подписи 1024, а не 4096 — на этом спотыкаются')

  const безМеток = tg.validate({ text: 'пост', link: 'https://goandstudy.com/' }, caps)
  ok('ссылка без utm_content — предупреждение, а не блокировка',
    безМеток.length === 1 && !безМеток[0].blocking && /приписать будет нечем/.test(безМеток[0].problem))

  // Разбор неизвестного исхода.
  const rec = await tg.reconcile()
  ok('Telegram честно говорит, что выяснить нечем',
    rec.kind === 'выяснить_нечем', 'а не делает вид, что проверил')

  const метрики = await tg.fetchMetrics('77', '2026-09-17')
  ok('недоступная метрика — недоступна, а не ноль',
    метрики.every((m) => m.completeness === 'недоступна' && m.value === null))

  // Куда переводить публикацию.
  ok('исходы разложены по статусам верно',
    statusFor({ kind: 'опубликовано', remoteId: '1', remoteUrl: null }) === 'published'
    && statusFor({ kind: 'отказано', reason: 'x' }) === 'failed'
    && statusFor({ kind: 'повторить_позже', reason: 'x', retryAfterSec: 1 }) === 'scheduled'
    && statusFor({ kind: 'нужна_авторизация', reason: 'x' }) === 'scheduled'
    && statusFor({ kind: 'исход_неизвестен', reason: 'x' }) === 'unknown')

  ok('хеш запроса меняется при смене текста',
    requestHash({ text: 'а' }, 'k1') !== requestHash({ text: 'б' }, 'k1')
    && requestHash({ text: 'а' }, 'k1') === requestHash({ text: 'а' }, 'k1'))

  /* ── На живой базе: дисциплина попытки ────────────────────────────────── */

  const есть = !(await content.from('publications').select('id').limit(1)).error
  if (!есть) { console.log('\nсхема content недоступна'); process.exit(2) }

  await cleanup()
  try {
    const { data: chan } = await content.from('channels').insert({
      platform: 'telegram', account_external_id: CHAN, title: 'канал для коннектора',
      timezone: 'Europe/Moscow', mode: 'active', daily_cap: 5,
    }).select('id').single() as any

    const { data: pkg } = await content.from('packages').insert({ seo_article_id: ART, status: 'verified' }).select('id').single() as any
    const { data: pv } = await content.from('package_versions').insert({
      package_id: pkg.id, version: 1, content_hash: 'хеш-коннектора',
    }).select('id').single() as any
    await content.from('packages').update({ current_version_id: pv.id }).eq('id', pkg.id)
    const { data: variant } = await content.from('variants').insert({ package_id: pkg.id, format: 'social_post' }).select('id').single() as any
    const { data: vv } = await content.from('variant_versions').insert({
      variant_id: variant.id, version: 1, package_version_id: pv.id, body_json: { text: 'пост' }, content_hash: 'хеш-варианта',
    }).select('id').single() as any
    const { data: pub } = await content.from('publications').insert({
      channel_id: chan.id, variant_version_id: vv.id, scheduled_at: new Date().toISOString(),
      status: 'publishing', idempotency_key: 'коннектор-1', slot_day: new Date().toISOString().slice(0, 10),
    }).select('id').single() as any

    const payload: Payload = { text: 'пост', link: 'https://goandstudy.com/', utm: { utm_content: `pub${pub.id}` } }

    // Обрыв сети: исход неизвестен, а не провал.
    const обрыв = new Поддельный(async () => { throw new Error('socket hang up') })
    const r1 = await attemptPublish(content, pub.id, обрыв, payload, 'коннектор-1')
    ok('обрыв даёт неизвестный исход, а не провал', r1.outcome.kind === 'исход_неизвестен',
      String(r1.outcome.kind))

    const { data: att1 } = await content.from('publication_attempts').select('attempt, phase, request_hash, result').eq('publication_id', pub.id)
    ok('попытка записана до вызова и осталась после обрыва', (att1 ?? []).length === 1)
    ok('фаза говорит, что ответа не было', (att1 ?? [])[0]?.phase === 'ответа_нет',
      `фаза ${(att1 ?? [])[0]?.phase} — по ней следующий проход поймёт, что исход неизвестен`)
    ok('хеш запроса записан', !!(att1 ?? [])[0]?.request_hash)

    // Повтор: вторая попытка, тот же хеш — значит повторяем ровно то же.
    const успешный = new Поддельный({ kind: 'опубликовано', remoteId: '99', remoteUrl: 'https://t.me/x/99' })
    const r2 = await attemptPublish(content, pub.id, успешный, payload, 'коннектор-1')
    ok('повтор — вторая попытка, а не перезапись первой', r2.attempt === 2)
    const { data: att2 } = await content.from('publication_attempts').select('attempt, request_hash, result, provider_request_id').eq('publication_id', pub.id).order('attempt')
    ok('обе попытки на месте', (att2 ?? []).length === 2)
    ok('хеш тот же — повторяем ровно то же',
      (att2 ?? [])[0]?.request_hash === (att2 ?? [])[1]?.request_hash)
    ok('идентификатор поста записан', (att2 ?? [])[1]?.provider_request_id === '99')

    // Отзыв токена: останавливается только этот канал.
    const { data: другой } = await content.from('channels').insert({
      platform: 'vk', account_external_id: CHAN + '-другой', title: 'соседний канал', mode: 'active',
    }).select('id').single() as any

    const auth = await content.rpc('channel_auth_failed', { p_channel_id: chan.id, p_reason: 'токен отозван' })
    if (auth.error) {
      console.log(`\nфункции отзыва токена нет: ${auth.error.message.slice(0, 60)}`)
      console.log('нужна миграция docs/sql/исходы-отправки.sql — проверки отзыва пропущены')
    } else {
      const { data: c1 } = await content.from('channels').select('mode').eq('id', chan.id).single() as any
      const { data: c2 } = await content.from('channels').select('mode').eq('id', другой.id).single() as any
      ok('канал с отозванным токеном остановлен', c1?.mode === 'stopped')
      ok('соседний канал не тронут', c2?.mode === 'active', 'требование гейта E5')
      const { data: attn } = await content.from('attention_items')
        .select('reason_code, suggested_action').eq('entity_type', 'channel').eq('entity_id', chan.id)
      ok('заведён вопрос с понятным действием',
        (attn ?? [])[0]?.reason_code === 'auth_required' && /Обновить токен/.test((attn ?? [])[0]?.suggested_action ?? ''))
    }
    await content.from('attention_items').delete().eq('entity_type', 'channel').eq('entity_id', другой.id)
    await content.from('channels').delete().eq('id', другой.id)
  } finally {
    await cleanup()
    const { data: left } = await content.from('channels').select('id').like('account_external_id', 'тест-коннектора%')
    const { data: leftP } = await content.from('packages').select('id').eq('seo_article_id', ART)
    console.log(`\nприбрано. осталось: каналов ${(left ?? []).length}, пакетов ${(leftP ?? []).length}`)
  }

  console.log(`\n${passed} пройдено, ${failed} провалено`)
  console.log('Чего здесь нет: настоящей публикации. Нужен токен бота — это 5.7 и 5.8, за Павлом.')
  process.exit(failed ? 1 : 0)
}
main()
