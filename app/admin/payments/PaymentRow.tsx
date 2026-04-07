'use client'

import { useState } from 'react'
import { markPaymentPaid } from './actions'

interface PaymentRowProps {
  payment: any
  statusLabel: Record<string, string>
  statusClass: Record<string, string>
}

export function PaymentRow({ payment: p, statusLabel, statusClass }: PaymentRowProps) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const today = new Date().toISOString().split('T')[0]

  async function handleSubmit(formData: FormData) {
    setLoading(true)
    await markPaymentPaid(formData)
    setLoading(false)
    setOpen(false)
  }

  return (
    <>
      <tr style={{
        borderLeft: p.status === 'paid' ? '3px solid var(--green)' :
          p.status === 'overdue' ? '3px solid var(--red)' :
          p.status === 'soon' ? '3px solid var(--gold)' : 'none'
      }}>
        <td style={{color:'var(--muted)', fontWeight:700, fontSize:11}}>{p.num}</td>
        <td style={{
          color: p.status === 'overdue' ? 'var(--red)' :
            p.status === 'soon' ? 'var(--gold)' : 'var(--text)',
          fontWeight: (p.status === 'overdue' || p.status === 'soon') ? 600 : 400
        }}>
          {new Date(p.plan_date).toLocaleDateString('ru-RU')}
        </td>
        <td><span className="num">{Number(p.plan_sum).toLocaleString('ru')} ₽</span></td>
        <td>
          {p.fact_sum
            ? <span className="num g">{Number(p.fact_sum).toLocaleString('ru')} ₽</span>
            : <span style={{color:'var(--muted)'}}>—</span>
          }
        </td>
        <td style={{fontSize:11, color:'var(--muted)'}}>
          {p.fact_date ? new Date(p.fact_date).toLocaleDateString('ru-RU') : '—'}
        </td>
        <td style={{fontSize:11, color:'var(--muted)'}}>{p.comment ?? '—'}</td>
        <td>
          <span className={`pill ${statusClass[p.status]}`}>
            <span className="dot"></span>
            {statusLabel[p.status]}
          </span>
        </td>
        <td>
          {p.is_paid ? (
            <span style={{fontSize:11, color:'var(--muted)'}}>✓</span>
          ) : (
            <button
              onClick={() => setOpen(!open)}
              style={{
                padding:'4px 10px',
                background: open ? 'var(--bg)' : 'var(--purple)',
                color: open ? 'var(--muted)' : '#fff',
                border: open ? '1px solid var(--bor2)' : 'none',
                borderRadius:6, fontSize:11, fontWeight:600,
                cursor:'pointer', fontFamily:'inherit'
              }}
            >
              {open ? 'Отмена' : '+ Отметить'}
            </button>
          )}
        </td>
      </tr>

      {open && !p.is_paid && (
        <tr>
          <td colSpan={8} style={{padding:0, background:'var(--surf2)', borderBottom:'1px solid var(--bor)'}}>
            <form action={handleSubmit} style={{padding:'12px 16px'}}>
              <input type="hidden" name="payment_id" value={p.id}/>
              <div style={{display:'grid', gridTemplateColumns:'1fr 1fr 2fr auto', gap:8, alignItems:'flex-end'}}>
                <div>
                  <div style={{fontSize:10, color:'var(--muted)', fontWeight:600, textTransform:'uppercase', letterSpacing:'0.04em', marginBottom:3}}>Дата оплаты</div>
                  <input
                    name="fact_date"
                    type="date"
                    defaultValue={today}
                    style={{width:'100%', padding:'7px 10px', border:'1px solid var(--bor2)', borderRadius:7, fontSize:12, fontFamily:'inherit', outline:'none', background:'var(--surf)'}}
                  />
                </div>
                <div>
                  <div style={{fontSize:10, color:'var(--muted)', fontWeight:600, textTransform:'uppercase', letterSpacing:'0.04em', marginBottom:3}}>Сумма факт</div>
                  <input
                    name="fact_sum"
                    type="number"
                    defaultValue={p.plan_sum}
                    style={{width:'100%', padding:'7px 10px', border:'1px solid var(--bor2)', borderRadius:7, fontSize:12, fontFamily:'inherit', outline:'none', background:'var(--surf)'}}
                  />
                </div>
                <div>
                  <div style={{fontSize:10, color:'var(--muted)', fontWeight:600, textTransform:'uppercase', letterSpacing:'0.04em', marginBottom:3}}>Комментарий</div>
                  <input
                    name="comment"
                    placeholder="Способ оплаты..."
                    style={{width:'100%', padding:'7px 10px', border:'1px solid var(--bor2)', borderRadius:7, fontSize:12, fontFamily:'inherit', outline:'none', background:'var(--surf)'}}
                  />
                </div>
                <button
                  type="submit"
                  disabled={loading}
                  style={{
                    padding:'7px 16px', background:'var(--green)', color:'#fff',
                    border:'none', borderRadius:7, fontSize:12, fontWeight:600,
                    cursor:'pointer', fontFamily:'inherit', opacity: loading ? 0.6 : 1,
                    whiteSpace:'nowrap'
                  }}
                >
                  {loading ? '...' : 'Сохранить'}
                </button>
              </div>
            </form>
          </td>
        </tr>
      )}
    </>
  )
}