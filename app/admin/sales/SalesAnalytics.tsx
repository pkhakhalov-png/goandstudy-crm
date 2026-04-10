'use client'

import { useState } from 'react'

interface Props {
  salespersons: any[]
  clients: any[]
  payments: any[]
}

interface MonthEntry {
  year: number
  month: number
}

const MONTHS_FULL = ['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь']
const MONTHS_SHORT = ['Янв','Фев','Мар','Апр','Май','Июн','Июл','Авг','Сен','Окт','Ноя','Дек']
const PLAN = 900000

export function SalesAnalytics({ salespersons, clients, payments }: Props) {
  const now = new Date()
  const [viewMonth, setViewMonth] = useState(now.getMonth())
  const [viewYear, setViewYear] = useState(now.getFullYear())
  const [expandedSales, setExpandedSales] = useState<Set<string>>(new Set())

  function shiftMonth(dir: number) {
    let m = viewMonth + dir, y = viewYear
    if (m < 0) { m = 11; y-- }
    if (m > 11) { m = 0; y++ }
    setViewMonth(m); setViewYear(y)
  }

  function toggleSales(id: string) {
    setExpandedSales(prev => { const n = new Set(prev); n.has(id)?n.delete(id):n.add(id); return n })
  }

  function getMonthStats(salespersonId: string, year: number, month: number) {
    const mStart = `${year}-${String(month+1).padStart(2,'0')}-01`
    const mEnd = new Date(year, month+1, 0).toISOString().split('T')[0]
    const myClients = clients.filter(c => c.salesperson_id === salespersonId)
    const myClientIds: number[] = myClients.map(c => c.id)

    const newClients = myClients.filter(c => {
      const d = c.created_at?.slice(0,10)
      return d >= mStart && d <= mEnd
    })
    const newContractsSum = newClients.reduce((sum: number, c: any) => {
      return sum + payments.filter(p => p.client_id === c.id).reduce((s: number, p: any) => s + Number(p.plan_sum), 0)
    }, 0)

    const factPaid = payments
      .filter(p => myClientIds.includes(p.client_id) && p.is_paid && p.fact_date >= mStart && p.fact_date <= mEnd)
      .reduce((sum: number, p: any) => sum + Number(p.fact_sum || p.plan_sum), 0)

    const pct = Math.round(factPaid / PLAN * 100)
    return { newClients: newClients.length, newContractsSum, factPaid, pct }
  }

  const salesStats = salespersons.map(s => {
    const myClients = clients.filter(c => c.salesperson_id === s.id)
    const myClientIds: number[] = myClients.map(c => c.id)

    const overdue = payments
      .filter(p => myClientIds.includes(p.client_id) && p.status === 'overdue')
      .reduce((sum: number, p: any) => sum + Number(p.plan_sum), 0)

    const activeMonths: MonthEntry[] = []
    for (let y = 2026; y <= now.getFullYear(); y++) {
      const maxM = y === now.getFullYear() ? now.getMonth() : 11
      for (let m = 0; m <= maxM; m++) {
        const mStart = `${y}-${String(m+1).padStart(2,'0')}-01`
        const mEnd = new Date(y, m+1, 0).toISOString().split('T')[0]
        const hasActivity = payments.some(p =>
          myClientIds.includes(p.client_id) && (
            (p.is_paid && p.fact_date >= mStart && p.fact_date <= mEnd) ||
            (p.plan_date >= mStart && p.plan_date <= mEnd)
          )
        ) || myClients.some((c: any) => {
          const d = c.created_at?.slice(0,10)
          return d >= mStart && d <= mEnd
        })
        if (hasActivity) activeMonths.push({ year: y, month: m })
      }
    }

    const monthStat = getMonthStats(s.id, viewYear, viewMonth)

    return {
      ...s,
      totalClients: myClients.length,
      activeClients: myClients.filter((c: any) => c.status === 'active').length,
      overdue,
      activeMonths,
      ...monthStat,
    }
  })

  const teamFactPaid = salesStats.reduce((s: number, x: any) => s + x.factPaid, 0)
  const teamNewContracts = salesStats.reduce((s: number, x: any) => s + x.newContractsSum, 0)
  const teamOverdue = salesStats.reduce((s: number, x: any) => s + x.overdue, 0)
  const teamPlan = PLAN * (salespersons.filter(s => s.is_active).length || 1)

  return (
    <div style={{padding:'20px 28px 40px',overflowY:'auto',flex:1}}>

      {/* Переключатель месяца */}
      <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:20}}>
        <button onClick={()=>shiftMonth(-1)} style={{width:28,height:28,border:'1px solid var(--bor2)',borderRadius:7,background:'rgba(255,255,255,.55)',backdropFilter:'blur(20px) saturate(180%)',WebkitBackdropFilter:'blur(20px) saturate(180%)',display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer'}}>
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" width="12" height="12"><polyline points="10,4 6,8 10,12"/></svg>
        </button>
        <div style={{fontSize:15,fontWeight:700,color:'var(--text)',minWidth:160,textAlign:'center'}}>{MONTHS_FULL[viewMonth]} {viewYear}</div>
        <button onClick={()=>shiftMonth(1)} style={{width:28,height:28,border:'1px solid var(--bor2)',borderRadius:7,background:'rgba(255,255,255,.55)',backdropFilter:'blur(20px) saturate(180%)',WebkitBackdropFilter:'blur(20px) saturate(180%)',display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer'}}>
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" width="12" height="12"><polyline points="6,4 10,8 6,12"/></svg>
        </button>
      </div>

      {/* KPI команды */}
      <div className="kg k4" style={{marginBottom:20}}>
        <div className="kc">
          <div className="kl">Новых договоров</div>
          <div className="kv p" style={{fontSize:17}}>{teamNewContracts.toLocaleString('ru')} ₽</div>
          <div className="ks">{MONTHS_FULL[viewMonth]} {viewYear}</div>
        </div>
        <div className="kc">
          <div className="kl">Поступило факт</div>
          <div className="kv g" style={{fontSize:17}}>{teamFactPaid.toLocaleString('ru')} ₽</div>
          <div className="ks">план: {teamPlan.toLocaleString('ru')} ₽ · {teamPlan>0?Math.round(teamFactPaid/teamPlan*100):0}%</div>
        </div>
        <div className="kc">
          <div className="kl">Просрочка (всего)</div>
          <div className="kv r" style={{fontSize:17}}>{teamOverdue.toLocaleString('ru')} ₽</div>
          <div className="ks">по всем продажникам</div>
        </div>
        <div className="kc">
          <div className="kl">ЗП к выплате</div>
          <div className="kv o" style={{fontSize:17}}>{Math.round(teamFactPaid*0.1).toLocaleString('ru')} ₽</div>
          <div className="ks">10% от поступлений месяца</div>
        </div>
      </div>

      {salesStats.length === 0 && (
        <div style={{textAlign:'center',color:'var(--muted)',padding:48}}>Продажников пока нет</div>
      )}

      {salesStats.map((s: any) => {
        const isOpen = expandedSales.has(s.id)
        const yearsSet = new Set<number>(s.activeMonths.map((m: MonthEntry) => m.year))
        const years: number[] = Array.from(yearsSet).sort((a: number, b: number) => b - a)

        return (
          <div key={s.id} style={{marginBottom:12,background:'rgba(255,255,255,.55)',backdropFilter:'blur(20px) saturate(180%)',WebkitBackdropFilter:'blur(20px) saturate(180%)',border:'1px solid var(--bor)',borderRadius:14,overflow:'hidden',boxShadow:'var(--sh)',opacity:s.is_active?1:0.5}}>

            {/* Шапка */}
            <div style={{padding:'14px 20px',background:'var(--surf2)',borderBottom:'1px solid var(--bor)',display:'flex',alignItems:'center',gap:14}}>
              <div style={{width:40,height:40,borderRadius:'50%',background:'linear-gradient(135deg,var(--purple),#8b3fa8)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:13,color:'#fff',fontWeight:700,flexShrink:0}}>
                {(s.name||s.email).split(' ').map((w:string)=>w[0]).join('').toUpperCase().slice(0,2)}
              </div>
              <div style={{flex:1}}>
                <div style={{fontSize:14,fontWeight:700,color:'var(--text)'}}>{s.name||'—'}</div>
                <div style={{fontSize:11,color:'var(--muted)',marginTop:2}}>{s.totalClients} клиентов всего · {s.activeClients} активных</div>
              </div>
              <div style={{display:'flex',gap:20,alignItems:'center'}}>
                <div style={{textAlign:'right'}}>
                  <div style={{fontSize:10,color:'var(--muted)',fontWeight:600,textTransform:'uppercase',letterSpacing:'0.04em',marginBottom:2}}>В {MONTHS_SHORT[viewMonth]}</div>
                  <div style={{fontSize:14,fontWeight:700,color:'var(--green)'}}>{s.factPaid.toLocaleString('ru')} ₽</div>
                  <div style={{fontSize:10,color:'var(--muted)',marginTop:1}}>факт поступило</div>
                </div>
                <div style={{textAlign:'right'}}>
                  <div style={{fontSize:10,color:'var(--muted)',fontWeight:600,textTransform:'uppercase',letterSpacing:'0.04em',marginBottom:2}}>Новых договоров</div>
                  <div style={{fontSize:14,fontWeight:700,color:'var(--purple)'}}>{s.newContractsSum.toLocaleString('ru')} ₽</div>
                  <div style={{fontSize:10,color:'var(--muted)',marginTop:1}}>{s.newClients} клиентов</div>
                </div>
                <div style={{textAlign:'right'}}>
                  <div style={{fontSize:10,color:'var(--muted)',fontWeight:600,textTransform:'uppercase',letterSpacing:'0.04em',marginBottom:2}}>% плана</div>
                  <div style={{fontSize:14,fontWeight:700,color:s.pct>=100?'var(--green)':s.pct>=60?'var(--gold)':'var(--red)'}}>{s.pct}%</div>
                  <div style={{fontSize:10,color:'var(--muted)',marginTop:1}}>план {PLAN.toLocaleString('ru')} ₽</div>
                </div>
                <div style={{textAlign:'right'}}>
                  <div style={{fontSize:10,color:'var(--muted)',fontWeight:600,textTransform:'uppercase',letterSpacing:'0.04em',marginBottom:2}}>Просрочка</div>
                  <div style={{fontSize:14,fontWeight:700,color:s.overdue>0?'var(--red)':'var(--muted)'}}>{s.overdue>0?s.overdue.toLocaleString('ru')+' ₽':'—'}</div>
                  <div style={{fontSize:10,color:'var(--muted)',marginTop:1}}>всего</div>
                </div>
                <button onClick={()=>toggleSales(s.id)}
                  style={{padding:'6px 14px',background:isOpen?'var(--bg)':'var(--purple)',color:isOpen?'var(--muted)':'#fff',border:isOpen?'1px solid var(--bor2)':'none',borderRadius:8,fontSize:11,fontWeight:600,cursor:'pointer',fontFamily:'inherit',flexShrink:0}}>
                  {isOpen?'Свернуть':'История'}
                </button>
              </div>
            </div>

            {/* Прогресс бар */}
            <div style={{padding:'8px 20px',borderBottom:isOpen?'1px solid var(--bor)':'none'}}>
              <div style={{display:'flex',justifyContent:'space-between',fontSize:10,color:'var(--muted)',marginBottom:3}}>
                <span>Выполнение плана {MONTHS_FULL[viewMonth]}</span>
                <span>{s.factPaid.toLocaleString('ru')} / {PLAN.toLocaleString('ru')} ₽</span>
              </div>
              <div style={{height:4,background:'var(--bor2)',borderRadius:20,overflow:'hidden'}}>
                <div style={{height:'100%',width:`${Math.min(s.pct,100)}%`,background:s.pct>=100?'var(--green)':s.pct>=60?'linear-gradient(90deg,var(--purple),#d47aff)':'var(--red)',borderRadius:20,transition:'width .3s'}}/>
              </div>
            </div>

            {/* История */}
            {isOpen && (
              <div>
                {years.length === 0 && (
                  <div style={{padding:'16px 20px',fontSize:12,color:'var(--muted)'}}>Нет данных с 2026</div>
                )}
                {years.map((year: number) => {
                  const yearMonths: MonthEntry[] = s.activeMonths
                    .filter((m: MonthEntry) => m.year === year)
                    .sort((a: MonthEntry, b: MonthEntry) => b.month - a.month)

                  const yearFactPaid = yearMonths.reduce((sum: number, m: MonthEntry) =>
                    sum + getMonthStats(s.id, m.year, m.month).factPaid, 0)
                  const yearNewContracts = yearMonths.reduce((sum: number, m: MonthEntry) =>
                    sum + getMonthStats(s.id, m.year, m.month).newContractsSum, 0)

                  return (
                    <div key={year}>
                      <div style={{display:'flex',alignItems:'center',gap:12,padding:'10px 20px',background:'rgba(177,94,204,.03)',borderTop:'1px solid var(--bor)'}}>
                        <span style={{fontSize:13,fontWeight:700,color:'var(--text)'}}>{year}</span>
                        <span style={{fontSize:11,color:'var(--muted)'}}>{yearMonths.length} активных месяцев</span>
                        <div style={{flex:1}}/>
                        <span style={{fontSize:12,fontWeight:700,color:'var(--green)',marginRight:16}}>{yearFactPaid.toLocaleString('ru')} ₽ поступило</span>
                        <span style={{fontSize:12,fontWeight:700,color:'var(--purple)'}}>{yearNewContracts.toLocaleString('ru')} ₽ договоров</span>
                      </div>
                      <table>
                        <thead>
                          <tr>
                            <th>Месяц</th>
                            <th>Новых договоров</th>
                            <th>Новых клиентов</th>
                            <th>Поступило факт</th>
                            <th>% плана</th>
                            <th>ЗП (10%)</th>
                          </tr>
                        </thead>
                        <tbody>
                          {yearMonths.map((me: MonthEntry) => {
                            const ms = getMonthStats(s.id, year, me.month)
                            const isCurrent = me.month === viewMonth && year === viewYear
                            return (
                              <tr key={me.month} style={{background:isCurrent?'rgba(177,94,204,.04)':'transparent'}}>
                                <td>
                                  <span style={{fontSize:12,fontWeight:isCurrent?700:500,color:isCurrent?'var(--purple)':'var(--text)'}}>
                                    {MONTHS_FULL[me.month]}
                                    {isCurrent && (
                                      <span style={{marginLeft:6,fontSize:9,padding:'1px 6px',borderRadius:10,background:'var(--pl)',color:'var(--purple)',fontWeight:700}}>
                                        текущий
                                      </span>
                                    )}
                                  </span>
                                </td>
                                <td><span className="num p">{ms.newContractsSum.toLocaleString('ru')} ₽</span></td>
                                <td style={{fontSize:12,color:'var(--muted)'}}>{ms.newClients > 0 ? `+${ms.newClients}` : '—'}</td>
                                <td><span className="num g">{ms.factPaid.toLocaleString('ru')} ₽</span></td>
                                <td>
                                  <span style={{fontSize:12,fontWeight:700,color:ms.pct>=100?'var(--green)':ms.pct>=60?'var(--gold)':'var(--red)'}}>
                                    {ms.pct}%
                                  </span>
                                </td>
                                <td><span className="num o">{Math.round(ms.factPaid*0.1).toLocaleString('ru')} ₽</span></td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}