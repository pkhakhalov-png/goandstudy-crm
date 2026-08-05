'use client'

import { useState } from 'react'
import { upsertSalesPlan } from './actions'

interface Props {
  salespersons: any[]
  salesPlans: any[]
}

const MONTHS_FULL = ['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь']

export function SalesPlansEditor({ salespersons, salesPlans }: Props) {
  const now = new Date()
  const [ym, setYm] = useState(`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`)

  const planFor = (id: string) =>
    Number(salesPlans.find(p => p.month === ym && p.salesperson_id === id)?.plan_amount || 0)

  const teamPlan = salespersons.reduce((s: number, sp: any) => s + planFor(sp.id), 0)

  // Список последних 12 месяцев для селекта
  const monthOptions: string[] = []
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i + 3, 1)
    monthOptions.push(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`)
  }
  const label = (m: string) => { const [y, mm] = m.split('-').map(Number); return `${MONTHS_FULL[mm-1]} ${y}` }

  return (
    <div style={{background:'#fff',border:'1px solid var(--bor)',borderRadius:14,padding:'18px 22px',boxShadow:'var(--sh)',marginBottom:16}}>
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:14}}>
        <div>
          <div style={{fontSize:15,fontWeight:700,color:'var(--text)'}}>Планы продаж</div>
          <div style={{fontSize:12,color:'var(--muted)',marginTop:2}}>План отдела = сумма личных планов: <b>{teamPlan.toLocaleString('ru')} ₽</b></div>
        </div>
        <select value={ym} onChange={e=>setYm(e.target.value)}
          style={{padding:'7px 12px',border:'1px solid var(--bor2)',borderRadius:8,fontSize:13,fontFamily:'inherit',background:'#fff'}}>
          {monthOptions.map(m => <option key={m} value={m}>{label(m)}</option>)}
        </select>
      </div>

      <div style={{display:'flex',flexDirection:'column',gap:8}}>
        {salespersons.map((sp: any) => (
          <form key={sp.id} action={upsertSalesPlan}
            style={{display:'flex',alignItems:'center',gap:12,padding:'8px 0',borderTop:'1px solid var(--bor)'}}>
            <input type="hidden" name="month" value={ym} />
            <input type="hidden" name="salesperson_id" value={sp.id} />
            <div style={{flex:1,fontSize:13,color:'var(--text)',opacity:sp.is_active?1:0.5}}>
              {sp.name || sp.email}{!sp.is_active && <span style={{fontSize:11,color:'var(--muted)'}}> · неактивен</span>}
            </div>
            <input name="plan_amount" type="number" min="0" step="10000" defaultValue={planFor(sp.id) || ''} placeholder="0"
              style={{width:140,padding:'6px 10px',border:'1px solid var(--bor2)',borderRadius:8,fontSize:13,fontFamily:'inherit',textAlign:'right'}} />
            <span style={{fontSize:12,color:'var(--muted)'}}>₽</span>
            <button type="submit" className="btn-s" style={{fontSize:12,padding:'6px 12px'}}>Сохранить</button>
          </form>
        ))}
        {salespersons.length === 0 && <div style={{fontSize:13,color:'var(--muted)',padding:'8px 0'}}>Продажников пока нет</div>}
      </div>
    </div>
  )
}
