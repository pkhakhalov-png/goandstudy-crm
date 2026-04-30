import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { resolveClientForViewer, getClientUnlockedScholarships, clientHasUnlockedScholarships } from '@/lib/client-data'
import { ClientTopNav } from '../ClientTopNav'
import { PreviewBanner } from '../PreviewBanner'

export const dynamic = 'force-dynamic'

const KIND_LABEL: Record<string, { label: string; color: string; bg: string }> = {
  idp: { label: 'IDP', color: '#0088cc', bg: 'rgba(0,136,204,.10)' },
  government: { label: 'Государственная', color: 'var(--ds-purple-deep)', bg: 'var(--ds-purple-soft)' },
  private: { label: 'QS', color: 'var(--ds-purple-deep)', bg: 'var(--ds-purple-soft)' },
}

const STATUS_LABEL: Record<string, string> = {
  planned: 'Планируется',
  preparing: 'Готовим',
  applying: 'Подаём',
  submitted: 'Подано',
  awarded: 'Получили',
  rejected: 'Отказ',
}

function fmtDate(d: string | null) {
  if (!d) return null
  try {
    return new Date(d).toLocaleDateString('ru', { day: 'numeric', month: 'long', year: 'numeric' })
  } catch { return d }
}

function daysLeft(d: string | null): number | null {
  if (!d) return null
  const ms = new Date(d).getTime() - Date.now()
  if (!Number.isFinite(ms)) return null
  return Math.ceil(ms / (24 * 3600 * 1000))
}

