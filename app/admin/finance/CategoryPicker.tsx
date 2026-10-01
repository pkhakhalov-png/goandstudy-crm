'use client'

import { useState, useTransition } from 'react'
import { setCategory } from './actions'

/**
 * Смена категории прямо в ленте.
 *
 * Почему не отдельная страница правки. Разбирать накопленное — работа на один
 * присест: шестьдесят операций подряд, у каждой надо глянуть заметку и выбрать
 * пункт. Переход на карточку и обратно превратил бы это в сто двадцать лишних
 * шагов, и разбор бы не состоялся.
 *
 * Выбор отправляется сразу, без кнопки «сохранить»: подтверждать нечего, а
 * вернуть прежнее значение — тот же один выбор.
 */
export function CategoryPicker({ txId, current, categories }: {
  txId: string
  current: string | null
  categories: { id: string; name: string }[]
}) {
  const [ошибка, setОшибка] = useState<string | null>(null)
  const [идёт, start] = useTransition()

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <select
        defaultValue={current ?? ''}
        disabled={идёт}
        onChange={(e) => {
          const fd = new FormData()
          fd.set('transaction_id', txId)
          fd.set('category_id', e.target.value)
          setОшибка(null)
          start(async () => {
            const r = await setCategory(fd)
            if (r.error) setОшибка(r.error)
          })
        }}
        style={{
          fontSize: 11, padding: '2px 6px', borderRadius: 7,
          border: '1px solid var(--bor)', background: 'var(--bg)',
          color: current ? 'var(--text)' : 'var(--muted)',
          maxWidth: 190, opacity: идёт ? 0.5 : 1,
        }}
      >
        <option value="">— без категории —</option>
        {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
      </select>
      {ошибка && <span style={{ fontSize: 11, color: 'var(--red)' }}>{ошибка}</span>}
    </span>
  )
}
