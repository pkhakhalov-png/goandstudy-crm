/**
 * Доступ к API Zoom.
 *
 * Приложение типа Server-to-Server OAuth: токен выдаётся по паре
 * client_id/client_secret на весь аккаунт, живёт час, пользователь в обмене не
 * участвует. Это ровно то, что нужно для фоновой работы — некому нажимать
 * «разрешить» в три часа ночи, когда воркер забирает запись.
 *
 * Токен кэшируется в памяти процесса. На Vercel процессы короткоживущие, и
 * кэш переживёт пару вызовов подряд, а не сутки, — этого достаточно: смысл не
 * в экономии запросов, а в том, чтобы не дёргать выдачу токена трижды внутри
 * одной обработки вебхука.
 *
 * Ключей нет — функции не притворяются работающими, а честно говорят, что
 * интеграция не настроена. Тот же принцип, что у приёма заявок с сайта:
 * `SITE_FORM_SECRET` не задан — приём выключен, а не «как-нибудь обойдётся».
 */

const API = 'https://api.zoom.us/v2'
const OAUTH = 'https://zoom.us/oauth/token'

export function zoomConfigured(): boolean {
  return Boolean(
    process.env.ZOOM_ACCOUNT_ID?.trim() &&
    process.env.ZOOM_CLIENT_ID?.trim() &&
    process.env.ZOOM_CLIENT_SECRET?.trim(),
  )
}

let кэш: { токен: string; годенДо: number } | null = null

export async function zoomToken(): Promise<string> {
  if (!zoomConfigured()) throw new Error('Zoom не настроен: нет ZOOM_CLIENT_ID / ZOOM_CLIENT_SECRET / ZOOM_ACCOUNT_ID')

  // Минута запаса: токен, истекающий через три секунды, формально годен, но
  // запрос с ним может не успеть.
  if (кэш && кэш.годенДо > Date.now() + 60_000) return кэш.токен

  const basic = Buffer.from(
    `${process.env.ZOOM_CLIENT_ID!.trim()}:${process.env.ZOOM_CLIENT_SECRET!.trim()}`,
  ).toString('base64')

  const res = await fetch(
    `${OAUTH}?grant_type=account_credentials&account_id=${encodeURIComponent(process.env.ZOOM_ACCOUNT_ID!.trim())}`,
    { method: 'POST', headers: { authorization: `Basic ${basic}` }, signal: AbortSignal.timeout(15_000) },
  )

  const data: any = await res.json().catch(() => ({}))
  if (!res.ok || !data?.access_token) {
    throw new Error(`Zoom не выдал токен (${res.status}): ${data?.reason ?? data?.error ?? 'без причины'}`)
  }

  кэш = { токен: data.access_token, годенДо: Date.now() + Number(data.expires_in ?? 3600) * 1000 }
  return кэш.токен
}

async function запрос<T = any>(
  путь: string,
  опции: { method?: string; body?: unknown; timeoutMs?: number } = {},
): Promise<T> {
  const токен = await zoomToken()
  const res = await fetch(`${API}${путь}`, {
    method: опции.method ?? 'GET',
    headers: {
      authorization: `Bearer ${токен}`,
      'content-type': 'application/json',
    },
    body: опции.body ? JSON.stringify(опции.body) : undefined,
    signal: AbortSignal.timeout(опции.timeoutMs ?? 20_000),
  })

  // 204 — успешное удаление, тела нет. Пытаться его разобрать значит упасть
  // на успешной операции.
  if (res.status === 204) return undefined as T

  const текст = await res.text()
  let data: any = undefined
  try { data = текст ? JSON.parse(текст) : undefined } catch { /* не JSON — оставим как есть */ }

  if (!res.ok) {
    const причина = data?.message ?? текст.slice(0, 200) ?? res.status
    throw new Error(`Zoom ${опции.method ?? 'GET'} ${путь} → ${res.status}: ${причина}`)
  }
  return data as T
}

// ── Встречи ─────────────────────────────────────────────────────────────────

export type СозданнаяВстреча = {
  id: string
  joinUrl: string
  startUrl: string
  hostEmail: string
}

/**
 * Создать встречу под бронь.
 *
 * `auto_recording: 'cloud'` задаётся прямо здесь, а не полагается на настройки
 * аккаунта: настройку может переключить человек, а от неё зависит, будет ли
 * вообще что разбирать. Дублирование намеренное.
 */
