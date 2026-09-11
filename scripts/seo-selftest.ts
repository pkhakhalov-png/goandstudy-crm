// Проверки критических мест конвейера. Запуск: npx tsx scripts/seo-selftest.ts
//
// Проверяем то, что уже ломалось в бою: захват задачи двумя исполнителями,
// повторную публикацию, классификацию ошибок, санитарию тела статьи,
// каннибализацию и целостность импорта. Тесты не трогают рабочий сайт:
// публикация проверяется на уровне очереди, а не записи файлов.
import { config } from 'dotenv'; import path from 'path'
config({ path: path.resolve(process.cwd(), '.env.local') })
import { createClient } from '@supabase/supabase-js'

const seo = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!).schema('seo')

let passed = 0, failed = 0
async function test(name: string, fn: () => Promise<string | void>) {
  try {
    const note = await fn()
    passed++; console.log(`✓ ${name}${note ? ` — ${note}` : ''}`)
  } catch (e: any) {
    failed++; console.log(`✗ ${name}\n    ${e.message}`)
  }
}
function assert(cond: any, msg: string) { if (!cond) throw new Error(msg) }

async function main() {
  /* ── Очередь ─────────────────────────────────────────────────────────── */

  await test('два исполнителя не возьмут одну задачу', async () => {
    const { data: job } = await seo.from('jobs').insert({ step: 'noop', lane: 'test', priority: 1, payload: {} }).select('id').single()
    try {
      const [a, b] = await Promise.all([
        seo.rpc('claim_jobs', { p_worker: 'test-a', p_limit: 5 }),
        seo.rpc('claim_jobs', { p_worker: 'test-b', p_limit: 5 }),
      ])
      const mine = [...(a.data ?? []), ...(b.data ?? [])].filter((j: any) => j.id === job!.id)
      assert(mine.length <= 1, `задачу выдали ${mine.length} раз — потеряна защита от двойного захвата`)
      return mine.length === 1 ? 'выдана ровно одному' : 'не выдана (занята дорожка) — тоже допустимо'
    } finally {
      await seo.from('jobs').delete().eq('id', job!.id)
    }
  })

  await test('зависшая задача возвращается в работу', async () => {
    const long = new Date(Date.now() - 20 * 60000).toISOString()
    const { data: job } = await seo.from('jobs')
      .insert({ step: 'noop', lane: 'test', priority: 1, payload: {}, status: 'running', locked_at: long, locked_by: 'умерший-воркер' })
      .select('id').single()
    try {
      await seo.rpc('claim_jobs', { p_worker: 'test-c', p_limit: 1 })
      const { data: after } = await seo.from('jobs').select('status, attempts').eq('id', job!.id).single()
      assert(after!.status !== 'running' || after!.attempts > 0, 'задача осталась висеть на мёртвом исполнителе')
      return `статус после разблокировки: ${after!.status}`
    } finally {
      await seo.from('jobs').delete().eq('id', job!.id)
    }
  })

  await test('повторная публикация не ставится дважды', async () => {
    const { data: art } = await seo.from('articles').select('id').eq('status', 'published').limit(1).single()
    if (!art) return 'опубликованных статей нет, проверка пропущена'
    const { data: dup } = await seo.from('jobs').select('id')
      .eq('step', 'article_publish_blog').eq('article_id', art.id).in('status', ['pending', 'running', 'waiting'])
    assert((dup?.length ?? 0) <= 1, `в очереди ${dup!.length} публикаций одной статьи`)
    return 'дублей в очереди нет'
  })

  /* ── Ошибки ──────────────────────────────────────────────────────────── */

  await test('временные и окончательные ошибки различаются', async () => {
    const { isTemporary } = await import('../lib/seo/failure')
    assert(isTemporary(new Error('OpenAI 429: rate limit')), 'перегрузку надо повторять')
    assert(!isTemporary(new Error('429: You have no credits remaining')), 'нехватку денег повторять бессмысленно')
    assert(isTemporary(new Error('fetch failed')), 'обрыв связи надо повторять')
    assert(!isTemporary(new Error('401 invalid_client')), 'неверный ключ повторять бессмысленно')
    return 'четыре случая разобраны верно'
  })

  /* ── Содержимое ──────────────────────────────────────────────────────── */

  await test('исполняемая разметка не доедет до страницы', async () => {
    const { sanitizeBody, findDangerous } = await import('../lib/seo/blog-style')
    for (const bad of ['<script>alert(1)</script>', '<p onclick="x()">т</p>', '<iframe src="//evil"></iframe>', '<?php system($_GET[1]); ?>']) {
      assert(findDangerous(bad).length > 0, `не заметили: ${bad}`)
      const clean = sanitizeBody(bad).body
      assert(!/<script|onclick=|<iframe|<\?php/i.test(clean), `не вычистили: ${bad}`)
    }
    return 'скрипт, обработчик, рамка и PHP вырезаются'
  })

  await test('обычная статья санитарию проходит без потерь', async () => {
    const { sanitizeBody } = await import('../lib/seo/blog-style')
    const body = '<!-- wp:paragraph -->\n<p>Учёба в Китае и <a href="/blog/x/">ссылка</a></p>\n<!-- /wp:paragraph -->'
    assert(sanitizeBody(body).body === body, 'чистый текст изменился')
    return 'текст не тронут'
  })

  /* ── Каннибализация ──────────────────────────────────────────────────── */

  await test('мало данных — не приговор, а «спорно»', async () => {
    const { verdictFor } = await import('../lib/seo/cannibal')
    const v = verdictFor([{ normalized_url: 'https://goandstudy.com/blog/a', query: 'редкий запрос про учёбу', clicks: 0, impressions: 3, position: 40 }], 'редкий запрос про учёбу')
    assert(v.verdict === 'unclear' || v.verdict === 'safe', `при трёх показах вынесли «${v.verdict}»`)
    return `исход: ${v.verdict}`
  })

  await test('переформулировка своей темы отлавливается', async () => {
    const { sameFamily } = await import('../lib/seo/cannibal')
    assert(sameFamily('грант на обучение в китае', 'гранты на обучение в китае'), 'не увидели одну семью')
    assert(!sameFamily('обучение в китае', 'обучение в италии'), 'приняли разные страны за одно')
    return 'семьи различаются верно'
  })

  /* ── Импорт ──────────────────────────────────────────────────────────── */

  await test('повторный импорт не удваивает показы', async () => {
    const day = '2026-09-05'
    const { data: before } = await seo.from('gsc_page_daily').select('normalized_url, impressions').eq('date', day).order('impressions', { ascending: false }).limit(1)
    if (!before?.length) return 'нет данных за контрольный день'
    const { runStep } = await import('../lib/seo/steps')
    await runStep({ id: 0, step: 'gsc_import', lane: 'gsc', payload: { startDate: day, endDate: day } } as any, seo)
    const { data: after } = await seo.from('gsc_page_daily').select('impressions').eq('date', day).eq('normalized_url', before[0].normalized_url).single()
    assert(after!.impressions === before[0].impressions, `показы изменились: ${before[0].impressions} → ${after!.impressions}`)
    return `показы устойчивы: ${after!.impressions}`
  })

  await test('обе формы адреса схлопываются в одну строку', async () => {
    const { data } = await seo.from('gsc_page_daily').select('normalized_url').like('normalized_url', '%/blog/%').limit(400)
    const withSlash = (data ?? []).filter((r: any) => r.normalized_url.endsWith('/'))
    assert(withSlash.length === 0, `${withSlash.length} адресов сохранились со слэшем — будут считаться отдельно`)
    return 'дублей по форме адреса нет'
  })

  /* ── Страница ────────────────────────────────────────────────────────── */

  await test('вышедшая статья проходит сверку', async () => {
    const { verifyPublished } = await import('../lib/seo/theme-publish')
    const v = await verifyPublished('kak-poluchit-grant-obuchenie-kitae')
    assert(v.ok, `сверка нашла: ${v.results.filter(r => /нет|не отдаётся|чужой/.test(r)).join('; ')}`)
    return v.results.length + ' проверок пройдено'
  })

  console.log(`\n${passed} пройдено, ${failed} провалено`)
  process.exit(failed ? 1 : 0)
}
main().catch((e) => { console.error('✗ тесты не запустились:', e.message); process.exit(1) })
