'use client'

import { useActionState, useState } from 'react'
import { addOperation } from './actions'
import { KIND_NAMES, type TxKind } from '@/lib/finance/kinds'

type Option = { id: string; name: string; currency?: string }

/**
 * Ручной ввод операции.
 *
 * Знак суммы здесь не вводится и не выбирается — его задаёт тип операции.
 * Поле, куда можно вписать «−6000» в расходе, рано или поздно получит минус
 * дважды, и расход станет приходом.
 *
 * Ошибки показываются рядом с формой, а не глотаются: «ничего не произошло»
 * после нажатия — худший из возможных ответов там, где речь о деньгах.
 */
export function AddOperation({ accounts, categories, counterparties }: {
  accounts: Option[]
  categories: Option[]
  counterparties: Option[]
}) {
  const [open, setOpen] = useState(false)
  const [kind, setKind] = useState<TxKind>('expense')
  const [state, action, pending] = useActionState(
    async (_prev: { error?: string } | null, formData: FormData) => {
      // Время из поля — местное и без пояса. Пояс знает только браузер, поэтому
      // абсолютный момент считаем здесь (см. тот же приём в мастере запуска).
      const local = String(formData.get('occurred_at') || '')
      if (local) formData.set('occurred_at', new Date(local).toISOString())

      const res = await addOperation(formData)
      if (!res.error) setOpen(false)
      return res
    },
    null,
  )

  const KINDS: TxKind[] = ['expense', 'income', 'transfer', 'fee', 'refund_in', 'refund_out',
    'founder_contribution', 'founder_withdrawal', 'adjustment']

  if (!open) {
    return (
      <button className="btn-p" onClick={() => setOpen(true)} style={{ padding: '9px 16px', fontSize: 13 }}>
        + Операция
      </button>
    )
  }

  return (
    <form
      action={action}
      style={{
        background: 'var(--surf)', border: '1px solid var(--bor)', borderRadius: 14,
        padding: 18, marginBottom: 16, display: 'grid', gap: 12,
      }}
    >
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {KINDS.map((k) => (
          <label
            key={k}
            style={{
              padding: '6px 12px', borderRadius: 999, fontSize: 12, cursor: 'pointer',
              border: `1px solid ${kind === k ? 'var(--purple)' : 'var(--bor)'}`,
              background: kind === k ? 'var(--pl)' : 'transparent',
              color: kind === k ? 'var(--purple)' : 'var(--muted)',
            }}
          >
            <input type="radio" name="kind" value={k} checked={kind === k}
              onChange={() => setKind(k)} style={{ display: 'none' }} />
            {KIND_NAMES[k]}
          </label>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 10 }}>
        <label style={label}>
          Сумма
          <input name="amount" className="si" placeholder="6000" inputMode="decimal" required autoFocus />
        </label>

        <label style={label}>
          {kind === 'transfer' ? 'Откуда' : 'Счёт'}
          <select name="account_id" className="si" required>
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </label>

        {kind === 'transfer' && (
          <>
            <label style={label}>
              Куда
              <select name="to_account_id" className="si" required>
                {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </label>
            <label style={label}>
              Сколько зачислено
              <input name="received" className="si" placeholder="если валюта другая" inputMode="decimal" />
            </label>
          </>
        )}

        <label style={label}>
          {/* Пустое поле означает «сейчас»: время проставит сервер в момент
              записи. Подставлять его при отрисовке нельзя — на сервере и в
              браузере получаются разные значения, и React ругается на
              расхождение. */}
          Когда <span style={{ textTransform: 'none', fontWeight: 400 }}>— пусто значит сейчас</span>
          <input name="occurred_at" type="datetime-local" className="si" />
        </label>

        {kind !== 'transfer' && (
          <label style={label}>
            Категория
            <select name="category_id" className="si">
              <option value="">— не выбрана —</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
        )}

        {kind !== 'transfer' && (
          <label style={label}>
            Кому / от кого
            <select name="counterparty_id" className="si">
              <option value="">— не указан —</option>
              {counterparties.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
        )}
      </div>

      <label style={label}>
        Комментарий
        <input name="note" className="si" placeholder="за что" />
      </label>

      {state?.error && (
        <div style={{ color: 'var(--red)', fontSize: 12, lineHeight: 1.5 }}>{state.error}</div>
      )}

      <div style={{ display: 'flex', gap: 8 }}>
        <button className="btn-p" disabled={pending} style={{ padding: '9px 18px', fontSize: 13 }}>
          {pending ? 'Записываю…' : 'Записать'}
        </button>
        <button type="button" className="btn-s" onClick={() => setOpen(false)}
          style={{ padding: '9px 16px', fontSize: 13 }}>
          Отмена
        </button>
      </div>
    </form>
  )
}

const label: React.CSSProperties = {
  display: 'grid', gap: 5, fontSize: 11, color: 'var(--muted)',
  textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 600,
}
