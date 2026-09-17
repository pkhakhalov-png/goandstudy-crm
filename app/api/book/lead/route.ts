import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { createBookingCore } from '@/lib/booking/create'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * Приём заявки с сайта goandstudy.com.
 *
 * Зачем он нужен. Форма записи живёт на crm.goandstudy.com, а это Vercel во
 * Франкфурте: часть посетителей из России до неё не доходит, и заявка теряется
 * ещё до заполнения. Сам сайт стоит в Москве и доступен всегда — значит форма
 * должна быть там, а сюда заявка приезжает с сервера на сервер, минуя браузер
 * посетителя.
 *
 * Отсюда два следствия. Первое: запрос приходит не из браузера, а от сервера
 * сайта, поэтому он подписан общим секретом — иначе создавать записи в CRM мог
 * бы кто угодно, зная адрес. Второе: механика записи здесь не своя, а ровно та
 * же, что у формы в CRM (`createBookingCore`): назначение менеджера, сделка в
 * воронке, касание для атрибуции, уведомление в телеграм.
 */
export async function POST(req: NextRequest) {
  const secret = process.env.SITE_FORM_SECRET
  if (!secret) {
    console.error('[book/lead] нет SITE_FORM_SECRET — приём заявок с сайта выключен')
    return NextResponse.json({ error: 'приём заявок не настроен' }, { status: 503 })
  }

  const raw = await req.text()
  const ts = req.headers.get('x-gs-timestamp') ?? ''
  const signature = req.headers.get('x-gs-signature') ?? ''

  // Подпись по схеме моста WordPress: секрет общий, тело и время — в подписи.
  // Время нужно, чтобы перехваченный запрос нельзя было повторить завтра.
  const expected = await hmac(`${ts}.${raw}`, secret)
  if (!timingSafeEqual(signature, expected)) {
    return NextResponse.json({ error: 'подпись не сошлась' }, { status: 401 })
  }

  const age = Math.abs(Date.now() - Number(ts) * 1000)
  if (!Number(ts) || age > 5 * 60 * 1000) {
    return NextResponse.json({ error: 'запрос устарел' }, { status: 401 })
  }

  let body: any
  try { body = JSON.parse(raw) } catch { return NextResponse.json({ error: 'не разобрать запрос' }, { status: 400 }) }

  const phone = String(body.client_phone ?? '').trim()
  const date = String(body.date ?? '').trim()
  const startTime = String(body.start_time ?? '').trim()

  // Повтор доставки. Сервер сайта обязан повторять отправку, если ответ не
  // дошёл, — иначе заявка потеряется при обрыве связи. Но повторять запись в
  // CRM нельзя: человек записался один раз. Считаем повтором заявку с тем же
  // телефоном на то же время, пришедшую в последние сутки.
  if (phone && date && startTime) {
    const supabase = await createAdminClient()
    const { data: same } = await supabase
      .from('bookings')
      .select('id')
      .eq('client_phone', phone)
      .eq('booking_date', date)
      .eq('start_time', startTime.length === 5 ? `${startTime}:00` : startTime)
      .neq('status', 'cancelled')
      .limit(1)
      .maybeSingle()

    if (same) {
      return NextResponse.json({ success: true, bookingId: same.id, duplicate: true })
    }
  }

  const result = await createBookingCore({
    date,
    startTime,
    endTime: body.end_time ?? null,
    clientName: String(body.client_name ?? ''),
    clientPhone: phone,
    clientTelegram: body.client_telegram ?? null,
    quizData: body.quiz_data ?? {},
    utm: body.utm ?? {},
    managerId: body.manager_id ?? null,
  })

  if (result.error) return NextResponse.json({ error: result.error }, { status: 400 })
  return NextResponse.json({ success: true, bookingId: result.bookingId })
}

async function hmac(message: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  )
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message))
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/** Сравнение за одинаковое время: по длине подписи нельзя подбирать её посимвольно. */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}
