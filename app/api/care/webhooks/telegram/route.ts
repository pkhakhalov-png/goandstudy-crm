/**
 * Приём событий care-бота.
 *
 * Делает ровно две вещи: кладёт событие в `care.inbound_events` и отвечает
 * 200. Разбор — из очереди.
 *
 * Почему не разбирать здесь. Телеграм ждёт ответа несколько секунд и при
 * таймауте присылает событие снова. Если звать модель в обработчике, одно
 * сообщение клиента превратится в три одинаковых разбора и, дальше по цепочке,
 * в три напоминания. Разделение приёма и работы — единственное, что это
 * предотвращает.
 *
 * ОТЛИЧИЕ ОТ СТАРОГО ВЕБХУКА. В `app/api/telegram/webhook/route.ts` проверка
 * подписи включается наличием переменной: нет переменной — проверки нет, в
 * журнале предупреждение. Здесь так нельзя. Нет секрета — 500 и отказ
 * работать. Контур, который принимает сообщения от кого угодно, не изолирован,
 * как бы хорошо ни были расставлены права в базе.
 */
import { NextRequest, NextResponse } from 'next/server'
import { базаCare } from '@/lib/care/db'
import { необязательна } from '@/lib/care/env'
import { секретГодится, секретыСовпали } from '@/lib/care/secret'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

type РезультатПроверки =
  | { ok: true }
  | { ok: false; код: 401 | 500; причина: string }

export function подписьВерна(req: {
  headers: { get(name: string): string | null }
}): РезультатПроверки {
  const секрет = необязательна('CARE_TELEGRAM_WEBHOOK_SECRET')

  // Отсутствие секрета — ошибка настройки, а не повод пропустить запрос.
  // 500, потому что виноваты мы, а не отправитель.
  if (!секрет) {
    return { ok: false, код: 500, причина: 'CARE_TELEGRAM_WEBHOOK_SECRET не задан' }
  }
  const годность = секретГодится(секрет)
  if (!годность.ok) {
    return { ok: false, код: 500, причина: `секрет не годится: ${годность.почему}` }
  }
  if (!секретыСовпали(req.headers.get('x-telegram-bot-api-secret-token'), секрет)) {
    return { ok: false, код: 401, причина: 'заголовок с секретом не сошёлся' }
  }
  return { ok: true }
}

/**
 * Опознание события.
 *
 * `update_id` уникален в пределах бота и повторяется при повторной доставке —
 * именно то, что нужно для дедупликации. Если его нет, событие не принимаем:
 * запись без опознавательного знака нельзя отличить от своей же копии.
 */
function опознать(тело: unknown): string | null {
  if (!тело || typeof тело !== 'object') return null
  const update = тело as { update_id?: unknown }
  return typeof update.update_id === 'number' ? String(update.update_id) : null
}

export async function POST(req: NextRequest) {
  const подпись = подписьВерна(req)
  if (!подпись.ok) {
    // Наружу — без подробностей: подбирающему секрет знать причину незачем.
    console.warn(`[care telegram] запрос отклонён: ${подпись.причина}`)
    return NextResponse.json({ ok: false }, { status: подпись.код })
  }

  let тело: unknown
  try {
    тело = await req.json()
  } catch {
    return NextResponse.json({ ok: false, error: 'тело не разобрано' }, { status: 400 })
  }

  const внешнийId = опознать(тело)
  if (!внешнийId) {
    console.warn('[care telegram] событие без update_id — не принято')
    return NextResponse.json({ ok: false, error: 'нет update_id' }, { status: 400 })
  }

  const { error } = await базаCare()
    .from('inbound_events')
    .insert({ channel: 'telegram', external_id: внешнийId, payload: тело })

  if (error) {
    // 23505 — сработало unique(channel, external_id): это повторная доставка,
    // штатное поведение Телеграма, а не сбой. Отвечаем 200, иначе он будет
    // слать это же событие сутки.
    if (error.code === '23505') {
      return NextResponse.json({ ok: true, повтор: true })
    }
    // Запись не удалась по другой причине — событие потеряно. Отвечаем не-200,
    // чтобы Телеграм прислал его снова: потерять сообщение клиента хуже, чем
    // разобрать его на минуту позже.
    console.error('[care telegram] событие не записано:', error.message)
    return NextResponse.json({ ok: false }, { status: 503 })
  }

  return NextResponse.json({ ok: true })
}
