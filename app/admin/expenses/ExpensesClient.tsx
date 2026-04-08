'use client'

import { useState } from 'react'
import { addExpense, markExpensePaid, markExpenseUnpaid, updateExpense } from './actions'

interface Props {
  clients: any[]
  expenses: any[]
}

export function ExpensesClient({ clients, expenses }: Props) {
  const [tab, setTab] = useState<'all' | 'curators'>('all')
  const [activeFilter, setActiveFilter] = useState<string>('all')
  const [collapsed, setCollapsed] = useState<Set<number>>(new Set())
  const [openPayForms, setOpenPayForms] = useState<Set<string>>(new Set())
  const [openEditForms, setOpenEditForms] = useState<Set<string>>(new Set())
  const [openAddForms, setOpenAddForms] = useState<Set<number>>(new Set())

  function toggleCollapse(clientId: number) {
    setCollapsed(prev => {
      const next = new Set(prev)
      next.has(clientId) ? next.delete(clientId) : next.add(clientId)
      return next
    })
  }

  function togglePayForm(e: React.MouseEvent, id: string) {
    e.stopPropagation()
    setOpenPayForms(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
    setOpenEditForms(prev => { const n = new Set(prev); n.delete(id); return n })
  }

  function toggleEditForm(e: React.MouseEvent, id: string) {
    e.stopPropagation()
    setOpenEditForms(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
    setOpenPayForms(prev => { const n = new Set(prev); n.delete(id); return n })
  }

  function toggleAddForm(e: React.MouseEvent, clientId: number) {
    e.stopPropagation()
    setOpenAddForms(prev => {
      const next = new Set(prev)
      next.has(clientId) ? next.delete(clientId) : next.add(clientId)
      return next
    })
  }

  const categories = ['curator', 'visa', 'salesperson', 'docs', 'other']
  const categoryLabel: Record<string,string> = {
    curator: 'Куратор', visa: 'Виза', salesperson: 'Агент', docs: 'Документы', other: 'Прочее'
  }

  const clientsMap = new Map<number, { client: any, expenses: any[] }>()
  clients.forEach(c => clientsMap.set(c.id, { client: c, expenses: [] }))
  expenses.forEach((e: any) => {
    if (clientsMap.has(e.client_id)) {
      clientsMap.get(e.client_id)!.expenses.push(e)
    }
  })

  const filteredExpenses = activeFilter === 'all'
    ? expenses
    : expenses.filter((e:any) => e.article === activeFilter)

  const filteredClientsMap = new Map<number, { client: any, expenses: any[] }>()
  clients.forEach(c => filteredClientsMap.set(c.id, { client: c, expenses: [] }))
  filteredExpenses.forEach((e: any) => {
    if (filteredClientsMap.has(e.client_id)) {
      filteredClientsMap.get(e.client_id)!.expenses.push(e)
    }
  })

  const activeGroups = Array.from(filteredClientsMap.values()).filter(g => g.expenses.length > 0 && g.client.status !== 'completed')
  const doneGroups = Array.from(filteredClientsMap.values()).filter(g => g.expenses.length > 0 && g.client.status === 'completed')

  // KPI
  const totalPlan = expenses.reduce((s,e) => s+Number(e.plan_sum),0)
  const totalPaid = expenses.filter(e=>e.is_paid).reduce((s,e) => s+Number(e.fact_sum||e.plan_sum),0)
  const totalPending = expenses.filter(e=>!e.is_paid).reduce((s,e) => s+Number(e.plan_sum),0)
  const curatorPending = expenses.filter(e=>e.article==='curator'&&!e.is_paid).reduce((s,e)=>s+Number(e.plan_sum),0)
  const agentPending = expenses.filter(e=>e.article==='salesperson'&&!e.is_paid).reduce((s,e)=>s+Number(e.plan_sum),0)

  // Аналитика по кураторам
  const curatorExpenses = expenses.filter((e:any) => e.article === 'curator')
  const curatorNames = [...new Set(curatorExpenses.map((e:any) => e.who).filter(Boolean))] as string[]
  const curatorStats = curatorNames.map(name => {
    const mine = curatorExpenses.filter((e:any) => e.who === name)
    const paid = mine.filter((e:any) => e.is_paid).reduce((s:number,e:any) => s+Number(e.fact_sum||e.plan_sum),0)
    const pending = mine.filter((e:any) => !e.is_paid).reduce((s:number,e:any) => s+Number(e.plan_sum),0)
    const total = mine.reduce((s:number,e:any) => s+Number(e.plan_sum),0)
    const clients_count = [...new Set(mine.map((e:any) => e.client_id))].length
    return { name, paid, pending, total, clients_count, expenses: mine }
  }).sort((a,b) => b.total - a.total)

  // Кураторы без имени
  const unknownCuratorExp = curatorExpenses.filter((e:any) => !e.who)
  if (unknownCuratorExp.length > 0) {
    const paid = unknownCuratorExp.filter((e:any) => e.is_paid).reduce((s:number,e:any) => s+Number(e.fact_sum||e.plan_sum),0)
    const pending = unknownCuratorExp.filter((e:any) => !e.is_paid).reduce((s:number,e:any) => s+Number(e.plan_sum),0)
    curatorStats.push({ name: '—', paid, pending, total: paid+pending, clients_count: 0, expenses: unknownCuratorExp })
  }

  const today = new Date().toISOString().split('T')[0]

  function renderGroup(group: { client: any, expenses: any[] }, isDone: boolean) {
    const { client, expenses: cExp } = group
    const allClientExp = clientsMap.get(client.id)?.expenses ?? []
    const isOpen = !collapsed.has(client.id)
    const isAddOpen = openAddForms.has(client.id)
    const totalDebt = allClientExp.filter(e=>!e.is_paid).reduce((s,e)=>s+Number(e.plan_sum),0)
    const totalPaidC = allClientExp.filter(e=>e.is_paid).reduce((s,e)=>s+Number(e.fact_sum||e.plan_sum),0)

    return (
      <div key={client.id} style={{marginBottom:8,border:'1px solid var(--bor)',borderRadius:14,background:'var(--surf)',overflow:'hidden',boxShadow:'var(--sh)',opacity:isDone?0.5:1}}>
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
          <div style={{display:'flex',alignItems:'center',gap:8}}>
            {totalDebt > 0 && <span style={{fontSize:11,fontWeight:700,color:'var(--gold)'}}>{totalDebt.toLocaleString('ru')} ₽ к выплате</span>}
            {totalPaidC > 0 && <span style={{fontSize:11,fontWeight:600,color:'var(--muted)'}}>{totalPaidC.toLocaleString('ru')} ₽ выплачено</span>}
            <button onClick={(e)=>toggleAddForm(e, client.id)}
              style={{padding:'4px 10px',background:isAddOpen?'var(--bg)':'var(--purple)',color:isAddOpen?'var(--muted)':'#fff',border:isAddOpen?'1px solid var(--bor2)':'none',borderRadius:7,fontSize:11,fontWeight:600,cursor:'pointer',fontFamily:'inherit'}}>
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
                <button type="submit" style={{padding:'7px 16px',background:'var(--purple)',color:'#fff',border:'none',borderRadius:7,fontSize:12,fontWeight:600,cursor:'pointer',fontFamily:'inherit'}}>
                  Добавить
                </button>
              </div>
            </form>
          </div>
        )}

        {isOpen && (
          <table>
            <thead>
              <tr>
                <th>Статья</th>
                <th>Кому</th>
                <th>Дата план</th>
                <th>Сумма план</th>
                <th>Факт</th>
                <th>Дата выплаты</th>
                <th>Статус</th>
                <th style={{width:60}}>✓</th>
              </tr>
            </thead>
            <tbody>
              {cExp.length === 0 && (
                <tr><td colSpan={8} style={{textAlign:'center',color:'var(--muted)',padding:20,fontSize:12}}>Нет расходов</td></tr>
              )}
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
                          {categoryLabel[e.article] ?? e.article}
                        </span>
                      </td>
                      <td style={{fontSize:11,color:e.article==='curator'?'var(--purple)':'var(--muted)',fontWeight:e.article==='curator'?600:400}}>
                        {e.who ?? '—'}
                      </td>
                      <td style={{fontSize:11,color:'var(--muted)'}}>
                        {e.plan_date ? new Date(e.plan_date).toLocaleDateString('ru-RU') : '—'}
                      </td>
                      <td>
                        <span className="num" style={{cursor:'pointer',textDecoration:'underline dotted'}} onClick={(ev)=>toggleEditForm(ev, e.id)}>
                          {Number(e.plan_sum).toLocaleString('ru')} ₽
                        </span>
                      </td>
                      <td>{e.fact_sum ? <span className="num m">{Number(e.fact_sum).toLocaleString('ru')} ₽</span> : <span style={{color:'var(--muted)'}}>—</span>}</td>
                      <td style={{fontSize:11,color:'var(--muted)'}}>{e.fact_date ? new Date(e.fact_date).toLocaleDateString('ru-RU') : '—'}</td>
                      <td>{e.is_paid ? <span className="pill pa"><span className="dot"></span>Выплачен</span> : <span className="pill ps"><span className="dot"></span>Ожидается</span>}</td>
                      <td onClick={(ev)=>ev.stopPropagation()} style={{textAlign:'center'}}>
                        {e.is_paid ? (
                          <form action={markExpenseUnpaid} style={{display:'inline'}}>
                            <input type="hidden" name="expense_id" value={e.id}/>
                            <button type="submit" title="Снять отметку"
                              style={{width:16,height:16,borderRadius:5,background:'var(--green)',border:'none',display:'inline-flex',alignItems:'center',justifyContent:'center',cursor:'pointer',padding:0}}>
                              <svg viewBox="0 0 9 7" fill="none" stroke="white" strokeWidth="2" width="9" height="9"><polyline points="1,3.5 3.5,6 8,1"/></svg>
                            </button>
                          </form>
                        ) : (
                          <div onClick={(ev)=>togglePayForm(ev, e.id)}
                            style={{width:16,height:16,borderRadius:5,border:'1.5px solid var(--bor2)',display:'inline-flex',alignItems:'center',justifyContent:'center',cursor:'pointer',background:isPayOpen?'var(--pl)':'transparent',margin:'0 auto'}}>
                          </div>
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
                                <input name="who" defaultValue={e.who??''} placeholder="Имя получателя" style={{width:'100%',padding:'7px 10px',border:'1px solid var(--bor2)',borderRadius:7,fontSize:12,fontFamily:'inherit',outline:'none',background:'var(--surf)'}}/>
                              </div>
                              <div>
                                <div style={{fontSize:10,color:'var(--muted)',fontWeight:600,textTransform:'uppercase',letterSpacing:'0.04em',marginBottom:3}}>Дата план</div>
                                <input name="plan_date" type="date" defaultValue={e.plan_date??''} style={{width:'100%',padding:'7px 10px',border:'1px solid var(--bor2)',borderRadius:7,fontSize:12,fontFamily:'inherit',outline:'none',background:'var(--surf)'}}/>
                              </div>
                              <div style={{display:'flex',gap:6}}>
                                <button type="submit" style={{padding:'7px 16px',background:'var(--purple)',color:'#fff',border:'none',borderRadius:7,fontSize:12,fontWeight:600,cursor:'pointer',fontFamily:'inherit'}}>Сохранить</button>
                                <button type="button" onClick={(ev)=>toggleEditForm(ev, e.id)} style={{padding:'7px 12px',background:'transparent',color:'var(--muted)',border:'1px solid var(--bor2)',borderRadius:7,fontSize:12,cursor:'pointer',fontFamily:'inherit'}}>Отмена</button>
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
                                <button type="button" onClick={(ev)=>togglePayForm(ev, e.id)} style={{padding:'7px 12px',background:'transparent',color:'var(--muted)',border:'1px solid var(--bor2)',borderRadius:7,fontSize:12,cursor:'pointer',fontFamily:'inherit'}}>Отмена</button>
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
            <div className="kl">Кураторы / Агенты</div>
            <div className="kv p" style={{fontSize:15}}>{curatorPending.toLocaleString('ru')} ₽</div>
            <div className="ks">агенты: {agentPending.toLocaleString('ru')} ₽</div>
          </div>
        </div>
      </div>

      {/* Табы */}
      <div style={{display:'flex',alignItems:'center',gap:8,padding:'0 28px 12px',borderBottom:'1px solid var(--bor)',background:'var(--surf)'}}>
        <div style={{display:'flex',gap:2,background:'var(--bg)',border:'1px solid var(--bor2)',borderRadius:9,padding:3}}>
          <button onClick={()=>setTab('all')}
            style={{padding:'6px 16px',borderRadius:6,border:'none',fontSize:12,fontWeight:500,cursor:'pointer',fontFamily:'inherit',background:tab==='all'?'#fff':'transparent',color:tab==='all'?'var(--text)':'var(--muted)',boxShadow:tab==='all'?'var(--sh)':'none'}}>
            Все расходы
          </button>
          <button onClick={()=>setTab('curators')}
            style={{padding:'6px 16px',borderRadius:6,border:'none',fontSize:12,fontWeight:500,cursor:'pointer',fontFamily:'inherit',background:tab==='curators'?'#fff':'transparent',color:tab==='curators'?'var(--text)':'var(--muted)',boxShadow:tab==='curators'?'var(--sh)':'none'}}>
            По кураторам
          </button>
        </div>

        {tab === 'all' && (
          <div style={{display:'flex',gap:6,marginLeft:8}}>
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

        {/* Вкладка По кураторам */}
        {tab === 'curators' && (
          <div>
            {curatorStats.length === 0 && (
              <div style={{textAlign:'center',color:'var(--muted)',padding:48}}>Нет расходов на кураторов</div>
            )}
            {curatorStats.map(c => (
              <div key={c.name} style={{marginBottom:16,background:'#fff',border:'1px solid var(--bor)',borderRadius:14,overflow:'hidden',boxShadow:'var(--sh)'}}>
                {/* Шапка куратора */}
                <div style={{padding:'14px 20px',background:'var(--surf2)',borderBottom:'1px solid var(--bor)',display:'flex',alignItems:'center',gap:16}}>
                  <div style={{width:36,height:36,borderRadius:'50%',background:'linear-gradient(135deg,var(--purple),#8b3fa8)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:13,color:'#fff',fontWeight:700,flexShrink:0}}>
                    {c.name !== '—' ? c.name.slice(0,2).toUpperCase() : '?'}
                  </div>
                  <div>
                    <div style={{fontSize:14,fontWeight:700,color:'var(--text)'}}>{c.name}</div>
                    <div style={{fontSize:11,color:'var(--muted)',marginTop:2}}>{c.clients_count} клиентов · {c.expenses.length} платежей</div>
                  </div>
                  <div style={{flex:1}}></div>
                  <div style={{display:'flex',gap:20,alignItems:'center'}}>
                    <div style={{textAlign:'right'}}>
                      <div style={{fontSize:10,color:'var(--muted)',fontWeight:600,textTransform:'uppercase',letterSpacing:'0.04em',marginBottom:2}}>Выплачено</div>
                      <div style={{fontSize:15,fontWeight:700,color:'var(--green)'}}>{c.paid.toLocaleString('ru')} ₽</div>
                    </div>
                    <div style={{textAlign:'right'}}>
                      <div style={{fontSize:10,color:'var(--muted)',fontWeight:600,textTransform:'uppercase',letterSpacing:'0.04em',marginBottom:2}}>Должны</div>
                      <div style={{fontSize:15,fontWeight:700,color:c.pending>0?'var(--gold)':'var(--muted)'}}>{c.pending.toLocaleString('ru')} ₽</div>
                    </div>
                    <div style={{textAlign:'right'}}>
                      <div style={{fontSize:10,color:'var(--muted)',fontWeight:600,textTransform:'uppercase',letterSpacing:'0.04em',marginBottom:2}}>Всего</div>
                      <div style={{fontSize:15,fontWeight:700,color:'var(--text)'}}>{c.total.toLocaleString('ru')} ₽</div>
                    </div>
                  </div>
                </div>

                {/* Прогресс бар */}
                <div style={{padding:'10px 20px',borderBottom:'1px solid var(--bor)'}}>
                  <div style={{display:'flex',justifyContent:'space-between',fontSize:10,color:'var(--muted)',marginBottom:4}}>
                    <span>Выплачено {c.total>0?Math.round(c.paid/c.total*100):0}%</span>
                    <span>{c.paid.toLocaleString('ru')} / {c.total.toLocaleString('ru')} ₽</span>
                  </div>
                  <div style={{height:6,background:'var(--bor2)',borderRadius:20,overflow:'hidden'}}>
                    <div style={{height:'100%',width:`${c.total>0?Math.round(c.paid/c.total*100):0}%`,background:'linear-gradient(90deg,var(--purple),#d47aff)',borderRadius:20}}></div>
                  </div>
                </div>

                {/* Таблица платежей куратора */}
                <table>
                  <thead>
                    <tr>
                      <th>Клиент</th>
                      <th>Дата план</th>
                      <th>Сумма план</th>
                      <th>Факт</th>
                      <th>Дата выплаты</th>
                      <th>Статус</th>
                    </tr>
                  </thead>
                  <tbody>
                    {c.expenses.sort((a:any,b:any) => (a.is_paid===b.is_paid?0:a.is_paid?1:-1)).map((e:any) => {
                      const client = clients.find(cl => cl.id === e.client_id)
                      return (
                        <tr key={e.id} style={{opacity:e.is_paid?0.65:1}}>
                          <td>
                            <div style={{fontSize:12,fontWeight:600,color:'var(--text)'}}>{client?.name ?? '—'}</div>
                            <div style={{fontSize:10,color:'var(--muted)'}}>{client?.country ?? ''}</div>
                          </td>
                          <td style={{fontSize:11,color:'var(--muted)'}}>{e.plan_date?new Date(e.plan_date).toLocaleDateString('ru-RU'):'—'}</td>
                          <td><span className="num">{Number(e.plan_sum).toLocaleString('ru')} ₽</span></td>
                          <td>{e.fact_sum?<span className="num m">{Number(e.fact_sum).toLocaleString('ru')} ₽</span>:<span style={{color:'var(--muted)'}}>—</span>}</td>
                          <td style={{fontSize:11,color:'var(--muted)'}}>{e.fact_date?new Date(e.fact_date).toLocaleDateString('ru-RU'):'—'}</td>
                          <td>{e.is_paid?<span className="pill pa"><span className="dot"></span>Выплачен</span>:<span className="pill ps"><span className="dot"></span>Ожидается</span>}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        )}

        {/* Вкладка Все расходы */}
        {tab === 'all' && (
          <>
            {activeGroups.length === 0 && doneGroups.length === 0 && (
              <div style={{textAlign:'center',color:'var(--muted)',padding:48}}>Расходов пока нет</div>
            )}
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