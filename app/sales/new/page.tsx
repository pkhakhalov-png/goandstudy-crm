// app/sales/new/page.tsx
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClientSales } from './actions'
import { SubmitButton } from '@/app/_shared/SubmitButton'

const inputStyle = {
  width: '100%',
  padding: '9px 12px',
  background: '#fff',
  border: '1px solid rgba(0,0,0,.12)',
  borderRadius: 8,
  fontSize: 13,
  color: '#14121e',
  boxSizing: 'border-box' as const,
  fontFamily: 'inherit',
  outline: 'none',
}

const labelStyle = {
  fontSize: 11,
  color: '#8a8796',
  fontWeight: 600 as const,
  display: 'block' as const,
  marginBottom: 5,
  textTransform: 'uppercase' as const,
  letterSpacing: '0.05em',
}

const cardStyle = {
  background: '#fff',
  border: '1px solid rgba(0,0,0,.07)',
  borderRadius: 14,
  padding: '20px 24px',
  marginBottom: 16,
  boxShadow: '0 1px 4px rgba(0,0,0,.07)',
}

export default async function NewClientPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const sp = await searchParams
  const errorMsg = sp?.error
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('users')
    .select('name, role')
    .eq('id', user.id)
    .single()

  if (profile?.role === 'admin') redirect('/admin/clients')
  if (profile?.role === 'rop') redirect('/rop')

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
            <div className="lt">GoAndStudy</div>
          </div>
          <div className="ls">Кабинет продажника</div>
        </div>
        <div style={{ margin: '12px 14px 4px', padding: '8px 12px', background: 'rgba(22,163,97,.1)', border: '1px solid rgba(22,163,97,.2)', borderRadius: 10 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--green)' }}>{profile?.name || user.email}</div>
          <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 1 }}>Продажник</div>
        </div>
        <nav className="nav">
          <div className="ns">Основное</div>
          <Link href="/sales" className="ni">
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
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" width="18" height="18">
                <path d="M10 13L5 8l5-5" />
              </svg>
            </Link>
            <div className="pt">Новый клиент</div>
          </div>
        </div>

        <div style={{ padding: '24px 28px', maxWidth: 700 }}>
          {errorMsg && (
            <div style={{ marginBottom: 16, padding: '12px 16px', background: 'rgba(220,53,69,.08)', border: '1px solid rgba(220,53,69,.25)', borderRadius: 10, color: 'var(--red)', fontSize: 13 }}>
              ⚠ {errorMsg}
            </div>
          )}
          <form action={createClientSales}>

            {/* Личные данные */}
            <div style={cardStyle}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#14121e', marginBottom: 16, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Личные данные</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                <div>
                  <label style={labelStyle}>Имя *</label>
                  <input name="first_name" required placeholder="Иван" style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Фамилия *</label>
                  <input name="last_name" required placeholder="Иванов" style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Телефон *</label>
                  <input name="phone" required placeholder="+7 900 000 00 00" style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Email</label>
                  <input name="email" type="email" placeholder="ivan@email.com" style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Telegram</label>
                  <input name="telegram" placeholder="@username" style={inputStyle} />
                </div>
              </div>
            </div>

            {/* Обучение */}
            <div style={cardStyle}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#14121e', marginBottom: 16, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Обучение</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                <div>
                  <label style={labelStyle}>Страна *</label>
                  <input name="country" required placeholder="Германия" style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Университет</label>
                  <input name="university" placeholder="TU Berlin" style={inputStyle} />
                </div>
                <div style={{ gridColumn: '1 / -1' }}>
                  <label style={labelStyle}>Куратор</label>
                  <select name="curator_id" style={{ ...inputStyle, appearance: 'none' as const }}>
                    <option value="">Не назначен</option>
                    {(curators ?? []).map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* Оплата */}
            <div style={cardStyle}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#14121e', marginBottom: 16, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Оплата</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14 }}>
                <div>
                  <label style={labelStyle}>Сумма договора *</label>
                  <input name="total_amount" type="number" required placeholder="150000" style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Кол-во месяцев *</label>
                  <input name="months" type="number" required placeholder="3" min="1" max="24" style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Дата 1-го платежа *</label>
                  <input name="first_pay_date" type="date" required defaultValue={today} style={inputStyle} />
                </div>
              </div>
              <div style={{ marginTop: 14, padding: '10px 14px', background: 'rgba(22,163,97,.07)', border: '1px solid rgba(22,163,97,.15)', borderRadius: 8, fontSize: 12, color: 'var(--muted)' }}>
                💡 Платежи разобьются автоматически на указанное кол-во месяцев. ЗП продажника — 10% от суммы договора.
              </div>
            </div>

            {/* Заметки */}
            <div style={cardStyle}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#14121e', marginBottom: 16, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Заметки</div>
              <textarea name="notes" placeholder="Доп. информация о клиенте..." rows={3}
                style={{ ...inputStyle, resize: 'vertical' }} />
            </div>

            <div style={{ display: 'flex', gap: 10 }}>
              <Link href="/sales" className="btn-s" style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}>
                Отмена
              </Link>
              <SubmitButton className="btn-p" pendingText="Создание…">
                Создать клиента
              </SubmitButton>
            </div>

          </form>
        </div>
      </div>
    </div>
  )
}