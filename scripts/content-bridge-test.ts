// Событийный мост (E4.3–E4.6).
//
//   npx tsx scripts/content-bridge-test.ts
//
// Гейт этапа звучит так: повтор события десять раз создаёт один пакет и один
// набор задач. Это и проверяется — десятью настоящими вызовами, а не одним
// вызовом и рассуждением о том, что остальные девять были бы такими же.
//
// Все записи помечены хешем `тест-моста-…` и удаляются в конце, даже если
// проверка упала.
import { config } from 'dotenv'; import path from 'path'
config({ path: path.resolve(process.cwd(), '.env.local') })
import { createClient } from '@supabase/supabase-js'
import { recordVerified, consumeVerified, reconcileVerified } from '../lib/content/bridge'

const seo = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
const content = seo.schema('content' as any)

let passed = 0, failed = 0
function ok(name: string, cond: boolean, note = '') {
  if (cond) { passed++; console.log(`✓ ${name}${note ? ' — ' + note : ''}`) }
  else { failed++; console.log(`✗ ${name}${note ? ' — ' + note : ''}`) }
}

// Отрицательный идентификатор статьи: с настоящими статьями не пересечётся,
// а внешнего ключа на seo.articles у пакета нет — схемы разные.
const ART = -777
const HASH = 'тест-моста-основной'
const HASH_FAILED = 'тест-моста-непройденный'
const HASH_LOST = 'тест-моста-потерянное-событие'

async function cleanup() {
  const hashes = [HASH, HASH_FAILED, HASH_LOST]
  const { data: pkgs } = await content.from('packages').select('id').eq('seo_article_id', ART)
  for (const p of (pkgs ?? []) as any[]) {
    await content.from('event_receipts').delete().in('event_id',
      ((await content.from('outbox_events').select('event_id').in('payload->>content_hash', hashes)).data ?? []).map((e: any) => e.event_id))
    await content.from('package_versions').delete().eq('package_id', p.id)
    await content.from('packages').delete().eq('id', p.id)
  }
  await content.from('outbox_events').delete().in('payload->>content_hash', hashes)
  await content.from('reviews').delete().in('target_hash', hashes)
}

