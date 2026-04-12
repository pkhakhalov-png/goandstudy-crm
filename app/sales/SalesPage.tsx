'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { markPaymentPaidSales, unmarkPaymentPaidSales } from './actions'

interface Props {
  clients: any[]
  expenses: any[]
}

const MONTHS_FULL = ['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь']

function getPaymentStatus(client: any) {
  if (client.status === 'completed') return { label: 'Завершён', cls: 'pd' }
  const pays = client.payments ?? []
  const unpaid = pays.filter((p: any) => !p.is_paid)
  if (unpaid.length === 0) return { label: 'Завершён', cls: 'pd' }
  const hasOverdue = unpaid.some((p: any) => p.status === 'overdue')
  if (hasOverdue) return { label: 'Просрочка', cls: 'po' }
  const today = new Date()
  const in7 = new Date(today)
  in7.setDate(today.getDate() + 7)
  const hasSoon = unpaid.some((p: any) => {
    const d = new Date(p.plan_date)
    return d >= today && d <= in7
  })
  if (hasSoon) return { label: 'Скоро платёж', cls: 'ps' }
  return { label: 'В графике', cls: 'pa' }
}

export function SalesPage({ clients, expenses }: Props) {
  const router = useRouter()
  const [tab, setTab] = useState<'clients' | 'salary'>('clients')
  const [selectedId, setSelectedId] = useState<number | null>(clients[0]?.id ?? null)
  const [search, setSearch] = useState('')
  const [openPayForm, setOpenPayForm] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [expandedMonths, setExpandedMonths] = useState<Set<string>>(new Set())

  const sel = clients.find(c => c.id === selectedId) ?? clients[0] ?? null
  const filtered = clients.filter(c =>
    !search || c.name.toLowerCase().includes(search.toLowerCase())
  )

  const totalPlan = clients.reduce((s,c) => s+(c.payments?.reduce((ps:number,p:any)=>ps+Number(p.plan_sum),0)??0),0)
  const totalPaid = clients.reduce((s,c) => s+(c.payments?.filter((p:any)=>p.is_paid).reduce((ps:number,p:any)=>ps+Number(p.fact_sum||p.plan_sum),0)??0),0)
  const totalOverdue = clients.reduce((s,c) => s+(c.payments?.filter((p:any)=>p.status==='overdue').reduce((ps:number,p:any)=>ps+Number(p.plan_sum),0)??0),0)
  const totalSoon = clients.reduce((s,c) => s+(c.payments?.filter((p:any)=>p.status==='soon').reduce((ps:number,p:any)=>ps+Number(p.plan_sum),0)??0),0)

  const selPayments = (sel?.payments ?? []).sort((a:any,b:any) => a.num - b.num)
  const selPaidSum = selPayments.filter((p:any)=>p.is_paid).reduce((s:number,p:any)=>s+Number(p.fact_sum||p.plan_sum),0)
  const selTotalSum = selPayments.reduce((s:number,p:any)=>s+Number(p.plan_sum),0)
  const selDebt = selTotalSum - selPaidSum
  const selPct = selPayments.length>0 ? Math.round(selPayments.filter((p:any)=>p.is_paid).length/selPayments.length*100) : 0

  const today = new Date().toISOString().split('T')[0]

  // Зарплата — считаем по месяцам
  const salaryTotal = expenses.reduce((s,e) => s+Number(e.plan_sum),0)
  const salaryPaid = expenses.filter(e=>e.is_paid).reduce((s,e) => s+Number(e.fact_sum||e.plan_sum),0)
  const salaryPending = expenses.filter(e=>!e.is_paid).reduce((s,e) => s+Number(e.plan_sum),0)

  // Группируем по месяцам
  const monthsMap = new Map<string, {label: string, year: number, month: number, total: number, paid: number, pending: number, items: any[]}>()
  expenses.forEach(e => {
    const d = e.plan_date ? new Date(e.plan_date) : new Date()
    const key = `${d.getFullYear()}-${d.getMonth()}`
    if (!monthsMap.has(key)) {
      monthsMap.set(key, {
        label: `${MONTHS_FULL[d.getMonth()]} ${d.getFullYear()}`,
        year: d.getFullYear(), month: d.getMonth(),
        total: 0, paid: 0, pending: 0, items: []
      })
    }
    const m = monthsMap.get(key)!
    m.total += Number(e.plan_sum)
    if (e.is_paid) m.paid += Number(e.fact_sum||e.plan_sum)
    else m.pending += Number(e.plan_sum)
    m.items.push(e)
  })
  const monthsList = Array.from(monthsMap.values()).sort((a,b) => b.year-a.year || b.month-a.month)

  function toggleMonth(key: string) {
    setExpandedMonths(prev => { const n = new Set(prev); n.has(key)?n.delete(key):n.add(key); return n })
  }

  async function handleMarkPaid(formData: FormData) {
    setLoading(true)
    await markPaymentPaidSales(formData)
    router.refresh()
    setLoading(false)
    setOpenPayForm(null)
  }

  async function handleUnmark(formData: FormData) {
    setLoading(true)
    await unmarkPaymentPaidSales(formData)
    router.refresh()
    setLoading(false)
    setOpenPayForm(null)
  }

  return (
    <>
      {/* KPI */}
      <div className="kw">
        <div className="kg k4" style={{marginBottom:14}}>
          <div className="kc">
            <div className="kl">Моих клиентов</div>
            <div className="kv" style={{color:'var(--green)'}}>{clients.length}</div>
            <div className="ks">{clients.filter(c=>c.status==='active').length} активных</div>
          </div>
          <div className="kc">
            <div className="kl">Продано (план)</div>
            <div className="kv" style={{fontSize:17}}>{totalPlan.toLocaleString('ru')} ₽</div>
            <div className="ks">по договорам</div>
          </div>
          <div className="kc">
            <div className="kl">Оплачено клиентами</div>
            <div className="kv g" style={{fontSize:17}}>{totalPaid.toLocaleString('ru')} ₽</div>
            <div className="ks">{totalPlan>0?Math.round(totalPaid/totalPlan*100):0}% от плана</div>
          </div>
          <div className="kc">
            <div className="kl">Моя ЗП заработано</div>
            <div className="kv p" style={{fontSize:17}}>{salaryTotal.toLocaleString('ru')} ₽</div>
            <div className="ks">выплачено: {salaryPaid.toLocaleString('ru')} ₽</div>
          </div>
        </div>
      </div>

      {/* Табы */}
      <div style={{padding:'0 28px 12px',borderBottom:'1px solid var(--bor)',background:'var(--surf)'}}>
        <div style={{display:'flex',gap:2,background:'var(--bg)',border:'1px solid var(--bor2)',borderRadius:9,padding:3,width:'fit-content'}}>
          <button onClick={()=>setTab('clients')}
            style={{padding:'6px 16px',borderRadius:6,border:'none',fontSize:12,fontWeight:500,cursor:'pointer',fontFamily:'inherit',background:tab==='clients'?'#fff':'transparent',color:tab==='clients'?'var(--text)':'var(--muted)',boxShadow:tab==='clients'?'var(--sh)':'none'}}>
            Мои клиенты
          </button>
          <button onClick={()=>setTab('salary')}
            style={{padding:'6px 16px',borderRadius:6,border:'none',fontSize:12,fontWeight:500,cursor:'pointer',fontFamily:'inherit',background:tab==='salary'?'#fff':'transparent',color:tab==='salary'?'var(--text)':'var(--muted)',boxShadow:tab==='salary'?'var(--sh)':'none'}}>
            Моя зарплата
          </button>
        </div>
      </div>

      {/* ВКЛАДКА ЗАРПЛАТА */}
      {tab === 'salary' && (
        <div style={{padding:'20px 28px 40px'}}>
          {/* Итоговые карточки */}
          <div className="kg k4" style={{marginBottom:20}}>
            <div className="kc">
              <div className="kl">Заработано всего</div>
              <div className="kv p" style={{fontSize:17}}>{salaryTotal.toLocaleString('ru')} ₽</div>
              <div className="ks">10% от договоров</div>
            </div>
            <div className="kc">
              <div className="kl">Выплачено</div>
              <div className="kv g" style={{fontSize:17}}>{salaryPaid.toLocaleString('ru')} ₽</div>
              <div className="ks">{salaryTotal>0?Math.round(salaryPaid/salaryTotal*100):0}% от заработанного</div>
            </div>
            <div className="kc">
              <div className="kl">К выплате</div>
              <div className="kv o" style={{fontSize:17}}>{salaryPending.toLocaleString('ru')} ₽</div>
              <div className="ks">ожидает выплаты</div>
            </div>
            <div className="kc">
              <div className="kl">Клиентов</div>
              <div className="kv" style={{fontSize:17}}>{clients.length}</div>
              <div className="ks">{expenses.length} записей ЗП</div>
            </div>
          </div>

          {/* История по месяцам */}
          {monthsList.length === 0 && (
            <div style={{textAlign:'center',color:'var(--muted)',padding:48}}>Нет данных о зарплате</div>
          )}
          {monthsList.map(m => {
            const key = `${m.year}-${m.month}`
            const isOpen = expandedMonths.has(key)
            return (
              <div key={key} style={{marginBottom:8,background:'#fff',border:'1px solid var(--bor)',borderRadius:14,overflow:'hidden',boxShadow:'var(--sh)'}}>
                <div onClick={()=>toggleMonth(key)}
                  style={{display:'flex',alignItems:'center',gap:12,padding:'14px 20px',cursor:'pointer',background:'var(--surf2)',borderBottom:isOpen?'1px solid var(--bor)':'none'}}>
                  <svg viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.8" width="10" height="10"
                    style={{transform:isOpen?'rotate(90deg)':'none',transition:'transform 0.2s',color:'var(--muted)',flexShrink:0}}>
                    <polyline points="3,2 7,5 3,8"/>
                  </svg>
                  <span style={{fontSize:13,fontWeight:700,color:'var(--text)'}}>{m.label}</span>
                  <span style={{fontSize:11,color:'var(--muted)'}}>{m.items.length} клиентов</span>
                  <div style={{flex:1}}/>
                  <span style={{fontSize:12,fontWeight:700,color:'var(--green)',marginRight:16}}>{m.paid.toLocaleString('ru')} ₽ выплачено</span>
                  {m.pending > 0 && <span style={{fontSize:12,fontWeight:700,color:'var(--gold)'}}>{m.pending.toLocaleString('ru')} ₽ ожидается</span>}
                </div>
                {isOpen && (
                  <table>
                    <thead>
                      <tr>
                        <th>Клиент</th>
                        <th>Сумма ЗП</th>
                        <th>Дата выплаты</th>
                        <th>Статус</th>
                      </tr>
                    </thead>
                    <tbody>
                      {m.items.map((e:any) => {
                        const client = clients.find(c => c.id === e.client_id)
                        return (
                          <tr key={e.id}>
                            <td>
                              <div style={{fontSize:12,fontWeight:600}}>{client?.name ?? '—'}</div>
                              {client?.country && <div style={{fontSize:10,color:'var(--muted)'}}>{client.country}</div>}
                            </td>
                            <td><span className="num p">{Number(e.plan_sum).toLocaleString('ru')} ₽</span></td>
                            <td style={{fontSize:11,color:'var(--muted)'}}>
                              {e.fact_date ? new Date(e.fact_date).toLocaleDateString('ru-RU') : '—'}
                            </td>
                            <td>
                              {e.is_paid
                                ? <span className="pill pa"><span className="dot"/>Выплачено</span>
                                : <span className="pill ps"><span className="dot"/>Ожидается</span>
                              }
                            </td>
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
      )}

      {/* ВКЛАДКА КЛИЕНТЫ */}
      {tab === 'clients' && (
        <div className="cnt">
          <div className="lay">
            <div className="tcol">
              <div className="ctrl">
                <div className="sl">Список клиентов</div>
                <div className="cr">
                  <div style={{display:'flex',alignItems:'center',gap:8,background:'var(--surf)',border:'1px solid var(--bor2)',borderRadius:9,padding:'7px 13px'}}>
                    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="var(--muted)" strokeWidth="1.6"><circle cx="7" cy="7" r="5"/><line x1="11" y1="11" x2="14" y2="14"/></svg>
                    <input
                      placeholder="Найти клиента..."
                      value={search}
                      onChange={e=>setSearch(e.target.value)}
                      style={{background:'transparent',border:'none',outline:'none',fontSize:13,color:'var(--text)',width:160,fontFamily:'inherit'}}
                    />
                  </div>
                </div>
              </div>
              <div className="tw">
                <table>
                  <thead>
                    <tr>
                      <th>Клиент</th>
                      <th>Куратор</th>
                      <th>Договор</th>
                      <th>Оплачено</th>
                      <th>Остаток</th>
                      <th>Прогресс</th>
                      <th>Статус</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((c:any) => {
                      const pays = c.payments ?? []
                      const paidS = pays.filter((p:any)=>p.is_paid).reduce((s:number,p:any)=>s+Number(p.fact_sum||p.plan_sum),0)
                      const totalS = pays.reduce((s:number,p:any)=>s+Number(p.plan_sum),0)
                      const debt = totalS - paidS
                      const pct = pays.length>0 ? Math.round(pays.filter((p:any)=>p.is_paid).length/pays.length*100) : 0
                      const isSel = sel?.id === c.id
                      const { label, cls } = getPaymentStatus(c)
                      return (
                        <tr key={c.id} onClick={()=>{ setSelectedId(c.id); setOpenPayForm(null) }}
                          style={{background:isSel?'var(--rs)':'transparent',cursor:'pointer'}}>
                          <td>
                            <div className="cn">{c.name}</div>
                            {c.country && <div className="cs">{c.country}{c.university?` · ${c.university}`:''}</div>}
                          </td>
                          <td><span className="ctag">{c.curator?.name ?? '—'}</span></td>
                          <td><span className="num">{totalS.toLocaleString('ru')} ₽</span></td>
                          <td><span className="num g">{paidS.toLocaleString('ru')} ₽</span></td>
                          <td><span className={`num ${debt>0?'o':'m'}`}>{debt.toLocaleString('ru')} ₽</span></td>
                          <td>
                            <div className="tp">
                              <div className="tpb"><div className="tpf" style={{width:`${pct}%`}}></div></div>
                              <div className="tpp">{pct}%</div>
                            </div>
                          </td>
                          <td>
                            <span className={`pill ${cls}`}><span className="dot"></span>{label}</span>
                          </td>
                        </tr>
                      )
                    })}
                    {filtered.length === 0 && (
                      <tr>
                        <td colSpan={7} style={{textAlign:'center',color:'var(--muted)',padding:32}}>
                          {clients.length === 0 ? 'Клиентов пока нет' : 'Нет клиентов по поиску'}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Правая панель */}
            {sel && (
              <div className="panel">
                <div className="ph">
                  <div className="ph-n">{sel.name}</div>
                  <div className="ph-s">{sel.country}{sel.university?` · ${sel.university}`:''}</div>
                </div>
                <div className="pb2">
                  {sel.phone && <div className="ir"><span className="ik">Телефон</span><span className="iv">{sel.phone}</span></div>}
                  {sel.telegram && <div className="ir"><span className="ik">Telegram</span><span className="iv">{sel.telegram}</span></div>}
                  <div className="ir"><span className="ik">Куратор</span><span className="iv p">{sel.curator?.name ?? '—'}</span></div>
                  <div className="ir"><span className="ik">Договор</span><span className="iv">{selTotalSum.toLocaleString('ru')} ₽</span></div>
                  <div className="ir"><span className="ik">Рассрочка</span><span className="iv">{sel.months} мес.</span></div>
                  <div className="ir"><span className="ik">Оплачено</span><span className="iv g">{selPaidSum.toLocaleString('ru')} ₽</span></div>
                  <div className="ir"><span className="ik">Остаток</span><span className="iv o">{selDebt.toLocaleString('ru')} ₽</span></div>

                  <div style={{margin:'14px 0 2px'}}>
                    <div style={{display:'flex',justifyContent:'space-between',fontSize:11,color:'var(--muted)',marginBottom:5,fontWeight:500}}>
                      <span>Прогресс</span><span>{selPct}%</span>
                    </div>
                    <div style={{height:6,background:'var(--bor2)',borderRadius:20,overflow:'hidden'}}>
                      <div style={{height:'100%',width:`${selPct}%`,background:'linear-gradient(90deg,var(--green),#5fd6a4)',borderRadius:20}}/>
                    </div>
                  </div>

                  <div style={{fontSize:10,textTransform:'uppercase',letterSpacing:'0.08em',color:'var(--muted2)',fontWeight:600,margin:'16px 0 8px'}}>
                    График платежей
                  </div>

                  {selPayments.map((p:any) => {
                    const isFormOpen = openPayForm === p.id
                    return (
                      <div key={p.id} style={{marginBottom:6}}>
                        <div style={{
                          display:'flex',alignItems:'center',gap:8,padding:'8px 10px',borderRadius:9,
                          border:`1px solid ${p.status==='paid'?'rgba(22,163,97,.2)':p.status==='overdue'?'rgba(220,53,69,.2)':p.status==='soon'?'rgba(201,125,0,.2)':'var(--bor)'}`,
                          background:p.status==='paid'?'rgba(22,163,97,.05)':p.status==='overdue'?'rgba(220,53,69,.05)':p.status==='soon'?'rgba(201,125,0,.05)':'var(--surf2)'
                        }}>
                          <div style={{fontSize:10,color:'var(--muted)',width:14,fontWeight:700,flexShrink:0}}>{p.num}</div>
                          <div style={{fontSize:11,color:p.status==='overdue'?'var(--red)':p.status==='soon'?'var(--gold)':'var(--muted)',flex:1,fontWeight:(p.status==='overdue'||p.status==='soon')?600:400}}>
                            {new Date(p.plan_date).toLocaleDateString('ru-RU')}
                          </div>
                          <div style={{fontSize:11,fontWeight:700,fontVariantNumeric:'tabular-nums',color:p.status==='paid'?'var(--green)':p.status==='overdue'?'var(--red)':p.status==='soon'?'var(--gold)':'var(--muted)'}}>
                            {Number(p.plan_sum).toLocaleString('ru')} ₽
                          </div>
                          <div onClick={()=>setOpenPayForm(isFormOpen ? null : p.id)}
                            style={{width:18,height:18,borderRadius:5,flexShrink:0,cursor:'pointer',
                              background:p.is_paid?'var(--green)':(isFormOpen?'rgba(22,163,97,.15)':'transparent'),
                              border:p.is_paid?'none':`1.5px solid ${isFormOpen?'var(--green)':'var(--bor2)'}`,
                              display:'inline-flex',alignItems:'center',justifyContent:'center'}}>
                            {p.is_paid && <svg viewBox="0 0 9 7" fill="none" stroke="white" strokeWidth="2" width="9" height="9"><polyline points="1,3.5 3.5,6 8,1"/></svg>}
                          </div>
                        </div>

                        {isFormOpen && (
                          <div style={{padding:'10px 12px',background:'var(--surf)',border:'1px solid var(--bor2)',borderRadius:9,marginTop:4}}>
                            {p.is_paid && (
                              <div style={{fontSize:11,color:'var(--muted)',marginBottom:8}}>
                                Оплачен {p.fact_date?new Date(p.fact_date).toLocaleDateString('ru-RU'):''}{p.fact_sum?` · ${Number(p.fact_sum).toLocaleString('ru')} ₽`:''}
                                {p.comment && <div style={{marginTop:2}}>💬 {p.comment}</div>}
                              </div>
                            )}
                            <form action={p.is_paid ? handleUnmark : handleMarkPaid}>
                              <input type="hidden" name="payment_id" value={p.id}/>
                              {!p.is_paid && (
                                <>
                                  <div style={{marginBottom:7}}>
                                    <div style={{fontSize:10,color:'var(--muted)',fontWeight:600,textTransform:'uppercase',letterSpacing:'0.04em',marginBottom:3}}>Дата оплаты</div>
                                    <input name="fact_date" type="date" defaultValue={today}
                                      style={{width:'100%',padding:'6px 10px',border:'1px solid var(--bor2)',borderRadius:7,fontSize:12,fontFamily:'inherit',outline:'none',background:'var(--surf2)'}}/>
                                  </div>
                                  <div style={{marginBottom:7}}>
                                    <div style={{fontSize:10,color:'var(--muted)',fontWeight:600,textTransform:'uppercase',letterSpacing:'0.04em',marginBottom:3}}>Сумма факт</div>
                                    <input name="fact_sum" type="number" defaultValue={p.plan_sum}
                                      style={{width:'100%',padding:'6px 10px',border:'1px solid var(--bor2)',borderRadius:7,fontSize:12,fontFamily:'inherit',outline:'none',background:'var(--surf2)'}}/>
                                  </div>
                                  <div style={{marginBottom:10}}>
                                    <div style={{fontSize:10,color:'var(--muted)',fontWeight:600,textTransform:'uppercase',letterSpacing:'0.04em',marginBottom:3}}>Комментарий</div>
                                    <input name="comment" placeholder="Способ оплаты..."
                                      style={{width:'100%',padding:'6px 10px',border:'1px solid var(--bor2)',borderRadius:7,fontSize:12,fontFamily:'inherit',outline:'none',background:'var(--surf2)'}}/>
                                  </div>
                                </>
                              )}
                              <div style={{display:'flex',gap:6}}>
                                <button type="submit" disabled={loading}
                                  style={{flex:1,padding:'7px 0',background:p.is_paid?'rgba(220,53,69,.08)':'var(--green)',color:p.is_paid?'var(--red)':'#fff',border:p.is_paid?'1px solid rgba(220,53,69,.2)':'none',borderRadius:7,fontSize:12,fontWeight:600,cursor:'pointer',fontFamily:'inherit',opacity:loading?0.6:1}}>
                                  {loading?'...':p.is_paid?'Отменить оплату':'✓ Отметить оплату'}
                                </button>
                                <button type="button" onClick={()=>setOpenPayForm(null)}
                                  style={{padding:'7px 12px',background:'transparent',color:'var(--muted)',border:'1px solid var(--bor2)',borderRadius:7,fontSize:12,cursor:'pointer',fontFamily:'inherit'}}>
                                  ✕
                                </button>
                              </div>
                            </form>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}