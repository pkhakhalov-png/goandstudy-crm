/**
 * Встреча Zoom под конкретную бронь.
 *
 * Зачем её создаём мы, а не продажник. Тогда у брони есть идентификатор
 * встречи, и запись разговора сшивается со сделкой однозначно — по нему, а не
 * по телефону участника и времени. На общих аккаунтах угадывание не работает
 * вовсе: хост у всех один и тот же.
 *
 * Побочные выгоды, которых не было: ссылка появляется в уведомлении сразу, а
 * автозапись задаётся при создании встречи и не зависит от того, что кто-то
 * переключил у себя в настройках.
 *
 * ВЫБОР ХОСТА. Лицензий две, продажников четверо, все работают с общих
 * аккаунтов. Одна лицензия не может вести две встречи одновременно, поэтому
 * хост выбирается по занятости: основной аккаунт, а если на это время у нас уже
 * есть бронь с встречей — запасной. Замер 24.09.2026: за четыре месяца
 * пересечений было два, трёх одновременных не было ни разу.
 *
 * Занятость считаем по своим броням, а не запросом в Zoom: мы знаем расписание
 * раньше, чем Zoom. Кураторские встречи на запасном аккаунте мы не видим —
 * поэтому второй шаг остаётся попыткой, а не гарантией.
 *
 * Сбой здесь НЕ должен ломать запись на консультацию. Человек записался — это
 * главное; встреча без ссылки хуже, чем встреча со ссылкой, но несравнимо
 * лучше, чем потерянная заявка.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { createMeeting, zoomConfigured } from '@/lib/zoom/client'
import { readRopSettings, flag } from '@/lib/rop-settings'

export type РезультатВстречи =
  | { создана: true; meetingId: string; joinUrl: string; hostEmail: string }
  | { создана: false; почему: string }

function строкой(v: unknown, запасной: string): string {
  if (typeof v === 'string') return v.replace(/^"|"$/g, '')
  return запасной
}

export async function создатьВстречуДляБрони(
  admin: SupabaseClient,
  params: {
    bookingId: string
    date: string          // YYYY-MM-DD
    startTime: string     // HH:MM:SS, московское
    endTime: string       // HH:MM:SS, московское
    clientName: string
    salespersonName: string
  },
): Promise<РезультатВстречи> {
  if (!zoomConfigured()) return { создана: false, почему: 'Zoom не настроен' }

  const настройки = await readRopSettings(admin)
  if (!flag(настройки, 'calls_zoom_auto', false)) {
    return { создана: false, почему: 'выключено настройкой calls_zoom_auto' }
  }

  const основной = строкой(настройки.find(s => s.key === 'calls_zoom_primary_host')?.value, 'gs@goandstudy.com')
  const запасной = строкой(настройки.find(s => s.key === 'calls_zoom_backup_host')?.value, '')

  // Время слота московское. Собираем момент явным смещением, а не локальной
  // зоной сервера: на Vercel она UTC, и встреча уехала бы на три часа.
  const начало = new Date(`${params.date}T${дополнить(params.startTime)}+03:00`)
  const конец = new Date(`${params.date}T${дополнить(params.endTime)}+03:00`)
  const минут = Math.max(15, Math.round((конец.getTime() - начало.getTime()) / 60000))

  // ── Кто хост ──────────────────────────────────────────────────────────────
  //
  // Занят, если на пересекающееся время уже есть бронь с созданной встречей
  // под этим аккаунтом. Считаем по дню: броней в дне единицы, выбирать из них
  // дешевле, чем городить интервальный запрос.
  const { data: вТотЖеДень } = await admin
    .from('bookings')
    .select('start_time, end_time, zoom_host_email')
    .eq('booking_date', params.date)
    .not('zoom_meeting_id', 'is', null)
    .neq('status', 'cancelled')

  const пересекается = (email: string) => (вТотЖеДень ?? []).some(b => {
    if ((b.zoom_host_email ?? '').toLowerCase() !== email.toLowerCase()) return false
    const s = new Date(`${params.date}T${дополнить(b.start_time)}+03:00`).getTime()
    const e = new Date(`${params.date}T${дополнить(b.end_time)}+03:00`).getTime()
    return s < конец.getTime() && e > начало.getTime()
  })

  let хост = ''
  if (!пересекается(основной)) хост = основной
  else if (запасной && !пересекается(запасной)) хост = запасной

  if (!хост) {
    // Оба заняты. Встречу не создаём, бронь остаётся: пусть лучше продажник
    // назначит ссылку руками, чем клиент попадёт в чужой разговор.
    return { создана: false, почему: 'оба аккаунта Zoom заняты на это время' }
  }

  // ── Создать ───────────────────────────────────────────────────────────────
  try {
    const встреча = await createMeeting({
      hostEmail: хост,
      // Тема — страховка для человека: в списке записей Zoom видно глазами,
      // к кому относится файл. Автоматика на неё не опирается.
      topic: `Консультация · ${params.clientName} · ${params.salespersonName}`,
      startTime: начало.toISOString(),
      durationMin: минут,
      agenda: `Бронь ${params.bookingId}`,
    })

    const { error } = await admin
      .from('bookings')
      .update({
        zoom_meeting_id: встреча.id,
        zoom_join_url: встреча.joinUrl,
        zoom_host_email: хост,
      })
      .eq('id', params.bookingId)

    if (error) {
      // Встреча в Zoom есть, а связи с бронью нет — это хуже, чем отсутствие
      // встречи: запись приедет и не опознается. Говорим об этом громко.
      console.error(`[zoom] встреча ${встреча.id} создана, но не привязалась к брони: ${error.message}`)
      return { создана: false, почему: `встреча создана, но не сохранилась: ${error.message}` }
    }

    return { создана: true, meetingId: встреча.id, joinUrl: встреча.joinUrl, hostEmail: хост }
  } catch (e: any) {
    return { создана: false, почему: String(e?.message ?? e).slice(0, 200) }
  }
}

function дополнить(t: string): string {
  return t.length === 5 ? `${t}:00` : t
}
