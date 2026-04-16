'use client'

import { useState, useTransition } from 'react'
import { updateRopSetting } from '../actions'

interface Props {
  settings: any[]
  stages: any[]
}

function getSetting(settings: any[], key: string, fallback: any = null) {
  const s = settings.find(s => s.key === key)
  if (!s) return fallback
  return typeof s.value === 'string' ? JSON.parse(s.value) : s.value
}

export function RopSettings({ settings, stages }: Props) {
  const [, startTransition] = useTransition()

  const sla = getSetting(settings, 'sla_response_minutes', 30)
  const stuck = getSetting(settings, 'stuck_deal_days', 5)
  const lowConv = getSetting(settings, 'low_conversion_threshold', 0.7)
  const scoreW = getSetting(settings, 'score_weights', { sales: 0.4, conv: 0.25, sla: 0.2, tasks: 0.15 })

  const [slaVal, setSlaVal] = useState(String(sla))
  const [stuckVal, setStuckVal] = useState(String(stuck))
  const [lowConvVal, setLowConvVal] = useState(String(Math.round(lowConv * 100)))
  const [scoreVals, setScoreVals] = useState({ sales: String(Math.round(scoreW.sales * 100)), conv: String(Math.round(scoreW.conv * 100)), sla: String(Math.round(scoreW.sla * 100)), tasks: String(Math.round(scoreW.tasks * 100)) })

  const cardStyle: React.CSSProperties = { background: 'var(--surf)', border: '1px solid var(--bor2)', borderRadius: 14, padding: '16px 20px', marginBottom: 16 }
  const sectionTitle: React.CSSProperties = { fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--muted)', marginBottom: 12 }
  const inputStyle: React.CSSProperties = { width: 80, fontSize: 13, padding: '6px 10px', border: '1px solid var(--bor2)', borderRadius: 8, textAlign: 'center' }
  const rowStyle: React.CSSProperties = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid var(--bor2)' }

  function save(key: string, value: unknown) {
    startTransition(async () => {
      const res = await updateRopSetting(key, value)
      if (res?.error) alert(res.error)
    })
  }

  return (
    <>
      <div style={cardStyle}>
        <div style={sectionTitle}>Пороги</div>
        <div style={rowStyle}>
          <div><div style={{ fontSize: 13, fontWeight: 600 }}>SLA время ответа</div><div style={{ fontSize: 10, color: 'var(--muted)' }}>Максимальное время ответа менеджера (мин)</div></div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <input type="number" value={slaVal} onChange={e => setSlaVal(e.target.value)} style={inputStyle} />
            <span style={{ fontSize: 11, color: 'var(--muted)' }}>мин</span>
            <button onClick={() => save('sla_response_minutes', Number(slaVal))} className="btn-p" style={{ fontSize: 10, padding: '4px 10px' }}>✓</button>
          </div>
        </div>
        <div style={rowStyle}>
          <div><div style={{ fontSize: 13, fontWeight: 600 }}>Застрявшая сделка</div><div style={{ fontSize: 10, color: 'var(--muted)' }}>После скольких дней без движения считать сделку застрявшей</div></div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <input type="number" value={stuckVal} onChange={e => setStuckVal(e.target.value)} style={inputStyle} />
            <span style={{ fontSize: 11, color: 'var(--muted)' }}>дн</span>
            <button onClick={() => save('stuck_deal_days', Number(stuckVal))} className="btn-p" style={{ fontSize: 10, padding: '4px 10px' }}>✓</button>
          </div>
        </div>
        <div style={rowStyle}>
          <div><div style={{ fontSize: 13, fontWeight: 600 }}>Порог плохой конверсии</div><div style={{ fontSize: 10, color: 'var(--muted)' }}>% от среднего, ниже которого этап считается проблемным</div></div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <input type="number" value={lowConvVal} onChange={e => setLowConvVal(e.target.value)} style={inputStyle} />
            <span style={{ fontSize: 11, color: 'var(--muted)' }}>%</span>
            <button onClick={() => save('low_conversion_threshold', Number(lowConvVal) / 100)} className="btn-p" style={{ fontSize: 10, padding: '4px 10px' }}>✓</button>
          </div>
        </div>
      </div>

      <div style={cardStyle}>
        <div style={sectionTitle}>Веса Score менеджеров</div>
        <div style={{ fontSize: 10, color: 'var(--muted)', marginBottom: 10 }}>Сумма должна быть 100%</div>
        {(['sales', 'conv', 'sla', 'tasks'] as const).map(key => {
          const labels: Record<string, string> = { sales: 'Продажи', conv: 'Конверсия', sla: 'Время ответа', tasks: 'Задачи' }
          return (
            <div key={key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0' }}>
              <span style={{ fontSize: 13 }}>{labels[key]}</span>
              <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                <input type="number" value={scoreVals[key]} onChange={e => setScoreVals({ ...scoreVals, [key]: e.target.value })} style={{ ...inputStyle, width: 60 }} />
                <span style={{ fontSize: 11, color: 'var(--muted)' }}>%</span>
              </div>
            </div>
          )
        })}
        <button
          onClick={() => save('score_weights', { sales: Number(scoreVals.sales) / 100, conv: Number(scoreVals.conv) / 100, sla: Number(scoreVals.sla) / 100, tasks: Number(scoreVals.tasks) / 100 })}
          className="btn-p" style={{ marginTop: 10, fontSize: 12, padding: '8px 20px' }}>
          Сохранить веса
        </button>
      </div>

      <div style={cardStyle}>
        <div style={sectionTitle}>Веса Pipeline по этапам</div>
        <div style={{ fontSize: 10, color: 'var(--muted)', marginBottom: 10 }}>Коэффициент вероятности сделки (0 — 1.0)</div>
        {stages.map(s => (
          <div key={s.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid var(--bor)' }}>
            <span style={{ fontSize: 12 }}>{s.name} <span style={{ color: 'var(--muted)', fontSize: 10 }}>({s.stage_type})</span></span>
            <input
              type="number"
              step="0.1"
              min="0"
              max="1"
              defaultValue={s.weight ?? 0}
              onBlur={e => {
                const v = Number(e.target.value)
                if (v >= 0 && v <= 1) {
                  startTransition(async () => {
                    const { createClient: cc } = await import('@/lib/supabase/server')
                    const sb = await cc()
                    await sb.from('pipeline_stages').update({ weight: v }).eq('id', s.id)
                  })
                }
              }}
              style={{ ...inputStyle, width: 60 }}
            />
          </div>
        ))}
      </div>
    </>
  )
}
