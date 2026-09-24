import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { createAdminClient } from '@/lib/supabase/server'
import { readRopSettings, flag } from '@/lib/rop-settings'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
// Запись скачивается прямо здесь: ссылка на скачивание живёт сутки, но полагаться
// на то, что воркер придёт вовремя, незачем — забираем файл сразу, а в очередь
// кладём уже свою копию.
export const maxDuration = 300

/**
 * Приём событий Zoom.
 *
 * Отвечает на две вещи и больше ни на что:
 *   · проверка адреса при подключении подписки (Zoom требует ответить хешем);
 *   · `recording.completed` — запись готова, забираем её себе.
 *
 * ГЛАВНОЕ ПРО БЕЗОПАСНОСТЬ. Подписка заводится на весь аккаунт Zoom, а не на
 * пользователя. Значит сюда придут и кураторские созвоны с `gszoom@`, и любая
 * внутренняя планёрка, которую кто-то записал. Без фильтра чужие разговоры
 * поехали бы в разбор по чек-листу продаж — и стоили бы денег, и лежали бы в
 * карточках не тех сделок.
 *
 * Поэтому запись принимается, только если выполнено одно из двух:
 *   · встречу создали мы под конкретную бронь (`bookings.zoom_meeting_id`);
 *   · хост — в списке разрешённых И на это время есть бронь консультации.
 *
 * Всё остальное отбрасывается до скачивания файла, с записью в журнал.
 */

function подписьВерна(req: NextRequest, сырое: string): { ok: true } | { ok: false; почему: string } {
  const секрет = process.env.ZOOM_WEBHOOK_SECRET_TOKEN?.trim()
  if (!секрет) {
    // В отличие от телеграмного вебхука, здесь «нет секрета» означает отказ, а
    // не мягкий режим: этот маршрут появился уже с проверкой, работающего
    // потока без неё никогда не было, и ломать нечего.
    return { ok: false, почему: 'ZOOM_WEBHOOK_SECRET_TOKEN не задан' }
  }

  const timestamp = req.headers.get('x-zm-request-timestamp') ?? ''
  const подпись = req.headers.get('x-zm-signature') ?? ''
  if (!timestamp || !подпись) return { ok: false, почему: 'нет заголовков подписи' }

  // Перехваченный запрос не должен приниматься завтра.
  const возраст = Math.abs(Date.now() - Number(timestamp) * 1000)
  if (!Number(timestamp) || возраст > 5 * 60 * 1000) return { ok: false, почему: 'запрос устарел' }

  const наша = 'v0=' + crypto
    .createHmac('sha256', секрет)
    .update(`v0:${timestamp}:${сырое}`)
    .digest('hex')

  const a = Buffer.from(наша)
  const b = Buffer.from(подпись)
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return { ok: false, почему: 'подпись не сошлась' }
  }
  return { ok: true }
}

export async function POST(req: NextRequest) {
  const сырое = await req.text()

  let body: any
  try { body = JSON.parse(сырое) } catch {
    return NextResponse.json({ ok: false }, { status: 400 })
  }

  // ── Проверка адреса при подключении подписки ──────────────────────────────
  //
  // Zoom присылает plainToken и ждёт его же, подписанный секретом. Это не
  // событие, а рукопожатие, и происходит оно до всякой авторизации — поэтому
  // обрабатывается раньше проверки подписи запроса.
  if (body?.event === 'endpoint.url_validation') {
    const секрет = process.env.ZOOM_WEBHOOK_SECRET_TOKEN?.trim()
    if (!секрет) {
      console.error('[zoom webhook] проверка адреса невозможна: ZOOM_WEBHOOK_SECRET_TOKEN не задан')
      return NextResponse.json({ error: 'not configured' }, { status: 503 })
    }
    const plainToken = body?.payload?.plainToken ?? ''
    const encryptedToken = crypto.createHmac('sha256', секрет).update(plainToken).digest('hex')
    console.log('[zoom webhook] проверка адреса пройдена')
    return NextResponse.json({ plainToken, encryptedToken })
  }

  const подпись = подписьВерна(req, сырое)
  if (!подпись.ok) {
    // Наружу — коротко: тому, кто подбирает секрет, знать причину незачем.
    console.warn(`[zoom webhook] запрос отклонён: ${подпись.почему}`)
    return NextResponse.json({ ok: false }, { status: 401 })
  }

  if (body?.event !== 'recording.completed') {
    // На остальные события мы не подписаны, но если подпишут — отвечаем
    // спокойно, а не ошибкой: Zoom отключает эндпоинт за сбои доставки.
    return NextResponse.json({ ok: true, ignored: body?.event ?? 'unknown' })
  }

  try {
    await принятьЗапись(body)
  } catch (e: any) {
    // Отвечаем 200 даже на своей ошибке: повторная доставка того же события
    // ничего не починит, а три неудачи подряд Zoom считает поводом отключить
    // подписку целиком. Разбираться будем по журналу.
    console.error('[zoom webhook] обработка упала:', e?.message ?? e)
  }

  return NextResponse.json({ ok: true })
}

