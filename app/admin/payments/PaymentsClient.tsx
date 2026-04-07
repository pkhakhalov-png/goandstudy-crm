'use client'

import { useState } from 'react'
import { markPaymentPaid } from './actions'

const MONTHS = ['Янв','Фев','Мар','Апр','Май','Июн','Июл','Авг','Сен','Окт','Ноя','Дек']

interface Props {
  allPayments: any[]
  allClients: any[]
  salespersons: any[]
  curators: any[]
}

export function PaymentsClient({ allPayments, salespersons, curators }: Props) {
  const now = new Date()
  const [centerMonth, setCenterMonth] = useState(now.getMonth())
  const [centerYear, setCenterYear] = useState(now.getFullYear())
  const [filterSalesperson, setFilterSalesperson] = useState('')
  const [filterCurator, setFilterCurator] = useState('')
  const [filterOverdue, setFilterOverdue] = useState(false)
  const [filterSoon, setFilterSoon] = useState(false)
  const [filterDone, setFilterDone] = useState(false)
  const [collapsed, setCollapsed] = useState<Set<number>>(new Set())
  const [openForms, setOpenForms] = useState<Set<number>>(new Set())
  const [loading, setLoading] = useState<Set<number>>(new Set())

  function shiftMonth(dir: number) {
    let m = centerMonth + dir
    let y = centerYear
    if (m < 0) { m = 11; y-- }
    if (m > 11) { m = 0; y++ }
    setCenterMonth(m)
    setCenterYear(y)
  }

  function toggleCollapse(clientId: number) {
    setCollapsed(prev => {
      const next = new Set(prev)
      next.has(clientId) ? next.delete(clientId) : next.add(clientId)
      return next
    })
  }

  function toggleForm(paymentId: number) {
    setOpenForms(prev => {
      const next = new Set(prev)
      next.has(paymentId) ? next.delete(paymentId) : next.add(paymentId)
      return next
    })
  }

  async function handlePay(paymentId: number, formData: FormData) {
    setLoading(prev => new Set(prev).add(paymentId))
    await markPaymentPaid(formData)
    setLoading(prev => { const n = new Set(prev); n.delete(paymentId); return n })
    setOpenForms(prev => { const n = new Set(prev); n.delete(paymentId); return n })
  }

  // Группируем ВСЕ платежи по клиентам — каждый клиент один раз
  const clientsMap = new Map<number, { client: any, payments: any[] }>()
  allPayments.forEach((p: any) => {
    const cid = p.clients?.id
    if (!cid) return
    if (!clientsMap.has(cid)) clientsMap.set(cid, { client: p.clients, payments: [] })
    clientsMap.get(cid)!.payments.push(p)
  })

  // Фильтруем клиентов
  const clientGroups = Array.from(clientsMap.values()).filter(({ client, payments }) => {
    if (filterSalesperson && client.salesperson_id !== filterSalesperson) return false
    if (filterCurator && client.curator_id !== filterCurator) return false
    if (!filterDone && client.status === 'completed') return false
    if (filterOverdue && !payments.some(p => p.status === 'overdue')) return false
    if (filterSoon && !payments.some(p => p.status === 'soon')) return false
    return true
  })

  // Сортируем — активные с просрочкой вверху, потом скоро, потом остальные, завершённые внизу
  clientGroups.sort((a, b) => {
    const aOver = a.payments.some(p => p.status === 'overdue')
    const bOver = b.payments.some(p => p.status === 'overdue')
    const aSoon = a.payments.some(p => p.status === 'soon')
    const bSoon = b.payments.some(p => p.status === 'soon')
    const aDone = a.client.status === 'completed'
    const bDone = b.client.status === 'completed'
    if (aDone && !bDone) return 1
    if (!aDone && bDone) return -1
    if (aOver && !bOver) return -1
    if (!aOver && bOver) return 1
    if (aSoon && !bSoon) return -1
    if (!aSoon && bSoon) return 1
    return 0
  })

  // KPI
  const totalPlan = allPayments.reduce((s:number,p:any) => s+Number(p.plan_sum),0)
  const totalPaid = allPayments.filter((p:any)=>p.is_paid).reduce((s:number,p:any)=>s+Number(p.fact_sum||p.plan_sum),0)
  const totalOverdue = allPayments.filter((p:any)=>p.status==='overdue').reduce((s:number,p:any)=>s+Number(p.plan_sum),0)
  const totalSoon = allPayments.filter((p:any)=>p.status==='soon').reduce((s:number,p:any)=>s+Number(p.plan_sum),0)

  // Данные для навигатора
  function getMonthData(m: number, y: number) {
    const mp = allPayments.filter((p:any) => {
      const d = new Date(p.plan_date)
      return d.getMonth()===m && d.getFullYear()===y
    })
    const paid = mp.filter((p:any)=>p.is_paid).reduce((s:number,p:any)=>s+Number(p.fact_sum||p.plan_sum),0)
    const wait = mp.filter((p:any)=>!p.is_paid&&p.status!=='overdue').reduce((s:number,p:any)=>s+Number(p.plan_sum),0)
    const over = mp.filter((p:any)=>p.status==='overdue').reduce((s:number,p:any)=>s+Number(p.plan_sum),0)
    const total = mp.reduce((s:number,p:any)=>s+Number(p.plan_sum),0)
    const pct = total>0 ? Math.round(paid/total*100) : 0
    return { paid, wait, over, total, pct }
  }

  const statusLabel: Record<string,string> = { paid:'Оплачен', overdue:'Просрочен', soon:'Скоро', pending:'Ожидается' }
  const statusClass: Record<string,string> = { paid:'pa', overdue:'po', soon:'ps', pending:'pw' }
  const clientStatusLabel: Record<string,string> = { active:'Активный', completed:'Завершён', frozen:'Заморожен' }
  const clientStatusClass: Record<string,string> = { active:'pa', completed:'pd', frozen:'pw' }
  const today = new Date().toISOString().split('T')[0]

  const navMonths = [-2,-1,0,1,2,3].map(offset => {
    let m = centerMonth + offset
    let y = centerYear
    if (m<0){m+=12;y--}
    if (m>11){m-=12;y++}
    return {m, y, offset}
  })

  return (
    <div className="main">
      {/* KPI */}
      <div className="kw">
        <div className="kg k4">
          <div className="kc">
            <div className="kl">Всего по договорам</div>
            <div className="kv" style={{fontSize:17}}>{totalPlan.toLocaleString('ru')} ₽</div>
            <div className="ks">{allPayments.length} платежей</div>
          </div>
          <div className="kc">
            <div className="kl">Оплачено</div>
            <div className="kv g" style={{fontSize:17}}>{totalPaid.toLocaleString('ru')} ₽</div>
            <div className="ks">{allPayments.filter((p:any)=>p.is_paid).length} платежей</div>
          </div>
          <div className="kc">
            <div className="kl">Просрочено</div>
            <div className="kv r" style={{fontSize:17}}>{totalOverdue.toLocaleString('ru')} ₽</div>
            <div className="ks">{allPayments.filter((p:any)=>p.status==='overdue').length} платежей</div>
          </div>
          <div className="kc">
            <div className="kl">Скоро (7 дней)</div>
            <div className="kv o" style={{fontSize:17}}>{totalSoon.toLocaleString('ru')} ₽</div>
            <div className="ks">{allPayments.filter((p:any)=>p.status==='soon').length} платежей</div>
          </div>
        </div>
      </div>

      {/* Навигатор месяцев */}
      <div style={{display:'flex',alignItems:'center',gap:8,padding:'14px 28px',background:'var(--surf)',borderBottom:'1px solid var(--bor)'}}>
        <button onClick={()=>shiftMonth(-1)} style={{width:30,height:30,border:'1px solid var(--bor2)',borderRadius:8,background:'var(--surf)',display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer',flexShrink:0}}>
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" width="14" height="14"><polyline points="10,4 6,8 10,12"/></svg>
        </button>
        <div style={{fontSize:13,fontWeight:700,color:'var(--text)',padding:'0 4px'}}>{centerYear}</div>
        <div style={{display:'flex',gap:6,flex:1,overflow:'hidden'}}>
          {navMonths.map(({m,y,offset}) => {
            const isCur = m===now.getMonth()&&y===now.getFullYear()
            const isPast = y<now.getFullYear()||(y===now.getFullYear()&&m<now.getMonth())
            const md = getMonthData(m,y)
            return (
              <div key={`${m}-${y}`}
                style={{flex:1,background:isCur?'var(--pl)':'var(--surf2)',border:`1px solid ${isCur?'var(--purple)':'var(--bor)'}`,borderRadius:10,padding:'9px 10px',opacity:isPast?0.75:1,minWidth:0}}>
                <div style={{fontSize:10,fontWeight:700,color:isCur?'var(--purple)':'var(--muted)',textTransform:'uppercase',letterSpacing:'0.04em',marginBottom:4,whiteSpace:'nowrap'}}>{MONTHS[m]} {y}</div>
                {md.paid>0 && <div style={{fontSize:12,fontWeight:700,color:'var(--green)',whiteSpace:'nowrap'}}>{(md.paid/1000).toFixed(0)}к ₽</div>}
                {md.wait>0 && <div style={{fontSize:10,fontWeight:600,color:'var(--gold)',whiteSpace:'nowrap'}}>+{(md.wait/1000).toFixed(0)}к ₽</div>}
                {md.over>0 && <div style={{fontSize:10,fontWeight:600,color:'var(--red)',whiteSpace:'nowrap'}}>−{(md.over/1000).toFixed(0)}к ₽</div>}
                <div style={{height:3,background:'var(--bor2)',borderRadius:20,overflow:'hidden',marginTop:5}}>
                  <div style={{height:'100%',width:`${md.pct}%`,background:'linear-gradient(90deg,var(--green),#5fd6a4)',borderRadius:20}}></div>
                </div>
              </div>
            )
          })}
        </div>
        <button onClick={()=>shiftMonth(1)} style={{width:30,height:30,border:'1px solid var(--bor2)',borderRadius:8,background:'var(--surf)',display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer',flexShrink:0}}>
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" width="14" height="14"><polyline points="6,4 10,8 6,12"/></svg>
        </button>
      </div>

      {/* Фильтры */}
      <div style={{display:'flex',alignItems:'center',gap:8,padding:'10px 28px',background:'var(--surf2)',borderBottom:'1px solid var(--bor)',flexWrap:'wrap'}}>
        <span style={{fontSize:12,fontWeight:600,color:'var(--muted)'}}>Фильтр:</span>
        <select className="si" value={filterSalesperson} onChange={e=>setFilterSalesperson(e.target.value)}>
          <option value="">Все продажники</option>
          {salespersons.map((s:any) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <select className="si" value={filterCurator} onChange={e=>setFilterCurator(e.target.value)}>
          <option value="">Все кураторы</option>
          {curators.map((c:any) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <div style={{marginLeft:'auto',display:'flex',gap:6}}>
          <button onClick={()=>{setFilterOverdue(!filterOverdue);setFilterSoon(false)}}
            style={{padding:'5px 11px',borderRadius:8,fontSize:12,fontWeight:500,cursor:'pointer',border:`1px solid ${filterOverdue?'rgba(220,53,69,.25)':'var(--bor2)'}`,background:filterOverdue?'rgba(220,53,69,.08)':'var(--surf)',color:filterOverdue?'var(--red)':'var(--muted)',fontFamily:'inherit'}}>
            Просрочка
          </button>
          <button onClick={()=>{setFilterSoon(!filterSoon);setFilterOverdue(false)}}
            style={{padding:'5px 11px',borderRadius:8,fontSize:12,fontWeight:500,cursor:'pointer',border:`1px solid ${filterSoon?'rgba(201,125,0,.25)':'var(--bor2)'}`,background:filterSoon?'rgba(201,125,0,.08)':'var(--surf)',color:filterSoon?'var(--gold)':'var(--muted)',fontFamily:'inherit'}}>
            Скоро
          </button>
          <button onClick={()=>setFilterDone(!filterDone)}
            style={{padding:'5px 11px',borderRadius:8,fontSize:12,fontWeight:500,cursor:'pointer',border:`1px solid ${filterDone?'rgba(177,94,204,.25)':'var(--bor2)'}`,background:filterDone?'rgba(177,94,204,.08)':'var(--surf)',color:filterDone?'var(--purple)':'var(--muted)',fontFamily:'inherit'}}>
            Завершённые
          </button>
        </div>
      </div>

      {/* Список клиентов — каждый один раз со всеми платежами */}
      <div style={{flex:1,padding:'14px 28px 32px',overflowY:'auto'}}>
        {clientGroups.length === 0 && (
          <div style={{textAlign:'center',color:'var(--muted)',padding:48}}>Платежей нет</div>
        )}

        {clientGroups.map(({client, payments: cPayments}) => {
          const sortedPayments = [...cPayments].sort((a,b) => a.num - b.num)
          const paidCount = cPayments.filter((p:any)=>p.is_paid).length
          const totalCount = cPayments.length
          const pct = totalCount>0 ? Math.round(paidCount/totalCount*100) : 0
          const isDone = client.status==='completed'
          const isOpen = !collapsed.has(client.id)

          return (
            <div key={client.id} style={{marginBottom:8,border:'1px solid var(--bor)',borderRadius:14,background:'var(--surf)',overflow:'hidden',boxShadow:'var(--sh)',opacity:isDone?0.45:1}}>
              {/* Шапка */}
              <div onClick={()=>toggleCollapse(client.id)}
                style={{display:'flex',alignItems:'center',gap:12,padding:'10px 16px',background:'var(--surf2)',borderBottom:isOpen?'1px solid var(--bor)':'none',cursor:'pointer',userSelect:'none'}}>
                <div style={{width:18,height:18,borderRadius:5,border:'1px solid var(--bor2)',background:'var(--surf)',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
                  <svg viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.8" width="10" height="10"
                    style={{transform:isOpen?'rotate(90deg)':'none',transition:'transform 0.2s'}}>
                    <polyline points="3,2 7,5 3,8"/>
                  </svg>
                </div>
                <div>
                  <span style={{fontSize:13,fontWeight:700,color:'var(--text)'}}>{client.name}</span>
                  <span style={{fontSize:11,color:'var(--muted)',marginLeft:4}}>· {client.country}</span>
                </div>
                <div style={{flex:1}}></div>
                <div style={{display:'flex',alignItems:'center',gap:7,flexWrap:'wrap'}}>
                  {client.phone && <span style={{fontSize:10,padding:'3px 9px',borderRadius:6,background:'var(--bg)',color:'var(--muted)',border:'1px solid var(--bor2)',fontWeight:600}}>{client.phone}</span>}
                  {client.salesperson_name && <span className="stag">{client.salesperson_name}</span>}
                  {client.curator_name && <span className="ctag">{client.curator_name}</span>}
                  <div style={{display:'flex',alignItems:'center',gap:6}}>
                    <div style={{width:55,height:4,background:'var(--bor2)',borderRadius:20,overflow:'hidden'}}>
                      <div style={{height:'100%',width:`${pct}%`,background:'linear-gradient(90deg,var(--purple),#d47aff)',borderRadius:20}}></div>
                    </div>
                    <span style={{fontSize:11,fontWeight:700,color:pct===100?'var(--green)':'var(--purple)'}}>{pct}%</span>
                  </div>
                  <span className={`pill ${clientStatusClass[client.status]}`}>
                    <span className="dot"></span>
                    {clientStatusLabel[client.status]}
                  </span>
                </div>
              </div>

              {/* Все платежи клиента */}
              {isOpen && (
                <table>
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Дата план</th>
                      <th>Сумма план</th>
                      <th>Факт</th>
                      <th>Дата оплаты</th>
                      <th>Комментарий</th>
                      <th>Статус</th>
                      <th>✓</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedPayments.map((p:any) => {
                      const isFormOpen = openForms.has(p.id)
                      const isLoading = loading.has(p.id)
                      return (
                        <>
                          <tr key={p.id} style={{borderLeft:p.status==='paid'?'3px solid var(--green)':p.status==='overdue'?'3px solid var(--red)':p.status==='soon'?'3px solid var(--gold)':'none'}}>
                            <td style={{color:'var(--muted)',fontWeight:700,fontSize:11}}>{p.num}</td>
                            <td style={{color:p.status==='overdue'?'var(--red)':p.status==='soon'?'var(--gold)':'var(--text)',fontWeight:(p.status==='overdue'||p.status==='soon')?600:400}}>
                              {new Date(p.plan_date).toLocaleDateString('ru-RU')}
                            </td>
                            <td><span className="num">{Number(p.plan_sum).toLocaleString('ru')} ₽</span></td>
                            <td>{p.fact_sum?<span className="num g">{Number(p.fact_sum).toLocaleString('ru')} ₽</span>:<span style={{color:'var(--muted)'}}>—</span>}</td>
                            <td style={{fontSize:11,color:'var(--muted)'}}>{p.fact_date?new Date(p.fact_date).toLocaleDateString('ru-RU'):'—'}</td>
                            <td style={{fontSize:11,color:'var(--muted)'}}>{p.comment??'—'}</td>
                            <td><span className={`pill ${statusClass[p.status]}`}><span className="dot"></span>{statusLabel[p.status]}</span></td>
                            <td>
                              {p.is_paid ? (
                                <div style={{width:16,height:16,borderRadius:5,background:'var(--green)',display:'inline-flex',alignItems:'center',justifyContent:'center'}}>
                                  <svg viewBox="0 0 9 7" fill="none" stroke="white" strokeWidth="2" width="9" height="9"><polyline points="1,3.5 3.5,6 8,1"/></svg>
                                </div>
                              ) : (
                                <div onClick={()=>toggleForm(p.id)}
                                  style={{width:16,height:16,borderRadius:5,border:'1.5px solid var(--bor2)',display:'inline-flex',alignItems:'center',justifyContent:'center',cursor:'pointer',background:isFormOpen?'var(--pl)':'transparent'}}>
                                </div>
                              )}
                            </td>
                          </tr>
                          {isFormOpen && !p.is_paid && (
                            <tr key={`form-${p.id}`}>
                              <td colSpan={8} style={{padding:0,background:'var(--surf2)'}}>
                                <form action={(fd)=>handlePay(p.id,fd)} style={{padding:'12px 16px'}}>
                                  <input type="hidden" name="payment_id" value={p.id}/>
                                  <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 2fr auto',gap:8,alignItems:'flex-end'}}>
                                    <div>
                                      <div style={{fontSize:10,color:'var(--muted)',fontWeight:600,textTransform:'uppercase',letterSpacing:'0.04em',marginBottom:3}}>Дата оплаты</div>
                                      <input name="fact_date" type="date" defaultValue={today}
                                        style={{width:'100%',padding:'7px 10px',border:'1px solid var(--bor2)',borderRadius:7,fontSize:12,fontFamily:'inherit',outline:'none',background:'var(--surf)'}}/>
                                    </div>
                                    <div>
                                      <div style={{fontSize:10,color:'var(--muted)',fontWeight:600,textTransform:'uppercase',letterSpacing:'0.04em',marginBottom:3}}>Сумма факт</div>
                                      <input name="fact_sum" type="number" defaultValue={p.plan_sum}
                                        style={{width:'100%',padding:'7px 10px',border:'1px solid var(--bor2)',borderRadius:7,fontSize:12,fontFamily:'inherit',outline:'none',background:'var(--surf)'}}/>
                                    </div>
                                    <div>
                                      <div style={{fontSize:10,color:'var(--muted)',fontWeight:600,textTransform:'uppercase',letterSpacing:'0.04em',marginBottom:3}}>Комментарий</div>
                                      <input name="comment" placeholder="Способ оплаты..."
                                        style={{width:'100%',padding:'7px 10px',border:'1px solid var(--bor2)',borderRadius:7,fontSize:12,fontFamily:'inherit',outline:'none',background:'var(--surf)'}}/>
                                    </div>
                                    <div style={{display:'flex',gap:6}}>
                                      <button type="submit" disabled={isLoading}
                                        style={{padding:'7px 16px',background:'var(--green)',color:'#fff',border:'none',borderRadius:7,fontSize:12,fontWeight:600,cursor:'pointer',fontFamily:'inherit',opacity:isLoading?0.6:1}}>
                                        {isLoading?'...':'Сохранить'}
                                      </button>
                                      <button type="button" onClick={()=>toggleForm(p.id)}
                                        style={{padding:'7px 12px',background:'transparent',color:'var(--muted)',border:'1px solid var(--bor2)',borderRadius:7,fontSize:12,cursor:'pointer',fontFamily:'inherit'}}>
                                        Отмена
                                      </button>
                                    </div>
                                  </div>
                                </form>
                              </td>
                            </tr>
                          )}
                        </>
                      )
                    })}
                  </tbody>
                </table>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}