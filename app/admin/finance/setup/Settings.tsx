'use client'

import { useActionState } from 'react'
import { grantAccess, revokeAccess, setRate } from '../actions'

type User = { id: string; name: string; email: string | null; role: string }
type AccessRow = { user_id: string; level: string; name: string; email: string | null }

/**
 * Настройки модуля после начала учёта: курс и доступы.
 *
 * Оба поля были только в мастере первого запуска — и это была ошибка: курс
 * меняется каждую неделю, а второго основателя надо пускать уже после старта.
 */
export function Settings({ rate, access, users }: {
  rate: { rub_per_usd: number; rate_date: string } | null
  access: AccessRow[]
  users: User[]
}) {
  const [rateState, rateAction, ratePending] = useActionState(
    async (_p: { error?: string } | null, fd: FormData) => setRate(fd), null,
  )
  const [grantState, grantAction, grantPending] = useActionState(
    async (_p: { error?: string } | null, fd: FormData) => grantAccess(fd), null,
  )
  const [revokeState, revokeAction] = useActionState(
    async (_p: { error?: string } | null, fd: FormData) => revokeAccess(fd), null,
  )

  const free = users.filter((u) => !access.some((a) => a.user_id === u.id))
  const today = new Date().toISOString().slice(0, 10)

  return (
    <div style={{ display: 'grid', gap: 26, maxWidth: 720, marginTop: 26 }}>
      <section>
        <H>Курс, рублей за доллар</H>
        <form action={rateAction} style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <input name="rate" className="si" placeholder="например 95,5" inputMode="decimal" style={{ width: 150 }} required />
          <input name="rate_date" type="date" className="si" defaultValue={today} style={{ width: 160 }} />
          <button className="btn-p" disabled={ratePending} style={{ padding: '8px 16px', fontSize: 13 }}>
            {ratePending ? 'Сохраняю…' : 'Сохранить'}
          </button>
        </form>
        {rateState?.error && <Err>{rateState.error}</Err>}
        <P>
          {rate
            ? `Сейчас ${rate.rub_per_usd} ₽ за доллар, задан на ${new Date(rate.rate_date).toLocaleDateString('ru-RU')}.`
            : 'Курс не задан: доллары учитываются, но общий рублёвый итог помечен неполным.'}
          {' '}Новый курс не переписывает прошлые оценки — он действует с указанной даты.
        </P>
      </section>

      <section>
        <H>Доступ к деньгам</H>
        <div style={{ display: 'grid', gap: 6 }}>
          {access.map((a) => (
            <div key={a.user_id} style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
              border: '1px solid var(--bor)', borderRadius: 10, padding: '9px 12px',
            }}>
              <div style={{ fontSize: 13 }}>
                {a.name}
                <span style={{ color: 'var(--muted)', fontSize: 11, marginLeft: 8 }}>
                  {a.email} · {a.level === 'owner' ? 'владелец' : a.level === 'operator' ? 'может вносить' : 'только смотрит'}
                </span>
              </div>
              <form action={revokeAction}>
                <input type="hidden" name="user_id" value={a.user_id} />
                <button className="btn-s" style={{ fontSize: 11, padding: '4px 10px' }}>Убрать</button>
              </form>
            </div>
          ))}
        </div>
        {revokeState?.error && <Err>{revokeState.error}</Err>}

        {free.length > 0 && (
          <form action={grantAction} style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
            <select name="user_id" className="si" style={{ minWidth: 220 }} required>
              <option value="">— кому выдать —</option>
              {free.map((u) => <option key={u.id} value={u.id}>{u.name} · {u.email}</option>)}
            </select>
            <select name="level" className="si" defaultValue="owner">
              <option value="owner">владелец</option>
              <option value="operator">может вносить</option>
              <option value="viewer">только смотрит</option>
            </select>
            <button className="btn-s" disabled={grantPending} style={{ padding: '8px 14px', fontSize: 13 }}>
              {grantPending ? '…' : 'Выдать'}
            </button>
          </form>
        )}
        {grantState?.error && <Err>{grantState.error}</Err>}
        <P>
          Доступ к CRM сам по себе прав на деньги не даёт: остальные сотрудники раздел
          не увидят, даже зная адрес. Последнего владельца убрать нельзя — иначе модуль
          станет недоступен никому.
        </P>
      </section>
    </div>
  )
}

function H({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>{children}</div>
}

function P({ children }: { children: React.ReactNode }) {
  return <p style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.6, margin: '10px 0 0', maxWidth: 640 }}>{children}</p>
}

function Err({ children }: { children: React.ReactNode }) {
  return <div style={{ color: 'var(--red)', fontSize: 12, marginTop: 8 }}>{children}</div>
}
