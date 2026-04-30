'use client'

import { useState } from 'react'
import {
  addSalesperson, deactivateSalesperson, activateSalesperson, resetSalespersonPassword, updateSalespersonTg,
  addCurator, deactivateCurator, activateCurator, updateCuratorName,
  addFixedExpense, updateFixedExpense, toggleFixedExpense, deleteFixedExpense
} from './actions'

type Salesperson = { id: string; name: string; email: string; is_active: boolean; telegram_username: string | null }
type Curator = { id: string; name: string; is_active: boolean }
type FixedExpense = { id: string; name: string; period: string; article: string; is_active: boolean }

const cardStyle = {
  background: '#fff', border: '1px solid rgba(0,0,0,.07)', borderRadius: 14,
  overflow: 'hidden' as const, boxShadow: '0 1px 4px rgba(0,0,0,.07)', marginBottom: 20,
}
const inputStyle = {
  flex: 1, padding: '8px 12px', border: '1px solid rgba(0,0,0,.12)', borderRadius: 8,
  fontSize: 13, fontFamily: 'inherit', outline: 'none', background: '#fff', color: '#14121e', minWidth: 120,
}
const thStyle = {
  padding: '10px 20px', fontSize: 10, color: '#8a8796', fontWeight: 600 as const,
  textAlign: 'left' as const, textTransform: 'uppercase' as const, letterSpacing: '0.05em', background: '#F9F8FC'
}
const periodLabel: Record<string,string> = { monthly:'Ежемесячно', quarterly:'Ежеквартально', yearly:'Ежегодно', once:'Разово' }
const articleLabel: Record<string,string> = { office:'Офис', salary:'ЗП', software:'ПО/Подписки', marketing:'Маркетинг', other:'Прочее' }