async function main() {
  const probe = await content.from('packages').select('id').limit(1)
  if (probe.error) {
    console.log(`схема content недоступна: ${probe.error.message}`)
    console.log('нужны миграция docs/sql/схема-content.sql и Settings → API → Exposed schemas → content')
    process.exit(2)
  }
  const fn = await content.rpc('record_verified', {
    p_article_id: ART, p_version: 0, p_content_hash: 'тест-доступности', p_evidence_bundle_id: null, p_verdict: 'failed',
  })
  if (fn.error) {
    console.log(`функций моста нет: ${fn.error.message}`)
    console.log('нужна миграция docs/sql/событийный-мост.sql')
    await content.from('reviews').delete().eq('target_hash', 'тест-доступности')
    process.exit(2)
  }
  await content.from('reviews').delete().eq('target_hash', 'тест-доступности')

  await cleanup()
  try {
    // ── Гейт этапа: десять повторов.
    const emits: boolean[] = []
    for (let i = 0; i < 10; i++) {
      const r = await recordVerified(seo, {
        articleId: ART, version: 1, contentHash: HASH, verdict: 'passed',
      })
      emits.push(r.emitted)
    }
    ok('десять повторов дают одно событие', emits.filter(Boolean).length === 1,
      `записано ${emits.filter(Boolean).length} из 10`)

    const { data: evs } = await content.from('outbox_events').select('event_id').eq('payload->>content_hash', HASH)
    ok('в очереди событий ровно одна строка', (evs ?? []).length === 1, `строк ${(evs ?? []).length}`)

    // ── Разбор события: один пакет.
    const first = await consumeVerified(seo, 'тест-строитель')
    const second = await consumeVerified(seo, 'тест-строитель')
    ok('первый разбор создал пакет', first.length === 1 && first[0].created, `${first.length} событий`)
    ok('повторный разбор не создал ничего', second.length === 0, `${second.length} событий`)

    const { data: pkgs } = await content.from('packages').select('id, status, current_version_id').eq('seo_article_id', ART)
    ok('пакет ровно один', (pkgs ?? []).length === 1, `пакетов ${(pkgs ?? []).length}`)
    const pkg = (pkgs ?? [])[0] as any
    const { data: vers } = await content.from('package_versions').select('id, version, source_article_version').eq('package_id', pkg?.id)
    ok('версия пакета ровно одна', (vers ?? []).length === 1, `версий ${(vers ?? []).length}`)
    ok('пакет указывает на свою версию', pkg?.current_version_id === (vers ?? [])[0]?.id)
    ok('пакет помечен проверенным', pkg?.status === 'verified', `статус ${pkg?.status}`)

    // ── Непройденная проверка: запись есть, события нет.
    const bad = await recordVerified(seo, {
      articleId: ART, version: 2, contentHash: HASH_FAILED, verdict: 'insufficient',
    })
    ok('непройденная проверка события не порождает', !bad.emitted)
    const { data: badRev } = await content.from('reviews').select('id, verdict').eq('target_hash', HASH_FAILED)
    ok('но сама проверка записана — это наблюдение, а не пустота', (badRev ?? []).length === 1,
      `вердикт ${(badRev ?? [])[0]?.verdict}`)
    const { data: badEv } = await content.from('outbox_events').select('event_id').eq('payload->>content_hash', HASH_FAILED)
    ok('в очереди событий её нет', (badEv ?? []).length === 0)

    // ── Версия пакета неизменяема.
    const upd = await content.from('package_versions').update({ content_hash: 'подмена' }).eq('package_id', pkg?.id)
    ok('версию пакета нельзя переписать', !!upd.error, upd.error ? 'база не дала' : 'ПЕРЕПИСАЛОСЬ — это дыра')

    // ── Сверщик: проверка есть, события нет.
    await content.from('reviews').insert({
      target_type: 'package_version', target_id: ART, target_version: 3, target_hash: HASH_LOST,
      provider: 'code', model: 'code/v1', verdict: 'passed',
    })
    const restored = await reconcileVerified(seo)
    const mine = restored.filter((r) => r.articleId === ART && r.version === 3)
    ok('сверщик восстановил потерянное событие', mine.length === 1 && mine[0].restored,
      `восстановлено ${mine.filter((m) => m.restored).length}`)
    const again = await reconcileVerified(seo)
    const mineAgain = again.filter((r) => r.articleId === ART && r.version === 3)
    ok('повторная сверка ничего не удваивает', mineAgain.length === 0, `нашёл ${mineAgain.length}`)

    // ── Разбор восстановленного даёт версию тому же пакету, а не второй пакет.
    await consumeVerified(seo, 'тест-строитель')
    const { data: pkgs2 } = await content.from('packages').select('id').eq('seo_article_id', ART)
    ok('восстановленное событие не создало второй пакет', (pkgs2 ?? []).length === 1, `пакетов ${(pkgs2 ?? []).length}`)
    const { data: vers2 } = await content.from('package_versions').select('version').eq('package_id', pkg?.id).order('version')
    ok('у пакета стало две версии', (vers2 ?? []).length === 2, `версий ${(vers2 ?? []).length}`)
  } finally {
    await cleanup()
    const { data: left } = await content.from('packages').select('id').eq('seo_article_id', ART)
    const { data: leftRev } = await content.from('reviews').select('id').like('target_hash', 'тест-моста%')
    console.log(`\nприбрано. осталось: пакетов ${(left ?? []).length}, проверок ${(leftRev ?? []).length}`)
  }

  console.log(`\n${passed} пройдено, ${failed} провалено`)
  process.exit(failed ? 1 : 0)
}
main()
