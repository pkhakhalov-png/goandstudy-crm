'use server'

/**
 * Отметка исхода отправки — то, что человек увидел в чате.
 *
 * Ни одного обращения к Телеграму отсюда нет и быть не должно: «проверил»
 * однажды стало бы «отправил второй раз».
 */
import { revalidatePath } from 'next/cache'
import { сессияКонтура } from '@/lib/care/session'
import { отметитьИсход, type ИтогОтметки } from '@/lib/care/outbox'

export async function отметитьДошло(id: string, дошло: boolean): Promise<ИтогОтметки> {
  const сессия = await сессияКонтура()
  if (!сессия?.участник || !сессия.интерфейсОткрыт) {
    return { ok: false, ошибка: 'Кабинет недоступен' }
  }

  const итог = await отметитьИсход(id, дошло, сессия.участник.id)
  revalidatePath('/care/review/sends')
  revalidatePath('/care/review')
  return итог
}
