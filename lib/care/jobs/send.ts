/**
 * Отправка того, что прошло ворота.
 *
 * Единственное место в контуре, которое вызывает Bot API. Всё остальное
 * только готовит и решает.
 *
 * ГЛАВНАЯ ТРУДНОСТЬ — ОБОРВАВШАЯСЯ ОТПРАВКА. Если запрос ушёл, а ответ не
 * вернулся, узнать исход нечем: Bot API не принимает вопрос «отправлял ли я
 * вот это». Три варианта, и два из них плохие:
 *
 *   · повторить — можно прислать человеку второе одинаковое сообщение;
 *   · считать отправленным — можно не прислать вовсе и не заметить;
 *   · признаться, что не знаем.
 *
 * Выбран третий: статус `unknown`, повтора нет, строка показывается
 * руководителю отдельно. Честное «не знаю» дешевле обеих ошибок, потому что
 * человек может проверить чат за десять секунд, а система — никогда.
 *
 * ВОРОТА ПРОВЕРЯЮТСЯ ЗАНОВО. Между постановкой в очередь и отправкой проходит
 * время: могли начаться тихие часы, клиент мог прислать документ. Тихие часы
 * откладывают, остальное отменяет.
 */
import { базаCare } from '../db'
import { необязательна } from '../env'
import { воротаОтправки, ОБЪЯСНЕНИЕ } from '../gate/outbound'

const ТАЙМАУТ_МС = 20_000

export type ИтогОтправки = {
  отправлено: number
  отложено: number
  отменено: number
  неизвестно: number
  ошибок: number
}

type Запись = {
  id: string
  proposal_id: string
  recipient: { tg_chat_id?: number; name?: string }
  payload: { текст?: string }
  attempts: number
}

export async function отправитьОчередь(потолок = 20): Promise<ИтогОтправки> {
  const итог: ИтогОтправки = { отправлено: 0, отложено: 0, отменено: 0, неизвестно: 0, ошибок: 0 }

  const токен = необязательна('CARE_TELEGRAM_BOT_TOKEN')
  if (!токен) {
    console.warn('[care send] CARE_TELEGRAM_BOT_TOKEN не задан — очередь не трогаем')
    return итог
  }

  const { data: очередь } = await базаCare()
    .from('outbound_actions')
    .select('id, proposal_id, recipient, payload, attempts')
    .eq('status', 'queued')
    .order('created_at')
    .limit(потолок)

  for (const запись of (очередь ?? []) as Запись[]) {
    // Ворота заново: между постановкой и отправкой мир мог измениться.
    const решение = await воротаОтправки(запись.proposal_id)

    if (!решение.разрешено) {
      if (решение.причина === 'quiet_hours') {
        // Откладываем, а не отменяем: наступит утро — уйдёт.
        итог.отложено += 1
        continue
      }
      await базаCare()
        .from('outbound_actions')
        .update({ status: 'cancelled', cancel_reason: решение.причина })
        .eq('id', запись.id)
      итог.отменено += 1
      continue
    }

    const текст = запись.payload?.текст
    if (!текст) {
      await базаCare()
        .from('outbound_actions')
        .update({ status: 'failed', last_error: 'в предложении нет текста' })
        .eq('id', запись.id)
      итог.ошибок += 1
      continue
    }

    // Отмечаем попытку ДО запроса. Если процесс умрёт на середине, останется
    // след, что мы уже пытались, — и никто не отправит второй раз наугад.
    await базаCare()
      .from('outbound_actions')
      .update({ attempts: запись.attempts + 1 })
      .eq('id', запись.id)

    try {
      const ответ = await fetch(`https://api.telegram.org/bot${токен}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          // Получатель из решения ворот, не из payload и не из recipient:
          // запись могла пролежать в очереди, а ворота смотрят на дело сейчас.
          chat_id: решение.chatId,
          text: текст,
          disable_notification: false,
        }),
        signal: AbortSignal.timeout(ТАЙМАУТ_МС),
      })

      const тело = (await ответ.json()) as { ok: boolean; result?: { message_id: number }; description?: string }

      if (тело.ok) {
        await базаCare()
          .from('outbound_actions')
          .update({
            status: 'sent',
            external_id: String(тело.result?.message_id ?? ''),
            sent_at: new Date().toISOString(),
            last_error: null,
          })
          .eq('id', запись.id)
        итог.отправлено += 1
      } else {
        // Телеграм ответил и отказал — исход известен, сообщение не ушло.
        await базаCare()
          .from('outbound_actions')
          .update({ status: 'failed', last_error: тело.description ?? 'отказ Телеграма' })
          .eq('id', запись.id)
        итог.ошибок += 1
      }
    } catch (e) {
      // Ответа нет. Отправлено или нет — неизвестно, и узнать нечем.
      // Не повторяем и не считаем отправленным.
      const текстОшибки = e instanceof Error ? e.message : String(e)
      await базаCare()
        .from('outbound_actions')
        .update({
          status: 'unknown',
          last_error: `ответ не получен: ${текстОшибки}. Проверьте чат вручную — повтор не делается, чтобы не прислать второе сообщение.`,
        })
        .eq('id', запись.id)
      итог.неизвестно += 1
    }
  }

  return итог
}

/** Отправки с неизвестным исходом — их смотрит человек. */
export async function неизвестныеИсходы() {
  const { data } = await базаCare()
    .from('outbound_actions')
    .select('id, proposal_id, payload, last_error, created_at')
    .eq('status', 'unknown')
    .order('created_at', { ascending: false })
  return data ?? []
}

export { ОБЪЯСНЕНИЕ }
