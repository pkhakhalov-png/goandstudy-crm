// Панель каналов: что показывается наверху и когда это «нет данных» (E4.10).
//
//   npx tsx scripts/content-channel-panel-test.ts
//
// Проверяется главное правило экрана: ноль и «нет данных» — разное. Публикация
// без подтверждённой кликабельной ссылки не даёт нуля переходов, она не даёт
// переходов вообще, и на экране это обязано выглядеть иначе, чем честный ноль.
//
// Тест заводит канал и публикации, проверяет и прибирает за собой. Канал
// заводится приостановленным, наружу ничего не уходит.
import { config } from 'dotenv'; import path from 'path'
config({ path: path.resolve(process.cwd(), '.env.local') })
import { createClient } from '@supabase/supabase-js'
import { карточкиКаналов, сводка } from '../lib/content/channel-panel'

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

const АККАУНТ = 'проверка-панели-каналов'
const дней = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString()
const через = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString()

const СТАТЬЯ = -779   // пометка тестового пакета: такой статьи в seo нет

async function убрать() {
  const { data: chans } = await content.from('channels').select('id').eq('account_external_id', АККАУНТ)
  for (const c of (chans ?? []) as any[]) {
    await content.from('publications').delete().eq('channel_id', c.id)
    await content.from('channels').delete().eq('id', c.id)
  }
  const { data: pkgs } = await content.from('packages').select('id').eq('seo_article_id', СТАТЬЯ)
  for (const p of (pkgs ?? []) as any[]) {
    const r = await content.rpc('purge_package', { p_package_id: p.id, p_reason: 'уборка после проверки панели', p_actor: 'тест' })
    if (r.error) console.log(`  пакет ${p.id} не прибрался: ${r.error.message}`)
  }
}

/**
 * Материал, на который будут ссылаться публикации.
 *
 * Версий варианта нужно столько же, сколько публикаций: в канале действует
 * уникальность «канал × версия варианта» — один и тот же текст не уходит в один
 * канал дважды, и это правильно, но тест обязан играть по этому правилу.
 */
async function завестиМатериал(сколько: number): Promise<number[]> {
  const { data: pkg } = await content.from('packages')
    .insert({ seo_article_id: СТАТЬЯ, status: 'verified', intent: 'проверка панели' }).select('id').single() as any
  const { data: pv } = await content.from('package_versions')
    .insert({ package_id: pkg.id, version: 1, content_hash: 'панель-пакет' }).select('id').single() as any
  const out: number[] = []
  for (let i = 0; i < сколько; i++) {
    const { data: v } = await content.from('variants')
      .insert({ package_id: pkg.id, format: 'social_post', editorial_angle: `проверка панели ${i}` }).select('id').single() as any
    const { data: vv } = await content.from('variant_versions').insert({
      variant_id: v.id, version: 1, package_version_id: pv.id,
      body_json: { text: `текст для проверки панели ${i}` }, content_hash: `панель-версия-${i}`,
    }).select('id').single() as any
    out.push(vv.id)
  }
  return out
}

