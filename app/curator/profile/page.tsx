import { createClient, createAdminClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { CuratorSidebar } from '../CuratorSidebar'

export default async function CuratorProfilePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('users').select('name, role').eq('id', user.id).single()
  if (profile?.role !== 'curator' && profile?.role !== 'admin' && profile?.role !== 'rop') redirect('/login')

  const admin = await createAdminClient()

  const { data: curator } = await admin
    .from('curators')
    .select('*')
    .eq('user_id', user.id)
    .maybeSingle()

  // Stats
  const { data: clients } = await admin
    .from('clients')
    .select('id, status')
    .eq('curator_id', curator?.id || '')

  const activeClients = (clients ?? []).filter(c => c.status === 'active').length
  const completedClients = (clients ?? []).filter(c => c.status === 'completed').length

  const initials = (profile?.name || user.email || 'КР')
    .split(' ').map((w: string) => w[0]).join('').toUpperCase().slice(0, 2)

  const cardStyle: React.CSSProperties = { background: 'var(--surf)', border: '1px solid var(--bor2)', borderRadius: 14, padding: '16px 20px' }
  const sectionTitle: React.CSSProperties = { fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--muted)', marginBottom: 12 }

  return (
    <div className="app">
      <CuratorSidebar userName={profile?.name || ''} userEmail={user.email || ''} initials={initials} activePage="profile" />
      <div className="main">
        <div className="topbar"><div className="pt">Профиль</div></div>
        <div style={{ padding: '20px 24px', maxWidth: 640 }}>

          {/* Avatar + name */}
          <div style={{ ...cardStyle, display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20 }}>
            <div style={{
              width: 64, height: 64, borderRadius: '50%',
              background: 'linear-gradient(135deg,#B15ECC,#8a3fad)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 22, fontWeight: 800, color: '#fff', flexShrink: 0,
            }}>
              {initials}
            </div>
            <div>
              <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--text)' }}>{profile?.name || 'Куратор'}</div>
              <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>{user.email}</div>
              {curator?.telegram_username && (
                <div style={{ fontSize: 12, color: '#0088cc', marginTop: 2 }}>@{curator.telegram_username}</div>
              )}
            </div>
          </div>

          {/* Stats */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 20 }}>
            <div style={cardStyle}>
              <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--purple)' }}>{activeClients}</div>
              <div style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 600, textTransform: 'uppercase' }}>Активных</div>
            </div>
            <div style={cardStyle}>
              <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--green)' }}>{completedClients}</div>
              <div style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 600, textTransform: 'uppercase' }}>Завершённых</div>
            </div>
            <div style={cardStyle}>
              <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--text)' }}>{curator?.max_clients || 20}</div>
              <div style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 600, textTransform: 'uppercase' }}>Макс. клиентов</div>
            </div>
          </div>

          {/* Info */}
          <div style={sectionTitle}>Информация</div>
          <div style={{ ...cardStyle, marginBottom: 20 }}>
            <div style={{ display: 'grid', gap: 12, fontSize: 13 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--muted)' }}>Email</span>
                <span style={{ fontWeight: 600 }}>{user.email}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--muted)' }}>Контакт</span>
                <span style={{ fontWeight: 600 }}>{curator?.contact || '—'}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--muted)' }}>Telegram</span>
                <span style={{ fontWeight: 600, color: '#0088cc' }}>{curator?.telegram_username ? `@${curator.telegram_username}` : '—'}</span>
              </div>
            </div>
          </div>

          {/* Specializations & Languages */}
          {((curator?.specializations && curator.specializations.length > 0) || (curator?.languages && curator.languages.length > 0)) && (
            <>
              <div style={sectionTitle}>Специализация</div>
              <div style={{ ...cardStyle, marginBottom: 20 }}>
                {curator.specializations && curator.specializations.length > 0 && (
                  <div style={{ marginBottom: curator.languages?.length > 0 ? 12 : 0 }}>
                    <div style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 600, marginBottom: 6 }}>Направления</div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {curator.specializations.map((s: string) => (
                        <span key={s} style={{
                          padding: '4px 10px', borderRadius: 8, fontSize: 11, fontWeight: 600,
                          background: 'rgba(177,94,204,.08)', color: 'var(--purple)',
                        }}>{s}</span>
                      ))}
                    </div>
                  </div>
                )}
                {curator.languages && curator.languages.length > 0 && (
                  <div>
                    <div style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 600, marginBottom: 6 }}>Языки</div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {curator.languages.map((l: string) => (
                        <span key={l} style={{
                          padding: '4px 10px', borderRadius: 8, fontSize: 11, fontWeight: 600,
                          background: 'rgba(0,136,204,.08)', color: '#0088cc',
                        }}>{l}</span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </>
          )}

          {!curator && (
            <div style={{ ...cardStyle, textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>
              Профиль куратора не привязан. Обратитесь к администратору.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
