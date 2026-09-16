/**
 * Типы операций и их названия.
 *
 * Отдельный файл без единого серверного импорта — нарочно. Эти же названия
 * нужны и форме ввода в браузере, и боту, и серверу; если держать их рядом с
 * ядром, клиентский компонент утащит за собой весь серверный модуль вместе с
 * ключами доступа к базе. Сборка это ловит, но чинить лучше причину.
 */

export type TxKind =
  | 'income' | 'expense' | 'transfer' | 'fee'
  | 'refund_in' | 'refund_out'
  | 'founder_contribution' | 'founder_withdrawal'
  | 'founder_expense' | 'founder_reimbursement'
  | 'adjustment'

/** Названия по-русски — одни и те же в CRM и в боте. */
export const KIND_NAMES: Record<TxKind, string> = {
  income: 'Поступление',
  expense: 'Расход',
  transfer: 'Перевод',
  fee: 'Комиссия',
  refund_in: 'Возврат нам',
  refund_out: 'Возврат клиенту',
  founder_contribution: 'Взнос основателя',
  founder_withdrawal: 'Вывод основателю',
  founder_expense: 'Оплата основателем из личных',
  founder_reimbursement: 'Возмещение основателю',
  adjustment: 'Корректировка остатка',
}

/** Типы, у которых деньги приходят. Остальные — уходят. */
export const INBOUND: TxKind[] = ['income', 'refund_in', 'founder_contribution']

/** Знак суммы по типу операции: направление задаёт смысл, а не минус в поле. */
export function signedAmount(kind: TxKind, amountMinor: number): number {
  return INBOUND.includes(kind) ? Math.abs(amountMinor) : -Math.abs(amountMinor)
}

/**
 * Метка операции для телеграма.
 *
 * Цветного текста в сообщениях Telegram нет, поэтому направление денег
 * показываем кружком: красный — ушли, зелёный — пришли. Одинаковая галочка на
 * всём подряд не различала приход и расход, и в ленте они сливались.
 */
export function kindIcon(kind: TxKind): string {
  if (INBOUND.includes(kind)) return '🟢'
  if (kind === 'transfer') return '🔄'
  if (kind === 'adjustment') return '⚙️'
  return '🔴'
}
