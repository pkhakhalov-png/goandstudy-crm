'use client'

import { useState } from 'react'
import { addExpense, markExpensePaid } from './actions'

interface Props {
  clients: any[]
  expenses: any[]
}

export function ExpensesClient({ clients, expenses }: Props) {
  const [filterCategory, setFilterCategory] = useState('')
  const [collapsed, setCollapsed] = useState<Set<number>>(new Set())
  const [openPayForms, setOpenPayForms] = useState<Set<string>>(new Set())
  const [showAddForm, setShowAddForm] = useState(false)
  const [loading, setLoading] = useState(false)

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
  }

  async function handleAddExpense(formData: FormData) {
    setLoading(true)
    await addExpense(formData)
    setLoading(false)
    setShowAddForm(false)
  }

  async function handleMarkPaid(id: string, formData: FormData) {
    await markExpensePaid(formData)
    setOpenPayForms(prev => { const n = new Set(prev); n.delete(id); return n })
  }

  const categories = ['curator', 'visa', 'salesperson', 'docs', 'other']
  const categoryLabel: Record<string,string> = {
    curator: 'Куратор', visa: 'Виза', salesperson: 'Агент', docs: 'Документы', other: 'Прочее'
  }
  const categoryClass: Record<string,string> = {
    curator: 'ac', visa: 'am', salesperson: 'ao', docs: 'am', other: 'am'
  }

  // Фильтрация
  const filtered = expenses.filter(e => {
    if (filterCategory && e.article !== filterCategory) return false
    return true
  })

  // Группируем по клиентам
  const clientsMap = new Map<number, { client: any, expenses: any[] }>()
  filtered.forEach((e: any) => {
    const cid = e.client_id
    if (!cid) return
    const client = clients.find(c => c.id === cid)
    if (!client) return
    if (!clientsMap.has(cid)) clientsMap.set(cid, { client, expenses: [] })
    clientsMap.get(cid)!.expenses.push(e)
  })

  // Разделяем на активных и закрытых
  const activeGroups = Array.from(clientsMap.values()).filter(g => g.client.status !== 'completed')
  const doneGroups = Array.from(clientsMap.values()).filter(g => g.client.status === 'completed')

  // KPI
  const totalPlan = expenses.reduce((s,e) => s+Number(e.plan_sum),0)
  const totalPaid = expenses.filter(e=>e.is_paid).reduce((s,e) => s+Number(e.fact_sum||e.plan_sum),0)
  const totalPending = expenses.filter(e=>!e.is_paid).reduce((s,e) => s+Number(e.plan_sum),0)

  // Сводка по категориям
  const curatorTotal = expenses.filter(e=>e.article==='curator').reduce((s,e)=>s+Number(e.plan_sum),0)
  const curatorPaid = expenses.filter(e=>e.article==='curator'&&e.is_paid).reduce((s,e)=>s+Number(e.fact_sum||e.plan_sum),0)
  const visaTotal = expenses.filter(e=>e.article==='visa').reduce((s,e)=>s+Number(e.plan_sum),0)
  const visaPaid = expenses.filter(e=>e.article==='visa'&&e.is_paid).reduce((s,e)=>s+Number(e.fact_sum||e.plan_sum),0)
  const agentTotal = expenses.filter(e=>e.article==='salesperson').reduce((s,e)=>s+Number(e.plan_sum),0)
  const agentPaid = expenses.filter(e=>e.article==='salesperson'&&e.is_paid).reduce((s,e)=>s+Number(e.fact_sum||e.plan_sum),0)

  const today = new Date().toISOString().split('T')[0]

  function renderGroup(group: { client: any, expenses: any[] }, isDone: boolean) {
    const { client, expenses: cExp } = group
    const isOpen = !collapsed.has(client.id)
    const totalDebt = cExp.filter(e=>!e.is_paid).reduce((s,e)=>s+Number(e.plan_sum),0)
    const totalPaidC = cExp.filter(e=>e.is_paid).reduce((s,e)=>s+Number(e.fact_sum||e.plan_sum),0)

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
            {totalDebt > 0 && (
              <span style={{fontSize:11,fontWeight:700,color:'var(--gold)'}}>
                {totalDebt.toLocaleString('ru')} ₽ к выплате
              </span>
            )}
            {isDone && totalDebt === 0 && (
              <span style={{fontSize:11,fontWeight:700,color:'var(--muted)'}}>
                {totalPaidC.toLocaleString('ru')} ₽ выплачено
              </span>
            )}
            <span className={`pill ${isDone?'pd':'pa'}`}>
              <span className="dot"></span>
              {isDone?'Закрыт':'Активный'}
            </span>
          </div>
        </div>

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
                <th>✓</th>
              </tr>
            </thead>
            <tbody>
              {cExp.map((e:any) => {
                const isFormOpen = openPayForms.has(e.id)
                return (
                  <>
                    <tr key={e.id} style={{opacity:e.is_paid?0.6:1}}>
                      <td>
                        <span style={{
                          display:'inline-block',padding:'3px 9px',borderRadius:6,fontSize:10,fontWeight:600,whiteSpace:'nowrap',
                          background:e.article==='curator'?'rgba(177,94,204,.09)':e.article==='visa'?'rgba(20,18,30,.05)':e.article==='salesperson'?'rgba(201,125,0,.08)':'rgba(20,18,30,.05)',
                          color:e.article==='curator'?'var(--purple)':e.article==='salesperson'?'var(--gold)':'var(--muted)',
                          border:e.article==='curator'?'1px solid rgba(177,94,204,.2)':e.article==='salesperson'?'1px solid rgba(201,125,0,.2)':'1px solid var(--bor2)'
                        }}>
                          {categoryLabel[e.article] ?? e.article}
                        </span>
                      </td>
                      <td style={{fontSize:11,color:'var(--muted)'}}>{e.who ?? '—'}</td>
                      <td style={{fontSize:11,color:e.status==='overdue'?'var(--red)':e.status==='pending'&&e.plan_date?'var(--gold)':'var(--muted)',fontWeight:e.status!=='paid'?600:400}}>
                        {e.plan_date ? new Date(e.plan_date).toLocaleDateString('ru-RU') : '—'}
                      </td>
                      <td><span className="num">{Number(e.plan_sum).toLocaleString('ru')} ₽</span></td>
                      <td>
                        {e.fact_sum
                          ? <span className="num m">{Number(e.fact_sum).toLocaleString('ru')} ₽</span>
                          : <span style={{color:'var(--muted)'}}>—</span>
                        }
                      </td>
                      <td style={{fontSize:11,color:'var(--muted)'}}>
                        {e.fact_date ? new Date(e.fact_date).toLocaleDateString('ru-RU') : '—'}
                      </td>
                      <td>
                        {e.is_paid
                          ? <span className="pill pn"><span className="dot"></span>Выплачен</span>
                          : <span className="pill ps"><span className="dot"></span>Ожидается</span>
                        }
                      </td>
                      <td onClick={(ev)=>ev.stopPropagation()}>
                        {e.is_paid ? (
                          <div style={{width:16,height:16,borderRadius:5,background:'var(--green)',display:'inline-flex',alignItems:'center',justifyContent:'center'}}>
                            <svg viewBox="0 0 9 7" fill="none" stroke="white" strokeWidth="2" width="9" height="9"><polyline points="1,3.5 3.5,6 8,1"/></svg>
                          </div>
                        ) : (
                          <div onClick={(ev)=>togglePayForm(ev, e.id)}
                            style={{width:16,height:16,borderRadius:5,border:'1.5px solid var(--bor2)',display:'inline-flex',alignItems:'center',justifyContent:'center',cursor:'pointer',background:isFormOpen?'var(--pl)':'transparent'}}>
                          </div>
                        )}
                      </td>
                    </tr>
                    {isFormOpen && !e.is_paid && (
                      <tr key={`form-${e.id}`}>
                        <td colSpan={8} style={{padding:0,background:'var(--surf2)'}} onClick={(ev)=>ev.stopPropagation()}>
                          <form action={(fd)=>handleMarkPaid(e.id,fd)} style={{padding:'12px 16px'}}>
                            <input type="hidden" name="expense_id" value={e.id}/>
                            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr auto',gap:8,alignItems:'flex-end'}}>
                              <div>
                                <div style={{fontSize:10,color:'var(--muted)',fontWeight:600,textTransform:'uppercase',letterSpacing:'0.04em',marginBottom:3}}>Дата выплаты</div>
                                <input name="fact_date" type="date" defaultValue={today}
                                  style={{width:'100%',padding:'7px 10px',border:'1px solid var(--bor2)',borderRadius:7,fontSize:12,fontFamily:'inherit',outline:'none',background:'var(--surf)'}}/>
                              </div>
                              <div>
                                <div style={{fontSize:10,color:'var(--muted)',fontWeight:600,textTransform:'uppercase',letterSpacing:'0.04em',marginBottom:3}}>Сумма факт</div>
                                <input name="fact_sum" type="number" defaultValue={e.plan_sum}
                                  style={{width:'100%',padding:'7px 10px',border:'1px solid var(--bor2)',borderRadius:7,fontSize:12,fontFamily:'inherit',outline:'none',background:'var(--surf)'}}/>
                              </div>
                              <div style={{display:'flex',gap:6}}>
                                <button type="submit"
                                  style={{padding:'7px 16px',background:'var(--green)',color:'#fff',border:'none',borderRadius:7,fontSize:12,fontWeight:600,cursor:'pointer',fontFamily:'inherit'}}>
                                  Сохранить
                                </button>
                                <button type="button" onClick={(ev)=>togglePayForm(ev, e.id)}
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
  }

  return (
    <>
      {/* KPI */}
      <div className="kw">
        <div className="kg k4" style={{marginBottom:14}}>
          <div className="kc">
            <div className="kl">Всего расходов (план)</div>
            <div className="kv" style={{fontSize:17}}>{totalPlan.toLocaleString('ru')} ₽</div>
            <div className="ks">по всем клиентам</div>
          </div>
          <div className="kc">
            <div className="kl">Выплачено</div>
            <div className="kv m" style={{fontSize:17,color:'var(--muted)'}}>{totalPaid.toLocaleString('ru')} ₽</div>
            <div className="ks">закрытые расходы</div>
          </div>
          <div className="kc">
            <div className="kl">К выплате</div>
            <div className="kv o" style={{fontSize:17}}>{totalPending.toLocaleString('ru')} ₽</div>
            <div className="ks">кредиторская задолженность</div>
          </div>
          <div className="kc">
            <div className="kl">Расходов всего</div>
            <div className="kv p">{expenses.length}</div>
            <div className="ks">{expenses.filter(e=>!e.is_paid).length} ожидается</div>
          </div>
        </div>

        {/* Сводка по категориям */}
        <div style={{display:'grid',gridTemplateColumns:'repeat(3,minmax(0,1fr))',gap:12,marginBottom:14}}>
          {[
            {label:'Кураторы', total:curatorTotal, paid:curatorPaid, color:'var(--purple)', bg:'rgba(177,94,204,.09)', border:'rgba(177,94,204,.2)'},
            {label:'Визы', total:visaTotal, paid:visaPaid, color:'var(--muted)', bg:'rgba(20,18,30,.04)', border:'var(--bor2)'},
            {label:'Агенты', total:agentTotal, paid:agentPaid, color:'var(--gold)', bg:'rgba(201,125,0,.07)', border:'rgba(201,125,0,.2)'},
          ].map(cat => (
            <div key={cat.label} style={{background:'var(--surf)',border:'1px solid var(--bor)',borderRadius:14,padding:'16px 18px',boxShadow:'var(--sh)'}}>
              <div style={{fontSize:11,fontWeight:700,color:'var(--text)',marginBottom:12,display:'flex',alignItems:'center',gap:8}}>
                <span style={{padding:'2px 8px',borderRadius:6,fontSize:10,fontWeight:600,background:cat.bg,color:cat.color,border:`1px solid ${cat.border}`}}>{cat.label}</span>
                Сводка
              </div>
              <div style={{display:'flex',justifyContent:'space-between',fontSize:12,padding:'6px 0',borderBottom:'1px solid var(--bor)'}}>
                <span style={{color:'var(--muted)'}}>Выплачено</span>
                <span style={{fontWeight:600,color:'var(--muted)'}}>{cat.paid.toLocaleString('ru')} ₽</span>
              </div>
              <div style={{display:'flex',justifyContent:'space-between',fontSize:12,padding:'6px 0'}}>
                <span style={{color:'var(--muted)'}}>К выплате</span>
                <span style={{fontWeight:700,color:cat.total-cat.paid>0?'var(--gold)':'var(--muted)'}}>{(cat.total-cat.paid).toLocaleString('ru')} ₽</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Фильтры и кнопка добавить */}
      <div style={{padding:'0 28px 12px',display:'flex',alignItems:'center',justifyContent:'space-between',flexWrap:'wrap',gap:8}}>
        <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
          {['','curator','visa','salesperson','docs','other'].map(cat => (
            <button key={cat} onClick={()=>setFilterCategory(cat)}
              style={{padding:'6px 14px',borderRadius:20,fontSize:12,fontWeight:600,cursor:'pointer',fontFamily:'inherit',
                border:`1px solid ${filterCategory===cat?'var(--purple)':'var(--bor2)'}`,
                background:filterCategory===cat?'var(--pl)':'var(--surf)',
                color:filterCategory===cat?'var(--purple)':'var(--muted)'}}>
              {cat===''?'Все':categoryLabel[cat]}
            </button>
          ))}
        </div>
        <button onClick={()=>setShowAddForm(!showAddForm)} className="btn-p" style={{padding:'7px 14px',fontSize:12}}>
          <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="white" strokeWidth="2.2">
            <line x1="6" y1="1" x2="6" y2="11"/><line x1="1" y1="6" x2="11" y2="6"/>
          </svg>
          Добавить расход
        </button>
      </div>

      {/* Форма добавления */}
      {showAddForm && (
        <div style={{margin:'0 28px 16px',background:'var(--surf2)',border:'1px solid var(--bor)',borderRadius:12,padding:'16px'}}>
          <form action={async(fd)=>{setLoading(true);await addExpense(fd);setLoading(false);setShowAddForm(false)}}>
            <div style={{display:'grid',gridTemplateColumns:'2fr 1fr 1fr 1fr 1fr auto',gap:8,alignItems:'flex-end'}}>
              <div>
                <div style={{fontSize:10,color:'var(--muted)',fontWeight:600,textTransform:'uppercase',letterSpacing:'0.04em',marginBottom:3}}>Клиент *</div>
                <select name="client_id" required style={{width:'100%',padding:'8px 10px',border:'1px solid var(--bor2)',borderRadius:8,fontSize:13,fontFamily:'inherit',outline:'none',background:'var(--surf)'}}>
                  <option value="">Выбрать</option>
                  {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <div style={{fontSize:10,color:'var(--muted)',fontWeight:600,textTransform:'uppercase',letterSpacing:'0.04em',marginBottom:3}}>Статья *</div>
                <select name="article" required style={{width:'100%',padding:'8px 10px',border:'1px solid var(--bor2)',borderRadius:8,fontSize:13,fontFamily:'inherit',outline:'none',background:'var(--surf)'}}>
                  {categories.map(c => <option key={c} value={c}>{categoryLabel[c]}</option>)}
                </select>
              </div>
              <div>
                <div style={{fontSize:10,color:'var(--muted)',fontWeight:600,textTransform:'uppercase',letterSpacing:'0.04em',marginBottom:3}}>Кому</div>
                <input name="who" placeholder="Аня, Посольство..." style={{width:'100%',padding:'8px 10px',border:'1px solid var(--bor2)',borderRadius:8,fontSize:13,fontFamily:'inherit',outline:'none',background:'var(--surf)'}}/>
              </div>
              <div>
                <div style={{fontSize:10,color:'var(--muted)',fontWeight:600,textTransform:'uppercase',letterSpacing:'0.04em',marginBottom:3}}>Сумма план *</div>
                <input name="plan_sum" type="number" required placeholder="0" style={{width:'100%',padding:'8px 10px',border:'1px solid var(--bor2)',borderRadius:8,fontSize:13,fontFamily:'inherit',outline:'none',background:'var(--surf)'}}/>
              </div>
              <div>
                <div style={{fontSize:10,color:'var(--muted)',fontWeight:600,textTransform:'uppercase',letterSpacing:'0.04em',marginBottom:3}}>Дата план</div>
                <input name="plan_date" type="date" style={{width:'100%',padding:'8px 10px',border:'1px solid var(--bor2)',borderRadius:8,fontSize:13,fontFamily:'inherit',outline:'none',background:'var(--surf)'}}/>
              </div>
              <div style={{display:'flex',gap:6}}>
                <button type="submit" disabled={loading} className="btn-p" style={{padding:'8px 16px',fontSize:12,opacity:loading?0.6:1}}>
                  {loading?'...':'Добавить'}
                </button>
                <button type="button" onClick={()=>setShowAddForm(false)} className="btn-s">
                  Отмена
                </button>
              </div>
            </div>
          </form>
        </div>
      )}

      {/* Список расходов по клиентам */}
      <div style={{flex:1,padding:'0 28px 32px',overflowY:'auto'}}>
        {activeGroups.length === 0 && doneGroups.length === 0 && (
          <div style={{textAlign:'center',color:'var(--muted)',padding:48}}>
            Расходов пока нет — нажмите "Добавить расход"
          </div>
        )}

        {activeGroups.length > 0 && (
          <>
            <div style={{fontSize:10,color:'var(--muted)',fontWeight:700,textTransform:'uppercase',letterSpacing:'0.08em',marginBottom:8}}>
              К выплате
            </div>
            {activeGroups.map(g => renderGroup(g, false))}
          </>
        )}

        {doneGroups.length > 0 && (
          <>
            <div style={{fontSize:10,color:'var(--muted)',fontWeight:700,textTransform:'uppercase',letterSpacing:'0.08em',margin:'16px 0 8px'}}>
              Закрытые клиенты
            </div>
            {doneGroups.map(g => renderGroup(g, true))}
          </>
        )}
      </div>
    </>
  )
}