/**
 * Что происходит с записью после того, как Zoom сообщил о её готовности.
 *
 *   скачать → положить к себе → расшифровать → разобрать → почистить облако Zoom
 *
 * Каждый шаг отмечается в `call_recordings.status`. Это не украшение: если
 * расшифровка упала, запись всё равно лежит у нас и её можно переразобрать,
 * а по статусу видно, на чём именно споткнулись. Молчаливый сбой посреди
 * цепочки — худшее, что может случиться с фоновой обработкой: разговор
 * пропал, и никто не узнает.
 *
 * Упавшее не ждёт человека: `повторитьОдну` раз в десять минут берёт запись из
 * нашего хранилища и проводит её дальше (см. /api/zoom/retry). Поэтому `done`
 * означает ровно одно — разбор лежит в карточке сделки (или сделки у записи
 * нет вовсе). Разбор не удался — это `failed`, а не тихий `done`.
 *
 * Очистка облака Zoom — отдельным шагом и строго последней. Между скачиванием
 * и удалением есть момент, когда копия ещё не подтверждена; удалять в нём
 * значит рискнуть единственным экземпляром ради экономии одного запроса.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { downloadRecording, trashMeetingRecordings } from '@/lib/zoom/client'
import { расшифровать, транскрипцияНастроена } from '@/lib/zoom/transcribe'
import { analyzeConversation } from '@/lib/sales/analyze-conversation'
import { readRopSettings, flag } from '@/lib/rop-settings'
import { normalizePhone } from '@/lib/phone'

const БАКЕТ = 'call-recordings'

/** Короче — разговора не было: клиент не пришёл, менеджер подождал и вышел. */
const МИН_СЕК = 120

/** Сколько раз повторять упавшую запись, прежде чем оставить её в failed. */
const МАКС_ПОПЫТОК = 12

/** Ошибки, которые повтором не лечатся: тратить на них распознаватель незачем. */
const НЕИСПРАВИМО = /не разобрать слов|модель отказалась|разбирать нечего/i

type Запись = {
  id: string
  deal_id: string | null
  booking_id: string | null
  meeting_id: string | null
  external_id: string | null
  duration_sec: number | null
  started_at: string | null
  storage_path: string | null
  error?: string | null
}

const ПОЛЯ = 'id, deal_id, booking_id, meeting_id, external_id, duration_sec, started_at, storage_path, error'

function отметчик(admin: SupabaseClient, id: string) {
  return async (поля: Record<string, unknown>) => {
    await admin.from('call_recordings')
      .update({ ...поля, updated_at: new Date().toISOString() })
      .eq('id', id)
  }
}

/**
 * Сделка записи.
 *
 * Обычно бронь указывает на сделку через `deals.booking_id`. Но повторная
 * запись того же клиента сделку не заводит — она приклеивается к уже
 * существующей, а `booking_id` у сделки остаётся от первой брони. Без поиска
 * по телефону второй разговор с клиентом оставался без разбора.
 */
async function найтиСделку(admin: SupabaseClient, запись: Запись): Promise<string | null> {
  if (запись.deal_id) return запись.deal_id
  if (!запись.booking_id) return null

  const { data: поБрони } = await admin.from('deals')
    .select('id').eq('booking_id', запись.booking_id).is('deleted_at', null)
    .limit(1).maybeSingle()
  let id: string | null = поБрони?.id ?? null

  if (!id) {
    const { data: бронь } = await admin.from('bookings')
      .select('client_phone').eq('id', запись.booking_id).maybeSingle()
    const тел = normalizePhone(бронь?.client_phone)
    if (тел) {
      const { data: поТелефону } = await admin.from('deals')
        .select('id').eq('phone_normalized', тел).is('deleted_at', null)
        .order('created_at', { ascending: false }).limit(1).maybeSingle()
      id = поТелефону?.id ?? null
    }
  }

  if (id) await admin.from('call_recordings').update({ deal_id: id }).eq('id', запись.id)
  return id
}

/**
 * Расшифровать и разобрать запись, уже лежащую у нас.
 *
 * Расшифровка сохраняется рядом с аудио (`<путь>.txt`): повтор после упавшего
 * разбора не платит за распознавание второй раз, а сам текст разговора можно
 * открыть и после того, как облако Zoom почищено.
 */
