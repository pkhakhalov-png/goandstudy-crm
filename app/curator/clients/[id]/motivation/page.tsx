import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { getClientEssay } from '@/lib/client-data'
import { MotivationEditor } from '@/app/client/motivation/MotivationEditor'

export const dynamic = 'force-dynamic'

export default async function CuratorMotivationEditorPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('users').select('role').eq('id', user.id).single()
  const role = profile?.role
  if (role !== 'curator' && role !== 'admin' && role !== 'rop') redirect('/login')

  const { id } = await params
  const clientId = Number(id)
  if (!clientId) redirect('/curator/clients')

  const admin = await createAdminClient()
  const { data: client } = await admin.from('clients').select('id, name').eq('id', clientId).maybeSingle()
  if (!client) redirect('/curator/clients')

  const essay = await getClientEssay(clientId, 'motivation')
  const displayContent = essay?.curator_content || essay?.content || undefined

  return (
    <div style={{ minHeight: '100vh', background: 'var(--ds-bg)' }}>
      <section style={{ position: 'relative', overflow: 'hidden', borderBottom: '1px solid var(--ds-border-soft)', background: 'var(--ds-bg)' }}>
        <div style={{ position: 'relative', maxWidth: 1400, margin: '0 auto', padding: '40px 32px 28px' }}>
          <Link
            href={`/curator/clients/${clientId}?tab=essays`}
            style={{ fontSize: 12, color: 'var(--ds-purple)', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 6, marginBottom: 10 }}
          >
            ← К карточке клиента
          </Link>
          <h1 style={{ fontFamily: 'var(--ds-font-display-stack)', fontWeight: 700, fontSize: 'clamp(28px, 3.5vw, 44px)', letterSpacing: '0.02em', lineHeight: 1, margin: '0 0 8px 0', textTransform: 'uppercase' }}>
            Мотивационное · <span className="ds-hl">{client.name}</span>
          </h1>
          <p style={{ fontSize: 14, color: 'var(--ds-ink-dim)', maxWidth: 720, lineHeight: 1.5, margin: 0 }}>
            Дорабатывай поверх версии клиента — изменения уходят в <code>curator_content</code>. Жми «✓ Утвердить» когда
            готово — клиент увидит финальный вариант и сможет скачать PDF.
          </p>
        </div>
      </section>

      <main style={{ maxWidth: 1400, margin: '0 auto', padding: '32px 32px 80px' }}>
        <MotivationEditor
          authorName={client.name}
          initialLetter={displayContent}
          clientId={clientId}
          status={essay?.status || 'draft'}
          viewerRole={role}
        />
      </main>
    </div>
  )
}