export function SettingsClient({ salespersons, curators, fixedExpenses, bookings }: {
  salespersons: Salesperson[]
  curators: Curator[]
  fixedExpenses: FixedExpense[]
  bookings: any[]
}) {
  const [newPassword, setNewPassword] = useState<string | null>(null)
  const [newPasswordName, setNewPasswordName] = useState<string | null>(null)
  const [editingCurator, setEditingCurator] = useState<string | null>(null)
  const [editingFixed, setEditingFixed] = useState<string | null>(null)
  const [bookingFilter, setBookingFilter] = useState('')
  const [bookingStatusFilter, setBookingStatusFilter] = useState('')
  const [bookingSearch, setBookingSearch] = useState('')
  const [settingsTab, setSettingsTab] = useState<'team' | 'expenses' | 'bookings'>('team')

  async function handleAddSalesperson(formData: FormData) {
    const result = await addSalesperson(formData)
    if (result.password) { setNewPasswordName(formData.get('name') as string); setNewPassword(result.password) }
  }

  async function handleResetPassword(formData: FormData) {
    const result = await resetSalespersonPassword(formData)
    if (result.password) { setNewPasswordName(formData.get('name') as string); setNewPassword(result.password) }
  }

  return (
    <div style={{ padding: '24px 28px', maxWidth: 960 }}>

      {/* Подразделы */}
      <div style={{ display: 'flex', gap: 0, marginBottom: 20, background: 'rgba(255,255,255,.55)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', border: '1px solid rgba(0,0,0,.07)', borderRadius: 14, overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,.05)' }}>
        {([['team', 'Команда'], ['expenses', 'Постоянные расходы'], ['bookings', `Записи клиентов (${bookings.length})`]] as const).map(([key, label]) => (
          <button key={key} onClick={() => setSettingsTab(key)}
            style={{
              flex: 1, padding: '12px 16px', fontSize: 13, fontWeight: settingsTab === key ? 700 : 500,
              color: settingsTab === key ? 'var(--purple)' : '#8a8796',
              background: settingsTab === key ? 'rgba(177,94,204,.06)' : 'transparent',
              border: 'none', borderBottom: settingsTab === key ? '2.5px solid var(--purple)' : '2.5px solid transparent',
              cursor: 'pointer', fontFamily: 'inherit', transition: 'all .15s',
            }}>
            {label}
          </button>
        ))}
      </div>

      {/* Пароль баннер */}
      {newPassword && (
        <div style={{ marginBottom: 16, padding: '14px 20px', background: 'rgba(22,163,97,.08)', border: '1px solid rgba(22,163,97,.2)', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>✅ Пароль для {newPasswordName}</div>
            <div style={{ fontSize: 13, color: '#8a8796' }}>Пароль: <strong style={{ fontFamily: 'monospace', fontSize: 15, color: '#16a361' }}>{newPassword}</strong></div>
          </div>
          <button onClick={() => setNewPassword(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: '#8a8796' }}>×</button>
        </div>
      )}

      {/* Продажники */}
      {settingsTab === 'team' && <div style={cardStyle}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid rgba(0,0,0,.07)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontSize: 13, fontWeight: 700 }}>Продажники</div>
          <div style={{ fontSize: 11, color: '#8a8796' }}>{salespersons.length} чел.</div>
        </div>
        <form action={handleAddSalesperson} style={{ padding: '14px 20px', background: '#F9F8FC', borderBottom: '1px solid rgba(0,0,0,.07)', display: 'flex', gap: 8, flexWrap: 'wrap' as const }}>
          <input name="name" required placeholder="Имя" style={inputStyle} />
          <input name="email" type="email" required placeholder="Email" style={inputStyle} />
          <button type="submit" style={{ padding: '8px 16px', background: '#B15ECC', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' as const }}>+ Добавить</button>
        </form>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr><th style={thStyle}>Имя</th><th style={thStyle}>Email</th><th style={thStyle}>TG для уведомлений</th><th style={thStyle}>Статус</th><th style={{ ...thStyle, textAlign: 'right' as const }}></th></tr></thead>
          <tbody>
            {salespersons.map(s => (
              <tr key={s.id} style={{ borderBottom: '1px solid rgba(0,0,0,.07)' }}>
                <td style={{ padding: '12px 20px', fontSize: 13, fontWeight: 600 }}>{s.name}</td>
                <td style={{ padding: '12px 20px', fontSize: 12, color: '#8a8796' }}>{s.email}</td>
                <td style={{ padding: '12px 20px' }}>
                  <form action={updateSalespersonTg} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <input type="hidden" name="id" value={s.id} />
                    <span style={{ fontSize: 12, color: '#8a8796' }}>@</span>
                    <input
                      name="telegram_username"
                      defaultValue={s.telegram_username || ''}
                      placeholder="username"
                      style={{ padding: '5px 8px', border: '1px solid rgba(0,0,0,.12)', borderRadius: 6, fontSize: 12, fontFamily: 'inherit', outline: 'none', width: 140 }}
                    />
                    <button type="submit" style={{ padding: '4px 10px', background: '#fff', border: '1px solid rgba(0,0,0,.12)', borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: 'pointer', color: '#B15ECC', fontFamily: 'inherit' }}>OK</button>
                  </form>
                </td>
                <td style={{ padding: '12px 20px' }}>
                  {s.is_active
                    ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 20, fontSize: 10, fontWeight: 600, background: 'rgba(22,163,97,.1)', color: '#16a361' }}>● Активен</span>
                    : <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 20, fontSize: 10, fontWeight: 600, background: 'rgba(138,135,150,.1)', color: '#8a8796' }}>● Неактивен</span>
                  }
                </td>
                <td style={{ padding: '12px 20px' }}>
                  <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                    <form action={handleResetPassword} style={{ display: 'inline' }}>
                      <input type="hidden" name="id" value={s.id} />
                      <input type="hidden" name="name" value={s.name} />
                      <button type="submit" style={{ padding: '5px 12px', background: '#fff', border: '1px solid rgba(0,0,0,.12)', borderRadius: 7, fontSize: 11, fontWeight: 600, cursor: 'pointer', color: '#B15ECC', fontFamily: 'inherit' }}>Сбросить пароль</button>
                    </form>
                    <form action={s.is_active ? deactivateSalesperson : activateSalesperson} style={{ display: 'inline' }}>
                      <input type="hidden" name="id" value={s.id} />
                      <button type="submit" style={{ padding: '5px 12px', background: '#fff', border: '1px solid rgba(0,0,0,.12)', borderRadius: 7, fontSize: 11, fontWeight: 600, cursor: 'pointer', color: s.is_active ? '#dc3545' : '#16a361', fontFamily: 'inherit' }}>
                        {s.is_active ? 'Деактивировать' : 'Активировать'}
                      </button>
                    </form>
                  </div>
                </td>
              </tr>
            ))}
            {salespersons.length === 0 && <tr><td colSpan={5} style={{ padding: '20px', textAlign: 'center', fontSize: 12, color: '#8a8796' }}>Нет продажников</td></tr>}
          </tbody>
        </table>
      </div>}

      {/* Кураторы */}
      {settingsTab === 'team' && <div style={cardStyle}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid rgba(0,0,0,.07)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontSize: 13, fontWeight: 700 }}>Кураторы</div>
          <div style={{ fontSize: 11, color: '#8a8796' }}>{curators.length} чел.</div>
        </div>
        <form action={addCurator} style={{ padding: '14px 20px', background: '#F9F8FC', borderBottom: '1px solid rgba(0,0,0,.07)', display: 'flex', gap: 8 }}>
          <input name="name" required placeholder="Имя куратора" style={inputStyle} />
          <button type="submit" style={{ padding: '8px 16px', background: '#B15ECC', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' as const }}>+ Добавить</button>
        </form>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr><th style={thStyle}>Имя</th><th style={thStyle}>Статус</th><th style={{ ...thStyle, textAlign: 'right' as const }}></th></tr></thead>
          <tbody>
            {curators.map(c => (
              <tr key={c.id} style={{ borderBottom: '1px solid rgba(0,0,0,.07)' }}>
                <td style={{ padding: '12px 20px' }}>
                  {editingCurator === c.id ? (
                    <form action={async (fd) => { await updateCuratorName(fd); setEditingCurator(null) }} style={{ display: 'flex', gap: 6 }}>
                      <input type="hidden" name="id" value={c.id} />
                      <input name="name" defaultValue={c.name} style={{ ...inputStyle, flex: 'none', width: 160 }} autoFocus />
                      <button type="submit" style={{ padding: '5px 10px', background: '#16a361', color: '#fff', border: 'none', borderRadius: 7, fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>✓</button>
                      <button type="button" onClick={() => setEditingCurator(null)} style={{ padding: '5px 10px', background: '#fff', border: '1px solid rgba(0,0,0,.12)', borderRadius: 7, fontSize: 11, cursor: 'pointer' }}>✕</button>
                    </form>
                  ) : (
                    <span style={{ fontSize: 13, fontWeight: 600 }}>{c.name}</span>
                  )}
                </td>
                <td style={{ padding: '12px 20px' }}>
                  {c.is_active
                    ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 20, fontSize: 10, fontWeight: 600, background: 'rgba(22,163,97,.1)', color: '#16a361' }}>● Активен</span>
                    : <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 20, fontSize: 10, fontWeight: 600, background: 'rgba(138,135,150,.1)', color: '#8a8796' }}>● Неактивен</span>
                  }
                </td>
                <td style={{ padding: '12px 20px' }}>
                  <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                    <button type="button" onClick={() => setEditingCurator(c.id)} style={{ padding: '5px 12px', background: '#fff', border: '1px solid rgba(0,0,0,.12)', borderRadius: 7, fontSize: 11, fontWeight: 600, cursor: 'pointer', color: '#8a8796', fontFamily: 'inherit' }}>Переименовать</button>
                    <form action={c.is_active ? deactivateCurator : activateCurator} style={{ display: 'inline' }}>
                      <input type="hidden" name="id" value={c.id} />
                      <button type="submit" style={{ padding: '5px 12px', background: '#fff', border: '1px solid rgba(0,0,0,.12)', borderRadius: 7, fontSize: 11, fontWeight: 600, cursor: 'pointer', color: c.is_active ? '#dc3545' : '#16a361', fontFamily: 'inherit' }}>
                        {c.is_active ? 'Деактивировать' : 'Активировать'}
                      </button>
                    </form>
                  </div>
                </td>
              </tr>
            ))}
            {curators.length === 0 && <tr><td colSpan={3} style={{ padding: '20px', textAlign: 'center', fontSize: 12, color: '#8a8796' }}>Нет кураторов</td></tr>}
          </tbody>
        </table>
      </div>}

      {/* Фиксированные расходы */}
      {settingsTab === 'expenses' && <div style={cardStyle}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid rgba(0,0,0,.07)' }}>
          <div style={{ fontSize: 13, fontWeight: 700 }}>Фиксированные расходы</div>
          <div style={{ fontSize: 11, color: '#8a8796', marginTop: 2 }}>Справочник статей — суммы вносятся в разделе Расходы по каждому месяцу</div>
        </div>
        <form action={addFixedExpense} style={{ padding: '14px 20px', background: '#F9F8FC', borderBottom: '1px solid rgba(0,0,0,.07)' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr auto', gap: 8, alignItems: 'flex-end' }}>
            <div>
              <div style={{ fontSize: 10, color: '#8a8796', fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '0.05em', marginBottom: 4 }}>Название *</div>
              <input name="name" required placeholder="Аренда офиса, ЗП бухгалтера..." style={{ ...inputStyle, flex: 'none', width: '100%' }} />
            </div>
            <div>
              <div style={{ fontSize: 10, color: '#8a8796', fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '0.05em', marginBottom: 4 }}>Период</div>
              <select name="period" style={{ width: '100%', padding: '8px 12px', border: '1px solid rgba(0,0,0,.12)', borderRadius: 8, fontSize: 13, fontFamily: 'inherit', outline: 'none', background: '#fff' }}>
                <option value="monthly">Ежемесячно</option>
                <option value="quarterly">Ежеквартально</option>
                <option value="yearly">Ежегодно</option>
                <option value="once">Разово</option>
              </select>
            </div>
            <div>
              <div style={{ fontSize: 10, color: '#8a8796', fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '0.05em', marginBottom: 4 }}>Статья</div>
              <select name="article" style={{ width: '100%', padding: '8px 12px', border: '1px solid rgba(0,0,0,.12)', borderRadius: 8, fontSize: 13, fontFamily: 'inherit', outline: 'none', background: '#fff' }}>
                <option value="office">Офис</option>
                <option value="salary">ЗП</option>
                <option value="software">ПО/Подписки</option>
                <option value="marketing">Маркетинг</option>
                <option value="other">Прочее</option>
              </select>
            </div>
            <button type="submit" style={{ padding: '8px 16px', background: '#B15ECC', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' as const }}>+ Добавить</button>
          </div>
        </form>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr>
            <th style={thStyle}>Название</th>
            <th style={thStyle}>Статья</th>
            <th style={thStyle}>Период</th>
            <th style={thStyle}>Статус</th>
            <th style={{ ...thStyle, textAlign: 'right' as const }}></th>
          </tr></thead>
          <tbody>
            {fixedExpenses.map(e => (
              <tr key={e.id} style={{ borderBottom: '1px solid rgba(0,0,0,.07)', opacity: e.is_active ? 1 : 0.5 }}>
                <td style={{ padding: '12px 20px' }}>
                  {editingFixed === e.id ? (
                    <form action={async (fd) => { await updateFixedExpense(fd); setEditingFixed(null) }} style={{ display: 'flex', gap: 6, flexWrap: 'wrap' as const }}>
                      <input type="hidden" name="id" value={e.id} />
                      <input name="name" defaultValue={e.name} style={{ ...inputStyle, flex: 'none', width: 200 }} autoFocus />
                      <select name="period" defaultValue={e.period} style={{ padding: '7px 10px', border: '1px solid rgba(0,0,0,.12)', borderRadius: 7, fontSize: 12, fontFamily: 'inherit', outline: 'none', background: '#fff' }}>
                        <option value="monthly">Ежемесячно</option>
                        <option value="quarterly">Ежеквартально</option>
                        <option value="yearly">Ежегодно</option>
                        <option value="once">Разово</option>
                      </select>
                      <select name="article" defaultValue={e.article} style={{ padding: '7px 10px', border: '1px solid rgba(0,0,0,.12)', borderRadius: 7, fontSize: 12, fontFamily: 'inherit', outline: 'none', background: '#fff' }}>
                        <option value="office">Офис</option>
                        <option value="salary">ЗП</option>
                        <option value="software">ПО/Подписки</option>
                        <option value="marketing">Маркетинг</option>
                        <option value="other">Прочее</option>
                      </select>
                      <button type="submit" style={{ padding: '5px 10px', background: '#16a361', color: '#fff', border: 'none', borderRadius: 7, fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>✓</button>
                      <button type="button" onClick={() => setEditingFixed(null)} style={{ padding: '5px 10px', background: '#fff', border: '1px solid rgba(0,0,0,.12)', borderRadius: 7, fontSize: 11, cursor: 'pointer' }}>✕</button>
                    </form>
                  ) : (
                    <span style={{ fontSize: 13, fontWeight: 600 }}>{e.name}</span>
                  )}
                </td>
                <td style={{ padding: '12px 20px' }}>
                  <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 6, background: 'rgba(177,94,204,.08)', color: '#B15ECC', border: '1px solid rgba(177,94,204,.2)', fontWeight: 600 }}>
                    {articleLabel[e.article] || e.article}
                  </span>
                </td>
                <td style={{ padding: '12px 20px', fontSize: 12, color: '#8a8796' }}>{periodLabel[e.period] || e.period}</td>
                <td style={{ padding: '12px 20px' }}>
                  {e.is_active
                    ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 20, fontSize: 10, fontWeight: 600, background: 'rgba(22,163,97,.1)', color: '#16a361' }}>● Активна</span>
                    : <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 20, fontSize: 10, fontWeight: 600, background: 'rgba(138,135,150,.1)', color: '#8a8796' }}>● Неактивна</span>
                  }
                </td>
                <td style={{ padding: '12px 20px' }}>
                  <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                    <button type="button" onClick={() => setEditingFixed(e.id)} style={{ padding: '5px 12px', background: '#fff', border: '1px solid rgba(0,0,0,.12)', borderRadius: 7, fontSize: 11, fontWeight: 600, cursor: 'pointer', color: '#8a8796', fontFamily: 'inherit' }}>Изменить</button>
                    <form action={toggleFixedExpense} style={{ display: 'inline' }}>
                      <input type="hidden" name="id" value={e.id} />
                      <input type="hidden" name="is_active" value={String(e.is_active)} />
                      <button type="submit" style={{ padding: '5px 12px', background: '#fff', border: '1px solid rgba(0,0,0,.12)', borderRadius: 7, fontSize: 11, fontWeight: 600, cursor: 'pointer', color: e.is_active ? '#dc3545' : '#16a361', fontFamily: 'inherit' }}>
                        {e.is_active ? 'Отключить' : 'Включить'}
                      </button>
                    </form>
                    <form action={deleteFixedExpense} style={{ display: 'inline' }}>
                      <input type="hidden" name="id" value={e.id} />
                      <button type="submit" style={{ padding: '5px 12px', background: '#fff', border: '1px solid rgba(220,53,69,.2)', borderRadius: 7, fontSize: 11, fontWeight: 600, cursor: 'pointer', color: '#dc3545', fontFamily: 'inherit' }}>Удалить</button>
                    </form>
                  </div>
                </td>
              </tr>
            ))}
            {fixedExpenses.length === 0 && <tr><td colSpan={5} style={{ padding: '20px', textAlign: 'center', fontSize: 12, color: '#8a8796' }}>Нет статей</td></tr>}
          </tbody>
        </table>
      </div>}

      {/* ═══ ЗАПИСИ КЛИЕНТОВ ═══ */}
      {settingsTab === 'bookings' && (() => {
        const today = new Date().toISOString().split('T')[0]
        const thisWeekStart = new Date()
        thisWeekStart.setDate(thisWeekStart.getDate() - thisWeekStart.getDay() + 1)
        const weekStr = thisWeekStart.toISOString().split('T')[0]
        const monthStr = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}-01`

        const statusMap: Record<string, { label: string; cls: string }> = {
          confirmed: { label: 'Подтверждена', cls: 'ps' },
          completed: { label: 'Проведена', cls: 'pa' },
          cancelled: { label: 'Отменена', cls: 'po' },
          no_show: { label: 'Не пришёл', cls: 'po' },
        }

        const todayCount = bookings.filter(b => b.booking_date === today && b.status !== 'cancelled').length
        const weekCount = bookings.filter(b => b.booking_date >= weekStr && b.booking_date <= today && b.status !== 'cancelled').length
        const monthBookings = bookings.filter(b => b.booking_date >= monthStr)
        const mCompleted = monthBookings.filter(b => b.status === 'completed').length
        const mNoShow = monthBookings.filter(b => b.status === 'no_show').length
        const mCancelled = monthBookings.filter(b => b.status === 'cancelled').length
        const mTotal = monthBookings.length
        const mConv = mTotal > 0 ? Math.round(mCompleted / mTotal * 100) : 0

        const filtered = bookings.filter(b => {
          if (bookingFilter && b.salesperson_id !== bookingFilter) return false
          if (bookingStatusFilter && b.status !== bookingStatusFilter) return false
          if (bookingSearch && !b.client_name.toLowerCase().includes(bookingSearch.toLowerCase()) && !b.client_phone.includes(bookingSearch)) return false
          return true
        })

        return <>
          <div style={{ ...cardStyle }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid rgba(0,0,0,.07)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#14121e' }}>Записи клиентов</div>
              <div style={{ display: 'flex', gap: 12, fontSize: 11 }}>
                <span>Сегодня: <b style={{ color: 'var(--gold)' }}>{todayCount}</b></span>
                <span>Неделя: <b>{weekCount}</b></span>
                <span>Месяц: <b style={{ color: 'var(--green)' }}>{mCompleted}</b> проведено, <b style={{ color: 'var(--gold)' }}>{mNoShow}</b> нп, <b style={{ color: 'var(--red)' }}>{mCancelled}</b> отм</span>
                <span>Конверсия: <b style={{ color: mConv >= 70 ? 'var(--green)' : mConv >= 40 ? 'var(--gold)' : 'var(--red)' }}>{mConv}%</b></span>
              </div>
            </div>

            <div style={{ padding: '10px 20px', borderBottom: '1px solid rgba(0,0,0,.05)', display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <select value={bookingFilter} onChange={e => setBookingFilter(e.target.value)} style={{ ...inputStyle, flex: 'none', width: 160 }}>
                <option value="">Все продажники</option>
                {salespersons.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
              <select value={bookingStatusFilter} onChange={e => setBookingStatusFilter(e.target.value)} style={{ ...inputStyle, flex: 'none', width: 140 }}>
                <option value="">Все статусы</option>
                <option value="confirmed">Подтверждена</option>
                <option value="completed">Проведена</option>
                <option value="no_show">Не пришёл</option>
                <option value="cancelled">Отменена</option>
              </select>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, ...inputStyle, flex: 'none', width: 200 }}>
                <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="#8a8796" strokeWidth="1.6"><circle cx="7" cy="7" r="5"/><line x1="11" y1="11" x2="14" y2="14"/></svg>
                <input placeholder="Имя или телефон..." value={bookingSearch} onChange={e => setBookingSearch(e.target.value)}
                  style={{ background: 'transparent', border: 'none', outline: 'none', fontSize: 12, color: '#14121e', width: '100%', fontFamily: 'inherit' }} />
              </div>
              <span style={{ fontSize: 11, color: '#8a8796', marginLeft: 'auto' }}>{filtered.length} записей</span>
            </div>

            <div style={{ maxHeight: 400, overflowY: 'auto' }}>
              <table>
                <thead>
                  <tr>
                    <th style={thStyle}>Дата / Время</th>
                    <th style={thStyle}>Клиент</th>
                    <th style={thStyle}>Телефон</th>
                    <th style={thStyle}>Telegram</th>
                    <th style={thStyle}>Продажник</th>
                    <th style={thStyle}>Статус</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.slice(0, 100).map((b: any) => {
                    const sp = salespersons.find(s => s.id === b.salesperson_id)
                    const st = statusMap[b.status] || { label: b.status, cls: 'pw' }
                    const isToday = b.booking_date === today
                    return (
                      <tr key={b.id} style={{ background: isToday ? 'rgba(255,149,0,.04)' : 'transparent' }}>
                        <td style={{ fontSize: 12, whiteSpace: 'nowrap' }}>
                          <span style={{ fontWeight: isToday ? 700 : 500, color: isToday ? 'var(--gold)' : 'var(--text)' }}>
                            {new Date(b.booking_date + 'T00:00:00').toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}
                          </span>
                          <span style={{ color: '#8a8796', marginLeft: 6 }}>{b.start_time.slice(0, 5)}</span>
                        </td>
                        <td style={{ fontSize: 13, fontWeight: 600 }}>{b.client_name}</td>
                        <td><a href={'tel:' + b.client_phone} style={{ fontSize: 12, color: 'var(--purple)', textDecoration: 'none', fontWeight: 600 }}>{b.client_phone}</a></td>
                        <td>
                          {b.client_telegram
                            ? <a href={'https://t.me/' + b.client_telegram.replace('@', '')} target="_blank" rel="noopener" style={{ fontSize: 12, color: 'var(--purple)', textDecoration: 'none' }}>{b.client_telegram}</a>
                            : <span style={{ color: '#8a8796' }}>—</span>}
                        </td>
                        <td><span className="stag">{sp?.name ?? '—'}</span></td>
                        <td><span className={'pill ' + st.cls}><span className="dot"></span>{st.label}</span></td>
                      </tr>
                    )
                  })}
                  {filtered.length === 0 && <tr><td colSpan={6} style={{ padding: 20, textAlign: 'center', fontSize: 12, color: '#8a8796' }}>Нет записей</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </>
      })()}
    </div>
  )

}