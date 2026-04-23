import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { ClientTopNav } from '../ClientTopNav'
import { ShortlistView } from './ShortlistView'
import { CURATOR_SHORTLIST, MAX_PRIORITY } from '../mock-data'

export default async function ClientShortlistPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('users')
    .select('name, role')
    .eq('id', user.id)
    .single()

  return (
    <div style={{ minHeight: '100vh', background: 'var(--ds-bg)' }}>
      <ClientTopNav userName={profile?.name || user.email || ''} activePage="shortlist" />

      <section style={{ position: 'relative', overflow: 'hidden', borderBottom: '1px solid var(--ds-border-soft)', background: 'var(--ds-bg)' }}>
        <div
          aria-hidden
          style={{
            position: 'absolute',
            top: '-30%',
            left: '-10%',
            width: 1000,
            height: 600,
            background: 'radial-gradient(ellipse at center, rgba(181,127,207,0.18) 0%, transparent 65%)',
            pointerEvents: 'none',
          }}
        />
        <div
          aria-hidden
          style={{
            position: 'absolute',
            top: '-20%',
            right: '-10%',
            width: 700,
            height: 400,
            background: 'radial-gradient(ellipse at center, rgba(232,184,68,0.12) 0%, transparent 65%)',
            pointerEvents: 'none',
          }}
        />
        <div style={{ position: 'relative', maxWidth: 1200, margin: '0 auto', padding: '40px 32px 28px' }}>
          <Link
            href="/client"
            style={{
              fontSize: 12,
              color: 'var(--ds-purple)',
              fontWeight: 700,
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              textDecoration: 'none',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              marginBottom: 10,
            }}
          >
            ← Вернуться в кабинет
          </Link>
          <h1
            style={{
              fontFamily: 'var(--ds-font-display-stack)',
              fontWeight: 700,
              fontSize: 'clamp(32px, 4.5vw, 56px)',
              letterSpacing: '0.02em',
              lineHeight: 1,
              margin: '0 0 12px 0',
              textTransform: 'uppercase',
            }}
          >
            Подборка <span className="ds-hl">вузов</span>
          </h1>
          <p
            style={{
              fontSize: 16,
              color: 'var(--ds-ink-dim)',
              maxWidth: 720,
              lineHeight: 1.5,
              margin: 0,
              letterSpacing: '-0.005em',
            }}
          >
            Куратор Анна подготовила <b>{CURATOR_SHORTLIST.length} программ</b> под проект Игоря.
            Выбери <b>{MAX_PRIORITY} приоритетные</b> — именно они появятся на главной странице кабинета
            и в первую очередь пойдут в работу по документам. Остальные останутся как запасной вариант.
          </p>
        </div>
      </section>

      <main style={{ maxWidth: 1200, margin: '0 auto', padding: '32px 32px 80px' }}>
        <ShortlistView items={CURATOR_SHORTLIST} />
      </main>
    </div>
  )
}
