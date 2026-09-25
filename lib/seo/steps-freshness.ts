/**
 * Задачи свежести фактов: наблюдение по расписанию и план правки (E6.7).
 *
 * Два шага, и разделены они не для красоты. Наблюдение дешёвое, массовое и
 * идёт по расписанию: сорок источников, условные запросы, у большинства ответ
 * «не изменилось». План правки — редкий и дорогой: он поднимает публикации,
 * прежние выдержки и пишет человеку, что делать с уже вышедшим постом. Слить их
 * в один шаг значит либо ходить по всем источникам каждый раз, когда надо
 * составить один план, либо составлять планы внутри обхода и терять их все,
 * когда обход упадёт на тридцатом источнике.
 *
 * Главное решение здесь такое: изменение страницы НЕ равно изменению факта.
 * Страница вуза меняется почти каждый день — новости, баннеры, номер набора в
 * подвале. Поэтому после «изменилось» мы перепроверяем по новому тексту каждое
 * утверждение, которое на этой странице стояло, и событием считаем только
 * исчезновение подтверждения. Иначе машина блокировала бы выпуск ежедневно, а
 * человек перестал бы читать её сообщения — и пропустил то одно, которое было
 * настоящим.
 */
import { registerStep, type Job, type StepOutcome } from './steps'
import { enqueueJob } from './enqueue'
import { extractText, snapshotText, verifyClaimAgainst, type Snapshot } from './provenance'
import { наблюдать } from '../content/observe'
import {
  историяВидов, следствия, нуженЧеловек, планПравки, правкаНаПлощадке,
} from '../content/freshness'

const АГЕНТ = () => process.env.SEO_CRAWL_USER_AGENT || 'goandstudy-seo-bot'

/** Сколько прошлых наблюдений поднимать: вывод об исчезновении делается по трём. */
const ГЛУБИНА_ИСТОРИИ = 5

/**
 * Свой запас времени у шага.
 *
 * У воркера на Vercel потолок 300 с, у тика бюджет 240. Одно наблюдение в худшем
 * случае это два запроса по двадцать секунд — robots.txt и страница, — то есть
 * пять источников подряд способны съесть двести секунд и быть убитыми на
 * середине. Поэтому обход останавливается сам и отдаёт остаток очереди
 * следующему прогону: недосмотренный источник просто останется просроченным, а
 * `sources_due` вернёт его первым.
 */
const ЗАПАС_МС = 120_000

/** Ошибка, по которой видно: миграция свежести не применена, а не «источников нет». */
const НЕТ_МИГРАЦИИ = /schema cache|does not exist|Could not find the function/i

type ИсточникКОсмотру = { id: number; url: string; критичный: boolean; просрочкаЧасов: number | null }

/* ── Наблюдение по расписанию ───────────────────────────────────────────── */

