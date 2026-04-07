'use client'

import { useState } from 'react'
import Link from 'next/link'

interface Props {
  clients: any[]
  salespersons: any[]
  curators: any[]
}

export function ClientsPage({ clients, salespersons, curators }: Props) {
  const [selected, setSelected] = useState<any>(clients[0] ?? null)
  const [search, setSearch] = useState('')
  const [filterSalesperson, setFilterSalesperson] = useState('')
  const [filterCurator, setFilterCurator] = useState('')
  const [filterStatus, setFilterStatus] = useState('')

  const filtered = clients.filter(c => {
    if (search && !c.name.toLowerCase().includes(search.toLowerCase())) return false
    if (filterSalesperson && c.users?.id !== filterSalesperson) return false
    if (filterCurator && c.curators?.id !== filterCurator) return false
    if (filterStatus && c.status !== filterStatus) return false
    return true
  })

  const statusLabel: Record<string,string> = { active:'Активный', completed:'Завершён', frozen:'Заморожен' }
  const statusClass: Record<string,string> = { active:'pa', completed:'pd', frozen:'pw' }
  const payStatusLabel: Record<string,string> = { paid:'Оплачен', overdue:'Просрочен', soon:'Скоро', pending:'Ожидается' }
  const payStatusClass: Record<string,string> = { paid:'pa', overdue:'po', soon:'ps', pending:'pw' }

  // KPI
  const totalClients = clients.length
  const totalPlan = clients.reduce((s,c) => s + (c.payments?.reduce((ps:number,p:any)=>ps+Number(p.plan_sum),0)??0), 0)
  const totalPaid = clients.reduce((s,c) => s + (c.payments?.filter((p:any)=>p.is_paid).reduce((ps:number,p:any)=>ps+Number(p.plan_sum),0)??0), 0)
  const totalOverdue = clients.reduce((s,c) => s + (c.payments?.filter((p:any)=>p.status==='overdue').reduce((ps:number,p:any)=>ps+Number(p.plan_sum),0)??0), 0)
  const paidPct = totalPlan>0 ? Math.round(totalPaid/totalPlan*100) : 0

  // Детали выбранного клиента
  const sel = selected
  const selPayments = sel?.payments ?? []
  const selPaid = selPayments.filter((p:any)=>p.is_paid).length
  const selTotal = selPayments.length
  const selPaidSum = selPayments.filter((p:any)=>p.is_paid).reduce((s:number,p:any)=>s+Number(p.plan_sum),0)
  const selTotalSum = selPayments.reduce((s:number,p:any)=>s+Number(p.plan_sum),0)
  const selDebt = selTotalSum - selPaidSum
  const selPct = selTotal>0 ? Math.round(selPaid/selTotal*100) : 0

  return (
    <>
      {/* KPI */}
      <div className="kw">
        <div className="kg k5" style={{marginBottom:14}}>
          <div className="kc">
            <div className="kl">Клиентов</div>
            <div className="kv p">{totalClients}</div>
            <div className="ks">всего в системе</div>
          </div>
          <div className="kc">
            <div className="kl">Продано (план)</div>
            <div className="kv" style={{fontSize:17}}>{totalPlan.toLocaleString('ru')} ₽</div>
            <div className="ks">по договорам</div>
          </div>
          <div className="kc">
            <div className="kl">Оплачено</div>
            <div className="kv g" style={{fontSize:17}}>{totalPaid.toLocaleString('ru')} ₽</div>
            <div className="ks">{paidPct}% от плана</div>
            <div style={{marginTop:8,height:4,background:'var(--bor2)',borderRadius:20,overflow:'hidden'}}>
              <div style={{height:'100%',width:`${paidPct}%`,background:'linear-gradient(90deg,var(--purple),#d47aff)',borderRadius:20}}></div>
            </div>
          </div>
          <div className="kc">
            <div className="kl">Просрочено</div>
            <div className="kv r" style={{fontSize:17}}>{totalOverdue.toLocaleString('ru')} ₽</div>
            <div className="ks">{clients.filter(c=>c.payments?.some((p:any)=>p.status==='overdue')).length} клиентов</div>
          </div>
          <div className="kc">
            <div className="kl">Активных</div>
            <div className="kv p">{clients.filter(c=>c.status==='active').length}</div>
            <div className="ks">{clients.filter(c=>c.status==='completed').length} завершено</div>
          </div>
        </div>
      </div>

      {/* Контент */}
      <div className="cnt">
        <div className="lay">
          {/* Таблица */}
          <div className="tcol">
            <div className="ctrl">
              <div className="sl">Список клиентов</div>
              <div className="cr">
                <select className="si" value={filterStatus} onChange={e=>setFilterStatus(e.target.value)}>
                  <option value="">Все статусы</option>
                  <option value="active">Активные</option>
                  <option value="completed">Завершённые</option>
                  <option value="frozen">Замороженные</option>
                </select>
                <select className="si" value={filterSalesperson} onChange={e=>setFilterSalesperson(e.target.value)}>
                  <option value="">Все продажники</option>
                  {salespersons.map((s:any) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
                <select className="si" value={filterCurator} onChange={e=>setFilterCurator(e.target.value)}>
                  <option value="">Все кураторы</option>
                  {curators.map((c:any) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
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
                    <th>Продажник</th>
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
                    const paidS = pays.filter((p:any)=>p.is_paid).reduce((s:number,p:any)=>s+Number(p.plan_sum),0)
                    const totalS = pays.reduce((s:number,p:any)=>s+Number(p.plan_sum),0)
                    const debt = totalS - paidS
                    const pct = pays.length>0 ? Math.round(pays.filter((p:any)=>p.is_paid).length/pays.length*100) : 0
                    const isSel = sel?.id === c.id
                    const isDone = c.status === 'completed'

                    return (
                      <tr key={c.id}
                        onClick={()=>setSelected(c)}
                        style={{background:isSel?'var(--rs)':'transparent', opacity:isDone?0.55:1}}>
                        <td>
                          <div className="cn">{c.name}</div>
                          {c.country && <div className="cs">{c.country}{c.university ? ` · ${c.university}` : ''}</div>}
                        </td>
                        <td><span className="stag">{c.users?.name ?? '—'}</span></td>
                        <td><span className="ctag">{c.curators?.name ?? '—'}</span></td>
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
                          <span className={`pill ${statusClass[c.status]}`}>
                            <span className="dot"></span>
                            {statusLabel[c.status]}
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                  {filtered.length === 0 && (
                    <tr>
                      <td colSpan={8} style={{textAlign:'center',color:'var(--muted)',padding:32}}>
                        {clients.length === 0
                          ? <span>Клиентов пока нет — <Link href="/admin/clients/new" style={{color:'var(--purple)'}}>добавить первого</Link></span>
                          : 'Нет клиентов по фильтру'
                        }
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
                <div className="ph-s">{sel.country}{sel.university ? ` · ${sel.university}` : ''}</div>
              </div>
              <div className="pb2">
                {sel.phone && <div className="ir"><span className="ik">Телефон</span><span className="iv">{sel.phone}</span></div>}
                {sel.telegram && <div className="ir"><span className="ik">Telegram</span><span className="iv">{sel.telegram}</span></div>}
                <div className="ir"><span className="ik">Продажник</span><span className="iv g">{sel.users?.name ?? '—'}</span></div>
                <div className="ir"><span className="ik">Куратор</span><span className="iv p">{sel.curators?.name ?? '—'}</span></div>
                <div className="ir"><span className="ik">Договор</span><span className="iv">{selTotalSum.toLocaleString('ru')} ₽</span></div>
                <div className="ir"><span className="ik">Рассрочка</span><span className="iv">{sel.months} мес.</span></div>
                <div className="ir"><span className="ik">Оплачено</span><span className="iv g">{selPaidSum.toLocaleString('ru')} ₽</span></div>
                <div className="ir"><span className="ik">Остаток</span><span className="iv o">{selDebt.toLocaleString('ru')} ₽</span></div>

                {/* Прогресс */}
                <div style={{margin:'14px 0 2px'}}>
                  <div style={{display:'flex',justifyContent:'space-between',fontSize:11,color:'var(--muted)',marginBottom:5,fontWeight:500}}>
                    <span>Прогресс</span><span>{selPct}%</span>
                  </div>
                  <div style={{height:6,background:'var(--bor2)',borderRadius:20,overflow:'hidden'}}>
                    <div style={{height:'100%',width:`${selPct}%`,background:'linear-gradient(90deg,var(--purple),#d47aff)',borderRadius:20}}></div>
                  </div>
                </div>

                {/* График платежей */}
                <div style={{fontSize:10,textTransform:'uppercase',letterSpacing:'0.08em',color:'var(--muted2)',fontWeight:600,margin:'16px 0 8px'}}>
                  График платежей
                </div>
                {selPayments.map((p:any) => (
                  <div key={p.id} style={{
                    display:'flex',alignItems:'center',gap:8,padding:'7px 10px',
                    borderRadius:9,marginBottom:5,
                    border:`1px solid ${p.status==='paid'?'rgba(22,163,97,.2)':p.status==='overdue'?'rgba(220,53,69,.2)':p.status==='soon'?'rgba(201,125,0,.2)':'var(--bor)'}`,
                    background:p.status==='paid'?'rgba(22,163,97,.05)':p.status==='overdue'?'rgba(220,53,69,.05)':p.status==='soon'?'rgba(201,125,0,.05)':'var(--surf2)'
                  }}>
                    <div style={{fontSize:10,color:'var(--muted)',width:14,fontWeight:700}}>{p.num}</div>
                    <div style={{
                      fontSize:11,color:p.status==='overdue'?'var(--red)':p.status==='soon'?'var(--gold)':'var(--muted)',
                      flex:1,fontWeight:(p.status==='overdue'||p.status==='soon')?600:400
                    }}>
                      {new Date(p.plan_date).toLocaleDateString('ru-RU')}
                    </div>
                    <div style={{
                      fontSize:11,fontWeight:700,fontVariantNumeric:'tabular-nums',
                      color:p.status==='paid'?'var(--green)':p.status==='overdue'?'var(--red)':p.status==='soon'?'var(--gold)':'var(--muted)'
                    }}>
                      {Number(p.plan_sum).toLocaleString('ru')} ₽
                    </div>
                    <div style={{
                      width:16,height:16,borderRadius:5,
                      background:p.is_paid?'var(--green)':'transparent',
                      border:p.is_paid?'none':'1.5px solid var(--bor2)',
                      display:'inline-flex',alignItems:'center',justifyContent:'center',flexShrink:0
                    }}>
                      {p.is_paid && <svg viewBox="0 0 9 7" fill="none" stroke="white" strokeWidth="2" width="9" height="9"><polyline points="1,3.5 3.5,6 8,1"/></svg>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  )
}