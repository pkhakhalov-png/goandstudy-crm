import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { logout } from '@/app/login/actions'
import { markPaymentPaid } from './actions'

export default async function AdminPaymentsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('users')
    .select('name, role')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'admin') redirect('/sales')

  const initials = (profile?.name || user.email || 'АБ')
    .split(' ').map((w: string) => w[0]).join('').toUpperCase().slice(0, 2)

  const { data: payments } = await supabase
    .from('payments_view')
    .select(`
      id, num, plan_date, plan_sum, fact_sum, fact_date, is_paid, status, comment,
      clients (
        id, name, phone, country, status,
        users!salesperson_id (name),
        curators (name)
      )
    `)
    .order('plan_date', { ascending: true })

  const clientsMap = new Map<number, any>()
  payments?.forEach((p: any) => {
    const clientId = p.clients?.id
    if (!clientId) return
    if (!clientsMap.has(clientId)) {
      clientsMap.set(clientId, { client: p.clients, payments: [] })
    }
    clientsMap.get(clientId).payments.push(p)
  })

  const groups = Array.from(clientsMap.values())

  const totalPlan = payments?.reduce((s: number, p: any) => s + Number(p.plan_sum), 0) ?? 0
  const totalPaid = payments?.filter((p: any) => p.is_paid).reduce((s: number, p: any) => s + Number(p.fact_sum || p.plan_sum), 0) ?? 0
  const totalOverdue = payments?.filter((p: any) => p.status === 'overdue').reduce((s: number, p: any) => s + Number(p.plan_sum), 0) ?? 0
  const totalSoon = payments?.filter((p: any) => p.status === 'soon').reduce((s: number, p: any) => s + Number(p.plan_sum), 0) ?? 0

  const statusLabel: Record<string, string> = {
    paid: 'Оплачен', overdue: 'Просрочен', soon: 'Скоро', pending: 'Ожидается'
  }
  const statusClass: Record<string, string> = {
    paid: 'pa', overdue: 'po', soon: 'ps', pending: 'pw'
  }
  const clientStatusLabel: Record<string, string> = {
    active: 'Активный', completed: 'Завершён', frozen: 'Заморожен'
  }
  const clientStatusClass: Record<string, string> = {
    active: 'pa', completed: 'pd', frozen: 'pw'
  }

  const today = new Date().toISOString().split('T')[0]

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="lw">
          <div className="lr">
            <div className="li">
              <svg viewBox="0 0 14 14" fill="none" stroke="white" strokeWidth="1.8" width="15" height="15">
                <circle cx="7" cy="5" r="3"/><path d="M2 12c0-2.8 2.2-5 5-5s5 2.2 5 5"/>
              </svg>
            </div>
            <div className="lt">Go & Study</div>
          </div>
          <div className="ls">CRM система</div>
        </div>
        <div className="rp">
          <div className="rd"></div>
          <div className="rt2">{profile?.name || user.email}</div>
        </div>
        <nav className="nav">
          <div className="ns">Основное</div>
          <Link href="/admin/clients" className="ni">
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" width="16" height="16">
              <rect x="2" y="3" width="12" height="10" rx="2"/>
              <line x1="5" y1="7" x2="11" y2="7"/>
              <line x1="5" y1="10" x2="9" y2="10"/>
            </svg>
            Клиенты
          </Link>
          <Link href="/admin/payments" className="ni active">
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" width="16" height="16">
              <rect x="1" y="4" width="14" height="9" rx="2"/>
              <line x1="1" y1="8" x2="15" y2="8"/>
            </svg>
            Платежи
          </Link>
          <div className="ns">Система</div>
          <Link href="/admin" className="ni">
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" width="16" height="16">
              <rect x="1" y="1" width="6" height="6" rx="1.5"/>
              <rect x="9" y="1" width="6" height="6" rx="1.5"/>
              <rect x="1" y="9" width="6" height="6" rx="1.5"/>
              <rect x="9" y="9" width="6" height="6" rx="1.5"/>
            </svg>
            Главная
          </Link>
        </nav>
        <div className="sf">
          <div className="ur">
            <div className="av">{initials}</div>
            <div>
              <div className="un">{profile?.name || user.email}</div>
              <div className="us">Администратор</div>
            </div>
          </div>
        </div>
      </aside>

      <div className="main">
        <div className="topbar">
          <div className="pt">Платежи</div>
          <div className="tbr">
            <form action={logout}>
              <button className="btn-s">Выйти</button>
            </form>
          </div>
        </div>

        <div className="kw">
          <div className="kg k4">
            <div className="kc">
              <div className="kl">Всего по договорам</div>
              <div className="kv" style={{fontSize:17}}>{totalPlan.toLocaleString('ru')} ₽</div>
              <div className="ks">{payments?.length ?? 0} платежей</div>
            </div>
            <div className="kc">
              <div className="kl">Оплачено</div>
              <div className="kv g" style={{fontSize:17}}>{totalPaid.toLocaleString('ru')} ₽</div>
              <div className="ks">{payments?.filter((p:any) => p.is_paid).length} платежей</div>
            </div>
            <div className="kc">
              <div className="kl">Просрочено</div>
              <div className="kv r" style={{fontSize:17}}>{totalOverdue.toLocaleString('ru')} ₽</div>
              <div className="ks">{payments?.filter((p:any) => p.status === 'overdue').length} платежей</div>
            </div>
            <div className="kc">
              <div className="kl">Скоро (7 дней)</div>
              <div className="kv o" style={{fontSize:17}}>{totalSoon.toLocaleString('ru')} ₽</div>
              <div className="ks">{payments?.filter((p:any) => p.status === 'soon').length} платежей</div>
            </div>
          </div>
        </div>

        <div className="cnt">
          {groups.length === 0 && (
            <div style={{textAlign:'center', color:'var(--muted)', padding:48}}>
              Платежей пока нет
            </div>
          )}

          {groups.map(({ client, payments: cPayments }) => {
            const paid = cPayments.filter((p: any) => p.is_paid).length
            const total = cPayments.length
            const pct = total > 0 ? Math.round((paid / total) * 100) : 0
            const isDone = client.status === 'completed'

            return (
              <div key={client.id} style={{
                marginBottom: 8,
                border: '1px solid var(--bor)',
                borderRadius: 14,
                background: 'var(--surf)',
                overflow: 'hidden',
                boxShadow: 'var(--sh)',
                opacity: isDone ? 0.5 : 1
              }}>
                <div style={{
                  display:'flex', alignItems:'center', gap:12,
                  padding:'10px 16px', background:'var(--surf2)',
                  borderBottom:'1px solid var(--bor)'
                }}>
                  <div style={{fontWeight:700, fontSize:13}}>{client.name}</div>
                  <div style={{fontSize:11, color:'var(--muted)'}}>· {client.country}</div>
                  <div style={{flex:1}}></div>
                  <div style={{display:'flex', alignItems:'center', gap:8, flexWrap:'wrap'}}>
                    {client.phone && (
                      <span style={{fontSize:10, padding:'3px 9px', borderRadius:6, background:'var(--bg)', color:'var(--muted)', border:'1px solid var(--bor2)', fontWeight:600}}>
                        {client.phone}
                      </span>
                    )}
                    <span className="stag">{(client.users as any)?.name ?? '—'}</span>
                    <span className="ctag">{(client.curators as any)?.name ?? '—'}</span>
                    <div style={{display:'flex', alignItems:'center', gap:6}}>
                      <div style={{width:55, height:4, background:'var(--bor2)', borderRadius:20, overflow:'hidden'}}>
                        <div style={{height:'100%', width:`${pct}%`, background:'linear-gradient(90deg,var(--purple),#d47aff)', borderRadius:20}}></div>
                      </div>
                      <span style={{fontSize:11, fontWeight:700, color:'var(--purple)'}}>{pct}%</span>
                    </div>
                    <span className={`pill ${clientStatusClass[client.status]}`}>
                      <span className="dot"></span>
                      {clientStatusLabel[client.status]}
                    </span>
                  </div>
                </div>

                <table>
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Дата план</th>
                      <th>Сумма план</th>
                      <th>Сумма факт</th>
                      <th>Дата оплаты</th>
                      <th>Комментарий</th>
                      <th>Статус</th>
                      <th>Действие</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cPayments.map((p: any) => (
                      <>
                        <tr key={p.id} style={{
                          borderLeft: p.status === 'paid' ? '3px solid var(--green)' :
                            p.status === 'overdue' ? '3px solid var(--red)' :
                            p.status === 'soon' ? '3px solid var(--gold)' : 'none'
                        }}>
                          <td style={{color:'var(--muted)', fontWeight:700, fontSize:11}}>{p.num}</td>
                          <td style={{
                            color: p.status === 'overdue' ? 'var(--red)' :
                              p.status === 'soon' ? 'var(--gold)' : 'var(--text)',
                            fontWeight: (p.status === 'overdue' || p.status === 'soon') ? 600 : 400
                          }}>
                            {new Date(p.plan_date).toLocaleDateString('ru-RU')}
                          </td>
                          <td><span className="num">{Number(p.plan_sum).toLocaleString('ru')} ₽</span></td>
                          <td>
                            {p.fact_sum
                              ? <span className="num g">{Number(p.fact_sum).toLocaleString('ru')} ₽</span>
                              : <span style={{color:'var(--muted)'}}>—</span>
                            }
                          </td>
                          <td style={{fontSize:11, color:'var(--muted)'}}>
                            {p.fact_date ? new Date(p.fact_date).toLocaleDateString('ru-RU') : '—'}
                          </td>
                          <td style={{fontSize:11, color:'var(--muted)'}}>{p.comment ?? '—'}</td>
                          <td>
                            <span className={`pill ${statusClass[p.status]}`}>
                              <span className="dot"></span>
                              {statusLabel[p.status]}
                            </span>
                          </td>
                          <td>
                            {!p.is_paid && (
                              <form action={markPaymentPaid} style={{display:'inline'}}>
                                <input type="hidden" name="payment_id" value={p.id}/>
                                <input type="hidden" name="fact_sum" value={p.plan_sum}/>
                                <input type="hidden" name="fact_date" value={today}/>
                                <button type="submit" style={{
                                  padding:'4px 10px', background:'var(--green)', color:'#fff',
                                  border:'none', borderRadius:6, fontSize:11, fontWeight:600,
                                  cursor:'pointer', fontFamily:'inherit'
                                }}>
                                  ✓ Оплачен
                                </button>
                              </form>
                            )}
                          </td>
                        </tr>
                      </>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}