registerStep('content_freshness_check', async (job: Job, seo: any): Promise<StepOutcome> => {
  const content = seo.schema('content')
  const лимит = Math.max(1, Math.min(20, Number(job.payload?.limit ?? 5)))
  const только = job.payload?.source_id ? Number(job.payload.source_id) : null

  let очередь: ИсточникКОсмотру[] = []
  if (только) {
    // Точечный прогон: так вызывают перед выпуском, когда важен один источник,
    // а не расписание. Срок при этом не смотрим — попросили, значит смотрим.
    const { data, error } = await seo.from('sources')
      .select('id, url, critical').eq('id', только).maybeSingle()
    if (error) return { outcome: 'failed', result: { error: `источник #${только}: ${error.message}` } }
    if (!data?.url) return { outcome: 'failed', result: { error: `источник #${только} без адреса — наблюдать нечего` } }
    очередь = [{ id: data.id, url: data.url, критичный: Boolean(data.critical), просрочкаЧасов: null }]
  } else {
    const { data, error } = await seo.rpc('sources_due', { p_limit: лимит })
    if (error) {
      return {
        outcome: 'failed',
        result: {
          error: НЕТ_МИГРАЦИИ.test(error.message)
            ? 'миграция свежести не применена: нет seo.sources_due. Применить supabase/migrations/20260918000000_freshness.sql'
            : `sources_due: ${error.message}`,
        },
      }
    }
    очередь = (data ?? []).map((r: any) => ({
      id: r.out_id, url: r.out_url, критичный: Boolean(r.out_critical), просрочкаЧасов: r.out_overdue_hours ?? null,
    }))
  }

  if (!очередь.length) return { outcome: 'done', result: { наблюдений: 0, нечего_смотреть: true, cost: 0 } }

  const началось = Date.now()
  const итог = {
    наблюдений: 0, изменилось: 0, пробелов: 0, подтверждено: 0, не_успели: 0,
    фактов_проверено: 0, фактов_устарело: 0, публикаций_заблокировано: 0,
    задач_правки: 0, позвали_человека: 0,
    исходы: {} as Record<string, number>,
    ошибки: [] as string[],
  }

  for (const ист of очередь) {
    if (Date.now() - началось > ЗАПАС_МС) {
      итог.не_успели = очередь.length - итог.наблюдений
      break
    }
    const { data: src } = await seo.from('sources')
      .select('id, url, critical, recheck_hours, etag, last_modified, consecutive_gaps')
      .eq('id', ист.id).maybeSingle()

    const { data: прошлые } = await seo.from('source_snapshots')
      .select('id, content_hash, fetched_at, outcome, http_status, fetch_error, changed')
      .eq('source_id', ист.id).order('fetched_at', { ascending: false }).limit(ГЛУБИНА_ИСТОРИИ)
    const предыдущий = прошлые?.[0] ?? null
    const историяДо = историяВидов(прошлые ?? [])

    const исход = await наблюдать(
      ист.url,
      { хеш: предыдущий?.content_hash ?? null, etag: src?.etag ?? null, изменено: src?.last_modified ?? null },
      extractText,
      АГЕНТ(),
    )
    итог.наблюдений++
    итог.исходы[исход.вид] = (итог.исходы[исход.вид] ?? 0) + 1

    const сл = следствия(исход, историяДо)
    const естьТекст = исход.вид === 'впервые' || исход.вид === 'изменилось'
    if (исход.вид === 'изменилось') итог.изменилось++
    if (исход.вид === 'не_изменилось') итог.подтверждено++
    if (сл.пробелов(0) > 0) итог.пробелов++

    // Строка снимка пишется при любом исходе: недоступность источника — это
    // наблюдение, а не отсутствие наблюдения.
    const строка: Record<string, unknown> = {
      source_id: ист.id, outcome: исход.вид, previous_snapshot_id: предыдущий?.id ?? null,
    }
    if (естьТекст) {
      const и = исход as Extract<typeof исход, { хеш: string; текст: string }>
      Object.assign(строка, {
        http_status: и.статус, final_url: и.финальныйАдрес, content_hash: и.хеш,
        bytes: Buffer.byteLength(и.текст, 'utf8'), changed: исход.вид === 'изменилось', raw_text: и.текст,
      })
    } else if (исход.вид === 'не_изменилось') {
      Object.assign(строка, {
        http_status: исход.статус, content_hash: предыдущий?.content_hash ?? null, changed: false,
        // Текст не повторяем: одинаковые копии одной страницы занимают место и
        // ничего не добавляют — так же, как в snapshotSource.
        raw_text: null,
      })
    } else {
      Object.assign(строка, {
        http_status: (исход as any).статус ?? null, changed: null,
        fetch_error: исход.вид === 'запрещено_robots' ? `запрещено robots.txt: ${исход.правило}`
          : исход.вид === 'таймаут' ? 'таймаут'
          : исход.вид === 'недоступно' ? исход.причина
          : исход.вид,
      })
    }

    const { data: новый, error: сохр } = await seo.from('source_snapshots').insert(строка).select('id').single()
    if (сохр) {
      итог.ошибки.push(`снимок источника #${ист.id}: ${сохр.message}`)
      continue
    }

    const { error: обн } = await seo.from('sources').update({
      last_observed_at: new Date().toISOString(),
      last_outcome: исход.вид,
      consecutive_gaps: сл.пробелов(src?.consecutive_gaps ?? 0),
      // Условные заголовки обновляем только когда источник их прислал: пустое
      // значение вместо прежнего заставило бы следующий запрос качать тело зря.
      ...(естьТекст && (исход as any).etag ? { etag: (исход as any).etag } : {}),
      ...(естьТекст && (исход as any).изменено ? { last_modified: (исход as any).изменено } : {}),
    }).eq('id', ист.id)
    if (обн) {
      return {
        outcome: 'failed',
        result: {
          error: НЕТ_МИГРАЦИИ.test(обн.message)
            ? 'миграция свежести не применена: у seo.sources нет полей наблюдения. '
              + 'Применить supabase/migrations/20260918000000_freshness.sql'
            : `sources #${ист.id}: ${обн.message}`,
          ...итог,
        },
      }
    }

    // Пробел зовёт человека не сам по себе — минутная недоступность это шум, —
    // а через вывод из истории: несколько наблюдений подряд без ответа.
    const ч = нуженЧеловек(сл.вывод, Boolean(src?.critical))
    if (ч.нужен) {
      const { data: уже } = await content.from('attention_items').select('id')
        .eq('reason_code', 'source_observation_gap').eq('entity_type', 'source').eq('entity_id', ист.id)
        .is('resolved_at', null).limit(1)
      if (!уже?.length) {
        await content.from('attention_items').insert({
          reason_code: 'source_observation_gap', severity: ч.вес,
          entity_type: 'source', entity_id: ист.id,
          suggested_action: `${ист.url} — ${ч.текст}`,
        })
        итог.позвали_человека++
      }
    }

    if (!естьТекст) continue

    // Страница другая. Что из этого следует для фактов — решает проверка по
    // новому тексту, а не сам факт изменения хеша.
    const и = исход as Extract<typeof исход, { хеш: string; текст: string }>
    const снимок: Snapshot = {
      id: новый.id, sourceId: ист.id, finalUrl: и.финальныйАдрес,
      httpStatus: и.статус, text: и.текст, contentHash: и.хеш, error: null,
    }

    const { data: факты, error: ош } = await seo.rpc('claims_on_source', { p_source_id: ист.id })
    if (ош) {
      итог.ошибки.push(НЕТ_МИГРАЦИИ.test(ош.message)
        ? 'нет seo.claims_on_source — миграция свежести не применена'
        : `claims_on_source #${ист.id}: ${ош.message}`)
      continue
    }

    for (const ф of факты ?? []) {
      const claimId = Number(ф.out_claim_id)
      итог.фактов_проверено++

      let держится = false
      try {
        держится = Boolean(await verifyClaimAgainst(seo, claimId, снимок))
      } catch (e: any) {
        итог.ошибки.push(`проверка факта #${claimId}: ${e?.message ?? e}`)
        continue
      }
      if (держится) continue

      // Подтверждения в новом тексте нет. Это и есть изменение факта.
      итог.фактов_устарело++
      await seo.from('claims').update({ status: 'stale' }).eq('id', claimId)

      const причина = `источник ${ист.url} изменился, прежней выдержки в нём нет`
      const { data: посл, error: ошИзм } = await content.rpc('claim_changed', {
        p_claim_id: claimId, p_reason: причина,
      })
      if (ошИзм) {
        итог.ошибки.push(НЕТ_МИГРАЦИИ.test(ошИзм.message)
          ? 'нет content.claim_changed — миграция свежести не применена'
          : `claim_changed #${claimId}: ${ошИзм.message}`)
        continue
      }
      итог.публикаций_заблокировано += Number(посл?.[0]?.out_blocked ?? 0)

      // План правки составляется отдельной задачей на каждую затронутую
      // публикацию: поднять прежние выдержки и написать человеку, что делать,
      // внутри обхода источников нельзя — обход упадёт, планы пропадут.
      const { data: затронуты } = await content.rpc('affected_by_claim', { p_claim_id: claimId })
      const нужныПланы = (затронуты ?? []).filter((a: any) =>
        a.out_publication_id && ['published', 'blocked', 'scheduled'].includes(a.out_publication_status))
      for (const a of нужныПланы) {
        const { data: стоит } = await seo.from('jobs').select('id')
          .eq('step', 'content_correction_plan').in('status', ['pending', 'running', 'waiting'])
          .contains('payload', { publication_id: a.out_publication_id, claim_id: claimId }).limit(1)
        if (стоит?.length) continue
        const res = await enqueueJob(seo, {
          step: 'content_correction_plan', lane: 'content', priority: 10,
          payload: { publication_id: a.out_publication_id, claim_id: claimId, source_id: ист.id, reason: причина },
        })
        if (res.error) итог.ошибки.push(`задача правки для публикации #${a.out_publication_id}: ${res.error}`)
        else итог.задач_правки++
      }
    }
  }

  return { outcome: 'done', result: { ...итог, cost: 0 } }
})

