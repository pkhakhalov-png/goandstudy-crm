import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { CuratorSidebar } from '../CuratorSidebar'
import { getAllApplicationsForCurator } from '@/lib/client-data'

export const dynamic = 'force-dynamic'

const STAGE_LABELS: Record<string, string> = {
  created: 'Создана',
  docs_collected: 'Документы',
  fee_paid: 'Fee оплачен',
  submitted: 'Подано',
  decision: 'Решение',
}

const DECISION_LABELS: Record<string, string> = {
  offer: '🎉 Оффер',
  conditional_offer: 'Условный оффер',
  rejected: 'Отказ',
  waitlisted: 'Лист ожидания',
  withdrawn: 'Отозвано',
}

function uniSlug(name: string, schoolId: number | null): string {
  if (schoolId) return `s-${schoolId}`
  return 'n-' + encodeURIComponent(name.toLowerCase().replace(/\s+/g, '-').slice(0, 80))
}

export default async function CuratorApplicationsHubPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('users').select('name, role').eq('id', user.id).single()
  if (profile?.role !== 'curator' && profile?.role !== 'admin' && profile?.role !== 'rop') redirect('/login')

  const admin = await createAdminClient()
  const { data: curatorRecord } = await admin.from('curators').select('id').eq('user_id', user.id).maybeSingle()
  const curatorId = curatorRecord?.id || null

  const isPrivileged = profile?.role === 'admin' || profile?.role === 'rop'
  const apps = await getAllApplicationsForCurator(isPrivileged ? null : curatorId)

  // Группируем по university_name + school_id
  const byUni = new Map<string, {
    name: string
    schoolId: number | null
    country: string | null
    total: number
    byStage: Record<string, number>
    decisions: { offer: number; rejected: number; conditional: number }
  }>()
  for (const a of apps) {
    const slug = uniSlug(a.university_name, a.school_id)
    let row = byUni.get(slug)
    if (!row) {
      row = {
        name: a.university_name,
        schoolId: a.school_id,
        country: a.country,
        total: 0,
        byStage: { created: 0, docs_collected: 0, fee_paid: 0, submitted: 0, decision: 0 },
        decisions: { offer: 0, rejected: 0, conditional: 0 },
      }
      byUni.set(slug, row)
    }
    row.total++
    row.byStage[a.stage] = (row.byStage[a.stage] || 0) + 1
    if (a.decision === 'offer') row.decisions.offer++
    if (a.decision === 'rejected') row.decisions.rejected++
    if (a.decision === 'conditional_offer') row.decisions.conditional++
  }
  const universities = Array.from(byUni.entries())
    .map(([slug, row]) => ({ slug, ...row }))
    .sort((a, b) => b.total - a.total)

  const initials = (profile?.name || user.email || 'КР')
    .split(' ').map((w: string) => w[0]).join('').toUpperCase().slice(0, 2)

  return (
    <div className="app">
      <CuratorSidebar userName={profile?.name || ''} userEmail={user.email || ''} initials={initials} activePage="applications" />
      <div className="main" style={{ background: 'var(--ds-bg)' }}>
        <header style={{ position: 'relative', overflow: 'hidden', borderBottom: '1px solid var(--ds-border-soft)', background: 'var(--ds-bg)' }}>
          <div style={{ position: 'relative', maxWidth: 1200, margin: '0 auto', padding: '40px 32px 32px' }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--ds-purple)', marginBottom: 6 }}>
              Заявки
            </div>
            <h1 style={{ fontFamily: 'var(--ds-font-display-stack)', fontWeight: 700, fontSize: 'clamp(28px, 4vw, 44px)', textTransform: 'uppercase', letterSpacing: '0.02em', margin: 0, lineHeight: 1 }}>
              Доски по вузам
            </h1>
            <p style={{ fontSize: 14, color: 'var(--ds-muted)', margin: '10px 0 0', maxWidth: 720, lineHeight: 1.5 }}>
              Каждый вуз — отдельная канбан-доска со всеми клиентами, подавшими в него. Кликай для управления стадиями.
            </p>
          </div>
        </header>

        <main style={{ maxWidth: 1200, margin: '0 auto', padding: '32px 32px 80px' }}>
          {universities.length === 0 ? (
            <div style={{
              padding: 48,
              textAlign: 'center',
              background: 'var(--ds-bg-alt)',
              borderRadius: 'var(--ds-r-lg)',
              border: '1px solid var(--ds-border-soft)',
              boxShadow: 'inset 0 1px 2px rgba(29,29,31,0.04)',
            }}>
              <div style={{ fontSize: 14, color: 'var(--ds-muted)' }}>
                Заявок пока нет. Создавай их в карточке клиента → таб «Заявки».
              </div>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16 }}>
              {universities.map(u => (
                <Link
                  key={u.slug}
                  href={`/curator/applications/${u.slug}`}
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
                      {u.name}
                    </div>
                    {u.country && (
                      <div style={{ fontSize: 12, color: 'var(--ds-muted)', marginTop: 4 }}>{u.country}</div>
                    )}
                  </div>

                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                    <span style={{ fontFamily: 'var(--ds-font-display-stack)', fontSize: 32, fontWeight: 700, color: 'var(--ds-purple)', lineHeight: 1 }}>
                      {u.total}
                    </span>
                    <span style={{ fontSize: 12, color: 'var(--ds-muted)' }}>
                      {u.total === 1 ? 'заявка' : u.total < 5 ? 'заявки' : 'заявок'}
                    </span>
                  </div>

                  <div style={{ display: 'flex', gap: 4 }}>
                    {(['created', 'docs_collected', 'fee_paid', 'submitted', 'decision'] as const).map(s => {
                      const c = u.byStage[s] || 0
                      return (
                        <div key={s} style={{ flex: 1, textAlign: 'center' }} title={STAGE_LABELS[s]}>
                          <div style={{ fontSize: 14, fontWeight: 700, color: c > 0 ? 'var(--ds-ink)' : 'var(--ds-muted)' }}>{c}</div>
                          <div style={{ fontSize: 9, color: 'var(--ds-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', marginTop: 2 }}>
                            {STAGE_LABELS[s]}
                          </div>
                        </div>
                      )
                    })}
                  </div>

                  {(u.decisions.offer + u.decisions.rejected + u.decisions.conditional > 0) && (
                    <div style={{ display: 'flex', gap: 8, fontSize: 11, paddingTop: 8, borderTop: '1px solid var(--ds-border-soft)' }}>
                      {u.decisions.offer > 0 && (
                        <span style={{ color: 'var(--ds-green, #2ea44f)' }}>🎉 {u.decisions.offer} оффер</span>
                      )}
                      {u.decisions.conditional > 0 && (
                        <span style={{ color: 'var(--ds-purple)' }}>◐ {u.decisions.conditional} conditional</span>
                      )}
                      {u.decisions.rejected > 0 && (
                        <span style={{ color: '#c33' }}>× {u.decisions.rejected} отказ</span>
                      )}
                    </div>
                  )}
                </Link>
              ))}
            </div>
          )}
        </main>
      </div>
    </div>
  )
}