async function разобрать(admin: SupabaseClient, запись: Запись, аудио?: Buffer): Promise<void> {
  const отметить = отметчик(admin, запись.id)
  if (!запись.storage_path) throw new Error('нет нашей копии записи')

  if ((запись.duration_sec ?? 0) < МИН_СЕК) {
    await отметить({ status: 'skipped', error: `запись короче ${МИН_СЕК / 60} минут — разговора не было` })
    return
  }

  // ── Расшифровать (или взять готовую) ──────────────────────────────────────
  const путьТекста = `${запись.storage_path}.txt`
  let текст: string | null = null
  const { data: готовая } = await admin.storage.from(БАКЕТ).download(путьТекста)
  if (готовая) текст = (await готовая.text()).trim() || null

  if (!текст) {
    if (!транскрипцияНастроена()) throw new Error('распознаватель речи не настроен (GEMINI_API_KEY)')
    await отметить({ status: 'transcribing' })
    if (!аудио) {
      const { data: файл, error } = await admin.storage.from(БАКЕТ).download(запись.storage_path)
      if (error || !файл) throw new Error(`наша копия не достаётся: ${error?.message ?? 'пусто'}`)
      аудио = Buffer.from(await файл.arrayBuffer())
    }
    const расшифровка = await расшифровать(аудио, 'audio/m4a')
    текст = расшифровка.текст
    await admin.storage.from(БАКЕТ).upload(путьТекста, Buffer.from(текст, 'utf8'), {
      contentType: 'text/plain; charset=utf-8', upsert: true,
    })
    console.log(`[запись ${запись.id}] расшифрована (${расшифровка.модель}) за ${Math.round(расшифровка.мс / 1000)} с, ${текст.length} символов`)
  }

  // ── Разобрать ─────────────────────────────────────────────────────────────
  //
  // Тем же разбором, что и переписка. Для человека звонок и чат — один
  // разговор, и смотреть на них он должен одинаково.
  const dealId = await найтиСделку(admin, запись)
  if (!dealId) {
    console.log(`[запись ${запись.id}] сделка не определена — лежит в «неопознанных»`)
    await отметить({ status: 'done', error: null })
    return
  }

  await отметить({ status: 'analyzing' })
  const материал = {
    dealId,
    text: `# Звонок\nДата: ${запись.started_at ?? '—'}\nДлительность: ${Math.round((запись.duration_sec ?? 0) / 60)} мин.\n\n${текст}`,
    messagesCount: текст.split('\n').filter(Boolean).length,
    coveredTo: запись.started_at ?? null,
    empty: false,
  }

  const res = await analyzeConversation(материал)
  if (!res.ok) throw new Error(`разбор не удался: ${res.why}`)

  const p = res.payload as any
  await admin.from('deal_analyses').insert({
    deal_id: dealId,
    source: 'call',
    covered_to: запись.started_at,
    items_count: материал.messagesCount,
    client_type: p['тип_клиента'] ?? null,
    next_step: p['следующий_шаг']?.['есть'] ?? null,
    summary: p['резюме'] ?? null,
    payload: res.payload,
    model: res.model,
    cost_usd: res.costUsd,
    ms: res.ms,
  }).throwOnError()

  await admin.from('deal_activities').insert({
    deal_id: dealId,
    activity_type: 'call',
    content: `Звонок ${Math.round((запись.duration_sec ?? 0) / 60)} мин разобран: ${p['тип_клиента']}, следующий шаг ${p['следующий_шаг']?.['есть'] ? 'зафиксирован' : 'НЕ зафиксирован'}`,
    metadata: { recording_id: запись.id, source: 'zoom', model: res.model },
  })

  await отметить({ status: 'done', error: null })
  console.log(`[запись ${запись.id}] разобрана: ${p['тип_клиента']}`)
}

/** Сколько попыток уже было — счётчик живёт в начале текста ошибки. */
function попыток(error: string | null | undefined): number {
  const m = /^\[попытка (\d+)\]/.exec(error ?? '')
  return m ? Number(m[1]) : (error ? 1 : 0)
}

