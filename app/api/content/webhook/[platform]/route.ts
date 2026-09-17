import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { разобратьTelegram, разобратьVk, принятьОдинРаз, секретГодится, type Платформа } from '@/lib/content/webhooks'

export const dynamic = 'force-dynamic'

/**
 * Приём вебхуков от площадок.
 *
 * Отвечаем 200 на всё, что прошло проверки, и делаем это быстро: площадка,
 * не дождавшаяся ответа, повторит доставку, а потом ещё раз. Тяжёлую работу
 * внутри обработчика вебхука делать нельзя — она превращается в лавину
 * повторов.
 *
 * На всё, что проверки не прошло, отвечаем коротко и без подробностей. «Подпись
 * не сошлась» тому, кто её подбирает, знать незачем; в журнал причина пишется,
 * наружу — нет.
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ platform: string }> }) {
  const { platform } = await ctx.params
  if (platform !== 'telegram' && platform !== 'vk') {
    return NextResponse.json({ error: 'неизвестная площадка' }, { status: 404 })
  }
  const площадка = platform as Платформа

  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'плохой запрос' }, { status: 400 })
  }

  const секрет = площадка === 'telegram'
    ? process.env.TELEGRAM_WEBHOOK_SECRET ?? null
    : process.env.VK_CALLBACK_SECRET ?? null

  // Секрет не задан — принимать нечего. Пропускать всё подряд «пока не
  // настроили» — самый частый способ оставить открытую дверь навсегда.
  //
  // Негодный секрет отклоняем так же: телеграм передаёт его заголовком, а в
  // заголовок HTTP кириллица не помещается. Молча принимать при негодном
  // секрете значит не проверять подпись вовсе.
  const годность = секретГодится(секрет)
  if (!годность.ok) {
    console.error(`[вебхук ${площадка}] секрет не годится: ${годность.почему}`)
    return NextResponse.json({ error: 'приём не настроен' }, { status: 503 })
  }

  // VK ждёт строку подтверждения в ответ на особое событие — иначе не
  // подключит адрес вовсе.
  if (площадка === 'vk' && body?.type === 'confirmation') {
    const строка = process.env.VK_CONFIRMATION_STRING
    if (!строка) return NextResponse.json({ error: 'приём не настроен' }, { status: 503 })
    return new NextResponse(строка, { status: 200, headers: { 'content-type': 'text/plain' } })
  }

  const проверка = площадка === 'telegram'
    ? разобратьTelegram(req.headers, body, секрет)
    : разобратьVk(body, секрет, process.env.VK_GROUP_ID ?? null)

  if (!проверка.ok) {
    console.warn(`[вебхук ${площадка}] отклонён: ${проверка.причина}`)
    return NextResponse.json({ error: 'отклонено' }, { status: проверка.статус })
  }

  const content = (await createAdminClient()).schema('content' as any)

  let впервые: boolean
  try {
    впервые = await принятьОдинРаз(content, площадка, проверка.eventId)
  } catch (e: any) {
    // Не смогли записать расписку — отвечаем ошибкой, чтобы площадка
    // повторила. Обработать событие и не записать, что обработали, хуже:
    // повтор сделает работу дважды.
    console.error(`[вебхук ${площадка}] расписка не записалась: ${e?.message ?? e}`)
    return NextResponse.json({ error: 'временная ошибка' }, { status: 500 })
  }

  if (!впервые) {
    // Повторная доставка — штатное поведение площадок, а не сбой. Отвечаем
    // успехом: иначе площадка будет слать это событие вечно.
    return NextResponse.json({ ok: true, повтор: true })
  }

  // Событие записано. Разбор — отдельным проходом, не здесь.
  await content.from('outbox_events').insert({
    event_id: crypto.randomUUID(),
    topic: `${площадка}.webhook`,
    payload: { платформа: площадка, event_id: проверка.eventId, срок: проверка.срок, body },
  })

  return NextResponse.json({ ok: true })
}