async function main() {
  await убрать()

  const { data: канал, error } = await content.from('channels').insert({
    platform: 'telegram', account_external_id: АККАУНТ, title: 'Проверка панели',
    mode: 'paused', delivery: 'api', timezone: 'Europe/Moscow',
  }).select('id').single()
  if (error) { console.error(`канал не завёлся: ${error.message}`); process.exit(1) }
  const id = (канал as any).id

  try {
    let карточки = await карточкиКаналов(content, seo)
    let к = карточки.find((x) => x.id === id)!

    ok('канал без публикаций не выглядит работающим', к.состояние === 'нет_публикаций', к.строка)
    ok('переходы у канала без публикаций — «нет данных», а не ноль',
      к.переходы30.n === null, к.переходы30.почему ?? '')
    ok('заявки — тоже', к.заявки30.n === null)

    // Вышедшая публикация, у которой кликабельность ссылки не подтверждена.
    const версии = await завестиМатериал(5)
    const базовая = {
      channel_id: id, variant_version_id: версии[0], scheduled_at: дней(3),
      idempotency_key: `${АККАУНТ}-1`, status: 'published', remote_url: 'https://t.me/x/1',
    }
    const { error: e1 } = await content.from('publications').insert({ ...базовая, link_clickable: null })
    if (e1) throw new Error(`публикация не завелась: ${e1.message}`)

    карточки = await карточкиКаналов(content, seo)
    к = карточки.find((x) => x.id === id)!
    ok('вышедшее считается вышедшим', к.вышло7 === 1 && к.вышло30 === 1, `7 дн ${к.вышло7}, 30 дн ${к.вышло30}`)
    ok('без подтверждённой ссылки переходы не приписываются',
      к.переходы30.n === null && /кликабель/.test(к.переходы30.почему ?? ''),
      'приписать переходы посту, чью ссылку площадка могла переписать, значит выдумать результат')

    // Публикация с подтверждённой ссылкой: теперь ноль — честный ноль.
    await content.from('publications').insert({
      ...базовая, variant_version_id: версии[1], idempotency_key: `${АККАУНТ}-2`, scheduled_at: дней(1), link_clickable: true,
    }).throwOnError()

    карточки = await карточкиКаналов(content, seo)
    к = карточки.find((x) => x.id === id)!
    ok('с подтверждённой ссылкой ноль становится честным нулём', к.переходы30.n === 0,
      'переходов правда не было — это результат, а не пробел')
    ok('и в пояснении сказано, сколько публикаций не в счёте',
      /1 публикация не в счёте/.test(к.переходы30.почему ?? ''), к.переходы30.почему ?? '')

    // Запланированное и заблокированное.
    await content.from('publications').insert([
      { ...базовая, variant_version_id: версии[2], idempotency_key: `${АККАУНТ}-3`, status: 'scheduled', scheduled_at: через(2), remote_url: null },
      { ...базовая, variant_version_id: версии[3], idempotency_key: `${АККАУНТ}-4`, status: 'blocked', scheduled_at: через(3), remote_url: null },
    ]).throwOnError()

    карточки = await карточкиКаналов(content, seo)
    к = карточки.find((x) => x.id === id)!
    ok('план на неделю считается', к.вПлане7 === 1, `в плане ${к.вПлане7}`)
    ok('заблокированное видно отдельно', к.заблокировано === 1)
    ok('заблокированное переводит канал в «требует внимания»',
      к.состояние === 'требует_внимания', к.строка)

    // Неизвестный исход — не успех и не провал.
    await content.from('publications').insert({
      ...базовая, variant_version_id: версии[4], idempotency_key: `${АККАУНТ}-5`, status: 'unknown', scheduled_at: дней(2), remote_url: null,
    }).throwOnError()
    карточки = await карточкиКаналов(content, seo)
    к = карточки.find((x) => x.id === id)!
    ok('публикация с неизвестным исходом не считается вышедшей', к.вышло30 === 2, `вышло ${к.вышло30}`)
    ok('и она названа в строке состояния', /1 публикация с неизвестным исходом/.test(к.строка), к.строка)

    ok('сводка собирается из состояний', /подключено/.test(сводка(карточки)), сводка(карточки))
  } finally {
    await убрать()
  }

  const { data: остались } = await content.from('channels').select('id').eq('account_external_id', АККАУНТ)
  const { data: пакеты } = await content.from('packages').select('id').eq('seo_article_id', СТАТЬЯ)
  ok('тест прибрал за собой', !остались?.length && !пакеты?.length,
    `каналов ${остались?.length ?? 0}, пакетов ${пакеты?.length ?? 0}`)

  console.log(`\n${passed} пройдено, ${failed} провалено`)
  process.exit(failed ? 1 : 0)
}
main()
