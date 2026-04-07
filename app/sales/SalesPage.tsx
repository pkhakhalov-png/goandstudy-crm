'use client'

import { useState } from 'react'

interface Props {
  clients: any[]
}

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

export function SalesPage({ clients }: Props) {
  const [selected, setSelected] = useState<any>(null)
  const [search, setSearch] = useState('')

  const filtered = clients.filter(c =>
    !search || c.name.toLowerCase().includes(search.toLowerCase())
  )

  const totalPlan = clients.reduce((s,c) => s+(c.payments?.reduce((ps:number,p:any)=>ps+Number(p.plan_sum),0)??0),0)
  const totalPaid = clients.reduce((s,c) => s+(c.payments?.filter((p:any)=>p.is_paid).reduce((ps:number,p:any)=>ps+Number(p.plan_sum),0)??0),0)
  const totalOverdue = clients.reduce((s,c) => s+(c.payments?.filter((p:any)=>p.status==='overdue').reduce((ps:number,p:any)=>ps+Number(p.plan_sum),0)??0),0)
  const totalSoon = clients.reduce((s,c) => s+(c.payments?.filter((p:any)=>p.status==='soon').reduce((ps:number,p:any)=>ps+Number(p.plan_sum),0)??0),0)

  const sel = selected
  const selPayments = (sel?.payments ?? []).sort((a:any,b:any) => a.num - b.num)
  const selPaidSum = selPayments.filter((p:any)=>p.is_paid).reduce((s:number,p:any)=>s+Number(p.plan_sum),0)
  const selTotalSum = selPayments.reduce((s:number,p:any)=>s+Number(p.plan_sum),0)
  const selDebt = selTotalSum - selPaidSum
  const selPct = selPayments.length>0 ? Math.round(selPayments.filter((p:any)=>p.is_paid).length/selPayments.length*100) : 0

  return (
    <>
      {/* Overlay */}
      {sel && (
        <div
          onClick={() => setSelected(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.25)', zIndex: 40, backdropFilter: 'blur(1px)' }}
        />
      )}

      {/* Drawer */}
      <div style={{
        position: 'fixed', top: 0, right: 0, bottom: 0, width: 320,
        background: '#fff', boxShadow: '-4px 0 24px rgba(0,0,0,.12)',
        zIndex: 50,
        transform: sel ? 'translateX(0)' : 'translateX(100%)',
        transition: 'transform 0.25s cubic-bezier(.4,0,.2,1)',
        display: 'flex', flexDirection: 'column', overflowY: 'auto',
      }}>
        {sel && (
          <>
            <div style={{ padding: '18px 20px 14px', borderBottom: '1px solid rgba(0,0,0,.07)', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700, color: '#14121e' }}>{sel.name}</div>
                <div style={{ fontSize: 12, color: '#8a8796', marginTop: 2 }}>
                  {sel.country}{sel.university ? ` · ${sel.university}` : ''}
                </div>
              </div>
              <button onClick={() => setSelected(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: '#8a8796', padding: '0 4px', lineHeight: 1 }}>×</button>
            </div>

            <div style={{ padding: '14px 20px', flex: 1 }}>
              {sel.phone && <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid rgba(0,0,0,.06)', fontSize: 12 }}>
                <span style={{ color: '#8a8796' }}>Телефон</span><span style={{ fontWeight: 600 }}>{sel.phone}</span>
              </div>}
              {sel.telegram && <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid rgba(0,0,0,.06)', fontSize: 12 }}>
                <span style={{ color: '#8a8796' }}>Telegram</span><span style={{ fontWeight: 600 }}>{sel.telegram}</span>
              </div>}
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid rgba(0,0,0,.06)', fontSize: 12 }}>
                <span style={{ color: '#8a8796' }}>Куратор</span>
                <span style={{ fontWeight: 600, color: '#B15ECC' }}>{sel.curator?.name ?? '—'}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid rgba(0,0,0,.06)', fontSize: 12 }}>
                <span style={{ color: '#8a8796' }}>Договор</span>
                <span style={{ fontWeight: 600 }}>{selTotalSum.toLocaleString('ru')} ₽</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid rgba(0,0,0,.06)', fontSize: 12 }}>
                <span style={{ color: '#8a8796' }}>Рассрочка</span>
                <span style={{ fontWeight: 600 }}>{sel.months} мес.</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid rgba(0,0,0,.06)', fontSize: 12 }}>
                <span style={{ color: '#8a8796' }}>Оплачено</span>
                <span style={{ fontWeight: 600, color: '#16a361' }}>{selPaidSum.toLocaleString('ru')} ₽</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid rgba(0,0,0,.06)', fontSize: 12 }}>
                <span style={{ color: '#8a8796' }}>Остаток</span>
                <span style={{ fontWeight: 600, color: '#c97d00' }}>{selDebt.toLocaleString('ru')} ₽</span>
              </div>

              <div style={{ margin: '14px 0 2px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#8a8796', marginBottom: 5, fontWeight: 500 }}>
                  <span>Прогресс</span><span>{selPct}%</span>
                </div>
                <div style={{ height: 6, background: 'rgba(0,0,0,.08)', borderRadius: 20, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${selPct}%`, background: 'linear-gradient(90deg,#16a361,#5fd6a4)', borderRadius: 20 }} />
                </div>
              </div>

              <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#b8b5c4', fontWeight: 600, margin: '18px 0 10px' }}>
                График платежей
              </div>
              {selPayments.map((p: any) => (
                <div key={p.id} style={{
                  display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px',
                  borderRadius: 9, marginBottom: 5,
                  border: `1px solid ${p.status==='paid'?'rgba(22,163,97,.2)':p.status==='overdue'?'rgba(220,53,69,.2)':p.status==='soon'?'rgba(201,125,0,.2)':'rgba(0,0,0,.07)'}`,
                  background: p.status==='paid'?'rgba(22,163,97,.05)':p.status==='overdue'?'rgba(220,53,69,.05)':p.status==='soon'?'rgba(201,125,0,.05)':'#F9F8FC'
                }}>
                  <div style={{ fontSize: 10, color: '#8a8796', width: 14, fontWeight: 700 }}>{p.num}</div>
                  <div style={{ fontSize: 11, flex: 1, color: p.status==='overdue'?'#dc3545':p.status==='soon'?'#c97d00':'#8a8796', fontWeight: (p.status==='overdue'||p.status==='soon')?600:400 }}>
                    {new Date(p.plan_date).toLocaleDateString('ru-RU')}
                  </div>
                  <div style={{ fontSize: 11, fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: p.status==='paid'?'#16a361':p.status==='overdue'?'#dc3545':p.status==='soon'?'#c97d00':'#8a8796' }}>
                    {Number(p.plan_sum).toLocaleString('ru')} ₽
                  </div>
                  <div style={{ width: 16, height: 16, borderRadius: 5, flexShrink: 0, background: p.is_paid?'#16a361':'transparent', border: p.is_paid?'none':'1.5px solid rgba(0,0,0,.12)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                    {p.is_paid && <svg viewBox="0 0 9 7" fill="none" stroke="white" strokeWidth="2" width="9" height="9"><polyline points="1,3.5 3.5,6 8,1"/></svg>}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* KPI */}
      <div className="kw">
        <div className="kg k4" style={{ marginBottom: 14 }}>
          <div className="kc">
            <div className="kl">Моих клиентов</div>
            <div className="kv" style={{ color: 'var(--green)' }}>{clients.length}</div>
            <div className="ks">{clients.filter(c=>c.status==='active').length} активных</div>
          </div>
          <div className="kc">
            <div className="kl">Продано (план)</div>
            <div className="kv" style={{ fontSize: 17 }}>{totalPlan.toLocaleString('ru')} ₽</div>
            <div className="ks">по договорам</div>
          </div>
          <div className="kc">
            <div className="kl">Оплачено</div>
            <div className="kv g" style={{ fontSize: 17 }}>{totalPaid.toLocaleString('ru')} ₽</div>
            <div className="ks">{totalPlan>0?Math.round(totalPaid/totalPlan*100):0}% от плана</div>
          </div>
          <div className="kc">
            <div className="kl">Просрочено</div>
            <div className="kv r" style={{ fontSize: 17 }}>{totalOverdue.toLocaleString('ru')} ₽</div>
            <div className="ks">скоро: {totalSoon.toLocaleString('ru')} ₽</div>
          </div>
        </div>
      </div>

      {/* Таблица */}
      <div className="cnt">
        <div className="ctrl">
          <div className="sl">Список клиентов</div>
          <div className="cr">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--surf)', border: '1px solid var(--bor2)', borderRadius: 9, padding: '7px 13px' }}>
              <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="var(--muted)" strokeWidth="1.6"><circle cx="7" cy="7" r="5"/><line x1="11" y1="11" x2="14" y2="14"/></svg>
              <input
                placeholder="Найти клиента..."
                value={search}
                onChange={e=>setSearch(e.target.value)}
                style={{ background: 'transparent', border: 'none', outline: 'none', fontSize: 13, color: 'var(--text)', width: 160, fontFamily: 'inherit' }}
              />
            </div>
          </div>
        </div>

        <div className="tw" style={{ overflowX: 'auto' }}>
          <table style={{ minWidth: 650 }}>
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
              {filtered.map((c: any) => {
                const pays = c.payments ?? []
                const paidS = pays.filter((p:any)=>p.is_paid).reduce((s:number,p:any)=>s+Number(p.plan_sum),0)
                const totalS = pays.reduce((s:number,p:any)=>s+Number(p.plan_sum),0)
                const debt = totalS - paidS
                const pct = pays.length>0 ? Math.round(pays.filter((p:any)=>p.is_paid).length/pays.length*100) : 0
                const isSel = sel?.id === c.id
                const { label, cls } = getPaymentStatus(c)

                return (
                  <tr key={c.id} onClick={() => setSelected(c)}
                    style={{ background: isSel ? 'rgba(22,163,97,.07)' : 'transparent', cursor: 'pointer' }}>
                    <td>
                      <div className="cn">{c.name}</div>
                      {c.country && <div className="cs">{c.country}{c.university ? ` · ${c.university}` : ''}</div>}
                    </td>
                    <td><span className="ctag">{c.curator?.name ?? '—'}</span></td>
                    <td><span className="num">{totalS.toLocaleString('ru')} ₽</span></td>
                    <td><span className="num g">{paidS.toLocaleString('ru')} ₽</span></td>
                    <td><span className={`num ${debt>0?'o':'m'}`}>{debt.toLocaleString('ru')} ₽</span></td>
                    <td>
                      <div className="tp">
                        <div className="tpb"><div className="tpf" style={{ width: `${pct}%`, background: 'linear-gradient(90deg,#16a361,#5fd6a4)' }}></div></div>
                        <div className="tpp" style={{ color: 'var(--green)' }}>{pct}%</div>
                      </div>
                    </td>
                    <td>
                      <span className={`pill ${cls}`}>
                        <span className="dot"></span>
                        {label}
                      </span>
                    </td>
                  </tr>
                )
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', color: 'var(--muted)', padding: 32 }}>
                    {clients.length === 0 ? 'Клиентов пока нет' : 'Нет клиентов по поиску'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}