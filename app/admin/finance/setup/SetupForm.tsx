'use client'

import { useActionState, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { startAccounting } from '../actions'

type Row = { name: string; currency: 'RUB' | 'USD'; opening: string }

/**
 * Начало учёта: счета, остатки на момент старта, курс и владельцы.
 *
 * Момент старта — граница, за которую назад вносить нельзя. Смысл в том, что
 * остаток, взятый из банка, уже включает в себя всё, что было раньше: внеся те
 * же операции ещё раз, вы удвоите деньги. Это объяснено прямо на экране, потому
 * что ошибка тут дорогая и обнаруживается не сразу.
 */
export function SetupForm({ users, defaultOwnerId }: {
  users: { id: string; name: string; email: string | null; role: string }[]
  defaultOwnerId: string
}) {
  const router = useRouter()
  const [rows, setRows] = useState<Row[]>([
    { name: 'Т-Банк', currency: 'RUB', opening: '' },
    { name: 'Карта компании', currency: 'USD', opening: '' },
  ])
  const [owners, setOwners] = useState<string[]>([defaultOwnerId])

  const [state, action, pending] = useActionState(
    async (_prev: { error?: string } | null, formData: FormData) => {
      // Поле datetime-local отдаёт время без пояса: «2026-09-15T14:18». Сервер
      // на Vercel живёт по UTC и прочтёт это как своё время — и начало учёта
      // уедет на разницу поясов. Здесь, в браузере, пояс известен, поэтому
      // превращаем в абсолютный момент до отправки.
      const local = String(formData.get('opening_at') || '')
      if (local) formData.set('opening_at', new Date(local).toISOString())

      const res = await startAccounting(formData)
      if (!res.error) router.push('/admin/finance')
      return res
    },
    null,
  )

  // Момент старта подставляется после появления формы, а не при отрисовке: на
  // сервере и в браузере «сейчас» разное, и значения в разметке разъехались бы.
  const openingRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (openingRef.current && !openingRef.current.value) {
      openingRef.current.value = new Date(Date.now() - new Date().getTimezoneOffset() * 60000)
        .toISOString().slice(0, 16)
    }
  }, [])

  const update = (i: number, patch: Partial<Row>) =>
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)))

  return (
    <form action={action} style={{ display: 'grid', gap: 22, maxWidth: 720 }}>
      <section>
        <H>Момент начала учёта</H>
        <input ref={openingRef} name="opening_at" type="datetime-local" className="si" required
          style={{ maxWidth: 260 }} />
        <P>
          Остатки ниже берутся на этот момент. Всё, что было раньше, уже сидит внутри
          них — вносить те же операции второй раз нельзя, иначе деньги удвоятся.
          База это запрещает: операция с датой раньше границы не запишется.
        </P>
      </section>

      <section>
        <H>Счета и остатки</H>
        <div style={{ display: 'grid', gap: 8 }}>
          {rows.map((r, i) => (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 110px 1fr 32px', gap: 8, alignItems: 'center' }}>
              <input name="account_name" className="si" placeholder="Название счёта"
                value={r.name} onChange={(e) => update(i, { name: e.target.value })} />
              <select name="account_currency" className="si" value={r.currency}
                onChange={(e) => update(i, { currency: e.target.value as Row['currency'] })}>
                <option value="RUB">RUB</option>
                <option value="USD">USD</option>
              </select>
              <input name="account_opening" className="si" placeholder="остаток, например 245 905"
                inputMode="decimal" value={r.opening} onChange={(e) => update(i, { opening: e.target.value })} />
              <button type="button" className="btn-s" style={{ padding: '6px 8px', fontSize: 12 }}
                onClick={() => setRows((p) => p.filter((_, idx) => idx !== i))} title="убрать счёт">×</button>
            </div>
          ))}
        </div>
        <button type="button" className="btn-s" style={{ marginTop: 8, padding: '6px 12px', fontSize: 12 }}
          onClick={() => setRows((p) => [...p, { name: '', currency: 'RUB', opening: '' }])}>
          + ещё счёт
        </button>
        <P>
          Счёт — это место, где лежат деньги, с одной валютой. Несколько карт к одному
          счёту не создают несколько остатков. Копилку под налоги заводите отдельным
          счётом, если считаете эти деньги отложенными.
        </P>
      </section>

      <section>
        <H>Курс, рублей за доллар</H>
        <input name="rate" className="si" placeholder="например 95,5" inputMode="decimal" style={{ maxWidth: 200 }} />
        <P>
          Нужен только для общего эквивалента. Без него доллары всё равно учитываются,
          а рублёвый итог помечается неполным — это честнее, чем подставить случайное
          число.
        </P>
      </section>

      <section>
        <H>У кого будет доступ к деньгам</H>
        <div style={{ display: 'grid', gap: 6 }}>
          {users.map((u) => (
            <label key={u.id} style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13 }}>
              <input
                type="checkbox" name="owner_id" value={u.id}
                checked={owners.includes(u.id)}
                onChange={(e) => setOwners((prev) => e.target.checked ? [...prev, u.id] : prev.filter((x) => x !== u.id))}
              />
              {u.name}
              <span style={{ color: 'var(--muted)', fontSize: 11 }}>{u.email} · {u.role}</span>
            </label>
          ))}
        </div>
        <P>
          Доступ к CRM сам по себе прав на деньги не даёт. Остальные сотрудники раздел
          не увидят, даже зная адрес.
        </P>
      </section>

      {state?.error && <div style={{ color: 'var(--red)', fontSize: 13 }}>{state.error}</div>}

      <div>
        <button className="btn-p" disabled={pending} style={{ padding: '10px 20px' }}>
          {pending ? 'Создаю…' : 'Начать учёт'}
        </button>
      </div>
    </form>
  )
}

function H({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>{children}</div>
}

function P({ children }: { children: React.ReactNode }) {
  return <p style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.6, margin: '8px 0 0', maxWidth: 640 }}>{children}</p>
}