async function упала(admin: SupabaseClient, запись: Запись, e: any): Promise<void> {
  const причина = String(e?.message ?? e).replace(/^\[попытка \d+\]\s*/, '').slice(0, 400)
  const n = попыток(запись.error) + 1
  console.error(`[запись ${запись.id}] упала (попытка ${n}): ${причина}`)
  await отметчик(admin, запись.id)({
    status: НЕИСПРАВИМО.test(причина) ? 'skipped' : 'failed',
    error: `[попытка ${n}] ${причина}`,
  })
}

export async function обработатьЗапись(
  admin: SupabaseClient,
  recordingId: string,
  источник: { downloadUrl: string; downloadToken?: string },
): Promise<void> {
  const { data: запись } = await admin
    .from('call_recordings')
    .select(ПОЛЯ)
    .eq('id', recordingId)
    .single()

  if (!запись) { console.error('[запись] строки нет:', recordingId); return }

  try {
    // ── Забрать файл ────────────────────────────────────────────────────────
    const файл = await downloadRecording(источник.downloadUrl, источник.downloadToken)
    const путь = `${запись.meeting_id}/${запись.external_id}.m4a`

    const { error: upErr } = await admin.storage
      .from(БАКЕТ)
      .upload(путь, файл, { contentType: 'audio/m4a', upsert: true })

    if (upErr) throw new Error(`не сохранилась к нам: ${upErr.message}`)

    await отметчик(admin, recordingId)({ storage_path: путь, file_size: файл.byteLength })
    console.log(`[запись ${recordingId}] сохранена, ${Math.round(файл.byteLength / 1048576)} МБ`)

    // ── Освободить место в облаке Zoom ──────────────────────────────────────
    //
    // Сразу после подтверждённой копии, а не после разбора: разбор может
    // упасть и уйти в повтор, а облако тем временем копило бы записи. Копия у
    // нас — значит, единственный экземпляр уже не в Zoom.
    const настройки = await readRopSettings(admin)
    if (flag(настройки, 'calls_zoom_purge', true) && запись.meeting_id) {
      try {
        await trashMeetingRecordings(запись.meeting_id)
        await отметчик(admin, recordingId)({ purged_at: new Date().toISOString() })
        console.log(`[запись ${recordingId}] облако Zoom освобождено`)
      } catch (e: any) {
        // Не почистили — плохо, но запись у нас. Видно по пустому purged_at.
        console.warn(`[запись ${recordingId}] облако Zoom не почистилось: ${e?.message ?? e}`)
      }
    }

    await разобрать(admin, { ...запись, storage_path: путь }, файл)
  } catch (e: any) {
    await упала(admin, запись, e)
  }
}

/**
 * Довести одну застрявшую запись. Возвращает, что сделано, — для журнала.
 *
 * Берёт самую старую из упавших или брошенных на полпути (функцию убили
 * посреди расшифровки — статус так и остался `transcribing`). Захват — через
 * условное обновление по `updated_at`: два тика подряд одну запись не возьмут.
 */
export async function повторитьОдну(admin: SupabaseClient): Promise<string> {
  const давно = new Date(Date.now() - 20 * 60_000).toISOString()
  const { data: кандидаты } = await admin.from('call_recordings')
    .select(`${ПОЛЯ}, updated_at`)
    .in('status', ['failed', 'ingested', 'transcribing', 'analyzing'])
    .not('storage_path', 'is', null)
    .lt('updated_at', давно)
    .order('created_at', { ascending: true })
    .limit(20)

  const запись = (кандидаты ?? []).find(з => попыток(з.error) < МАКС_ПОПЫТОК)
  if (!запись) return 'нечего повторять'

  const { data: взял } = await admin.from('call_recordings')
    .update({ updated_at: new Date().toISOString() })
    .eq('id', запись.id).eq('updated_at', запись.updated_at)
    .select('id')
  if (!взял?.length) return 'запись уже взял другой'

  try {
    await разобрать(admin, запись)
    return `запись ${запись.id} доведена`
  } catch (e: any) {
    await упала(admin, запись, e)
    return `запись ${запись.id} снова упала: ${String(e?.message ?? e).slice(0, 200)}`
  }
}
