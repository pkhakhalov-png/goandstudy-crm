'use client'

import { useState } from 'react'
import {
  addSalesperson, deactivateSalesperson, activateSalesperson,
  addCurator, deactivateCurator, activateCurator, updateCuratorName
} from './actions'

type Salesperson = { id: string; name: string; email: string; is_active: boolean; created_at: string }
type Curator = { id: string; name: string; is_active: boolean; created_at: string }

const cardStyle = {
  background: '#fff',
  border: '1px solid rgba(0,0,0,.07)',
  borderRadius: 14,
  overflow: 'hidden' as const,
  boxShadow: '0 1px 4px rgba(0,0,0,.07)',
  marginBottom: 20,
}

const inputStyle = {
  flex: 1,
  padding: '8px 12px',
  border: '1px solid rgba(0,0,0,.12)',
  borderRadius: 8,
  fontSize: 13,
  fontFamily: 'inherit',
  outline: 'none',
  background: '#fff',
  color: '#14121e',
  minWidth: 120,
}

export function SettingsClient({ salespersons, curators }: { salespersons: Salesperson[]; curators: Curator[] }) {
  const [newPassword, setNewPassword] = useState<string | null>(null)
  const [editingCurator, setEditingCurator] = useState<string | null>(null)

  async function handleAddSalesperson(formData: FormData) {
    const result = await addSalesperson(formData)
    if (result.password) setNewPassword(result.password)
  }

  return (
    <div style={{ padding: '24px 28px', maxWidth: 780 }}>

      {/* Продажники */}
      <div style={cardStyle}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid rgba(0,0,0,.07)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#14121e' }}>Продажники</div>
          <div style={{ fontSize: 11, color: '#8a8796' }}>{salespersons.length} чел.</div>
        </div>

        {/* Форма добавления */}
        <form action={handleAddSalesperson} style={{ padding: '14px 20px', background: '#F9F8FC', borderBottom: '1px solid rgba(0,0,0,.07)', display: 'flex', gap: 8, flexWrap: 'wrap' as const }}>
          <input name="name" required placeholder="Имя" style={inputStyle} />
          <input name="email" type="email" required placeholder="Email" style={inputStyle} />
          <button type="submit" style={{ padding: '8px 16px', background: '#B15ECC', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' as const }}>
            + Добавить
          </button>
        </form>

        {/* Показываем пароль после создания */}
        {newPassword && (
          <div style={{ padding: '10px 20px', background: 'rgba(22,163,97,.08)', borderBottom: '1px solid rgba(22,163,97,.15)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 12, color: '#14121e' }}>
              ✅ Пользователь создан. Временный пароль: <strong style={{ fontFamily: 'monospace', color: '#16a361' }}>{newPassword}</strong>
            </span>
            <button onClick={() => setNewPassword(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, color: '#8a8796' }}>×</button>
          </div>
        )}

        {/* Список */}
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid rgba(0,0,0,.07)' }}>
              <th style={{ padding: '10px 20px', fontSize: 10, color: '#8a8796', fontWeight: 600, textAlign: 'left', textTransform: 'uppercase', letterSpacing: '0.05em', background: '#F9F8FC' }}>Имя</th>
              <th style={{ padding: '10px 20px', fontSize: 10, color: '#8a8796', fontWeight: 600, textAlign: 'left', textTransform: 'uppercase', letterSpacing: '0.05em', background: '#F9F8FC' }}>Email</th>
              <th style={{ padding: '10px 20px', fontSize: 10, color: '#8a8796', fontWeight: 600, textAlign: 'left', textTransform: 'uppercase', letterSpacing: '0.05em', background: '#F9F8FC' }}>Статус</th>
              <th style={{ padding: '10px 20px', background: '#F9F8FC' }}></th>
            </tr>
          </thead>
          <tbody>
            {salespersons.map(s => (
              <tr key={s.id} style={{ borderBottom: '1px solid rgba(0,0,0,.07)' }}>
                <td style={{ padding: '12px 20px', fontSize: 13, fontWeight: 600, color: '#14121e' }}>{s.name}</td>
                <td style={{ padding: '12px 20px', fontSize: 12, color: '#8a8796' }}>{s.email}</td>
                <td style={{ padding: '12px 20px' }}>
                  {s.is_active
                    ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 20, fontSize: 10, fontWeight: 600, background: 'rgba(22,163,97,.1)', color: '#16a361' }}>● Активен</span>
                    : <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 20, fontSize: 10, fontWeight: 600, background: 'rgba(138,135,150,.1)', color: '#8a8796' }}>● Неактивен</span>
                  }
                </td>
                <td style={{ padding: '12px 20px', textAlign: 'right' }}>
                  <form action={s.is_active ? deactivateSalesperson : activateSalesperson} style={{ display: 'inline' }}>
                    <input type="hidden" name="id" value={s.id} />
                    <button type="submit" style={{ padding: '5px 12px', background: '#fff', border: '1px solid rgba(0,0,0,.12)', borderRadius: 7, fontSize: 11, fontWeight: 600, cursor: 'pointer', color: s.is_active ? '#dc3545' : '#16a361', fontFamily: 'inherit' }}>
                      {s.is_active ? 'Деактивировать' : 'Активировать'}
                    </button>
                  </form>
                </td>
              </tr>
            ))}
            {salespersons.length === 0 && (
              <tr><td colSpan={4} style={{ padding: '20px', textAlign: 'center', fontSize: 12, color: '#8a8796' }}>Нет продажников</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Кураторы */}
      <div style={cardStyle}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid rgba(0,0,0,.07)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#14121e' }}>Кураторы</div>
          <div style={{ fontSize: 11, color: '#8a8796' }}>{curators.length} чел.</div>
        </div>

        <form action={addCurator} style={{ padding: '14px 20px', background: '#F9F8FC', borderBottom: '1px solid rgba(0,0,0,.07)', display: 'flex', gap: 8 }}>
          <input name="name" required placeholder="Имя куратора" style={inputStyle} />
          <button type="submit" style={{ padding: '8px 16px', background: '#B15ECC', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' as const }}>
            + Добавить
          </button>
        </form>

        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid rgba(0,0,0,.07)' }}>
              <th style={{ padding: '10px 20px', fontSize: 10, color: '#8a8796', fontWeight: 600, textAlign: 'left', textTransform: 'uppercase', letterSpacing: '0.05em', background: '#F9F8FC' }}>Имя</th>
              <th style={{ padding: '10px 20px', fontSize: 10, color: '#8a8796', fontWeight: 600, textAlign: 'left', textTransform: 'uppercase', letterSpacing: '0.05em', background: '#F9F8FC' }}>Статус</th>
              <th style={{ padding: '10px 20px', background: '#F9F8FC' }}></th>
            </tr>
          </thead>
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
                    <span style={{ fontSize: 13, fontWeight: 600, color: '#14121e', cursor: 'pointer' }} onClick={() => setEditingCurator(c.id)}>{c.name}</span>
                  )}
                </td>
                <td style={{ padding: '12px 20px' }}>
                  {c.is_active
                    ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 20, fontSize: 10, fontWeight: 600, background: 'rgba(22,163,97,.1)', color: '#16a361' }}>● Активен</span>
                    : <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 20, fontSize: 10, fontWeight: 600, background: 'rgba(138,135,150,.1)', color: '#8a8796' }}>● Неактивен</span>
                  }
                </td>
                <td style={{ padding: '12px 20px', textAlign: 'right', display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                  <button type="button" onClick={() => setEditingCurator(c.id)} style={{ padding: '5px 12px', background: '#fff', border: '1px solid rgba(0,0,0,.12)', borderRadius: 7, fontSize: 11, fontWeight: 600, cursor: 'pointer', color: '#8a8796', fontFamily: 'inherit' }}>
                    Переименовать
                  </button>
                  <form action={c.is_active ? deactivateCurator : activateCurator} style={{ display: 'inline' }}>
                    <input type="hidden" name="id" value={c.id} />
                    <button type="submit" style={{ padding: '5px 12px', background: '#fff', border: '1px solid rgba(0,0,0,.12)', borderRadius: 7, fontSize: 11, fontWeight: 600, cursor: 'pointer', color: c.is_active ? '#dc3545' : '#16a361', fontFamily: 'inherit' }}>
                      {c.is_active ? 'Деактивировать' : 'Активировать'}
                    </button>
                  </form>
                </td>
              </tr>
            ))}
            {curators.length === 0 && (
              <tr><td colSpan={3} style={{ padding: '20px', textAlign: 'center', fontSize: 12, color: '#8a8796' }}>Нет кураторов</td></tr>
            )}
          </tbody>
        </table>
      </div>

    </div>
  )
}