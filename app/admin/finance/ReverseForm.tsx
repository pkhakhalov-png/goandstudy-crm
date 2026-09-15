'use client'

import { useActionState } from 'react'
import { reverseOperation } from './actions'

/**
 * Отмена операции.
 *
 * Отдельный клиентский компонент нужен ровно ради одного: показать отказ.
 * Обычная форма с серверным действием не может вернуть текст ошибки, и человек
 * увидел бы, что «ничего не произошло», — худший ответ там, где речь о деньгах.
 *
 * Сама отмена ничего не удаляет: создаются обратные движения, исходная операция
 * остаётся в истории со статусом «отменена».
 */
export function ReverseForm({ transactionId }: { transactionId: string }) {
  const [state, action, pending] = useActionState(
    async (_prev: { error?: string } | null, formData: FormData) => reverseOperation(formData),
    null,
  )

  return (
    <details style={{ marginTop: 2 }}>
      <summary style={{ fontSize: 11, color: 'var(--muted)', cursor: 'pointer', listStyle: 'none' }}>
        отменить
      </summary>
      <form action={action} style={{ display: 'flex', gap: 6, marginTop: 6, justifyContent: 'flex-end' }}>
        <input type="hidden" name="transaction_id" value={transactionId} />
        <input name="reason" className="si" placeholder="почему"
          style={{ fontSize: 11, padding: '4px 8px', width: 130 }} />
        <button className="btn-s" disabled={pending} style={{ fontSize: 11, padding: '4px 10px' }}>
          {pending ? '…' : 'Отменить'}
        </button>
      </form>
      {state?.error && (
        <div style={{ color: 'var(--red)', fontSize: 11, marginTop: 4, textAlign: 'right', maxWidth: 260 }}>
          {state.error}
        </div>
      )}
    </details>
  )
}
