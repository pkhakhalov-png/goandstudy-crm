'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import type { ReactNode } from 'react'
import { C } from './lib/theme'
import { PRESETS, TABS, type Period, type Tab } from './lib/period'

export function AnalyticsShell({ tab, period, children }: { tab: Tab; period: Period; children: ReactNode }) {
  const router = useRouter()
  const sp = useSearchParams()

  function push(next: Record<string, string | null>) {
    const params = new URLSearchParams(sp.toString())
    for (const [k, v] of Object.entries(next)) {
      if (v === null) params.delete(k)
      else params.set(k, v)
    }
    router.push(`/admin/analytics?${params.toString()}`)
  }

  const setPreset = (p: string) => push({ preset: p, from: null, to: null })
  const setTab = (t: string) => push({ tab: t })
  const setRange = (from: string, to: string) => { if (from && to) push({ from, to, preset: null }) }

  return (
    <div style={{ background: C.bg, minHeight: '100%', flex: 1, overflowY: 'auto' }}>
      <div style={{ maxWidth: 1440, margin: '0 auto', padding: '28px 32px 64px', display: 'flex', flexDirection: 'column', gap: 20,
        fontFamily: "'Helvetica Neue', Helvetica, 'Segoe UI', sans-serif", fontFeatureSettings: "'tnum' 1" }}>

        {/* Шапка */}
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: 11, letterSpacing: '.14em', textTransform: 'uppercase', color: C.muted }}>Go &amp; Study · /admin/analytics</div>
            <h1 style={{ fontSize: 30, fontWeight: 600, letterSpacing: '-.02em', color: C.text, margin: '4px 0 0' }}>Аналитика</h1>
          </div>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            {/* Пресеты */}
            <div style={{ display: 'flex', gap: 0, background: '#e9e9e4', borderRadius: 10, padding: 3 }}>
              {PRESETS.map(p => {
                const active = period.preset === p.key
                return (
                  <button key={p.key} onClick={() => setPreset(p.key)}
                    style={{ padding: '7px 13px', fontSize: 13, fontWeight: 500, borderRadius: 8, border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                      background: active ? '#fff' : 'transparent', color: active ? C.text : '#7c807a',
                      boxShadow: active ? '0 1px 2px rgba(20,22,18,.12)' : 'none' }}>
                    {p.label}
                  </button>
                )
              })}
            </div>
            {/* Произвольный диапазон */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#fff', border: `1px solid ${C.ctrlBorder}`, borderRadius: 10, padding: '6px 10px' }}>
              <input type="date" defaultValue={period.from} onChange={e => setRange(e.target.value, period.to)}
                style={{ border: 'none', outline: 'none', fontSize: 13, fontFamily: 'inherit', color: C.text2 }} />
              <span style={{ color: '#b6b9b2' }}>—</span>
              <input type="date" defaultValue={period.to} onChange={e => setRange(period.from, e.target.value)}
                style={{ border: 'none', outline: 'none', fontSize: 13, fontFamily: 'inherit', color: C.text2 }} />
            </div>
          </div>
        </div>

        {/* Табы */}
        <div style={{ display: 'flex', gap: 26, borderBottom: `1px solid ${C.ctrlBorder}` }}>
          {TABS.map(t => {
            const active = tab === t.key
            return (
              <button key={t.key} onClick={() => setTab(t.key)}
                style={{ padding: '0 2px 12px', marginBottom: -1, fontSize: 15, fontWeight: active ? 600 : 400,
                  color: active ? C.text : C.muted, background: 'none', border: 'none', borderBottom: `2px solid ${active ? C.text : 'transparent'}`,
                  cursor: 'pointer', fontFamily: 'inherit' }}>
                {t.label}
              </button>
            )
          })}
        </div>

        {/* Контент вкладки (серверный рендер) */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>{children}</div>
      </div>
    </div>
  )
}
