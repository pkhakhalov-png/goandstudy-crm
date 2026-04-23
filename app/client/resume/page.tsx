import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { ClientTopNav } from '../ClientTopNav'
import { ResumeEditor } from './ResumeEditor'

export default async function ResumeBuilderPage() {
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
      <ClientTopNav userName={profile?.name || user.email || ''} activePage="home" />

      <section style={{ position: 'relative', overflow: 'hidden', borderBottom: '1px solid var(--ds-border-soft)', background: 'var(--ds-bg)' }}>
        <div
          aria-hidden
          style={{
            position: 'absolute',
            top: '-30%',
            left: '-10%',
            width: 900,
            height: 500,
            background: 'radial-gradient(ellipse at center, rgba(181,127,207,0.16) 0%, transparent 65%)',
            pointerEvents: 'none',
          }}
        />
        <div style={{ position: 'relative', maxWidth: 1400, margin: '0 auto', padding: '40px 32px 32px', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 24, flexWrap: 'wrap' }}>
          <div>
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
                fontSize: 'clamp(32px, 4vw, 52px)',
                letterSpacing: '0.02em',
                lineHeight: 1,
                margin: '0 0 10px 0',
                textTransform: 'uppercase',
              }}
            >
              Создать <span className="ds-hl">резюме</span>
            </h1>
            <p style={{ fontSize: 15, color: 'var(--ds-ink-dim)', maxWidth: 640, lineHeight: 1.5, margin: 0 }}>
              Заполняй секции слева — справа резюме собирается в реальном времени. Когда будет готово, куратор проверит
              и подготовит финальную версию для документов.
            </p>
          </div>

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button className="ds-btn ds-btn-secondary" type="button">
              Сохранить черновик
            </button>
            <button className="ds-btn ds-btn-primary" type="button">
              Отправить куратору
            </button>
          </div>
        </div>
      </section>

      <main style={{ maxWidth: 1400, margin: '0 auto', padding: '32px 32px 80px' }}>
        <ResumeEditor />
      </main>
    </div>
  )
}
