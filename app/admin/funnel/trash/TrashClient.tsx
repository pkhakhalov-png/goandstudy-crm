'use client'

import { restoreDeal, permanentDeleteDeal } from '../actions'

interface Props {
  deals: any[]
  stages: any[]
}

export function TrashClient({ deals, stages }: Props) {
  async function handleRestore(dealId: string) {
    const fd = new FormData(); fd.append('deal_id', dealId); await restoreDeal(fd)
  }
  async function handleDelete(dealId: string) {
    if (!confirm('Удалить навсегда?')) return
    const fd = new FormData(); fd.append('deal_id', dealId); await permanentDeleteDeal(fd)
  }

  return (
    <div className="cnt">
      <div className="sl" style={{ marginBottom: 12 }}>{deals.length} удалённых сделок</div>
      {deals.length === 0 && <div style={{ textAlign: 'center', color: 'var(--muted)', padding: 40 }}>Корзина пуста</div>}
      <div className="tw">
        <table>
          <thead><tr><th>Контакт</th><th>Телефон</th><th>Этап</th><th>Удалена</th><th></th></tr></thead>
          <tbody>
            {deals.map((d: any) => {
              const stage = stages.find((s: any) => s.id === d.stage_id)
              return (
                <tr key={d.id}>
                  <td style={{ fontWeight: 600 }}>{d.contact_name}</td>
                  <td style={{ fontSize: 12, color: 'var(--muted)' }}>{d.contact_phone || '—'}</td>
                  <td><span style={{ padding: '3px 8px', borderRadius: 6, fontSize: 10, fontWeight: 700, color: stage?.color, background: (stage?.color || '') + '15' }}>{stage?.name || '—'}</span></td>
                  <td style={{ fontSize: 11, color: 'var(--muted)' }}>{d.deleted_at ? new Date(d.deleted_at).toLocaleDateString('ru-RU') : '—'}</td>
                  <td>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button onClick={() => handleRestore(d.id)} className="btn-s" style={{ fontSize: 11, padding: '4px 10px', color: 'var(--green)' }}>Восстановить</button>
                      <button onClick={() => handleDelete(d.id)} className="btn-s" style={{ fontSize: 11, padding: '4px 10px', color: 'var(--red)', borderColor: 'rgba(220,53,69,.2)' }}>Удалить навсегда</button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
