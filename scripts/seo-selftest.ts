// Проверки критических мест конвейера. Запуск: npx tsx scripts/seo-selftest.ts
//
// Проверяем то, что уже ломалось в бою: захват задачи двумя исполнителями,
// повторную публикацию, классификацию ошибок, санитарию тела статьи,
// каннибализацию и целостность импорта. Тесты не трогают рабочий сайт:
// публикация проверяется на уровне очереди, а не записи файлов.
import { config } from 'dotenv'; import path from 'path'
config({ path: path.resolve(process.cwd(), '.env.local') })
import { createClient } from '@supabase/supabase-js'
import { warnOnError } from '../lib/supabase/write-guard'

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
    const { data: job } = await seo.from('jobs').insert({ step: 'noop', lane: 'test', priority: 1, payload: {} }).select('id').single().then(warnOnError('jobs · scripts/seo-selftest.ts:28'))
    try {
      const [a, b] = await Promise.all([
        seo.rpc('claim_jobs', { p_worker: 'test-a', p_limit: 5 }),
        seo.rpc('claim_jobs', { p_worker: 'test-b', p_limit: 5 }),
      ])
      const mine = [...(a.data ?? []), ...(b.data ?? [])].filter((j: any) => j.id === job!.id)
      assert(mine.length <= 1, `задачу выдали ${mine.length} раз — потеряна защита от двойного захвата`)
      return mine.length === 1 ? 'выдана ровно одному' : 'не выдана (занята дорожка) — тоже допустимо'
    } finally {
      await seo.from('jobs').delete().eq('id', job!.id).then(warnOnError('jobs · scripts/seo-selftest.ts:38'))
    }
  })

  await test('зависшая задача возвращается в работу', async () => {
    const long = new Date(Date.now() - 20 * 60000).toISOString()
    const { data: job } = await seo.from('jobs')
      .insert({ step: 'noop', lane: 'test', priority: 1, payload: {}, status: 'running', locked_at: long, locked_by: 'умерший-воркер' })
      .select('id').single().then(warnOnError('jobs · scripts/seo-selftest.ts:45'))
    try {
      await seo.rpc('claim_jobs', { p_worker: 'test-c', p_limit: 1 })
      const { data: after } = await seo.from('jobs').select('status, attempts').eq('id', job!.id).single()
      assert(after!.status !== 'running' || after!.attempts > 0, 'задача осталась висеть на мёртвом исполнителе')
      return `статус после разблокировки: ${after!.status}`
    } finally {
      await seo.from('jobs').delete().eq('id', job!.id).then(warnOnError('jobs · scripts/seo-selftest.ts:53'))
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
    // Импорт пишет след полноты в settings.gsc_import_health. След сторожит
    // молчаливую потерю данных: по нему видно, сколько строк приехало за день.
    // Прогон за один день записал бы туда однодневное окно, и сторож после
    // проверки врал бы до следующего ночного импорта. Поэтому снимаем и кладём
    // обратно — проверка не должна портить то, что охраняет базу.
    const { data: healthBefore } = await seo.from('settings').select('value').eq('key', 'gsc_import_health').maybeSingle()
    try {
      await runStep({ id: 0, step: 'gsc_import', lane: 'gsc', payload: { startDate: day, endDate: day } } as any, seo)
    } finally {
      if (healthBefore) {
        await seo.from('settings').upsert({ key: 'gsc_import_health', value: healthBefore.value }, { onConflict: 'key' })
      }
    }
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

  /* ── Достоверность ───────────────────────────────────────────────────── */

  await test('существенное утверждение без подтверждения блокирует выпуск', async () => {
    const { factGate } = await import('../lib/seo/fact-gate')
    const { data: claim } = await seo.from('claims')
      .select('subject_key, statement, value_num, confidence').neq('confidence', 'confirmed').limit(1).single()
    if (!claim) return 'все утверждения подтверждены — проверка пропущена'
    const text = `Текст со значением ${claim.value_num ?? claim.statement}`
    const g = await factGate(seo, text, [claim.subject_key])
    assert(g.blocking.length + g.warnings.length > 0, 'неподтверждённое утверждение не замечено')
    return `${g.blocking.length} блокирующих, ${g.warnings.length} предупреждений`
  })

  await test('рискованная формулировка без числа ловится', async () => {
    const { findSemanticClaims } = await import('../lib/seo/semantic-claims')
    const must: [string, string][] = [
      ['<p>Для этой поездки виза не нужна, достаточно паспорта.</p>', 'visa'],
      ['<p>Мы гарантируем поступление в выбранный вуз.</p>', 'guarantee'],
      ['<p>Студенты могут работать без ограничений по часам.</p>', 'work_rights'],
      ['<p>Диплом признаётся автоматически во всех странах ЕС.</p>', 'recognition'],
      ['<p>Нострификация не нужна, документы примут как есть.</p>', 'recognition'],
      ['<p>По нашему опыту, подавать лучше в ноябре.</p>', 'about_us'],
    ]
    for (const [body, category] of must) {
      const found = findSemanticClaims(body)
      assert(found.length > 0, `пропущено: ${body}`)
      assert(found[0].category === category, `${body} — определено как ${found[0].category}, ожидалось ${category}`)
    }
    return `${must.length} формулировок распознаны верно`
  })

  await test('правильная формулировка не считается нарушением', async () => {
    const { findSemanticClaims } = await import('../lib/seo/semantic-claims')
    // Ложное срабатывание здесь дороже пропуска: редактор, которому дважды
    // показали верную фразу как ошибку, перестанет читать замечания вовсе.
    const quiet = [
      '<p>Для поездки виза нужна, её оформляют заранее.</p>',
      '<p>Мы не гарантируем поступление: решение принимает вуз.</p>',
      '<p>Гарантий никто не даёт, и обещать результат нечестно.</p>',
      '<p>Нужна ли виза — зависит от гражданства и срока поездки.</p>',
      '<p>Работать можно не более 20 часов в неделю.</p>',
      '<p>Нужна нострификация: без неё диплом не примут.</p>',
      '<p>Виза может не понадобиться, но это стоит уточнить в консульстве.</p>',
      // Живой случай из архива: статья про пробный экзамен, а не про работу.
      // «Без ограничения времени» ловилось как право работать без ограничений
      '<p>Без ограничения времени результат на практике часто выглядит лучше, чем на реальном экзамене.</p>',
      // Ещё три живых случая из архива: отрицание и разбор чужой ошибки
      '<p>Не все дипломы одинаково признаются во всех странах.</p>',
      '<p>Главная ошибка — думать, что существует список активностей, который гарантирует поступление в США.</p>',
      '<h2>Частые ошибки при оформлении учебной визы</h2><p>Думать, что зачисление гарантирует визу.</p>',
      // Живой случай из статьи про выбор консультанта: обещание стоит в списке
      // признаков недобросовестного агентства, то есть статья здесь права
      '<h2>Красные флаги в разговоре с агентством</h2><p>Гарантия зачисления, визы или стипендии — решение принимают вуз и консульство.</p>',
    ]
    for (const body of quiet) {
      const found = findSemanticClaims(body)
      assert(found.length === 0, `ложное срабатывание (${found[0]?.category}, «${found[0]?.trigger}»): ${body}`)
    }
    return `${quiet.length} верных формулировок пропущены молча`
  })

  await test('находка несёт цитату и место в тексте', async () => {
    const { findSemanticClaims } = await import('../lib/seo/semantic-claims')
    const body = '<!-- wp:paragraph -->\n<p>Учиться можно где угодно. Мы гарантируем зачисление в срок.</p>\n<!-- /wp:paragraph -->'
    const [found, ...rest] = findSemanticClaims(body)
    assert(found, 'обещание не найдено')
    assert(rest.length === 0, `на одно обещание ${rest.length + 1} находок`)
    assert(found.quote.includes('гарантируем зачисление'), `цитата не из текста: ${found.quote}`)
    assert(body.slice(found.offset, found.offset + found.trigger.length) === found.trigger,
      `смещение ${found.offset} указывает не на фразу: ${JSON.stringify(body.slice(found.offset, found.offset + 24))}`)
    return `цитата и смещение ${found.offset} совпадают с телом статьи`
  })

  await test('формулировка без числа блокирует выпуск так же, как неподтверждённое число', async () => {
    const { factGate } = await import('../lib/seo/fact-gate')
    const body = '<p>Для белорусов виза не нужна, въезд безвизовый.</p><p>По нашему опыту, подавать лучше в ноябре.</p>'
    // Ключ предмета заведомо пустой: проверка формулировок не должна зависеть
    // от того, есть ли в реестре факты по теме статьи
    const g = await factGate(seo, body, ['—'])
    assert(g.blocking.some((b) => b.kind === 'visa_requirement'), 'визовое утверждение не заблокировало выпуск')
    assert(g.warnings.some((w) => w.kind === 'internal_stat'), 'рассказ о себе не попал в предупреждения')
    assert(g.checked > 0, 'проверка отчиталась нулём — экран сочтёт, что проверять было нечего')
    const issue = g.blocking.find((b) => b.kind === 'visa_requirement')!
    assert(typeof issue.offset === 'number' && issue.quote, 'находка пришла без цитаты или места')
    return `${g.blocking.length} блокирующих, ${g.warnings.length} предупреждений`
  })

  await test('страна разводит похожие темы', async () => {
    const { sameFamily } = await import('../lib/seo/cannibal')
    assert(!sameFamily('поступление в вузы великобритании', 'поступление в вузы китая'), 'склеили разные страны')
    assert(sameFamily('магистратура в корее', 'магистратура в южной корее'), 'разделили одну страну')
    return 'страны различаются'
  })

  /* ── Обращения ───────────────────────────────────────────────────────── */

  await test('заявка привязывается к посадочной, чужие адреса отбрасываются', async () => {
    const { landingPathOf } = await import('../lib/seo/attribution')
    assert(landingPathOf({ landing_url: 'https://goandstudy.com/blog/x/' }) === '/blog/x', 'своя страница не распознана')
    assert(landingPathOf({ referrer: 'https://yandex.ru/search/' }) === null, 'чужой сайт принят за посадочную')
    assert(landingPathOf({ landing_url: 'https://crm.goandstudy.com/book' }) === null, 'форма записи принята за посадочную')
    assert(landingPathOf({ landing_url: 'https://goandstudy.com/book' }) === null, 'форма записи на домене сайта принята за посадочную')
    assert(landingPathOf({ landing_url: 'https://goandstudy.com/blog/postuplenie-v-ssha/' }) === '/blog/postuplenie-v-ssha', 'статья не распозналась как посадочная')

    // Боевой случай, которого здесь не было и из-за которого атрибуция молчала:
    // адрес формы приходит ВСЕГДА, а статья лежит в referrer. Проверять поля по
    // отдельности мало — ломается именно сочетание.
    assert(
      landingPathOf({
        landing_url: 'https://goandstudy.com/book?utm_source=tg',
        referrer: 'https://goandstudy.com/blog/postuplenie-v-ssha/',
      }) === '/blog/postuplenie-v-ssha',
      'форма заслонила статью: посадочная не определилась',
    )
    // И наоборот: пришли на форму из поиска — посадочной нет, и выдумывать её нельзя
    assert(
      landingPathOf({
        landing_url: 'https://goandstudy.com/book',
        referrer: 'https://www.google.com/',
      }) === null,
      'чужой referrer принят за посадочную',
    )
    return 'семь случаев разобраны верно, включая сочетание формы и статьи'
  })

  console.log(`\n${passed} пройдено, ${failed} провалено`)
  process.exit(failed ? 1 : 0)
}
main().catch((e) => { console.error('✗ тесты не запустились:', e.message); process.exit(1) })
