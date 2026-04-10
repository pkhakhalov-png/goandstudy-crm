'use client'

import { useState } from 'react'

interface Props {
  clients: any[]
  payments: any[]
  expenses: any[]
  salespersons: any[]
  fixedExpenses: any[]
}

const MONTHS = ['Янв','Фев','Мар','Апр','Май','Июн','Июл','Авг','Сен','Окт','Ноя','Дек']
const MONTHS_FULL = ['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь']

export function Dashboard({ clients, payments, expenses, salespersons, fixedExpenses }: Props) {
  const now = new Date()
  const [viewMonth, setViewMonth] = useState(now.getMonth())
  const [viewYear, setViewYear] = useState(now.getFullYear())
  const [tab, setTab] = useState<'overview' | 'salespersons' | 'curators'>('overview')
  const [expandedYears, setExpandedYears] = useState<Set<string>>(new Set())
  const [expandedMonths, setExpandedMonths] = useState<Set<string>>(new Set())
  const [debtorsOpen, setDebtorsOpen] = useState(true)
  const [tooltip, setTooltip] = useState<{x:number,y:number,text:string}|null>(null)

  function shiftMonth(dir: number) {
    let m = viewMonth + dir, y = viewYear
    if (m < 0) { m = 11; y-- }
    if (m > 11) { m = 0; y++ }
    setViewMonth(m); setViewYear(y)
  }
  function toggleYear(k: string) { setExpandedYears(p => { const n = new Set(p); n.has(k)?n.delete(k):n.add(k); return n }) }
  function toggleMonth(k: string) { setExpandedMonths(p => { const n = new Set(p); n.has(k)?n.delete(k):n.add(k); return n }) }

  const fixedMonthly = fixedExpenses.reduce((s, e) => {
    if (e.period === 'monthly') return s + Number(e.amount)
    if (e.period === 'quarterly') return s + Number(e.amount) / 3
    if (e.period === 'yearly') return s + Number(e.amount) / 12
    return s
  }, 0)

  const debtorTotal = payments.filter(p => !p.is_paid).reduce((s, p) => s + Number(p.plan_sum), 0)
  const debtorOverdue = payments.filter(p => !p.is_paid && p.status === 'overdue').reduce((s, p) => s + Number(p.plan_sum), 0)
  const creditorTotal = expenses.filter(e => !e.is_paid).reduce((s, e) => s + Number(e.plan_sum), 0)
  const creditorCurators = expenses.filter(e => !e.is_paid && e.article === 'curator').reduce((s, e) => s + Number(e.plan_sum), 0)
  const creditorSales = expenses.filter(e => !e.is_paid && e.article === 'salesperson').reduce((s, e) => s + Number(e.plan_sum), 0)

  const monthPayments = payments.filter(p => {
    const d = new Date(p.plan_date)
    return d.getMonth() === viewMonth && d.getFullYear() === viewYear
  })
  const monthExpected = monthPayments.reduce((s, p) => s + Number(p.plan_sum), 0)
  const monthReceived = monthPayments.filter(p => p.is_paid).reduce((s, p) => s + Number(p.fact_sum || p.plan_sum), 0)
  const monthOverdue = monthPayments.filter(p => !p.is_paid && p.status === 'overdue').reduce((s, p) => s + Number(p.plan_sum), 0)
  // Исправление: "ещё ожидается" = все неоплаченные включая просрочку
  const monthUnpaid = monthPayments.filter(p => !p.is_paid).reduce((s, p) => s + Number(p.plan_sum), 0)

  const monthDebtors = clients.filter(c => {
    return monthPayments.some(p => p.client_id === c.id && !p.is_paid)
  }).map(c => {
    const cp = monthPayments.filter(p => p.client_id === c.id)
    const unpaid = cp.filter(p => !p.is_paid).reduce((s, p) => s + Number(p.plan_sum), 0)
    const overdue = cp.filter(p => !p.is_paid && p.status === 'overdue').reduce((s, p) => s + Number(p.plan_sum), 0)
    return { ...c, unpaid, overdue }
  }).sort((a, b) => b.overdue - a.overdue || b.unpaid - a.unpaid)

  const monthExpenses = expenses.filter(e => {
    const d = new Date(e.plan_date)
    return d.getMonth() === viewMonth && d.getFullYear() === viewYear
  })
  const monthExpTotal = monthExpenses.reduce((s, e) => s + Number(e.plan_sum), 0)
  const monthExpPaid = monthExpenses.filter(e => e.is_paid).reduce((s, e) => s + Number(e.fact_sum || e.plan_sum), 0)
  const monthExpPending = monthExpenses.filter(e => !e.is_paid).reduce((s, e) => s + Number(e.plan_sum), 0)
  const monthProfit = monthReceived - monthExpPaid - fixedMonthly

  const currentYear = now.getFullYear()
  const monthlyData = MONTHS.map((label, i) => {
    const mp = payments.filter(p => { const d = new Date(p.plan_date); return d.getFullYear() === currentYear && d.getMonth() === i })
    const plan = mp.reduce((s, p) => s + Number(p.plan_sum), 0)
    const fact = mp.filter(p => p.is_paid).reduce((s, p) => s + Number(p.fact_sum || p.plan_sum), 0)
    const exp = expenses.filter(e => { const d = new Date(e.plan_date); return d.getFullYear() === currentYear && d.getMonth() === i && e.is_paid }).reduce((s, e) => s + Number(e.fact_sum || e.plan_sum), 0)
    return { label, plan, fact, exp, profit: fact - exp - fixedMonthly }
  })
  const maxVal = Math.max(...monthlyData.map(m => Math.max(m.plan, m.fact)), 1)

  // Итоги за год
  const yearTotalPlan = monthlyData.reduce((s, m) => s + m.plan, 0)
  const yearTotalFact = monthlyData.reduce((s, m) => s + m.fact, 0)
  const yearTotalExp = monthlyData.reduce((s, m) => s + m.exp, 0)

  function showTooltip(e: React.MouseEvent, text: string) {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    const wrap = (e.currentTarget as HTMLElement).closest('.dash-wrap')?.getBoundingClientRect()
    setTooltip({ x: rect.left - (wrap?.left ?? 0) + rect.width / 2, y: rect.top - (wrap?.top ?? 0) - 8, text })
  }

  function buildStaffStats(article: string) {
    const staffExp = expenses.filter(e => e.article === article)
    const names = [...new Set(staffExp.map(e => e.who).filter(Boolean))] as string[]
    return names.map(name => {
      const mine = staffExp.filter(e => e.who === name)
      const paid = mine.filter(e => e.is_paid).reduce((s, e) => s + Number(e.fact_sum || e.plan_sum), 0)
      const pending = mine.filter(e => !e.is_paid).reduce((s, e) => s + Number(e.plan_sum), 0)
      const total = mine.reduce((s, e) => s + Number(e.plan_sum), 0)
      const monthMine = mine.filter(e => { const d = new Date(e.plan_date); return d.getMonth() === viewMonth && d.getFullYear() === viewYear })
      const monthPaid = monthMine.filter(e => e.is_paid).reduce((s, e) => s + Number(e.fact_sum || e.plan_sum), 0)
      const monthPending2 = monthMine.filter(e => !e.is_paid).reduce((s, e) => s + Number(e.plan_sum), 0)
      const years = [...new Set(mine.map(e => new Date(e.plan_date || Date.now()).getFullYear()))].filter(y => y >= 2026).sort((a,b) => b-a)
      const byYear = years.map(year => {
        const ye = mine.filter(e => new Date(e.plan_date || Date.now()).getFullYear() === year)
        const yPaid = ye.filter(e => e.is_paid).reduce((s, e) => s + Number(e.fact_sum || e.plan_sum), 0)
        const yPending = ye.filter(e => !e.is_paid).reduce((s, e) => s + Number(e.plan_sum), 0)
        const months = [...new Set(ye.map(e => new Date(e.plan_date || Date.now()).getMonth()))].sort((a,b) => b-a)
        const byMonth = months.map(month => {
          const me = ye.filter(e => new Date(e.plan_date || Date.now()).getMonth() === month)
          return { month, me, mPaid: me.filter(e=>e.is_paid).reduce((s,e)=>s+Number(e.fact_sum||e.plan_sum),0), mPending: me.filter(e=>!e.is_paid).reduce((s,e)=>s+Number(e.plan_sum),0) }
        })
        return { year, ye, yPaid, yPending, byMonth }
      })
      return { name, paid, pending, total, monthPaid, monthPending: monthPending2, byYear, clientsCount: [...new Set(mine.map(e => e.client_id))].length }
    }).sort((a,b) => b.total - a.total)
  }

  const salesStats = buildStaffStats('salesperson')
  const curatorStats = buildStaffStats('curator')

  function renderStaffStats(stats: ReturnType<typeof buildStaffStats>, gradient: string) {
    if (stats.length === 0) return <div style={{textAlign:'center',color:'var(--muted)',padding:32}}>Нет данных</div>
    return (
      <div style={{display:'flex',flexDirection:'column',gap:16}}>
        {stats.map(s => (
          <div key={s.name} style={{background:'#fff',border:'1px solid var(--bor)',borderRadius:14,overflow:'hidden',boxShadow:'var(--sh)'}}>
            <div style={{padding:'14px 20px',background:'var(--surf2)',borderBottom:'1px solid var(--bor)',display:'flex',alignItems:'center',gap:14}}>
              <div style={{width:38,height:38,borderRadius:'50%',background:gradient,display:'flex',alignItems:'center',justifyContent:'center',fontSize:13,color:'#fff',fontWeight:700,flexShrink:0}}>
                {s.name.slice(0,2).toUpperCase()}
              </div>
              <div style={{flex:1}}>
                <div style={{fontSize:14,fontWeight:700,color:'var(--text)'}}>{s.name}</div>
                <div style={{fontSize:11,color:'var(--muted)',marginTop:2}}>{s.clientsCount} клиентов</div>
              </div>
              <div style={{display:'flex',gap:20}}>
                <div style={{textAlign:'right'}}>
                  <div style={{fontSize:10,color:'var(--muted)',fontWeight:600,textTransform:'uppercase',letterSpacing:'0.04em',marginBottom:2}}>В {MONTHS[viewMonth]}</div>
                  <div style={{fontSize:13,fontWeight:700,color:s.monthPaid>0?'var(--green)':'var(--muted)'}}>{s.monthPaid.toLocaleString('ru')} ₽</div>
                  {s.monthPending > 0 && <div style={{fontSize:11,color:'var(--gold)',fontWeight:600}}>+ {s.monthPending.toLocaleString('ru')} ₽ долг</div>}
                </div>
                <div style={{textAlign:'right'}}>
                  <div style={{fontSize:10,color:'var(--muted)',fontWeight:600,textTransform:'uppercase',letterSpacing:'0.04em',marginBottom:2}}>Выплачено всего</div>
                  <div style={{fontSize:13,fontWeight:700,color:'var(--green)'}}>{s.paid.toLocaleString('ru')} ₽</div>
                </div>
                <div style={{textAlign:'right'}}>
                  <div style={{fontSize:10,color:'var(--muted)',fontWeight:600,textTransform:'uppercase',letterSpacing:'0.04em',marginBottom:2}}>Должны</div>
                  <div style={{fontSize:13,fontWeight:700,color:s.pending>0?'var(--gold)':'var(--muted)'}}>{s.pending.toLocaleString('ru')} ₽</div>
                </div>
              </div>
            </div>
            <div style={{padding:'8px 20px',borderBottom:'1px solid var(--bor)'}}>
              <div style={{display:'flex',justifyContent:'space-between',fontSize:10,color:'var(--muted)',marginBottom:3}}>
                <span>Выплачено {s.total>0?Math.round(s.paid/s.total*100):0}%</span>
                <span>{s.paid.toLocaleString('ru')} / {s.total.toLocaleString('ru')} ₽</span>
              </div>
              <div style={{height:4,background:'var(--bor2)',borderRadius:20,overflow:'hidden'}}>
                <div style={{height:'100%',width:`${s.total>0?Math.min(Math.round(s.paid/s.total*100),100):0}%`,background:gradient,borderRadius:20}}/>
              </div>
            </div>
            {s.byYear.map(({year,ye,yPaid,yPending,byMonth}) => {
              const yk = `${s.name}-${year}`
              const isYOpen = expandedYears.has(yk)
              return (
                <div key={year}>
                  <div onClick={()=>toggleYear(yk)} style={{display:'flex',alignItems:'center',gap:10,padding:'10px 20px',cursor:'pointer',borderTop:'1px solid var(--bor)',background:isYOpen?'rgba(0,0,0,.02)':'transparent'}}>
                    <svg viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.8" width="10" height="10" style={{transform:isYOpen?'rotate(90deg)':'none',transition:'transform .2s',color:'var(--muted)',flexShrink:0}}><polyline points="3,2 7,5 3,8"/></svg>
                    <span style={{fontSize:13,fontWeight:700}}>{year}</span>
                    <span style={{fontSize:11,color:'var(--muted)'}}>{ye.length} платежей</span>
                    <div style={{flex:1}}/>
                    <span style={{fontSize:12,fontWeight:700,color:'var(--green)',marginRight:16}}>{yPaid.toLocaleString('ru')} ₽ выплачено</span>
                    {yPending > 0 && <span style={{fontSize:12,fontWeight:700,color:'var(--gold)'}}>{yPending.toLocaleString('ru')} ₽ долг</span>}
                  </div>
                  {isYOpen && byMonth.map(({month,me,mPaid,mPending}) => {
                    const mk = `${s.name}-${year}-${month}`
                    const isMOpen = expandedMonths.has(mk)
                    return (
                      <div key={month}>
                        <div onClick={()=>toggleMonth(mk)} style={{display:'flex',alignItems:'center',gap:10,padding:'8px 20px 8px 36px',cursor:'pointer',borderTop:'1px solid var(--bor)',background:isMOpen?'rgba(177,94,204,.04)':'var(--surf2)'}}>
                          <svg viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.8" width="9" height="9" style={{transform:isMOpen?'rotate(90deg)':'none',transition:'transform .2s',color:'var(--muted)',flexShrink:0}}><polyline points="3,2 7,5 3,8"/></svg>
                          <span style={{fontSize:12,fontWeight:600}}>{MONTHS_FULL[month]}</span>
                          <span style={{fontSize:11,color:'var(--muted)'}}>{me.length} платежей</span>
                          <div style={{flex:1}}/>
                          {mPaid > 0 && <span style={{fontSize:11,fontWeight:600,color:'var(--green)',marginRight:12}}>{mPaid.toLocaleString('ru')} ₽</span>}
                          {mPending > 0 && <span style={{fontSize:11,fontWeight:600,color:'var(--gold)'}}>{mPending.toLocaleString('ru')} ₽ ожидается</span>}
                        </div>
                        {isMOpen && (
                          <table>
                            <thead><tr><th>Клиент</th><th>Дата план</th><th>Сумма план</th><th>Факт</th><th>Дата выплаты</th><th>Статус</th></tr></thead>
                            <tbody>
                              {me.map((e:any) => {
                                const client = clients.find(c => c.id === e.client_id)
                                return (
                                  <tr key={e.id} style={{opacity:e.is_paid?0.65:1}}>
                                    <td><div style={{fontSize:12,fontWeight:600}}>{client?.name??'—'}</div><div style={{fontSize:10,color:'var(--muted)'}}>{client?.country??''}</div></td>
                                    <td style={{fontSize:11,color:'var(--muted)'}}>{e.plan_date?new Date(e.plan_date).toLocaleDateString('ru-RU'):'—'}</td>
                                    <td><span className="num">{Number(e.plan_sum).toLocaleString('ru')} ₽</span></td>
                                    <td>{e.fact_sum?<span className="num g">{Number(e.fact_sum).toLocaleString('ru')} ₽</span>:<span style={{color:'var(--muted)'}}>—</span>}</td>
                                    <td style={{fontSize:11,color:'var(--muted)'}}>{e.fact_date?new Date(e.fact_date).toLocaleDateString('ru-RU'):'—'}</td>
                                    <td>{e.is_paid?<span className="pill pa"><span className="dot"/>Выплачен</span>:<span className="pill ps"><span className="dot"/>Ожидается</span>}</td>
                                  </tr>
                                )
                              })}
                            </tbody>
                          </table>
                        )}
                      </div>
                    )
                  })}
                </div>
              )
            })}
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="dash-wrap" style={{padding:'20px 28px 40px',position:'relative'}}>

      {/* Tooltip */}
      {tooltip && (
        <div style={{position:'absolute',left:tooltip.x,top:tooltip.y,transform:'translate(-50%,-100%)',background:'#14121e',color:'#fff',fontSize:11,fontWeight:600,padding:'5px 10px',borderRadius:7,pointerEvents:'none',zIndex:100,whiteSpace:'nowrap',boxShadow:'0 2px 8px rgba(0,0,0,.2)'}}>
          {tooltip.text}
          <div style={{position:'absolute',bottom:-4,left:'50%',transform:'translateX(-50%)',width:0,height:0,borderLeft:'4px solid transparent',borderRight:'4px solid transparent',borderTop:'4px solid #14121e'}}/>
        </div>
      )}

      {/* Переключатель месяца + табы */}
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:20}}>
        <div style={{display:'flex',alignItems:'center',gap:10}}>
          <button onClick={()=>shiftMonth(-1)} style={{width:28,height:28,border:'1px solid var(--bor2)',borderRadius:7,background:'#fff',display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer'}}>
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" width="12" height="12"><polyline points="10,4 6,8 10,12"/></svg>
          </button>
          <div style={{fontSize:15,fontWeight:700,color:'var(--text)',minWidth:160,textAlign:'center'}}>{MONTHS_FULL[viewMonth]} {viewYear}</div>
          <button onClick={()=>shiftMonth(1)} style={{width:28,height:28,border:'1px solid var(--bor2)',borderRadius:7,background:'#fff',display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer'}}>
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" width="12" height="12"><polyline points="6,4 10,8 6,12"/></svg>
          </button>
        </div>
        <div style={{display:'flex',gap:2,background:'var(--bg)',border:'1px solid var(--bor2)',borderRadius:9,padding:3}}>
          {(['overview','salespersons','curators'] as const).map(t => (
            <button key={t} onClick={()=>setTab(t)}
              style={{padding:'6px 14px',borderRadius:6,border:'none',fontSize:12,fontWeight:500,cursor:'pointer',fontFamily:'inherit',background:tab===t?'#fff':'transparent',color:tab===t?'var(--text)':'var(--muted)',boxShadow:tab===t?'var(--sh)':'none'}}>
              {t==='overview'?'Обзор':t==='salespersons'?'Продажники':'Кураторы'}
            </button>
          ))}
        </div>
      </div>

      {/* ОБЗОР */}
      {tab === 'overview' && (
        <>
          {/* KPI */}
          <div className="kg k4" style={{marginBottom:16}}>
            <div className="kc">
              <div className="kl">Клиентов всего</div>
              <div className="kv p">{clients.length}</div>
              <div className="ks">{clients.filter(c=>c.status==='active').length} активных · {clients.filter(c=>c.status==='completed').length} завершено</div>
            </div>
            <div className="kc">
              <div className="kl">Дебиторка (всего)</div>
              <div className="kv r" style={{fontSize:17}}>{debtorTotal.toLocaleString('ru')} ₽</div>
              <div className="ks">просрочено: {debtorOverdue.toLocaleString('ru')} ₽</div>
            </div>
            <div className="kc">
              <div className="kl">Кредиторка (всего)</div>
              <div className="kv o" style={{fontSize:17}}>{creditorTotal.toLocaleString('ru')} ₽</div>
              <div className="ks">кураторы: {creditorCurators.toLocaleString('ru')} ₽ · агенты: {creditorSales.toLocaleString('ru')} ₽</div>
            </div>
            <div className="kc">
              <div className="kl">Фикс. расходы/мес</div>
              <div className="kv" style={{fontSize:17}}>{Math.round(fixedMonthly).toLocaleString('ru')} ₽</div>
              <div className="ks">{fixedExpenses.length} активных статей</div>
            </div>
          </div>

          {/* График выручки — НАВЕРХУ */}
          <div style={{background:'#fff',border:'1px solid var(--bor)',borderRadius:14,padding:'18px 24px',marginBottom:16,boxShadow:'var(--sh)'}} onMouseLeave={()=>setTooltip(null)}>
            <div style={{fontSize:12,fontWeight:700,color:'var(--text)',marginBottom:4,display:'flex',alignItems:'center',justifyContent:'space-between'}}>
              <span>Выручка {currentYear}</span>
              <div style={{display:'flex',gap:16,fontSize:11,color:'var(--muted)'}}>
                <span style={{display:'flex',alignItems:'center',gap:5}}><span style={{width:10,height:3,background:'rgba(177,94,204,.3)',borderRadius:2,display:'inline-block'}}/>план</span>
                <span style={{display:'flex',alignItems:'center',gap:5}}><span style={{width:10,height:3,background:'var(--green)',borderRadius:2,display:'inline-block'}}/>факт</span>
              </div>
            </div>
            {/* Итоги за год */}
            <div style={{display:'flex',gap:24,marginBottom:14,padding:'8px 0',borderBottom:'1px solid var(--bor)'}}>
              <div style={{fontSize:11,color:'var(--muted)'}}>Год план: <strong style={{color:'var(--text)'}}>{yearTotalPlan.toLocaleString('ru')} ₽</strong></div>
              <div style={{fontSize:11,color:'var(--muted)'}}>Год факт: <strong style={{color:'var(--green)'}}>{yearTotalFact.toLocaleString('ru')} ₽</strong></div>
              <div style={{fontSize:11,color:'var(--muted)'}}>Выполнение: <strong style={{color:'var(--purple)'}}>{yearTotalPlan>0?Math.round(yearTotalFact/yearTotalPlan*100):0}%</strong></div>
              <div style={{fontSize:11,color:'var(--muted)'}}>Расходы: <strong style={{color:'var(--gold)'}}>{yearTotalExp.toLocaleString('ru')} ₽</strong></div>
            </div>
            <div style={{display:'flex',alignItems:'flex-end',gap:4,height:130}}>
              {monthlyData.map((m, i) => (
                <div key={i} style={{flex:1,display:'flex',flexDirection:'column',alignItems:'center',height:'100%',justifyContent:'flex-end'}}>
                  <div style={{width:'100%',display:'flex',gap:2,alignItems:'flex-end',height:110}}>
                    <div
                      onMouseEnter={e=>showTooltip(e,`${MONTHS_FULL[i]} план: ${m.plan.toLocaleString('ru')} ₽`)}
                      style={{flex:1,background:'rgba(177,94,204,.2)',borderRadius:'3px 3px 0 0',height:`${Math.round(m.plan/maxVal*100)}%`,minHeight:m.plan>0?2:0,cursor:'pointer',transition:'background .15s'}}
                      onMouseOver={e=>(e.currentTarget.style.background='rgba(177,94,204,.45)')}
                      onMouseOut={e=>(e.currentTarget.style.background='rgba(177,94,204,.2)')}
                    />
                    <div
                      onMouseEnter={e=>showTooltip(e,`${MONTHS_FULL[i]} факт: ${m.fact.toLocaleString('ru')} ₽`)}
                      style={{flex:1,background:'var(--green)',borderRadius:'3px 3px 0 0',height:`${Math.round(m.fact/maxVal*100)}%`,minHeight:m.fact>0?2:0,opacity:.85,cursor:'pointer',transition:'opacity .15s'}}
                      onMouseOver={e=>(e.currentTarget.style.opacity='1')}
                      onMouseOut={e=>(e.currentTarget.style.opacity='0.85')}
                    />
                  </div>
                  <div style={{fontSize:9,color:i===viewMonth&&currentYear===viewYear?'var(--purple)':'var(--muted)',fontWeight:i===viewMonth&&currentYear===viewYear?700:600,marginTop:4}}>{m.label}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Поступления месяца */}
          <div style={{background:'#fff',border:'1px solid var(--bor)',borderRadius:14,padding:'18px 24px',marginBottom:16,boxShadow:'var(--sh)'}}>
            <div style={{fontSize:12,fontWeight:700,color:'var(--text)',marginBottom:14}}>{MONTHS_FULL[viewMonth]} {viewYear} — поступления от клиентов</div>
            <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:16,marginBottom:14}}>
              <div>
                <div style={{fontSize:10,color:'var(--muted)',fontWeight:600,textTransform:'uppercase',letterSpacing:'0.04em',marginBottom:4}}>Ожидается всего</div>
                <div style={{fontSize:18,fontWeight:700}}>{monthExpected.toLocaleString('ru')} ₽</div>
                <div style={{fontSize:11,color:'var(--muted)',marginTop:2}}>{monthPayments.length} платежей</div>
              </div>
              <div>
                <div style={{fontSize:10,color:'var(--muted)',fontWeight:600,textTransform:'uppercase',letterSpacing:'0.04em',marginBottom:4}}>Получено</div>
                <div style={{fontSize:18,fontWeight:700,color:'var(--green)'}}>{monthReceived.toLocaleString('ru')} ₽</div>
                <div style={{fontSize:11,color:'var(--muted)',marginTop:2}}>{monthPayments.filter(p=>p.is_paid).length} оплачено</div>
              </div>
              <div>
                <div style={{fontSize:10,color:'var(--muted)',fontWeight:600,textTransform:'uppercase',letterSpacing:'0.04em',marginBottom:4}}>Ещё ожидается</div>
                <div style={{fontSize:18,fontWeight:700,color:monthOverdue>0?'var(--red)':'var(--gold)'}}>{monthUnpaid.toLocaleString('ru')} ₽</div>
                {monthOverdue > 0 && <div style={{fontSize:11,color:'var(--red)',marginTop:2,fontWeight:600}}>из них просрочка: {monthOverdue.toLocaleString('ru')} ₽</div>}
              </div>
              <div>
                <div style={{fontSize:10,color:'var(--muted)',fontWeight:600,textTransform:'uppercase',letterSpacing:'0.04em',marginBottom:4}}>Прибыль месяца</div>
                <div style={{fontSize:18,fontWeight:700,color:monthProfit>=0?'var(--purple)':'var(--red)'}}>{monthProfit.toLocaleString('ru')} ₽</div>
                <div style={{fontSize:11,color:'var(--muted)',marginTop:2}}>получено − расходы</div>
              </div>
            </div>
            <div style={{height:5,background:'var(--bor2)',borderRadius:20,overflow:'hidden',marginBottom:4}}>
              <div style={{height:'100%',width:`${monthExpected>0?Math.min(Math.round(monthReceived/monthExpected*100),100):0}%`,background:'linear-gradient(90deg,var(--green),#5fd6a4)',borderRadius:20}}/>
            </div>
            <div style={{fontSize:11,color:'var(--muted)'}}>Собрано {monthExpected>0?Math.round(monthReceived/monthExpected*100):0}% от плана месяца</div>
          </div>

          {/* Кто должен — раскрывается */}
          {monthDebtors.length > 0 && (
            <div style={{background:'#fff',border:'1px solid var(--bor)',borderRadius:14,marginBottom:16,boxShadow:'var(--sh)',overflow:'hidden'}}>
              <div onClick={()=>setDebtorsOpen(!debtorsOpen)}
                style={{padding:'14px 20px',display:'flex',alignItems:'center',gap:10,cursor:'pointer',background:'var(--surf2)',borderBottom:debtorsOpen?'1px solid var(--bor)':'none'}}>
                <svg viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.8" width="10" height="10"
                  style={{transform:debtorsOpen?'rotate(90deg)':'none',transition:'transform .2s',color:'var(--muted)',flexShrink:0}}>
                  <polyline points="3,2 7,5 3,8"/>
                </svg>
                <div style={{fontSize:12,fontWeight:700,color:'var(--text)'}}>Кто должен в {MONTHS_FULL[viewMonth]}</div>
                <span style={{fontSize:11,color:'var(--muted)',marginLeft:4}}>{monthDebtors.length} клиентов</span>
                <div style={{flex:1}}/>
                <span style={{fontSize:12,fontWeight:700,color:'var(--gold)'}}>{monthUnpaid.toLocaleString('ru')} ₽ всего</span>
                {monthOverdue > 0 && <span style={{fontSize:12,fontWeight:700,color:'var(--red)',marginLeft:12}}>{monthOverdue.toLocaleString('ru')} ₽ просрочка</span>}
              </div>
              {debtorsOpen && (
                <table>
                  <thead><tr>
                    <th>Клиент</th><th>Страна</th><th>К оплате в месяце</th><th>Из них просрочка</th>
                  </tr></thead>
                  <tbody>
                    {monthDebtors.map(c => (
                      <tr key={c.id}>
                        <td><span style={{fontSize:13,fontWeight:700}}>{c.name}</span></td>
                        <td style={{fontSize:12,color:'var(--muted)'}}>{c.country}</td>
                        <td><span className="num o">{c.unpaid.toLocaleString('ru')} ₽</span></td>
                        <td>{c.overdue>0?<span className="num r">{c.overdue.toLocaleString('ru')} ₽</span>:<span style={{color:'var(--muted)'}}>—</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {/* Расходы месяца */}
          <div style={{background:'#fff',border:'1px solid var(--bor)',borderRadius:14,padding:'18px 24px',boxShadow:'var(--sh)'}}>
            <div style={{fontSize:12,fontWeight:700,color:'var(--text)',marginBottom:12}}>Расходы в {MONTHS_FULL[viewMonth]} {viewYear}</div>
            <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:16,marginBottom:10}}>
              <div>
                <div style={{fontSize:10,color:'var(--muted)',fontWeight:600,textTransform:'uppercase',letterSpacing:'0.04em',marginBottom:4}}>Запланировано</div>
                <div style={{fontSize:16,fontWeight:700}}>{monthExpTotal.toLocaleString('ru')} ₽</div>
              </div>
              <div>
                <div style={{fontSize:10,color:'var(--muted)',fontWeight:600,textTransform:'uppercase',letterSpacing:'0.04em',marginBottom:4}}>Выплачено</div>
                <div style={{fontSize:16,fontWeight:700,color:'var(--muted)'}}>{monthExpPaid.toLocaleString('ru')} ₽</div>
              </div>
              <div>
                <div style={{fontSize:10,color:'var(--muted)',fontWeight:600,textTransform:'uppercase',letterSpacing:'0.04em',marginBottom:4}}>Осталось выплатить</div>
                <div style={{fontSize:16,fontWeight:700,color:monthExpPending>0?'var(--gold)':'var(--muted)'}}>{monthExpPending.toLocaleString('ru')} ₽</div>
              </div>
            </div>
            <div style={{fontSize:11,color:'var(--muted)',padding:'8px 0',borderTop:'1px solid var(--bor)'}}>
              + фиксированные расходы: <strong>{Math.round(fixedMonthly).toLocaleString('ru')} ₽/мес</strong>
              &nbsp;·&nbsp; итого расходов месяца: <strong style={{color:'var(--red)'}}>{(monthExpPaid + fixedMonthly).toLocaleString('ru', {maximumFractionDigits:0})} ₽</strong>
            </div>
          </div>
        </>
      )}

      {tab === 'salespersons' && renderStaffStats(salesStats, 'linear-gradient(135deg,#16a361,#0d7a49)')}
      {tab === 'curators' && renderStaffStats(curatorStats, 'linear-gradient(135deg,var(--purple),#8b3fa8)')}
    </div>
  )
}