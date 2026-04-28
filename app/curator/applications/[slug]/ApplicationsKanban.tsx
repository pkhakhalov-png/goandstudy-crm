'use client'

import Link from 'next/link'
import { useState, useTransition } from 'react'
import {
  updateApplicationStage,
  setApplicationDecision,
  type AppStage,
  type AppDecision,
} from '@/app/curator/applications/actions'

const STAGE_LABELS: Record<AppStage, string> = {
  created: 'Заявка создана',
  docs_collected: 'Документы загружены',
  fee_paid: 'Application fee оплачен',
  submitted: 'Подано в вуз',
  decision: 'Решение получено',
}

const STAGE_ORDER: AppStage[] = ['created', 'docs_collected', 'fee_paid', 'submitted', 'decision']

const DECISION_LABELS: Record<AppDecision, string> = {
  offer: '🎉 Оффер',
  conditional_offer: 'Условный',
  rejected: 'Отказ',
  waitlisted: 'Лист ожидания',
  withdrawn: 'Отозвано',
}

const DECISION_COLOR: Record<AppDecision, string> = {
  offer: 'var(--ds-green, #2ea44f)',
  conditional_offer: 'var(--ds-purple)',
  rejected: '#c33',
  waitlisted: '#c98a00',
  withdrawn: 'var(--ds-muted)',
}

export function ApplicationsKanban({ applications }: { applications: any[] }) {
  const grouped = STAGE_ORDER.reduce((acc, s) => {
    acc[s] = applications.filter(a => a.stage === s)
    return acc
  }, {} as Record<AppStage, any[]>)

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(220px, 1fr))', gap: 16, overflowX: 'auto' }}>
      {STAGE_ORDER.map(stage => (
        <Column key={stage} stage={stage} apps={grouped[stage]} />
      ))}
    </div>
  )
}

function Column({ stage, apps }: { stage: AppStage; apps: any[] }) {
  return (
    <div style={{
      background: 'var(--ds-bg-alt)',
      border: '1px solid var(--ds-border-soft)',
      borderRadius: 'var(--ds-r-lg)',
      padding: 14,
      display: 'flex',
      flexDirection: 'column',
      gap: 10,
      minWidth: 220,
      boxShadow: 'inset 0 1px 2px rgba(29,29,31,0.04)',
    }}>
      <header style={{ padding: '4px 6px 8px', borderBottom: '1px solid var(--ds-border-soft)' }}>
        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--ds-muted)' }}>
          {STAGE_LABELS[stage]}
        </div>
        <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--ds-ink)', marginTop: 2 }}>{apps.length}</div>
      </header>

      {apps.length === 0 ? (
        <div style={{ padding: 16, textAlign: 'center', fontSize: 11, color: 'var(--ds-muted)', fontStyle: 'italic' }}>
          —
        </div>
      ) : (
        apps.map(app => <Card key={app.id} app={app} />)
      )}
    </div>
  )
}

function Card({ app }: { app: any }) {
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function move(stage: AppStage) {
    start(async () => {
      const res = await updateApplicationStage({ applicationId: app.id, stage, clientId: app.client_id })
      if ('error' in res && res.error) setError(res.error)
    })
  }

  function decide(decision: AppDecision) {
    start(async () => {
      const res = await setApplicationDecision({ applicationId: app.id, decision, clientId: app.client_id })
      if ('error' in res && res.error) setError(res.error)
    })
  }

  return (
    <div style={{
      background: '#fff',
      border: '1px solid var(--ds-border-soft)',
      borderRadius: 'var(--ds-r-md)',
      padding: 12,
      display: 'flex',
      flexDirection: 'column',
      gap: 8,
      boxShadow: '0 2px 8px -2px rgba(29,29,31,0.08), 0 1px 2px rgba(29,29,31,0.04)',
    }}>
      <div>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ds-ink)', lineHeight: 1.3 }}>
          {app.client_name || app.client_email || `Клиент #${app.client_id}`}
        </div>
        {app.program_name && (
          <div style={{ fontSize: 11, color: 'var(--ds-muted)', marginTop: 2 }}>{app.program_name}</div>
        )}
        {app.intake && (
          <div style={{ fontSize: 11, color: 'var(--ds-muted)' }}>{app.intake}</div>
        )}
      </div>

      {app.app_deadline && app.stage !== 'decision' && (
        <div style={{ fontSize: 10, color: 'var(--ds-muted)' }}>
          Дедлайн: <b style={{ color: 'var(--ds-ink)' }}>{new Date(app.app_deadline).toLocaleDateString('ru')}</b>
        </div>
      )}

      {app.decision && (
        <div style={{ fontSize: 11, fontWeight: 700, color: DECISION_COLOR[app.decision as AppDecision] }}>
          {DECISION_LABELS[app.decision as AppDecision]}
        </div>
      )}

      <div style={{ display: 'flex', gap: 4 }}>
        <select
          value={app.stage}
          onChange={(e) => move(e.target.value as AppStage)}
          disabled={pending}
          className="ds-input"
          style={{ flex: 1, padding: '4px 6px', fontSize: 10 }}
        >
          {STAGE_ORDER.map(s => <option key={s} value={s}>{STAGE_LABELS[s]}</option>)}
        </select>
      </div>

      {app.stage === 'decision' && (
        <select
          value={app.decision || ''}
          onChange={(e) => e.target.value && decide(e.target.value as AppDecision)}
          disabled={pending}
          className="ds-input"
          style={{ padding: '4px 6px', fontSize: 10 }}
        >
          <option value="">— Решение —</option>
          {(Object.keys(DECISION_LABELS) as AppDecision[]).map(d => (
            <option key={d} value={d}>{DECISION_LABELS[d]}</option>
          ))}
        </select>
      )}

      <div style={{ display: 'flex', gap: 6, fontSize: 10 }}>
        <Link
          href={`/client/applications/${app.id}?clientId=${app.client_id}`}
          style={{ color: 'var(--ds-purple)', textDecoration: 'none', fontWeight: 600 }}
        >
          Открыть →
        </Link>
        <Link
          href={`/curator/clients/${app.client_id}?tab=applications`}
          style={{ color: 'var(--ds-muted)', textDecoration: 'none' }}
        >
          Клиент
        </Link>
      </div>

      {error && <div style={{ fontSize: 10, color: '#c33' }}>{error}</div>}
    </div>
  )
}
