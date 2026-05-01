import { lookupInvitation } from '@/lib/invitation'
import { InviteForm } from './InviteForm'

export const dynamic = 'force-dynamic'

const errBlock: React.CSSProperties = {
  minHeight: '100vh', display: 'grid', placeItems: 'center',
  background: '#F7F5FA', padding: 24, fontFamily: '-apple-system, sans-serif',
}

const cardStyle: React.CSSProperties = {
  background: '#fff', borderRadius: 18, boxShadow: '0 12px 40px rgba(20,18,30,.08)',
  border: '1px solid rgba(0,0,0,.06)', padding: 40, maxWidth: 440, width: '100%',
  textAlign: 'center',
}

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const verdict = await lookupInvitation(token)

  if (!verdict.ok) {
    return (
      <div style={errBlock}>
        <div style={cardStyle}>
          <div style={{ fontSize: 56, marginBottom: 12 }}>🔒</div>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: '0 0 12px' }}>
            Ссылка недоступна
          </h1>
          <p style={{ fontSize: 14, color: '#8a8796', lineHeight: 1.5, margin: 0 }}>
            {verdict.error}
          </p>
          <p style={{ fontSize: 13, color: '#8a8796', marginTop: 24 }}>
            Попроси у куратора новую ссылку.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div style={errBlock}>
      <InviteForm token={token} email={verdict.invitation.email} />
    </div>
  )
}