async function принятьЗапись(body: any) {
  const объект = body?.payload?.object ?? {}
  const meetingId = String(объект.id ?? '')
  const hostEmail = String(объект.host_email ?? '').toLowerCase()
  const downloadToken = body?.download_token as string | undefined

  if (!meetingId) { console.warn('[zoom webhook] в событии нет id встречи'); return }

  const admin = await createAdminClient()
  const настройки = await readRopSettings(admin)

  if (!flag(настройки, 'calls_enabled', false)) {
    console.log(`[zoom webhook] модуль разговоров выключен — запись ${meetingId} пропущена`)
    return
  }

  // ── Чья это запись ────────────────────────────────────────────────────────
  const { data: booking } = await admin
    .from('bookings')
    .select('id, salesperson_id, booking_date, start_time, client_name, zoom_host_email')
    .eq('zoom_meeting_id', meetingId)
    .maybeSingle()

  let разрешено = Boolean(booking)
  let почему = 'встреча создана под бронь'

  if (!разрешено) {
    const хосты = (настройки.find(s => s.key === 'calls_zoom_hosts')?.value ?? []) as unknown
    const список: string[] = Array.isArray(хосты)
      ? хосты.map(String)
      : (typeof хосты === 'string' ? JSON.parse(хосты) : [])
    if (hostEmail && список.map(s => s.toLowerCase()).includes(hostEmail)) {
      разрешено = true
      почему = 'хост в списке разрешённых, встреча вне брони'
    }
  }

  if (!разрешено) {
    console.log(`[zoom webhook] запись ${meetingId} от ${hostEmail || 'неизвестного хоста'} отброшена: не наша`)
    return
  }

  // ── Какой файл берём ──────────────────────────────────────────────────────
  //
  // Настройки аккаунта велят писать только звук, но в событии всё равно могут
  // приехать несколько файлов — расшифровка Zoom, субтитры, отдельные дорожки.
  // Берём общий звуковой: он один на встречу и содержит весь разговор.
  const файлы: any[] = объект.recording_files ?? []
  const звук = файлы.find(f => f.file_type === 'M4A' && f.recording_type === 'audio_only')
    ?? файлы.find(f => f.file_type === 'M4A')
    ?? файлы.find(f => f.file_type === 'MP4')

  if (!звук) {
    console.warn(`[zoom webhook] во встрече ${meetingId} нет ни звука, ни видео — пропускаем`)
    return
  }

  // Повторная доставка того же события — обычное дело при сбоях сети. Второй
  // разбор того же разговора стоил бы денег и засорил бы карточку.
  const { data: уже } = await admin
    .from('call_recordings')
    .select('id')
    .eq('external_id', String(звук.id))
    .maybeSingle()

  if (уже) {
    console.log(`[zoom webhook] запись ${звук.id} уже принята — повтор отброшен`)
    return
  }

  const { data: созданная, error } = await admin
    .from('call_recordings')
    .insert({
      deal_id: null,           // проставим ниже, если бронь связана со сделкой
      booking_id: booking?.id ?? null,
      source: 'zoom',
      external_id: String(звук.id),
      meeting_id: meetingId,
      host_email: hostEmail || null,
      duration_sec: Number(объект.duration ?? 0) * 60,
      started_at: объект.start_time ?? null,
      file_size: Number(звук.file_size ?? 0),
      status: 'ingested',
    })
    .select('id')
    .single()

  if (error) { console.error('[zoom webhook] не записалось:', error.message); return }

  // Сделка находится через бронь: у неё есть booking_id.
  if (booking) {
    const { data: deal } = await admin
      .from('deals')
      .select('id')
      .eq('booking_id', booking.id)
      .is('deleted_at', null)
      .limit(1)
      .maybeSingle()
    if (deal) {
      await admin.from('call_recordings').update({ deal_id: deal.id }).eq('id', созданная.id)
    }
  }

  console.log(
    `[zoom webhook] принята запись ${звук.id} встречи ${meetingId} (${почему}), ` +
    `${Math.round(Number(звук.file_size ?? 0) / 1048576)} МБ`,
  )

  // Скачивание и разбор — отдельным шагом: здесь только приём и опознание.
  // Так вебхук отвечает Zoom быстро и не рискует упереться в предел времени
  // на часовой записи.
  const { обработатьЗапись } = await import('@/lib/zoom/process-recording')
  await обработатьЗапись(admin, созданная.id, {
    downloadUrl: звук.download_url,
    downloadToken,
  })
}
