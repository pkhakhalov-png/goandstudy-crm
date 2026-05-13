'use client'

import type { ApplicationRow } from '@/lib/client-data'

const STAGE_LABEL: Record<string, string> = {
  docs_collected: 'Документы собраны',
  sent: 'Заявка отправлена',
  decision: 'Решение получено',
  enrolled: 'Зачислен',
}

interface Props {
  applications: ApplicationRow[]
}

export function DemoApplicationsBlock({ applications }: Props) {
  if (!applications.length) return null

  return (
    <section>
      <header style={{ marginBottom: 20 }}>
        <h2 style={{ fontFamily: 'var(--ds-font-display-stack)', fontWeight: 700, fontSize: 22, letterSpacing: '0.04em', textTransform: 'uppercase', margin: 0 }}>
          Мои заявки
        </h2>
        <p style={{ fontSize: 12, color: 'var(--ds-ink-dim)', marginTop: 4, letterSpacing: '0.04em' }}>
          {applications.length} заявка в работе
        </p>
      </header>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16 }}>
        {applications.map(app => {
          const stageLabel = STAGE_LABEL[app.stage as string] || (app.stage as string)
          return (
            <div key={app.id} style={{
              padding: 18, borderRadius: 14,
              background: 'var(--ds-surface)',
              border: '1px solid var(--ds-border-soft)',
            }}>
              <div style={{ fontSize: 10, color: 'var(--ds-ink-dim)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 4 }}>
                {app.country} · Intake {app.intake}
              </div>
              <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--ds-ink)', marginBottom: 6 }}>
                {app.university_name}
              </div>
              <div style={{ fontSize: 12, color: 'var(--ds-ink-dim)', marginBottom: 12 }}>
                {app.program_name}
              </div>
              <div style={{
                fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase',
                padding: '4px 10px', borderRadius: 4, display: 'inline-block',
                background: 'rgba(177,94,204,.1)', color: 'var(--ds-purple)',
              }}>
                {stageLabel}
              </div>
              {app.app_deadline && (
                <div style={{ marginTop: 10, fontSize: 11, color: 'var(--ds-ink-dim)' }}>
                  Дедлайн: {new Date(app.app_deadline).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </section>
  )
}