/* ── План правки вышедшего ──────────────────────────────────────────────── */

registerStep('content_correction_plan', async (job: Job, seo: any): Promise<StepOutcome> => {
  const content = seo.schema('content')
  const claimId = Number(job.payload?.claim_id ?? 0)
  const pubId = job.payload?.publication_id ? Number(job.payload.publication_id) : null
  if (!claimId) return { outcome: 'failed', result: { error: 'в задаче нет claim_id — план правки не о чем составлять' } }

  const { data: факт, error: ошФакт } = await seo.from('claims')
    .select('id, kind, statement, value, value_num, unit, status, subject_key').eq('id', claimId).maybeSingle()
  if (ошФакт || !факт) return { outcome: 'failed', result: { error: `факт #${claimId} не найден: ${ошФакт?.message ?? 'нет строки'}` } }

  // Источник берём из задачи, а если его там нет — из последней связи факта со
  // снимком: план должен называть адрес страницы, а не «источник изменился».
  let sourceId = job.payload?.source_id ? Number(job.payload.source_id) : null
  let прежняяВыдержка: string | null = null
  const { data: связи } = await seo.from('claim_sources')
    .select('snapshot_id, quote, checked_at').eq('claim_id', claimId)
    .order('checked_at', { ascending: false }).limit(5)
  if (связи?.length) {
    прежняяВыдержка = связи[0].quote ?? null
    if (!sourceId) {
      const { data: сн } = await seo.from('source_snapshots')
        .select('source_id').eq('id', связи[0].snapshot_id).maybeSingle()
      sourceId = сн?.source_id ?? null
    }
  }

  const { data: ист } = sourceId
    ? await seo.from('sources').select('id, url, critical').eq('id', sourceId).maybeSingle()
    : { data: null }

  // Что на странице стоит сейчас. Берём последний снимок с текстом: план без
  // нынешнего состояния заставляет человека открывать страницу самому и
  // сравнивать на глаз.
  let сейчасТекст: string | null = null
  let наблюдёнВ = 'наблюдений нет'
  if (sourceId) {
    const { data: посл } = await seo.from('source_snapshots')
      .select('content_hash, fetched_at, outcome').eq('source_id', sourceId)
      .order('fetched_at', { ascending: false }).limit(1)
    if (посл?.[0]) {
      наблюдёнВ = String(посл[0].fetched_at ?? '').slice(0, 16).replace('T', ' ')
      if (посл[0].content_hash) сейчасТекст = await snapshotText(seo, sourceId, посл[0].content_hash)
    }
  }

  const { findEvidence } = await import('./provenance')
  const нашлось = сейчасТекст ? findEvidence(сейчасТекст, факт) : null

  const { data: пуб } = pubId
    ? await content.from('publications').select('id, status, channel_id, remote_url, variant_version_id').eq('id', pubId).maybeSingle()
    : { data: null }
  const { data: канал } = пуб?.channel_id
    ? await content.from('channels').select('id, platform, title').eq('id', пуб.channel_id).maybeSingle()
    : { data: null }

  const { data: версия } = пуб?.variant_version_id
    ? await content.from('variant_versions').select('id, variant_id').eq('id', пуб.variant_version_id).maybeSingle()
    : { data: null }

  const план = планПравки({
    факт: {
      id: факт.id, kind: факт.kind, statement: факт.statement,
      было: прежняяВыдержка,
      подтверждаетсяСейчас: Boolean(нашлось),
      стало: нашлось?.quote ?? null,
    },
    источник: { url: ист?.url ?? null, наблюдёнВ },
    публикация: пуб
      ? { id: пуб.id, статус: пуб.status, платформа: канал?.platform ?? null, адрес: пуб.remote_url ?? null }
      : null,
    вариант: версия ? { версияId: версия.id, пакетId: null } : null,
  })

  // Если подтверждение на странице всё-таки нашлось, план правки не нужен, но и
  // молчать нельзя: значит наблюдение и проверка разошлись, и разбираться в этом
  // человеку. Такое бывает, когда страница отдаёт разный текст разным клиентам.
  const расхождение = Boolean(нашлось)

  const причина = String(job.payload?.reason ?? 'факт изменился в источнике')
  const текст = [
    расхождение
      ? 'РАСХОЖДЕНИЕ: наблюдение сочло факт изменившимся, а проверка по последнему снимку его находит. '
        + 'Возможно, страница отдаёт разный текст разным клиентам — решать человеку.'
      : `Правка нужна: ${причина}`,
    план.текст,
  ].join('\n')

  // План кладём в ту же строку очереди внимания, которую завела claim_changed:
  // две записи об одном событии человек читает как два события.
  const reason_code = пуб?.status === 'published' ? 'claim_changed_after_publish' : 'claim_changed_in_draft'
  const entity_type = пуб ? 'publication' : 'variant_version'
  const entity_id = пуб?.id ?? версия?.id ?? null

  let записано: 'обновлена' | 'создана' | 'некуда' = 'некуда'
  if (entity_id) {
    const { data: уже } = await content.from('attention_items').select('id')
      .eq('entity_type', entity_type).eq('entity_id', entity_id)
      .in('reason_code', ['claim_changed_after_publish', 'claim_changed_in_draft'])
      .is('resolved_at', null).order('id', { ascending: false }).limit(1)
    if (уже?.length) {
      await content.from('attention_items').update({
        severity: расхождение ? 'medium' : план.вес,
        suggested_action: текст,
      }).eq('id', уже[0].id)
      записано = 'обновлена'
    } else {
      await content.from('attention_items').insert({
        reason_code, severity: расхождение ? 'medium' : план.вес,
        entity_type, entity_id, suggested_action: текст,
      })
      записано = 'создана'
    }
  }

  // В журнал — чтобы через месяц было видно, кто и когда поставил задачу правки.
  await content.from('audit_events').insert({
    actor: 'content_freshness', operation: 'correction_plan',
    entity_type, entity_id, trace_id: `claim:${claimId}:job:${job.id}`,
  })

  return {
    outcome: 'done',
    result: {
      факт: claimId, публикация: pubId, запись_внимания: записано,
      подтверждается_сейчас: расхождение, вес: план.вес,
      действий: план.действия.length,
      правка_на_площадке: правкаНаПлощадке(канал?.platform ?? null).доверие,
      cost: 0,
    },
  }
})