export default async function ClientScholarshipsPage({ searchParams }: { searchParams: Promise<{ clientId?: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('users').select('name, role').eq('id', user.id).single()

  const params = await searchParams
  const requestedClientId = params.clientId ? Number(params.clientId) : undefined

  const client = await resolveClientForViewer({
    userId: user.id,
    userEmail: user.email || '',
    role: profile?.role,
    requestedClientId,
  })
  if (!client) redirect('/client')

  // Если у клиента нет ни одной раскрытой стипендии — отправляем на главную.
  // По требованию: «у клиента не будет типо стипендии замочек, ничего нет —
  // оплачивает, куратор включает, появляется».
  const hasUnlocked = await clientHasUnlockedScholarships(client.id)
  if (!hasUnlocked) redirect('/client')

  const scholarships = await getClientUnlockedScholarships(client.id)
  const isPreview = profile?.role !== 'client'

  return (
    <div style={{ minHeight: '100vh', background: 'var(--ds-bg)' }}>
      {isPreview && <PreviewBanner clientName={client.name || 'клиент'} clientId={client.id} />}
      <ClientTopNav
        userName={profile?.name || user.email || ''}
        activePage="scholarships"
        showScholarships
      />

      <section style={{ position: 'relative', overflow: 'hidden', borderBottom: '1px solid var(--ds-border-soft)', background: 'var(--ds-bg)' }}>
        <div
          aria-hidden
          style={{
            position: 'absolute', top: '-30%', left: '-10%', width: 1000, height: 600,
            background: 'radial-gradient(ellipse at center, rgba(181,127,207,0.18) 0%, transparent 65%)',
            pointerEvents: 'none',
          }}
        />
        <div
          aria-hidden
          style={{
            position: 'absolute', top: '-20%', right: '-10%', width: 700, height: 400,
            background: 'radial-gradient(ellipse at center, rgba(232,184,68,0.12) 0%, transparent 65%)',
            pointerEvents: 'none',
          }}
        />
        <div style={{ position: 'relative', maxWidth: 1200, margin: '0 auto', padding: '40px 32px 28px' }}>
          <Link
            href="/client"
            style={{
              fontSize: 12, color: 'var(--ds-purple)', fontWeight: 700,
              letterSpacing: '0.12em', textTransform: 'uppercase', textDecoration: 'none',
              display: 'inline-flex', alignItems: 'center', gap: 6, marginBottom: 10,
            }}
          >
            ← Вернуться в кабинет
          </Link>
          <h1
            style={{
              fontFamily: 'var(--ds-font-display-stack)', fontWeight: 700,
              fontSize: 'clamp(32px, 4.5vw, 56px)', letterSpacing: '0.02em',
              lineHeight: 1, margin: '0 0 12px 0', textTransform: 'uppercase',
            }}
          >
            Доступные <span className="ds-hl">стипендии</span>
          </h1>
          <p
            style={{
              fontSize: 16, color: 'var(--ds-ink-dim)', maxWidth: 720,
              lineHeight: 1.5, margin: 0, letterSpacing: '-0.005em',
            }}
          >
            Куратор отобрал <b>{scholarships.length}</b> стипенди{scholarships.length === 1 ? 'ю' : 'й'} под твой проект.
            Жми на любую — увидишь детали и сможешь подать заявку. По вопросам пиши куратору.
          </p>
        </div>
      </section>

      <main style={{ maxWidth: 1200, margin: '0 auto', padding: '32px 32px 80px' }}>
        <div style={{ display: 'grid', gap: 12 }}>
          {scholarships.map(s => {
            const badge = KIND_LABEL[s.kind] || KIND_LABEL.private
            const dl = daysLeft(s.deadline)
            const detailHref = s.kind === 'idp'
              ? `/curator/scholarships/idp/${s.scholarship_id}?asClient=1`
              : `/curator/scholarships/${s.scholarship_id}?asClient=1`
            return (
              <article
                key={s.id}
                style={{
                  background: 'var(--ds-bg)', border: '1px solid var(--ds-border-soft)',
                  borderRadius: 'var(--ds-r-lg)', padding: 24,
                  borderLeft: s.kind === 'idp' ? '3px solid #0088cc' : s.kind === 'government' ? '3px solid var(--ds-purple-deep)' : '3px solid var(--ds-border)',
                }}
              >
                <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 16, alignItems: 'flex-start' }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
                      <span style={{
                        fontSize: 9, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase',
                        color: badge.color, background: badge.bg, padding: '3px 8px', borderRadius: 4,
                      }}>
                        {badge.label}
                      </span>
                      {dl !== null && dl >= 0 && dl <= 30 && (
                        <span style={{
                          fontSize: 9, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase',
                          color: 'var(--ds-error-ink)', background: 'rgba(220,53,69,.10)',
                          padding: '3px 8px', borderRadius: 4,
                        }}>
                          до дедлайна {dl} дн.
                        </span>
                      )}
                    </div>
                    <Link href={detailHref} style={{ textDecoration: 'none', color: 'inherit' }}>
                      <h2 style={{
                        fontSize: 20, fontWeight: 700, color: 'var(--ds-ink)',
                        margin: '0 0 6px 0', letterSpacing: '-0.01em', lineHeight: 1.25,
                      }}>
                        {s.scholarship_title}
                      </h2>
                    </Link>
                    {s.institution_title && (
                      <div style={{ fontSize: 13, color: 'var(--ds-ink-dim)', marginBottom: 10 }}>
                        {s.institution_title}
                      </div>
                    )}
                    <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: 12, color: 'var(--ds-muted)' }}>
                      {s.amount_text && (
                        <span><b style={{ color: 'var(--ds-ink)' }}>{s.amount_text}</b></span>
                      )}
                      {s.deadline ? (
                        <span>📅 до {fmtDate(s.deadline)}</span>
                      ) : (
                        <span style={{ fontStyle: 'italic' }}>дедлайн уточняется</span>
                      )}
                      <span>· {STATUS_LABEL[s.status] || s.status}</span>
                    </div>
                  </div>
                  <Link
                    href={detailHref}
                    className="ds-btn ds-btn-primary ds-btn-sm"
                    style={{ textDecoration: 'none', whiteSpace: 'nowrap' }}
                  >
                    Подробнее →
                  </Link>
                </div>
              </article>
            )
          })}
        </div>

        <div style={{
          marginTop: 32, padding: '20px 24px',
          background: 'var(--ds-bg-alt)', borderRadius: 'var(--ds-r-md)',
          fontSize: 13, color: 'var(--ds-ink-dim)', lineHeight: 1.6,
        }}>
          <b style={{ color: 'var(--ds-ink)' }}>Что дальше?</b><br />
          Куратор подскажет какие подать в первую очередь и поможет собрать документы.
          Если есть вопросы — пиши в личный кабинет → раздел «Куратор».
        </div>
      </main>
    </div>
  )
}
