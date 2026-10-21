'use client'

/**
 * Повторные созвоны сделки и кнопка «назначить ещё один».
 *
 * Ссылку создаёт CRM, а не продажник в своём Zoom: только так запись второго
 * разговора ложится в эту же сделку. Встреча, заведённая руками, ни с чем не
 * связана — запись приходит и остаётся неопознанной.
 *
 * После создания ссылка показывается сразу: её отправляют клиенту, ради этого
 * кнопку и нажимали.
 */

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { scheduleFollowUpCall } from '../actions'
import { ZoomLinkRow } from '@/app/_shared/ZoomLinkRow'

export type ПовторныйСозвон = {
  id: string
  booking_date: string
  start_time: string
  end_time: string
  status: string
  zoom_join_url: string | null
}

function завтра(): string {
  const д = new Date(Date.now() + 86_400_000)
  return д.toLocaleDateString('sv-SE', { timeZone: 'Europe/Moscow' })
}

export function FollowUpCalls({ dealId, calls }: { dealId: string; calls: ПовторныйСозвон[] }) {
  const router = useRouter()
  const [открыта, открыть] = useState(false)
  const [идёт, начать] = useTransition()
  const [ошибка, установитьОшибку] = useState<string | null>(null)
  const [новая, установитьНовую] = useState<string | null>(null)

  function отправить(данные: FormData) {
    установитьОшибку(null)
    данные.set('deal_id', dealId)
    начать(async () => {
      const итог = await scheduleFollowUpCall(данные)
      if ('error' in итог) { установитьОшибку(итог.error); return }
      установитьНовую(итог.joinUrl)
      открыть(false)
      router.refresh()
    })
  }

  const подпись = { fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase' as const, letterSpacing: '0.06em', marginBottom: 8 }

  return (
    <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--bor2)' }}>
      <div style={подпись}>Повторные созвоны</div>

      {calls.map(с => (
        <div key={с.id} style={{ marginBottom: 8 }}>
          <div style={{ padding: '8px 12px', borderRadius: 8, background: 'rgba(255,149,0,.06)', border: '1px solid rgba(255,149,0,.15)', fontSize: 12 }}>
            <span style={{ fontWeight: 600 }}>{new Date(с.booking_date + 'T00:00:00').toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })}</span>
            <span style={{ marginLeft: 8, fontWeight: 700, color: 'var(--gold)' }}>{с.start_time.slice(0, 5)}–{с.end_time.slice(0, 5)}</span>
            <span className={`pill ${с.status === 'completed' ? 'pa' : с.status === 'cancelled' ? 'po' : 'ps'}`} style={{ marginLeft: 8, fontSize: 9 }}>
              <span className="dot"></span>{с.status === 'completed' ? 'Проведён' : с.status === 'cancelled' ? 'Отменён' : с.status === 'no_show' ? 'Не пришёл' : 'Назначен'}
            </span>
          </div>
          {с.zoom_join_url && <ZoomLinkRow url={с.zoom_join_url} />}
        </div>
      ))}

      {новая && (
        <p style={{ fontSize: 12, color: 'var(--green)', margin: '0 0 8px' }}>
          Ссылка создана — скопируйте и отправьте клиенту. Запись разговора ляжет в эту сделку.
        </p>
      )}

      {!открыта ? (
        <button type="button" className="btn-s" style={{ fontSize: 12, padding: '7px 12px', width: '100%' }} onClick={() => { открыть(true); установитьНовую(null) }}>
          + Назначить повторный созвон
        </button>
      ) : (
        <form action={отправить} style={{ display: 'grid', gap: 6 }}>
          <div style={{ display: 'flex', gap: 6 }}>
            <input type="date" name="date" defaultValue={завтра()} required className="si" style={{ flex: 1, padding: '7px 10px', fontSize: 12 }} />
            <input type="time" name="time" defaultValue="12:00" step={900} required className="si" style={{ width: 96, padding: '7px 10px', fontSize: 12 }} />
            <select name="minutes" defaultValue="45" className="si" style={{ width: 84, padding: '7px 8px', fontSize: 12 }}>
              <option value="30">30 мин</option>
              <option value="45">45 мин</option>
              <option value="60">60 мин</option>
            </select>
          </div>
          <div style={{ fontSize: 11, color: 'var(--muted)' }}>Время московское.</div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button type="submit" disabled={идёт} className="btn-p" style={{ flex: 1, fontSize: 11, padding: '7px' }}>
              {идёт ? 'Создаю ссылку…' : 'Создать ссылку Zoom'}
            </button>
            <button type="button" onClick={() => открыть(false)} className="btn-s" style={{ fontSize: 11, padding: '7px 12px' }}>Отмена</button>
          </div>
        </form>
      )}
      {ошибка && <p style={{ color: 'var(--red)', fontSize: 12, marginTop: 6 }}>{ошибка}</p>}
    </div>
  )
}