export async function createMeeting(params: {
  hostEmail: string
  topic: string
  startTime: string      // ISO-8601, UTC
  durationMin: number
  agenda?: string
}): Promise<СозданнаяВстреча> {
  const data = await запрос<any>(`/users/${encodeURIComponent(params.hostEmail)}/meetings`, {
    method: 'POST',
    body: {
      topic: params.topic.slice(0, 200),
      type: 2,                        // запланированная встреча, не личная комната
      start_time: params.startTime,
      duration: params.durationMin,
      timezone: 'Europe/Moscow',
      agenda: (params.agenda ?? '').slice(0, 2000),
      settings: {
        auto_recording: 'cloud',
        join_before_host: true,       // клиент может войти раньше продажника
        waiting_room: false,          // иначе клиент ждёт, а запись не стартует
        approval_type: 2,             // без регистрации
        audio: 'both',
      },
    },
  })

  return {
    id: String(data.id),
    joinUrl: data.join_url,
    startUrl: data.start_url,
    hostEmail: params.hostEmail,
  }
}

/** Перенос брони: время меняется, идентификатор встречи остаётся тем же. */
export async function updateMeetingTime(meetingId: string, startTime: string, durationMin: number): Promise<void> {
  await запрос(`/meetings/${encodeURIComponent(meetingId)}`, {
    method: 'PATCH',
    body: { start_time: startTime, duration: durationMin, timezone: 'Europe/Moscow' },
  })
}

/** Отмена брони: встречу удаляем, чтобы по мёртвой ссылке никто не зашёл. */
export async function deleteMeeting(meetingId: string): Promise<void> {
  await запрос(`/meetings/${encodeURIComponent(meetingId)}`, { method: 'DELETE' })
}

// ── Записи ──────────────────────────────────────────────────────────────────

export type ФайлЗаписи = {
  id: string
  meetingId: string
  fileType: string
  fileExtension: string
  fileSize: number
  downloadUrl: string
  recordingType: string
}

export async function getMeetingRecordings(meetingId: string): Promise<{
  duration: number
  startTime: string
  hostEmail: string
  files: ФайлЗаписи[]
}> {
  const data = await запрос<any>(`/meetings/${encodeURIComponent(meetingId)}/recordings`)
  return {
    duration: Number(data.duration ?? 0),
    startTime: data.start_time,
    hostEmail: data.host_email ?? '',
    files: (data.recording_files ?? []).map((f: any) => ({
      id: String(f.id),
      meetingId: String(data.id ?? meetingId),
      fileType: f.file_type,
      fileExtension: f.file_extension,
      fileSize: Number(f.file_size ?? 0),
      downloadUrl: f.download_url,
      recordingType: f.recording_type,
    })),
  }
}

/**
 * Скачать файл записи.
 *
 * Токен доступа передаётся заголовком, а не в адресе: адрес с токеном внутри
 * попадает в логи и историю запросов целиком, и оттуда его уже не убрать.
 */
export async function downloadRecording(downloadUrl: string, downloadToken?: string): Promise<Buffer> {
  const токен = downloadToken || (await zoomToken())
  const res = await fetch(downloadUrl, {
    headers: { authorization: `Bearer ${токен}` },
    redirect: 'follow',
    signal: AbortSignal.timeout(180_000),
  })
  if (!res.ok) throw new Error(`не скачалась запись: ${res.status}`)
  return Buffer.from(await res.arrayBuffer())
}

/**
 * Удалить запись из облака Zoom.
 *
 * Вызывается только после того, как наша копия подтверждена. На тарифе
 * «Профессиональный» даётся 5 ГБ на лицензию: без очистки место кончается
 * примерно за сотню консультаций, и Zoom перестаёт записывать молча.
 *
 * `action=trash`, а не `delete`: файл уходит в корзину, где живёт 30 дней и,
 * по документации Zoom, не занимает место хранилища. То есть место мы
 * освобождаем сразу, но месяц ещё можем передумать.
 */
export async function trashMeetingRecordings(meetingId: string): Promise<void> {
  await запрос(`/meetings/${encodeURIComponent(meetingId)}/recordings?action=trash`, { method: 'DELETE' })
}

// ── Пользователи ────────────────────────────────────────────────────────────

export async function listUsers(): Promise<{ id: string; email: string; name: string; licensed: boolean }[]> {
  const data = await запрос<any>('/users?status=active&page_size=300')
  return (data.users ?? []).map((u: any) => ({
    id: u.id,
    email: u.email,
    name: [u.first_name, u.last_name].filter(Boolean).join(' '),
    licensed: u.type === 2,
  }))
}
