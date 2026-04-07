import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { logout } from '@/app/login/actions'

export default async function AdminClientsPage() {
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

  const { data: clients } = await supabase
    .from('clients')
    .select(`
      id, name, phone, country, university, status, created_at,
      users!salesperson_id (name),
      curators (name),
      payments (id, is_paid, plan_sum, plan_date)
    `)
    .order('created_at', { ascending: false })

  const statusLabel: Record<string, string> = {
    active: 'Активный', completed: 'Завершён', frozen: 'Заморожен',
  }
  const statusClass: Record<string, string> = {
    active: 'pa', completed: 'pd', frozen: 'pw',
  }

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
          <Link href="/admin/clients" className="ni active">
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" width="16" height="16">
              <rect x="2" y="3" width="12" height="10" rx="2"/>
              <line x1="5" y1="7" x2="11" y2="7"/>
              <line x1="5" y1="10" x2="9" y2="10"/>
            </svg>
            Клиенты
          </Link>
          <Link href="/admin/payments" className="ni">
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
          <div className="pt">Клиенты</div>
          <div className="tbr">
            <span style={{fontSize:12, color:'var(--muted)'}}>
              {clients?.length ?? 0} клиентов
            </span>
            <Link href="/admin/clients/new" className="btn-p">
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="white" strokeWidth="2.2">
                <line x1="6" y1="1" x2="6" y2="11"/>
                <line x1="1" y1="6" x2="11" y2="6"/>
              </svg>
              Новый клиент
            </Link>
            <form action={logout}>
              <button className="btn-s">Выйти</button>
            </form>
          </div>
        </div>

        <div className="cnt">
          <div className="ctrl">
            <div className="sl">Список клиентов</div>
          </div>
          <div className="tw">
            <table>
              <thead>
                <tr>
                  <th>Клиент</th>
                  <th>Телефон</th>
                  <th>Страна</th>
                  <th>Продажник</th>
                  <th>Куратор</th>
                  <th>Договор</th>
                  <th>Оплачено</th>
                  <th>Прогресс</th>
                  <th>Статус</th>
                </tr>
              </thead>
              <tbody>
                {clients?.map((client) => {
                  const payments = client.payments ?? []
                  const paid = payments.filter((p: any) => p.is_paid).length
                  const total = payments.length
                  const paidSum = payments
                    .filter((p: any) => p.is_paid)
                    .reduce((s: number, p: any) => s + Number(p.plan_sum), 0)
                  const totalSum = payments
                    .reduce((s: number, p: any) => s + Number(p.plan_sum), 0)
                  const pct = total > 0 ? Math.round((paid / total) * 100) : 0

                  return (
                    <tr key={client.id}>
                      <td>
                        <div className="cn">{client.name}</div>
                        {client.university && <div className="cs">{client.university}</div>}
                      </td>
                      <td><span style={{fontSize:11, color:'var(--muted)'}}>{client.phone ?? '—'}</span></td>
                      <td><span style={{fontSize:12}}>{client.country ?? '—'}</span></td>
                      <td><span className="stag">{(client.users as any)?.name ?? '—'}</span></td>
                      <td><span className="ctag">{(client.curators as any)?.name ?? '—'}</span></td>
                      <td><span className="num">{totalSum.toLocaleString('ru')} ₽</span></td>
                      <td><span className="num g">{paidSum.toLocaleString('ru')} ₽</span></td>
                      <td>
                        <div className="tp">
                          <div className="tpb">
                            <div className="tpf" style={{width:`${pct}%`}}></div>
                          </div>
                          <div className="tpp">{pct}%</div>
                        </div>
                      </td>
                      <td>
                        <span className={`pill ${statusClass[client.status]}`}>
                          <span className="dot"></span>
                          {statusLabel[client.status]}
                        </span>
                      </td>
                    </tr>
                  )
                })}
                {(!clients || clients.length === 0) && (
                  <tr>
                    <td colSpan={9} style={{textAlign:'center', color:'var(--muted)', padding:'32px'}}>
                      Клиентов пока нет — <Link href="/admin/clients/new" style={{color:'var(--purple)'}}>добавить первого</Link>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}