/**
 * Собрать подтверждения самостоятельно.
 *
 * Реестр фактов заполнялся руками, и пока рука не дошла, ворота выпуска
 * держали готовые статьи: десять утверждений про стипендии CSC пролежали
 * непроверенными две недели только потому, что источник по Китаю никто не
 * завёл. Ритм «статья в день» не может зависеть от блокнота.
 *
 * Шаг долгий: поиск в сети плюс скачивание нескольких страниц. Разбираем по
 * двадцать утверждений за раз — этого хватает, чтобы за несколько часов закрыть
 * новую страну, и не хватает, чтобы съесть весь запас времени у одного тика.
 */
registerStep('claims_autoverify', async (_job: Job, seo: any): Promise<StepOutcome> => {
  const { autoverifyClaims } = await import('./claim-verify')
  const { count } = await seo.from('claims')
    .select('*', { count: 'exact', head: true }).is('verified_at', null)
  if (!count) return { outcome: 'done', result: { skipped: 'неподтверждённых утверждений нет', cost: 0 } }

  const r = await autoverifyClaims(seo, { limit: 20 })
  return {
    outcome: 'done',
    result: {
      подтверждено: r.confirmed,
      не_нашлось: r.notFound,
      источников_заведено: r.sourcesAdded,
      утверждения: r.confirmedIds,
      заметки: r.notes.slice(0, 8),
      cost: 0,
    },
  }
})
