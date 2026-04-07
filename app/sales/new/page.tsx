// app/sales/new/page.tsx
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClientSales } from './actions'

export default async function NewClientPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('users')
    .select('name, role')
    .eq('id', user.id)
    .single()

  if (profile?.role === 'admin') redirect('/admin/clients')

  const { data: curators } = await supabase.from('curators').select('id, name')

  const today = new Date().toISOString().split('T')[0]

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="lw">
          <div className="lr">
            <div className="li" style={{ background: 'var(--green)' }}>
              <svg viewBox="0 0 14 14" fill="none" stroke="white" strokeWidth="1.8" width="15" height="15">
                <circle cx="7" cy="5" r="3" /><path d="M2 12c0-2.8 2.2-5 5-5s5 2.2 5 5" />
              </svg>
            </div>
            <div className="lt">Go & Study</div>
          </div>
          <div className="ls">Кабинет продажника</div>
        </div>
        <div style={{ margin: '12px 14px 4px', padding: '8px 12px', background: 'rgba(22,163,97,.1)', border: '1px solid rgba(22,163,97,.2)', borderRadius: 10 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--green)' }}>{profile?.name || user.email}</div>
          <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 1 }}>Продажник</div>
        </div>
        <nav className="nav">
          <div className="ns">Основное</div>
          <Link href="/sales" className="ni" style={{ color: 'var(--green)' }}>
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" width="16" height="16">
              <rect x="2" y="3" width="12" height="10" rx="2" />
              <line x1="5" y1="7" x2="11" y2="7" />
              <line x1="5" y1="10" x2="9" y2="10" />
            </svg>
            Мои клиенты
          </Link>
        </nav>
        <div className="sf">
          <div className="ur">
            <div className="av" style={{ background: 'linear-gradient(135deg,#16a361,#0d7a49)' }}>
              {(profile?.name || user.email || 'ПП').split(' ').map((w: string) => w[0]).join('').toUpperCase().slice(0, 2)}
            </div>
            <div>
              <div className="un">{profile?.name || user.email}</div>
              <div className="us">Продажник</div>
            </div>
          </div>
        </div>
      </aside>

      <div className="main">
        <div className="topbar">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Link href="/sales" style={{ color: 'var(--muted)', display: 'flex', alignItems: 'center', textDecoration: 'none' }}>
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" width="16" height="16">
                <path d="M10 13L5 8l5-5" />
              </svg>
            </Link>
            <div className="pt">Новый клиент</div>
          </div>
        </div>

        <div style={{ padding: '24px 28px', maxWidth: 680 }}>
          <form action={createClientSales}>
            {/* Личные данные */}
            <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 14, padding: '20px 24px', marginBottom: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--fg)', marginBottom: 16 }}>Личные данные</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                <div>
                  <label style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600, display: 'block', marginBottom: 5 }}>Имя *</label>
                  <input name="name" required placeholder="Иван Иванов"
                    style={{ width: '100%', padding: '9px 12px', background: 'var(--input)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13, color: 'var(--fg)', boxSizing: 'border-box' }} />
                </div>
                <div>
                  <label style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600, display: 'block', marginBottom: 5 }}>Телефон *</label>
                  <input name="phone" required placeholder="+7 900 000 00 00"
                    style={{ width: '100%', padding: '9px 12px', background: 'var(--input)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13, color: 'var(--fg)', boxSizing: 'border-box' }} />
                </div>
                <div>
                  <label style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600, display: 'block', marginBottom: 5 }}>Email</label>
                  <input name="email" type="email" placeholder="ivan@email.com"
                    style={{ width: '100%', padding: '9px 12px', background: 'var(--input)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13, color: 'var(--fg)', boxSizing: 'border-box' }} />
                </div>
                <div>
                  <label style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600, display: 'block', marginBottom: 5 }}>Telegram</label>
                  <input name="telegram" placeholder="@username"
                    style={{ width: '100%', padding: '9px 12px', background: 'var(--input)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13, color: 'var(--fg)', boxSizing: 'border-box' }} />
                </div>
              </div>
            </div>

            {/* Обучение */}
            <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 14, padding: '20px 24px', marginBottom: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--fg)', marginBottom: 16 }}>Обучение</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                <div>
                  <label style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600, display: 'block', marginBottom: 5 }}>Страна *</label>
                  <input name="country" required placeholder="Германия"
                    style={{ width: '100%', padding: '9px 12px', background: 'var(--input)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13, color: 'var(--fg)', boxSizing: 'border-box' }} />
                </div>
                <div>
                  <label style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600, display: 'block', marginBottom: 5 }}>Университет</label>
                  <input name="university" placeholder="TU Berlin"
                    style={{ width: '100%', padding: '9px 12px', background: 'var(--input)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13, color: 'var(--fg)', boxSizing: 'border-box' }} />
                </div>
                <div>
                  <label style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600, display: 'block', marginBottom: 5 }}>Куратор</label>
                  <select name="curator_id"
                    style={{ width: '100%', padding: '9px 12px', background: 'var(--input)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13, color: 'var(--fg)', boxSizing: 'border-box' }}>
                    <option value="">Не назначен</option>
                    {(curators ?? []).map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* Оплата */}
            <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 14, padding: '20px 24px', marginBottom: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--fg)', marginBottom: 16 }}>Оплата</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14 }}>
                <div>
                  <label style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600, display: 'block', marginBottom: 5 }}>Сумма договора *</label>
                  <input name="total_amount" type="number" required placeholder="150000"
                    style={{ width: '100%', padding: '9px 12px', background: 'var(--input)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13, color: 'var(--fg)', boxSizing: 'border-box' }} />
                </div>
                <div>
                  <label style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600, display: 'block', marginBottom: 5 }}>Кол-во месяцев *</label>
                  <input name="months" type="number" required placeholder="3" min="1" max="24"
                    style={{ width: '100%', padding: '9px 12px', background: 'var(--input)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13, color: 'var(--fg)', boxSizing: 'border-box' }} />
                </div>
                <div>
                  <label style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600, display: 'block', marginBottom: 5 }}>Дата 1-го платежа *</label>
                  <input name="first_pay_date" type="date" required defaultValue={today}
                    style={{ width: '100%', padding: '9px 12px', background: 'var(--input)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13, color: 'var(--fg)', boxSizing: 'border-box' }} />
                </div>
              </div>
              <div style={{ marginTop: 14, padding: '10px 14px', background: 'rgba(22,163,97,.08)', borderRadius: 8, fontSize: 12, color: 'var(--muted)' }}>
                💡 Платежи разобьются автоматически на указанное кол-во месяцев. ЗП продажника — 10% от суммы договора.
              </div>
            </div>

            {/* Заметки */}
            <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 14, padding: '20px 24px', marginBottom: 20 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--fg)', marginBottom: 16 }}>Заметки</div>
              <textarea name="notes" placeholder="Доп. информация о клиенте..." rows={3}
                style={{ width: '100%', padding: '9px 12px', background: 'var(--input)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13, color: 'var(--fg)', resize: 'vertical', boxSizing: 'border-box', fontFamily: 'inherit' }} />
            </div>

            <div style={{ display: 'flex', gap: 10 }}>
              <Link href="/sales" style={{ padding: '10px 20px', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 9, fontSize: 13, fontWeight: 600, color: 'var(--fg)', textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}>
                Отмена
              </Link>
              <button type="submit" style={{ padding: '10px 28px', background: 'var(--green)', color: '#fff', border: 'none', borderRadius: 9, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                Создать клиента
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}