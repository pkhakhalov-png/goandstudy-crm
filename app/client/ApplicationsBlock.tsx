import Link from 'next/link'
import type { ApplicationRow } from '@/lib/client-data'

const STAGE_LABELS: Record<string, string> = {
  created: 'Заявка создана',
  docs_collected: 'Документы загружены',
  fee_paid: 'Application fee оплачен',
  submitted: 'Подано в вуз',
  decision: 'Решение получено',
}

const STAGE_ORDER = ['created', 'docs_collected', 'fee_paid', 'submitted', 'decision']

const DECISION_LABELS: Record<string, string> = {
  offer: '🎉 Оффер',
  conditional_offer: 'Условный оффер',
  rejected: 'Отказ',
  waitlisted: 'Лист ожидания',
  withdrawn: 'Отозвано',
}

const DECISION_COLOR: Record<string, string> = {
  offer: 'var(--ds-green, #2ea44f)',
  conditional_offer: 'var(--ds-purple)',
  rejected: '#c33',
  waitlisted: '#c98a00',
  withdrawn: 'var(--ds-muted)',
}

export function ApplicationsBlock({
  applications,
  previewQuery = '',
}: {
  applications: ApplicationRow[]
  previewQuery?: string
}) {
  if (applications.length === 0) return null

  // Новые офферы (получены за последние 14 дней) — для верхней плашки
  const RECENT_DAYS = 14
  const cutoff = Date.now() - RECENT_DAYS * 24 * 60 * 60 * 1000
  const recentOffers = applications.filter(a =>
    (a.decision === 'offer' || a.decision === 'conditional_offer') &&
    a.decision_at && new Date(a.decision_at).getTime() >= cutoff
  )
  const recentRejects = applications.filter(a =>
    a.decision === 'rejected' &&
    a.decision_at && new Date(a.decision_at).getTime() >= cutoff
  )

  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {recentOffers.length > 0 && (
        <div style={{
          padding: '16px 20px',
          background: 'linear-gradient(135deg, rgba(232,184,68,0.18) 0%, rgba(52,199,89,0.16) 100%)',
          border: '1px solid rgba(232,184,68,0.4)',
          borderRadius: 'var(--ds-r-lg)',
          display: 'flex',
          alignItems: 'center',
          gap: 14,
          boxShadow: '0 4px 16px -6px rgba(232,184,68,0.25)',
        }}>
          <div style={{ fontSize: 28, lineHeight: 1 }}>🎉</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.10em', textTransform: 'uppercase', color: 'var(--ds-amber-hov, #D9AA35)', marginBottom: 2 }}>
              Новости
            </div>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--ds-ink)' }}>
              {recentOffers.length === 1
                ? `Получен оффер от ${recentOffers[0].university_name}`
                : `Получено офферов: ${recentOffers.length}`}
            </div>
            {recentOffers.length === 1 && (
              <div style={{ fontSize: 12, color: 'var(--ds-muted)', marginTop: 2 }}>
                {[recentOffers[0].program_name, recentOffers[0].country].filter(Boolean).join(' · ')}
              </div>
            )}
          </div>
        </div>
      )}

      {recentRejects.length > 0 && recentOffers.length === 0 && (
        <div style={{
          padding: '14px 18px',
          background: 'var(--ds-error-soft)',
          border: '1px solid rgba(255,59,48,0.25)',
          borderRadius: 'var(--ds-r-md)',
          fontSize: 13,
          color: 'var(--ds-ink)',
        }}>
          <b>Получен отказ от {recentRejects[0].university_name}</b>
          {recentRejects.length > 1 && <span style={{ color: 'var(--ds-muted)' }}> · и ещё {recentRejects.length - 1}</span>}
          <span style={{ color: 'var(--ds-muted)' }}> — обсуди следующие шаги с куратором</span>
        </div>
      )}

      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--ds-purple)', marginBottom: 6 }}>
            Заявки
          </div>
          <h2 style={{ fontFamily: 'var(--ds-font-display-stack)', fontWeight: 700, fontSize: 28, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--ds-ink)', margin: 0, lineHeight: 1 }}>
            Мои заявки · {applications.length}
          </h2>
        </div>
      </header>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16 }}>
        {applications.map(app => {
          const stageIdx = STAGE_ORDER.indexOf(app.stage)
          return (
            <Link
              key={app.id}
              href={`/client/applications/${app.id}${previewQuery}`}
              className="ds-app-card"
              style={{
                padding: 20,
                background: '#fff',
                borderRadius: 'var(--ds-r-lg)',
                border: '1px solid var(--ds-border-soft)',
                boxShadow: '0 4px 20px -6px rgba(29,29,31,0.10), 0 1px 3px -1px rgba(29,29,31,0.05)',
                textDecoration: 'none',
                color: 'inherit',
                display: 'flex',
                flexDirection: 'column',
                gap: 12,
                transition: 'transform 160ms ease, box-shadow 160ms ease',
              }}
            >
              <div>
                <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--ds-ink)', lineHeight: 1.3 }}>
                  {app.university_name}
                </div>
                {(app.program_name || app.country) && (
                  <div style={{ fontSize: 12, color: 'var(--ds-muted)', marginTop: 4 }}>
                    {[app.program_name, app.country, app.intake].filter(Boolean).join(' · ')}
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', gap: 4 }}>
                {STAGE_ORDER.map((s, i) => (
                  <div key={s} style={{
                    flex: 1,
                    height: 4,
                    borderRadius: 2,
                    background: i <= stageIdx ? 'var(--ds-purple)' : 'var(--ds-border)',
                  }} />
                ))}
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--ds-ink)' }}>
                  {STAGE_LABELS[app.stage]}
                </span>
                {app.decision && (
                  <span style={{
                    fontSize: 11,
                    fontWeight: 700,
                    color: DECISION_COLOR[app.decision] || 'var(--ds-ink)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                  }}>
                    {DECISION_LABELS[app.decision]}
                  </span>
                )}
              </div>

              {app.app_deadline && !app.decision && (
                <div style={{ fontSize: 11, color: 'var(--ds-muted)' }}>
                  Дедлайн: <b style={{ color: 'var(--ds-ink)' }}>{new Date(app.app_deadline).toLocaleDateString('ru')}</b>
                </div>
              )}
            </Link>
          )
        })}
      </div>
    </section>
  )
}
