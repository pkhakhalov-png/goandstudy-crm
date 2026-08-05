'use client'

import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts'
import { C, SERIES } from '../lib/theme'
import { money, pct } from '../lib/format'

export interface DonutSlice { name: string; value: number; color?: string }

// Донат с центр-лейблом и легендой справа (по анатомии из хендоффа).
export function Donut({ data, size = 186, centerValue, centerLabel, showAmounts = true }: {
  data: DonutSlice[]
  size?: number
  centerValue: string
  centerLabel: string
  showAmounts?: boolean
}) {
  const total = data.reduce((s, d) => s + d.value, 0)
  const colored = data.map((d, i) => ({ ...d, color: d.color || SERIES[i % SERIES.length] }))
  const inner = Math.round(size / 2 - 30)
  const outer = Math.round(size / 2)

  return (
    <div style={{ display: 'flex', gap: 22, alignItems: 'center' }}>
      <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={colored} dataKey="value" nameKey="name" cx="50%" cy="50%"
                 innerRadius={inner} outerRadius={outer} startAngle={90} endAngle={-270} stroke="none">
              {colored.map((d, i) => <Cell key={i} fill={d.color} />)}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
          <div style={{ fontSize: 20, fontWeight: 600, letterSpacing: '-.02em', color: C.text, fontVariantNumeric: 'tabular-nums' }}>{centerValue}</div>
          <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '.1em', color: C.muted, marginTop: 2 }}>{centerLabel}</div>
        </div>
      </div>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 11 }}>
        {colored.map((d, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13 }}>
            <span style={{ width: 10, height: 10, borderRadius: 3, background: d.color, flexShrink: 0 }} />
            <span style={{ color: C.text2, flex: 1 }}>{d.name}</span>
            <span style={{ color: C.muted }}>{total > 0 ? pct(d.value / total * 100, 1) : '0%'}</span>
            {showAmounts && <span style={{ fontWeight: 500, minWidth: 96, textAlign: 'right', color: C.text2, fontVariantNumeric: 'tabular-nums' }}>{money(d.value)}</span>}
          </div>
        ))}
      </div>
    </div>
  )
}
