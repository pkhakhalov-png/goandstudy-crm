/**
 * Режим контура: читается из базы, не из переменной окружения.
 *
 * Почему из базы. Переменную на Vercel можно переставить деплоем и не
 * заметить — а переставленная переменная здесь означает сообщения, ушедшие
 * настоящим клиентам. Строку в базе меняет только миграция, то есть
 * осознанное действие с файлом в репозитории.
 *
 * Значение по умолчанию при любой неясности — «наружу не ходим». Если строку
 * не удалось прочитать, правильный вывод не «наверное, можно», а «нельзя».
 */
import { базаCare } from './db'

export type РежимКонтура = {
  mode: 'pilot' | 'prod'
  external_sends: boolean
  note: string | null
  updated_at: string | null
}

/** Состояние «ничего не знаем» — оно же самое безопасное. */
const ЗАКРЫТО: РежимКонтура = {
  mode: 'pilot',
  external_sends: false,
  note: 'отпечаток режима не прочитан — контур считается закрытым',
  updated_at: null,
}

export async function режим(): Promise<РежимКонтура> {
  const { data, error } = await базаCare()
    .from('env_marker')
    .select('mode, external_sends, note, updated_at')
    .maybeSingle()

  if (error || !data) {
    console.warn('[care mode] отпечаток режима не прочитан:', error?.message ?? 'строки нет')
    return ЗАКРЫТО
  }

  return {
    mode: data.mode,
    // Не `data.external_sends`, а строгое сравнение: null и undefined обязаны
    // означать «выключено», а не «истинность неизвестна».
    external_sends: data.external_sends === true,
    note: data.note ?? null,
    updated_at: data.updated_at ?? null,
  }
}

/**
 * Разрешены ли внешние отправки прямо сейчас.
 *
 * Это только первая из пяти проверок ворот отправки (этап 3 плана). Отдельной
 * функцией — чтобы её нельзя было «почти вызвать»: либо спросили, либо нет.
 */
export async function отправкиРазрешены(): Promise<boolean> {
  return (await режим()).external_sends
}
