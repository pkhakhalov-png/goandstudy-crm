import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { resolveClientForViewer, getClientEssay } from '@/lib/client-data'
import { ClientTopNav } from '../ClientTopNav'
import { ResumeEditor } from './ResumeEditor'

export const dynamic = 'force-dynamic'

export default async function ResumeBuilderPage({
  searchParams,
}: {
  searchParams: Promise<{ clientId?: string }>
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('users').select('name, role').eq('id', user.id).single()

  const sp = await searchParams
  const requestedClientId = sp.clientId ? Number(sp.clientId) : undefined
  const client = await resolveClientForViewer({
    userId: user.id,
    userEmail: user.email || '',
    role: profile?.role,
    requestedClientId,
  })

  const essay = client ? await getClientEssay(client.id, 'resume') : null
  // /client/* is always client-cabinet preview. Curator edits via /curator/clients/[id]/resume.
  // If approved → client sees curator_content (final), else their own content.
  const rawContent =
    essay?.status === 'approved' && essay.curator_content
      ? essay.curator_content
      : essay?.content || undefined

  // If saved draft is essentially empty (no personal info, no sections) — fall back
  // to INITIAL_RESUME sample so user sees an example to edit, not a blank canvas.
  const isEmpty = !rawContent || (
    !rawContent.personal?.firstName?.trim?.() &&
    !rawContent.personal?.lastName?.trim?.() &&
    !rawContent.personal?.profileSummary?.trim?.() &&
    !(rawContent.workExperience?.length) &&
    !(rawContent.education?.length) &&
    !(rawContent.skills?.length)
  )
  const displayContent = isEmpty ? undefined : rawContent

  return (
    <div style={{ minHeight: '100vh', background: 'var(--ds-bg)' }}>
      <ClientTopNav userName={profile?.name || user.email || ''} activePage="home" />

      <section style={{ position: 'relative', overflow: 'hidden', borderBottom: '1px solid var(--ds-border-soft)', background: 'var(--ds-bg)' }}>
        <div aria-hidden style={{ position: 'absolute', top: '-30%', left: '-10%', width: 900, height: 500, background: 'radial-gradient(ellipse at center, rgba(181,127,207,0.16) 0%, transparent 65%)', pointerEvents: 'none' }} />
        <div style={{ position: 'relative', maxWidth: 1400, margin: '0 auto', padding: '40px 32px 32px' }}>
          <Link href={requestedClientId ? `/client?clientId=${requestedClientId}` : '/client'} style={{ fontSize: 12, color: 'var(--ds-purple)', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
            ← Вернуться в кабинет
          </Link>
          <h1 style={{ fontFamily: 'var(--ds-font-display-stack)', fontWeight: 700, fontSize: 'clamp(32px, 4vw, 52px)', letterSpacing: '0.02em', lineHeight: 1, margin: '0 0 10px 0', textTransform: 'uppercase' }}>
            Создать <span className="ds-hl">резюме</span>
          </h1>
          <p style={{ fontSize: 15, color: 'var(--ds-ink-dim)', maxWidth: 640, lineHeight: 1.5, margin: 0 }}>
            Заполняй секции слева — справа резюме собирается в реальном времени. Автосохранение включено. Когда готово —
            жми «Отправить куратору»: он проверит, дополнит и вернёт финальную версию.
          </p>
        </div>
      </section>

      <main style={{ maxWidth: 1400, margin: '0 auto', padding: '32px 32px 80px' }}>
        <ResumeEditor
          initialResume={displayContent}
          clientId={client?.id}
          status={essay?.status || 'draft'}
        />
      </main>
    </div>
  )
}
