'use client'

import { useState } from 'react'
import { addExpense, markExpensePaid, markExpenseUnpaid, updateExpense, addFixedExpenseRecord, markFixedRecordPaid, markFixedRecordUnpaid } from './actions'

interface Props {
  clients: any[]
  expenses: any[]
  fixedExpenses: any[]
  fixedRecords: any[]
}

const MONTHS_RU = ['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь']

export function ExpensesClient({ clients, expenses, fixedExpenses, fixedRecords }: Props) {
  const now = new Date()
  const [tab, setTab] = useState<'all' | 'curators' | 'salespersons' | 'fixed'>('all')
  const [activeFilter, setActiveFilter] = useState<string>('all')
  const [collapsed, setCollapsed] = useState<Set<number>>(new Set())
  const [openPayForms, setOpenPayForms] = useState<Set<string>>(new Set())
  const [openEditForms, setOpenEditForms] = useState<Set<string>>(new Set())
  const [openAddForms, setOpenAddForms] = useState<Set<number>>(new Set())
  const [expandedYears, setExpandedYears] = useState<Set<string>>(new Set())
  const [expandedMonths, setExpandedMonths] = useState<Set<string>>(new Set())
  const [fixedMonth, setFixedMonth] = useState(`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`)
  const [openFixedForms, setOpenFixedForms] = useState<Set<string>>(new Set())
  const [openFixedPayForms, setOpenFixedPayForms] = useState<Set<string>>(new Set())

  function toggleYear(key: string) { setExpandedYears(prev => { const n = new Set(prev); n.has(key)?n.delete(key):n.add(key); return n }) }
  function toggleMonth(key: string) { setExpandedMonths(prev => { const n = new Set(prev); n.has(key)?n.delete(key):n.add(key); return n }) }
  function toggleCollapse(clientId: number) { setCollapsed(prev => { const n = new Set(prev); n.has(clientId)?n.delete(clientId):n.add(clientId); return n }) }
  function togglePayForm(e: React.MouseEvent, id: string) {
    e.stopPropagation()
    setOpenPayForms(prev => { const n = new Set(prev); n.has(id)?n.delete(id):n.add(id); return n })
    setOpenEditForms(prev => { const n = new Set(prev); n.delete(id); return n })
  }
  function toggleEditForm(e: React.MouseEvent, id: string) {
    e.stopPropagation()
    setOpenEditForms(prev => { const n = new Set(prev); n.has(id)?n.delete(id):n.add(id); return n })
    setOpenPayForms(prev => { const n = new Set(prev); n.delete(id); return n })
  }
  function toggleAddForm(e: React.MouseEvent, clientId: number) {
    e.stopPropagation()
    setOpenAddForms(prev => { const n = new Set(prev); n.has(clientId)?n.delete(clientId):n.add(clientId); return n })
  }

  const categories = ['curator', 'visa', 'salesperson', 'docs', 'other']
  const categoryLabel: Record<string,string> = { curator:'Куратор', visa:'Виза', salesperson:'Агент', docs:'Документы', other:'Прочее' }

  const clientsMap = new Map<number, { client: any, expenses: any[] }>()
  clients.forEach(c => clientsMap.set(c.id, { client: c, expenses: [] }))
  expenses.forEach((e: any) => { if (clientsMap.has(e.client_id)) clientsMap.get(e.client_id)!.expenses.push(e) })

  const filteredExpenses = activeFilter === 'all' ? expenses : expenses.filter((e:any) => e.article === activeFilter)
  const filteredClientsMap = new Map<number, { client: any, expenses: any[] }>()
  clients.forEach(c => filteredClientsMap.set(c.id, { client: c, expenses: [] }))
  filteredExpenses.forEach((e: any) => { if (filteredClientsMap.has(e.client_id)) filteredClientsMap.get(e.client_id)!.expenses.push(e) })
  const activeGroups = Array.from(filteredClientsMap.values()).filter(g => g.expenses.length > 0 && g.client.status !== 'completed')
  const doneGroups = Array.from(filteredClientsMap.values()).filter(g => g.expenses.length > 0 && g.client.status === 'completed')

  const totalPlan = expenses.reduce((s,e) => s+Number(e.plan_sum),0)
  const totalPaid = expenses.filter(e=>e.is_paid).reduce((s,e) => s+Number(e.fact_sum||e.plan_sum),0)
  const totalPending = expenses.filter(e=>!e.is_paid).reduce((s,e) => s+Number(e.plan_sum),0)
  const curatorPending = expenses.filter(e=>e.article==='curator'&&!e.is_paid).reduce((s,e)=>s+Number(e.plan_sum),0)
  const agentPending = expenses.filter(e=>e.article==='salesperson'&&!e.is_paid).reduce((s,e)=>s+Number(e.plan_sum),0)

  // Фиксированные расходы — сумма в месяц
  const fixedMonthly = fixedExpenses.reduce((s, e) => {
    if (e.period === 'monthly') return s + Number(e.amount)
    if (e.period === 'quarterly') return s + Number(e.amount) / 3
    if (e.period === 'yearly') return s + Number(e.amount) / 12
    return s
  }, 0)

  // Записи фиксированных расходов за выбранный месяц
  const fixedRecordsThisMonth = fixedRecords.filter(r => r.month === fixedMonth)
  const fixedRecordsPaid = fixedRecordsThisMonth.filter(r => r.is_paid).reduce((s,r) => s+Number(r.fact_amount||r.amount),0)
  const fixedRecordsPending = fixedRecordsThisMonth.filter(r => !r.is_paid).reduce((s,r) => s+Number(r.amount),0)

  const today = new Date().toISOString().split('T')[0]

  // Навигация по месяцам для фиксированных
  function shiftFixedMonth(dir: number) {
    const [y, m] = fixedMonth.split('-').map(Number)
    let nm = m + dir, ny = y
    if (nm < 1) { nm = 12; ny-- }
    if (nm > 12) { nm = 1; ny++ }
    setFixedMonth(`${ny}-${String(nm).padStart(2,'0')}`)
  }

  const fixedMonthLabel = (() => {
    const [y, m] = fixedMonth.split('-').map(Number)
    return `${MONTHS_RU[m-1]} ${y}`
  })()

  function buildStaffStats(article: string) {
    const staffExpenses = expenses.filter((e:any) => e.article === article)
    const names = [...new Set(staffExpenses.map((e:any) => e.who).filter(Boolean))] as string[]
    const unknown = staffExpenses.filter((e:any) => !e.who)
    if (unknown.length > 0) names.push('—')
    return names.map(name => {
      const mine = name === '—' ? unknown : staffExpenses.filter((e:any) => e.who === name)
      const paid = mine.filter((e:any) => e.is_paid).reduce((s:number,e:any) => s+Number(e.fact_sum||e.plan_sum),0)
      const pending = mine.filter((e:any) => !e.is_paid).reduce((s:number,e:any) => s+Number(e.plan_sum),0)
      const total = mine.reduce((s:number,e:any) => s+Number(e.plan_sum),0)
      const clientsCount = [...new Set(mine.map((e:any) => e.client_id))].length
      const years = [...new Set(mine.map((e:any) => new Date(e.plan_date || e.created_at || Date.now()).getFullYear()))].filter(y => y >= 2026).sort((a,b) => b-a)
      const byYear = years.map(year => {
        const yearExp = mine.filter((e:any) => new Date(e.plan_date || e.created_at || Date.now()).getFullYear() === year)
        const yearPaid = yearExp.filter((e:any)=>e.is_paid).reduce((s:number,e:any)=>s+Number(e.fact_sum||e.plan_sum),0)
        const yearPending = yearExp.filter((e:any)=>!e.is_paid).reduce((s:number,e:any)=>s+Number(e.plan_sum),0)
        const months = [...new Set(yearExp.map((e:any) => new Date(e.plan_date || e.created_at || Date.now()).getMonth()))].sort((a,b) => b-a)
        const byMonth = months.map(month => {
          const monthExp = yearExp.filter((e:any) => new Date(e.plan_date || e.created_at || Date.now()).getMonth() === month)
          return { month, monthExp, monthPaid: monthExp.filter((e:any)=>e.is_paid).reduce((s:number,e:any)=>s+Number(e.fact_sum||e.plan_sum),0), monthPending: monthExp.filter((e:any)=>!e.is_paid).reduce((s:number,e:any)=>s+Number(e.plan_sum),0) }
        })
        return { year, yearExp, yearPaid, yearPending, byMonth }
      })
      return { name, paid, pending, total, clientsCount, byYear }
    }).sort((a,b) => b.total - a.total)
  }

  function renderStaffTab(article: string) {
    const stats = buildStaffStats(article)
    const gradient = article === 'curator' ? 'linear-gradient(135deg,var(--purple),#8b3fa8)' : 'linear-gradient(135deg,#c97d00,#ffac02)'
    if (stats.length === 0) return <div style={{textAlign:'center',color:'var(--muted)',padding:48}}>Нет данных</div>
    return (
      <div>
        {stats.map(s => (
          <div key={s.name} style={{marginBottom:16,background:'#fff',border:'1px solid var(--bor)',borderRadius:14,overflow:'hidden',boxShadow:'var(--sh)'}}>
            <div style={{padding:'14px 20px',background:'var(--surf2)',borderBottom:'1px solid var(--bor)',display:'flex',alignItems:'center',gap:16}}>
              <div style={{width:38,height:38,borderRadius:'50%',background:gradient,display:'flex',alignItems:'center',justifyContent:'center',fontSize:13,color:'#fff',fontWeight:700,flexShrink:0}}>
                {s.name !== '—' ? s.name.slice(0,2).toUpperCase() : '?'}
              </div>
              <div>
                <div style={{fontSize:14,fontWeight:700,color:'var(--text)'}}>{s.name}</div>
                <div style={{fontSize:11,color:'var(--muted)',marginTop:2}}>{s.clientsCount} клиентов</div>
              </div>
              <div style={{flex:1}}/>
              <div style={{display:'flex',gap:24}}>
                <div style={{textAlign:'right'}}>
                  <div style={{fontSize:10,color:'var(--muted)',fontWeight:600,textTransform:'uppercase',letterSpacing:'0.04em',marginBottom:2}}>Выплачено</div>
                  <div style={{fontSize:16,fontWeight:700,color:'var(--green)'}}>{s.paid.toLocaleString('ru')} ₽</div>
                </div>
                <div style={{textAlign:'right'}}>
                  <div style={{fontSize:10,color:'var(--muted)',fontWeight:600,textTransform:'uppercase',letterSpacing:'0.04em',marginBottom:2}}>Должны</div>
                  <div style={{fontSize:16,fontWeight:700,color:s.pending>0?'var(--gold)':'var(--muted)'}}>{s.pending.toLocaleString('ru')} ₽</div>
                </div>
                <div style={{textAlign:'right'}}>
                  <div style={{fontSize:10,color:'var(--muted)',fontWeight:600,textTransform:'uppercase',letterSpacing:'0.04em',marginBottom:2}}>Всего</div>
                  <div style={{fontSize:16,fontWeight:700}}>{s.total.toLocaleString('ru')} ₽</div>
                </div>
              </div>
            </div>
            <div style={{padding:'10px 20px',borderBottom:'1px solid var(--bor)'}}>
              <div style={{display:'flex',justifyContent:'space-between',fontSize:10,color:'var(--muted)',marginBottom:4}}>
                <span>Выплачено {s.total>0?Math.round(s.paid/s.total*100):0}%</span>
                <span>{s.paid.toLocaleString('ru')} / {s.total.toLocaleString('ru')} ₽</span>
              </div>
              <div style={{height:5,background:'var(--bor2)',borderRadius:20,overflow:'hidden'}}>
                <div style={{height:'100%',width:`${s.total>0?Math.round(s.paid/s.total*100):0}%`,background:gradient,borderRadius:20}}/>
              </div>
            </div>
            <div style={{padding:'8px 0'}}>
              {s.byYear.length === 0 && <div style={{padding:'12px 20px',fontSize:12,color:'var(--muted)'}}>Нет данных с 2026</div>}
              {s.byYear.map(({year,yearExp,yearPaid,yearPending,byMonth}) => {
                const yk = `${s.name}-${year}`
                const isYOpen = expandedYears.has(yk)
                return (
                  <div key={year}>
                    <div onClick={()=>toggleYear(yk)} style={{display:'flex',alignItems:'center',gap:10,padding:'10px 20px',cursor:'pointer',borderTop:'1px solid var(--bor)',background:isYOpen?'rgba(177,94,204,.03)':'transparent'}}>
                      <svg viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.8" width="10" height="10" style={{transform:isYOpen?'rotate(90deg)':'none',transition:'transform 0.2s',color:'var(--muted)',flexShrink:0}}><polyline points="3,2 7,5 3,8"/></svg>
                      <span style={{fontSize:13,fontWeight:700}}>{year}</span>
                      <span style={{fontSize:11,color:'var(--muted)'}}>{yearExp.length} платежей</span>
                      <div style={{flex:1}}/>
                      <span style={{fontSize:12,fontWeight:700,color:'var(--green)',marginRight:16}}>{yearPaid.toLocaleString('ru')} ₽ выплачено</span>
                      {yearPending > 0 && <span style={{fontSize:12,fontWeight:700,color:'var(--gold)'}}>{yearPending.toLocaleString('ru')} ₽ должны</span>}
                    </div>
                    {isYOpen && byMonth.map(({month,monthExp,monthPaid,monthPending}) => {
                      const mk = `${s.name}-${year}-${month}`
                      const isMOpen = expandedMonths.has(mk)
                      return (
                        <div key={month}>
                          <div onClick={()=>toggleMonth(mk)} style={{display:'flex',alignItems:'center',gap:10,padding:'8px 20px 8px 36px',cursor:'pointer',borderTop:'1px solid var(--bor)',background:isMOpen?'rgba(177,94,204,.05)':'var(--surf2)'}}>
                            <svg viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.8" width="9" height="9" style={{transform:isMOpen?'rotate(90deg)':'none',transition:'transform 0.2s',color:'var(--muted)',flexShrink:0}}><polyline points="3,2 7,5 3,8"/></svg>
                            <span style={{fontSize:12,fontWeight:600}}>{MONTHS_RU[month]}</span>
                            <span style={{fontSize:11,color:'var(--muted)'}}>{monthExp.length} платежей</span>
                            <div style={{flex:1}}/>
                            {monthPaid > 0 && <span style={{fontSize:11,fontWeight:600,color:'var(--green)',marginRight:12}}>{monthPaid.toLocaleString('ru')} ₽</span>}
                            {monthPending > 0 && <span style={{fontSize:11,fontWeight:600,color:'var(--gold)'}}>{monthPending.toLocaleString('ru')} ₽ ожидается</span>}
                          </div>
                          {isMOpen && (
                            <table>
                              <thead><tr><th>Клиент</th><th>Дата план</th><th>Сумма план</th><th>Факт</th><th>Дата выплаты</th><th>Статус</th></tr></thead>
                              <tbody>
                                {monthExp.map((e:any) => {
                                  const client = clients.find(cl => cl.id === e.client_id)
                                  return (
                                    <tr key={e.id} style={{opacity:e.is_paid?0.65:1}}>
                                      <td><div style={{fontSize:12,fontWeight:600}}>{client?.name??'—'}</div><div style={{fontSize:10,color:'var(--muted)'}}>{client?.country??''}</div></td>
                                      <td style={{fontSize:11,color:'var(--muted)'}}>{e.plan_date?new Date(e.plan_date).toLocaleDateString('ru-RU'):'—'}</td>
                                      <td><span className="num">{Number(e.plan_sum).toLocaleString('ru')} ₽</span></td>
                                      <td>{e.fact_sum?<span className="num m">{Number(e.fact_sum).toLocaleString('ru')} ₽</span>:<span style={{color:'var(--muted)'}}>—</span>}</td>
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
          </div>
        ))}
      </div>
    )
  }

  function renderGroup(group: { client: any, expenses: any[] }, isDone: boolean) {
    const { client, expenses: cExp } = group
    const allClientExp = clientsMap.get(client.id)?.expenses ?? []
    const isOpen = !collapsed.has(client.id)
    const isAddOpen = openAddForms.has(client.id)
    const totalDebt = allClientExp.filter(e=>!e.is_paid).reduce((s,e)=>s+Number(e.plan_sum),0)
    const totalPaidC = allClientExp.filter(e=>e.is_paid).reduce((s,e)=>s+Number(e.fact_sum||e.plan_sum),0)
    return (
      <div key={client.id} style={{marginBottom:8,border:'1px solid var(--bor)',borderRadius:14,background:'var(--surf)',overflow:'hidden',boxShadow:'var(--sh)',opacity:isDone?0.5:1}}>
        <div onClick={()=>toggleCollapse(client.id)} style={{display:'flex',alignItems:'center',gap:12,padding:'10px 16px',background:'var(--surf2)',borderBottom:isOpen?'1px solid var(--bor)':'none',cursor:'pointer',userSelect:'none'}}>
          <div style={{width:18,height:18,borderRadius:5,border:'1px solid var(--bor2)',background:'var(--surf)',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
            <svg viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.8" width="10" height="10" style={{transform:isOpen?'rotate(90deg)':'none',transition:'transform 0.2s'}}><polyline points="3,2 7,5 3,8"/></svg>
          </div>
          <div>
            <span style={{fontSize:13,fontWeight:700,color:'var(--text)'}}>{client.name}</span>
            <span style={{fontSize:11,color:'var(--muted)',marginLeft:4}}>· {client.country}</span>
          </div>
          <div style={{flex:1}}/>
          <div style={{display:'flex',alignItems:'center',gap:8}}>
            {totalDebt > 0 && <span style={{fontSize:11,fontWeight:700,color:'var(--gold)'}}>{totalDebt.toLocaleString('ru')} ₽ к выплате</span>}
            {totalPaidC > 0 && <span style={{fontSize:11,fontWeight:600,color:'var(--muted)'}}>{totalPaidC.toLocaleString('ru')} ₽ выплачено</span>}
            <button onClick={(e)=>toggleAddForm(e, client.id)} style={{padding:'4px 10px',background:isAddOpen?'var(--bg)':'var(--purple)',color:isAddOpen?'var(--muted)':'#fff',border:isAddOpen?'1px solid var(--bor2)':'none',borderRadius:7,fontSize:11,fontWeight:600,cursor:'pointer',fontFamily:'inherit'}}>
              {isAddOpen ? 'Отмена' : '+ Расход'}
            </button>
          </div>
        </div>
        {isAddOpen && (
          <div style={{padding:'12px 16px',background:'rgba(177,94,204,.04)',borderBottom:'1px solid var(--bor)'}} onClick={e=>e.stopPropagation()}>
            <form action={async(fd)=>{await addExpense(fd);setOpenAddForms(prev=>{const n=new Set(prev);n.delete(client.id);return n})}}>
              <input type="hidden" name="client_id" value={client.id}/>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr 1fr auto',gap:8,alignItems:'flex-end'}}>
                <div>
                  <div style={{fontSize:10,color:'var(--muted)',fontWeight:600,textTransform:'uppercase',letterSpacing:'0.04em',marginBottom:3}}>Статья *</div>
                  <select name="article" required style={{width:'100%',padding:'7px 10px',border:'1px solid var(--bor2)',borderRadius:7,fontSize:12,fontFamily:'inherit',outline:'none',background:'var(--surf)'}}>
                    {categories.map(c => <option key={c} value={c}>{categoryLabel[c]}</option>)}
                  </select>
                </div>
                <div>
                  <div style={{fontSize:10,color:'var(--muted)',fontWeight:600,textTransform:'uppercase',letterSpacing:'0.04em',marginBottom:3}}>Кому</div>
                  <input name="who" placeholder="Аня, Посольство..." style={{width:'100%',padding:'7px 10px',border:'1px solid var(--bor2)',borderRadius:7,fontSize:12,fontFamily:'inherit',outline:'none',background:'var(--surf)'}}/>
                </div>
                <div>
                  <div style={{fontSize:10,color:'var(--muted)',fontWeight:600,textTransform:'uppercase',letterSpacing:'0.04em',marginBottom:3}}>Сумма *</div>
                  <input name="plan_sum" type="number" required placeholder="25000" style={{width:'100%',padding:'7px 10px',border:'1px solid var(--bor2)',borderRadius:7,fontSize:12,fontFamily:'inherit',outline:'none',background:'var(--surf)'}}/>
                </div>
                <div>
                  <div style={{fontSize:10,color:'var(--muted)',fontWeight:600,textTransform:'uppercase',letterSpacing:'0.04em',marginBottom:3}}>Дата план</div>
                  <input name="plan_date" type="date" style={{width:'100%',padding:'7px 10px',border:'1px solid var(--bor2)',borderRadius:7,fontSize:12,fontFamily:'inherit',outline:'none',background:'var(--surf)'}}/>
                </div>
                <button type="submit" style={{padding:'7px 16px',background:'var(--purple)',color:'#fff',border:'none',borderRadius:7,fontSize:12,fontWeight:600,cursor:'pointer',fontFamily:'inherit'}}>Добавить</button>
              </div>
            </form>
          </div>
        )}
        {isOpen && (
          <table>
            <thead><tr><th>Статья</th><th>Кому</th><th>Дата план</th><th>Сумма план</th><th>Факт</th><th>Дата выплаты</th><th>Статус</th><th style={{width:60}}>✓</th></tr></thead>
            <tbody>
              {cExp.length === 0 && <tr><td colSpan={8} style={{textAlign:'center',color:'var(--muted)',padding:20,fontSize:12}}>Нет расходов</td></tr>}
              {cExp.map((e:any) => {
                const isPayOpen = openPayForms.has(e.id)
                const isEditOpen = openEditForms.has(e.id)
                return (
                  <>
                    <tr key={e.id} style={{opacity:e.is_paid?0.65:1}}>
                      <td>
                        <span style={{display:'inline-block',padding:'3px 9px',borderRadius:6,fontSize:10,fontWeight:600,
                          background:e.article==='curator'?'rgba(177,94,204,.09)':e.article==='salesperson'?'rgba(201,125,0,.08)':'rgba(20,18,30,.04)',
                          color:e.article==='curator'?'var(--purple)':e.article==='salesperson'?'var(--gold)':'var(--muted)',
                          border:e.article==='curator'?'1px solid rgba(177,94,204,.2)':e.article==='salesperson'?'1px solid rgba(201,125,0,.2)':'1px solid var(--bor2)'}}>
                          {categoryLabel[e.article]??e.article}
                        </span>
                      </td>
                      <td style={{fontSize:11,color:e.article==='curator'?'var(--purple)':e.article==='salesperson'?'var(--gold)':'var(--muted)',fontWeight:(e.article==='curator'||e.article==='salesperson')?600:400}}>{e.who??'—'}</td>
                      <td style={{fontSize:11,color:'var(--muted)'}}>{e.plan_date?new Date(e.plan_date).toLocaleDateString('ru-RU'):'—'}</td>
                      <td><span className="num" style={{cursor:'pointer',textDecoration:'underline dotted'}} onClick={(ev)=>toggleEditForm(ev,e.id)}>{Number(e.plan_sum).toLocaleString('ru')} ₽</span></td>
                      <td>{e.fact_sum?<span className="num m">{Number(e.fact_sum).toLocaleString('ru')} ₽</span>:<span style={{color:'var(--muted)'}}>—</span>}</td>
                      <td style={{fontSize:11,color:'var(--muted)'}}>{e.fact_date?new Date(e.fact_date).toLocaleDateString('ru-RU'):'—'}</td>
                      <td>{e.is_paid?<span className="pill pa"><span className="dot"/>Выплачен</span>:<span className="pill ps"><span className="dot"/>Ожидается</span>}</td>
                      <td onClick={(ev)=>ev.stopPropagation()} style={{textAlign:'center'}}>
                        {e.is_paid ? (
                          <form action={markExpenseUnpaid} style={{display:'inline'}}>
                            <input type="hidden" name="expense_id" value={e.id}/>
                            <button type="submit" style={{width:16,height:16,borderRadius:5,background:'var(--green)',border:'none',display:'inline-flex',alignItems:'center',justifyContent:'center',cursor:'pointer',padding:0}}>
                              <svg viewBox="0 0 9 7" fill="none" stroke="white" strokeWidth="2" width="9" height="9"><polyline points="1,3.5 3.5,6 8,1"/></svg>
                            </button>
                          </form>
                        ) : (
                          <div onClick={(ev)=>togglePayForm(ev,e.id)} style={{width:16,height:16,borderRadius:5,border:'1.5px solid var(--bor2)',display:'inline-flex',alignItems:'center',justifyContent:'center',cursor:'pointer',background:isPayOpen?'var(--pl)':'transparent',margin:'0 auto'}}/>
                        )}
                      </td>
                    </tr>
                    {isEditOpen && (
                      <tr key={`edit-${e.id}`}>
                        <td colSpan={8} style={{padding:0,background:'var(--surf2)'}} onClick={(ev)=>ev.stopPropagation()}>
                          <form action={async(fd)=>{await updateExpense(fd);setOpenEditForms(prev=>{const n=new Set(prev);n.delete(e.id);return n})}} style={{padding:'12px 16px'}}>
                            <input type="hidden" name="expense_id" value={e.id}/>
                            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr auto',gap:8,alignItems:'flex-end'}}>
                              <div>
                                <div style={{fontSize:10,color:'var(--muted)',fontWeight:600,textTransform:'uppercase',letterSpacing:'0.04em',marginBottom:3}}>Сумма план</div>
                                <input name="plan_sum" type="number" defaultValue={e.plan_sum} style={{width:'100%',padding:'7px 10px',border:'1px solid var(--bor2)',borderRadius:7,fontSize:12,fontFamily:'inherit',outline:'none',background:'var(--surf)'}}/>
                              </div>
                              <div>
                                <div style={{fontSize:10,color:'var(--muted)',fontWeight:600,textTransform:'uppercase',letterSpacing:'0.04em',marginBottom:3}}>Кому</div>
                                <input name="who" defaultValue={e.who??''} style={{width:'100%',padding:'7px 10px',border:'1px solid var(--bor2)',borderRadius:7,fontSize:12,fontFamily:'inherit',outline:'none',background:'var(--surf)'}}/>
                              </div>
                              <div>
                                <div style={{fontSize:10,color:'var(--muted)',fontWeight:600,textTransform:'uppercase',letterSpacing:'0.04em',marginBottom:3}}>Дата план</div>
                                <input name="plan_date" type="date" defaultValue={e.plan_date??''} style={{width:'100%',padding:'7px 10px',border:'1px solid var(--bor2)',borderRadius:7,fontSize:12,fontFamily:'inherit',outline:'none',background:'var(--surf)'}}/>
                              </div>
                              <div style={{display:'flex',gap:6}}>
                                <button type="submit" style={{padding:'7px 16px',background:'var(--purple)',color:'#fff',border:'none',borderRadius:7,fontSize:12,fontWeight:600,cursor:'pointer',fontFamily:'inherit'}}>Сохранить</button>
                                <button type="button" onClick={(ev)=>toggleEditForm(ev,e.id)} style={{padding:'7px 12px',background:'transparent',color:'var(--muted)',border:'1px solid var(--bor2)',borderRadius:7,fontSize:12,cursor:'pointer',fontFamily:'inherit'}}>Отмена</button>
                              </div>
                            </div>
                          </form>
                        </td>
                      </tr>
                    )}
                    {isPayOpen && !e.is_paid && (
                      <tr key={`pay-${e.id}`}>
                        <td colSpan={8} style={{padding:0,background:'var(--surf2)'}} onClick={(ev)=>ev.stopPropagation()}>
                          <form action={async(fd)=>{await markExpensePaid(fd);setOpenPayForms(prev=>{const n=new Set(prev);n.delete(e.id);return n})}} style={{padding:'12px 16px'}}>
                            <input type="hidden" name="expense_id" value={e.id}/>
                            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr auto',gap:8,alignItems:'flex-end'}}>
                              <div>
                                <div style={{fontSize:10,color:'var(--muted)',fontWeight:600,textTransform:'uppercase',letterSpacing:'0.04em',marginBottom:3}}>Дата выплаты</div>
                                <input name="fact_date" type="date" defaultValue={today} style={{width:'100%',padding:'7px 10px',border:'1px solid var(--bor2)',borderRadius:7,fontSize:12,fontFamily:'inherit',outline:'none',background:'var(--surf)'}}/>
                              </div>
                              <div>
                                <div style={{fontSize:10,color:'var(--muted)',fontWeight:600,textTransform:'uppercase',letterSpacing:'0.04em',marginBottom:3}}>Сумма факт</div>
                                <input name="fact_sum" type="number" defaultValue={e.plan_sum} style={{width:'100%',padding:'7px 10px',border:'1px solid var(--bor2)',borderRadius:7,fontSize:12,fontFamily:'inherit',outline:'none',background:'var(--surf)'}}/>
                              </div>
                              <div style={{display:'flex',gap:6}}>
                                <button type="submit" style={{padding:'7px 16px',background:'var(--green)',color:'#fff',border:'none',borderRadius:7,fontSize:12,fontWeight:600,cursor:'pointer',fontFamily:'inherit'}}>Выплачено</button>
                                <button type="button" onClick={(ev)=>togglePayForm(ev,e.id)} style={{padding:'7px 12px',background:'transparent',color:'var(--muted)',border:'1px solid var(--bor2)',borderRadius:7,fontSize:12,cursor:'pointer',fontFamily:'inherit'}}>Отмена</button>
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
  }

  return (
    <>
      {/* KPI */}
      <div className="kw">
        <div className="kg k4" style={{marginBottom:14}}>
          <div className="kc">
            <div className="kl">Всего расходов (план)</div>
            <div className="kv" style={{fontSize:17}}>{totalPlan.toLocaleString('ru')} ₽</div>
            <div className="ks">{expenses.length} позиций</div>
          </div>
          <div className="kc">
            <div className="kl">Выплачено</div>
            <div className="kv m" style={{fontSize:17,color:'var(--muted)'}}>{totalPaid.toLocaleString('ru')} ₽</div>
            <div className="ks">закрытые расходы</div>
          </div>
          <div className="kc">
            <div className="kl">К выплате</div>
            <div className="kv o" style={{fontSize:17}}>{totalPending.toLocaleString('ru')} ₽</div>
            <div className="ks">кредиторка</div>
          </div>
          <div className="kc">
            <div className="kl">Фикс. расходы/мес</div>
            <div className="kv p" style={{fontSize:17}}>{Math.round(fixedMonthly).toLocaleString('ru')} ₽</div>
            <div className="ks">кураторы долг: {curatorPending.toLocaleString('ru')} ₽</div>
          </div>
        </div>
      </div>

      {/* Табы */}
      <div style={{display:'flex',alignItems:'center',gap:8,padding:'0 28px 12px',borderBottom:'1px solid var(--bor)',background:'var(--surf)',flexWrap:'wrap'}}>
        <div style={{display:'flex',gap:2,background:'var(--bg)',border:'1px solid var(--bor2)',borderRadius:9,padding:3}}>
          {(['all','fixed','curators','salespersons'] as const).map(t => (
            <button key={t} onClick={()=>setTab(t)}
              style={{padding:'6px 14px',borderRadius:6,border:'none',fontSize:12,fontWeight:500,cursor:'pointer',fontFamily:'inherit',background:tab===t?'#fff':'transparent',color:tab===t?'var(--text)':'var(--muted)',boxShadow:tab===t?'var(--sh)':'none'}}>
              {t==='all'?'Все расходы':t==='fixed'?'Фиксированные':t==='curators'?'Кураторы':'Продажники'}
            </button>
          ))}
        </div>
        {tab === 'all' && (
          <div style={{display:'flex',gap:6,marginLeft:8,flexWrap:'wrap'}}>
            {['all','curator','visa','salesperson','docs','other'].map(f => (
              <button key={f} onClick={()=>setActiveFilter(f)}
                style={{padding:'5px 12px',borderRadius:20,fontSize:11,fontWeight:600,cursor:'pointer',fontFamily:'inherit',border:`1px solid ${activeFilter===f?'var(--purple)':'var(--bor2)'}`,background:activeFilter===f?'var(--pl)':'var(--surf)',color:activeFilter===f?'var(--purple)':'var(--muted)'}}>
                {f==='all'?'Все':f==='curator'?'Куратор':f==='visa'?'Виза':f==='salesperson'?'Агент':f==='docs'?'Документы':'Прочее'}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Контент */}
      <div style={{flex:1,padding:'14px 28px 32px',overflowY:'auto'}}>

        {/* ФИКСИРОВАННЫЕ РАСХОДЫ */}
        {tab === 'fixed' && (
          <div>
            {/* Навигатор месяца */}
            <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:16}}>
              <button onClick={()=>shiftFixedMonth(-1)} style={{width:28,height:28,border:'1px solid var(--bor2)',borderRadius:7,background:'#fff',display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer'}}>
                <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" width="12" height="12"><polyline points="10,4 6,8 10,12"/></svg>
              </button>
              <div style={{fontSize:14,fontWeight:700,color:'var(--text)',minWidth:140,textAlign:'center'}}>{fixedMonthLabel}</div>
              <button onClick={()=>shiftFixedMonth(1)} style={{width:28,height:28,border:'1px solid var(--bor2)',borderRadius:7,background:'#fff',display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer'}}>
                <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" width="12" height="12"><polyline points="6,4 10,8 6,12"/></svg>
              </button>
              <div style={{marginLeft:'auto',display:'flex',gap:16,fontSize:12}}>
                <span style={{color:'var(--muted)'}}>Выплачено: <strong style={{color:'var(--green)'}}>{fixedRecordsPaid.toLocaleString('ru')} ₽</strong></span>
                <span style={{color:'var(--muted)'}}>Осталось: <strong style={{color:fixedRecordsPending>0?'var(--gold)':'var(--muted)'}}>{fixedRecordsPending.toLocaleString('ru')} ₽</strong></span>
                <span style={{color:'var(--muted)'}}>Норма/мес: <strong>{Math.round(fixedMonthly).toLocaleString('ru')} ₽</strong></span>
              </div>
            </div>

            {/* Список статей */}
            {fixedExpenses.length === 0 && (
              <div style={{textAlign:'center',color:'var(--muted)',padding:48}}>Нет фиксированных расходов — добавьте в Настройках</div>
            )}
            {fixedExpenses.map(fe => {
              const records = fixedRecordsThisMonth.filter(r => r.fixed_expense_id === fe.id)
              const isAddOpen = openFixedForms.has(fe.id)
              const articleColors: Record<string,string> = { office:'rgba(22,163,97,.08)', salary:'rgba(177,94,204,.08)', software:'rgba(201,125,0,.08)', marketing:'rgba(220,53,69,.08)', other:'rgba(20,18,30,.04)' }
              const articleTextColors: Record<string,string> = { office:'var(--green)', salary:'var(--purple)', software:'var(--gold)', marketing:'var(--red)', other:'var(--muted)' }
              const articleLabel: Record<string,string> = { office:'Офис', salary:'ЗП', software:'ПО/Подписки', marketing:'Маркетинг', other:'Прочее' }
              const periodLabel: Record<string,string> = { monthly:'Ежемесячно', quarterly:'Ежеквартально', yearly:'Ежегодно', once:'Разово' }

              return (
                <div key={fe.id} style={{marginBottom:8,background:'#fff',border:'1px solid var(--bor)',borderRadius:14,overflow:'hidden',boxShadow:'var(--sh)'}}>
                  {/* Шапка статьи */}
                  <div style={{display:'flex',alignItems:'center',gap:12,padding:'12px 16px',background:'var(--surf2)',borderBottom:'1px solid var(--bor)'}}>
                    <div style={{flex:1}}>
                      <div style={{fontSize:13,fontWeight:700,color:'var(--text)'}}>{fe.name}</div>
                      <div style={{display:'flex',gap:8,marginTop:3}}>
                        <span style={{fontSize:10,padding:'2px 7px',borderRadius:5,background:articleColors[fe.article]||'rgba(20,18,30,.04)',color:articleTextColors[fe.article]||'var(--muted)',fontWeight:600,border:'1px solid rgba(0,0,0,.06)'}}>
                          {articleLabel[fe.article]||fe.article}
                        </span>
                        <span style={{fontSize:10,color:'var(--muted)',fontWeight:500}}>{periodLabel[fe.period]||fe.period}</span>
                      </div>
                    </div>
                    <div style={{textAlign:'right',marginRight:16}}>
                      <div style={{fontSize:13,fontWeight:700,color:'var(--text)'}}>{Number(fe.amount).toLocaleString('ru')} ₽</div>
                      <div style={{fontSize:10,color:'var(--muted)'}}>за период</div>
                    </div>
                    <button
                      onClick={()=>setOpenFixedForms(prev=>{const n=new Set(prev);n.has(fe.id)?n.delete(fe.id):n.add(fe.id);return n})}
                      style={{padding:'5px 12px',background:isAddOpen?'var(--bg)':'var(--purple)',color:isAddOpen?'var(--muted)':'#fff',border:isAddOpen?'1px solid var(--bor2)':'none',borderRadius:7,fontSize:11,fontWeight:600,cursor:'pointer',fontFamily:'inherit'}}>
                      {isAddOpen?'Отмена':'+ Добавить запись'}
                    </button>
                  </div>

                  {/* Форма добавления записи */}
                  {isAddOpen && (
                    <div style={{padding:'12px 16px',background:'rgba(177,94,204,.04)',borderBottom:'1px solid var(--bor)'}}>
                      <form action={async(fd)=>{await addFixedExpenseRecord(fd);setOpenFixedForms(prev=>{const n=new Set(prev);n.delete(fe.id);return n})}}>
                        <input type="hidden" name="fixed_id" value={fe.id}/>
                        <input type="hidden" name="month" value={fixedMonth}/>
                        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr auto',gap:8,alignItems:'flex-end'}}>
                          <div>
                            <div style={{fontSize:10,color:'var(--muted)',fontWeight:600,textTransform:'uppercase',letterSpacing:'0.04em',marginBottom:3}}>Сумма</div>
                            <input name="amount" type="number" defaultValue={fe.amount} style={{width:'100%',padding:'7px 10px',border:'1px solid var(--bor2)',borderRadius:7,fontSize:12,fontFamily:'inherit',outline:'none',background:'var(--surf)'}}/>
                          </div>
                          <div>
                            <div style={{fontSize:10,color:'var(--muted)',fontWeight:600,textTransform:'uppercase',letterSpacing:'0.04em',marginBottom:3}}>Примечание</div>
                            <input name="note" placeholder="Необязательно..." style={{width:'100%',padding:'7px 10px',border:'1px solid var(--bor2)',borderRadius:7,fontSize:12,fontFamily:'inherit',outline:'none',background:'var(--surf)'}}/>
                          </div>
                          <button type="submit" style={{padding:'7px 16px',background:'var(--purple)',color:'#fff',border:'none',borderRadius:7,fontSize:12,fontWeight:600,cursor:'pointer',fontFamily:'inherit'}}>Добавить</button>
                        </div>
                      </form>
                    </div>
                  )}

                  {/* Записи за месяц */}
                  {records.length === 0 ? (
                    <div style={{padding:'12px 16px',fontSize:12,color:'var(--muted)'}}>Нет записей за {fixedMonthLabel} — нажмите "+ Добавить запись"</div>
                  ) : (
                    <table>
                      <thead><tr><th>Месяц</th><th>Сумма</th><th>Факт</th><th>Дата выплаты</th><th>Примечание</th><th>Статус</th><th style={{width:40}}>✓</th></tr></thead>
                      <tbody>
                        {records.map((r:any) => {
                          const isPayOpen = openFixedPayForms.has(r.id)
                          return (
                            <>
                              <tr key={r.id} style={{opacity:r.is_paid?0.65:1}}>
                                <td style={{fontSize:11,color:'var(--muted)'}}>{fixedMonthLabel}</td>
                                <td><span className="num">{Number(r.amount).toLocaleString('ru')} ₽</span></td>
                                <td>{r.fact_amount?<span className="num m">{Number(r.fact_amount).toLocaleString('ru')} ₽</span>:<span style={{color:'var(--muted)'}}>—</span>}</td>
                                <td style={{fontSize:11,color:'var(--muted)'}}>{r.fact_date?new Date(r.fact_date).toLocaleDateString('ru-RU'):'—'}</td>
                                <td style={{fontSize:11,color:'var(--muted)'}}>{r.note||'—'}</td>
                                <td>{r.is_paid?<span className="pill pa"><span className="dot"/>Выплачен</span>:<span className="pill ps"><span className="dot"/>Ожидается</span>}</td>
                                <td style={{textAlign:'center'}}>
                                  {r.is_paid ? (
                                    <form action={markFixedRecordUnpaid} style={{display:'inline'}}>
                                      <input type="hidden" name="record_id" value={r.id}/>
                                      <button type="submit" style={{width:16,height:16,borderRadius:5,background:'var(--green)',border:'none',display:'inline-flex',alignItems:'center',justifyContent:'center',cursor:'pointer',padding:0}}>
                                        <svg viewBox="0 0 9 7" fill="none" stroke="white" strokeWidth="2" width="9" height="9"><polyline points="1,3.5 3.5,6 8,1"/></svg>
                                      </button>
                                    </form>
                                  ) : (
                                    <div onClick={()=>setOpenFixedPayForms(prev=>{const n=new Set(prev);n.has(r.id)?n.delete(r.id):n.add(r.id);return n})}
                                      style={{width:16,height:16,borderRadius:5,border:'1.5px solid var(--bor2)',display:'inline-flex',alignItems:'center',justifyContent:'center',cursor:'pointer',background:isPayOpen?'var(--pl)':'transparent',margin:'0 auto'}}/>
                                  )}
                                </td>
                              </tr>
                              {isPayOpen && !r.is_paid && (
                                <tr key={`fpay-${r.id}`}>
                                  <td colSpan={7} style={{padding:0,background:'var(--surf2)'}}>
                                    <form action={async(fd)=>{await markFixedRecordPaid(fd);setOpenFixedPayForms(prev=>{const n=new Set(prev);n.delete(r.id);return n})}} style={{padding:'12px 16px'}}>
                                      <input type="hidden" name="record_id" value={r.id}/>
                                      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr auto',gap:8,alignItems:'flex-end'}}>
                                        <div>
                                          <div style={{fontSize:10,color:'var(--muted)',fontWeight:600,textTransform:'uppercase',letterSpacing:'0.04em',marginBottom:3}}>Дата выплаты</div>
                                          <input name="fact_date" type="date" defaultValue={today} style={{width:'100%',padding:'7px 10px',border:'1px solid var(--bor2)',borderRadius:7,fontSize:12,fontFamily:'inherit',outline:'none',background:'var(--surf)'}}/>
                                        </div>
                                        <div>
                                          <div style={{fontSize:10,color:'var(--muted)',fontWeight:600,textTransform:'uppercase',letterSpacing:'0.04em',marginBottom:3}}>Сумма факт</div>
                                          <input name="fact_amount" type="number" defaultValue={r.amount} style={{width:'100%',padding:'7px 10px',border:'1px solid var(--bor2)',borderRadius:7,fontSize:12,fontFamily:'inherit',outline:'none',background:'var(--surf)'}}/>
                                        </div>
                                        <div style={{display:'flex',gap:6}}>
                                          <button type="submit" style={{padding:'7px 16px',background:'var(--green)',color:'#fff',border:'none',borderRadius:7,fontSize:12,fontWeight:600,cursor:'pointer',fontFamily:'inherit'}}>Выплачено</button>
                                          <button type="button" onClick={()=>setOpenFixedPayForms(prev=>{const n=new Set(prev);n.delete(r.id);return n})} style={{padding:'7px 12px',background:'transparent',color:'var(--muted)',border:'1px solid var(--bor2)',borderRadius:7,fontSize:12,cursor:'pointer',fontFamily:'inherit'}}>Отмена</button>
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
        )}

        {tab === 'curators' && renderStaffTab('curator')}
        {tab === 'salespersons' && renderStaffTab('salesperson')}
        {tab === 'all' && (
          <>
            {activeGroups.length === 0 && doneGroups.length === 0 && <div style={{textAlign:'center',color:'var(--muted)',padding:48}}>Расходов пока нет</div>}
            {activeGroups.length > 0 && (
              <>
                <div style={{fontSize:10,color:'var(--muted)',fontWeight:700,textTransform:'uppercase',letterSpacing:'0.08em',margin:'0 0 8px'}}>Активные клиенты</div>
                {activeGroups.map(g => renderGroup(g, false))}
              </>
            )}
            {doneGroups.length > 0 && (
              <>
                <div style={{fontSize:10,color:'var(--muted)',fontWeight:700,textTransform:'uppercase',letterSpacing:'0.08em',margin:'16px 0 8px'}}>Завершённые клиенты</div>
                {doneGroups.map(g => renderGroup(g, true))}
              </>
            )}
          </>
        )}
      </div>
    </>
  )
}