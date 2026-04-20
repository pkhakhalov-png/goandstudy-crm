import { createClient, createAdminClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { CuratorSidebar } from '../CuratorSidebar'

const categoryLabel: Record<string, string> = {
  main: 'Основные',
  session: 'Сессии',
  docs: 'Документы',
  designer: 'Дизайн',
}

const iconColors: Record<string, { bg: string; color: string }> = {
  GS: { bg: 'rgba(22,163,97,.1)', color: 'var(--green)' },
  Cal: { bg: 'rgba(66,133,244,.1)', color: '#4285F4' },
  Zm: { bg: 'rgba(45,140,255,.1)', color: '#2D8CFF' },
  AB: { bg: 'rgba(177,94,204,.1)', color: 'var(--purple)' },
  CV: { bg: 'rgba(201,125,0,.1)', color: 'var(--gold)' },
  EN: { bg: 'rgba(0,136,204,.1)', color: '#0088cc' },
  TG: { bg: 'rgba(0,136,204,.1)', color: '#0088cc' },
}

export default async function CuratorResourcesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('users').select('name, role').eq('id', user.id).single()
  if (profile?.role !== 'curator' && profile?.role !== 'admin' && profile?.role !== 'rop') redirect('/login')

  const admin = await createAdminClient()
  const { data: resources } = await admin
    .from('curator_resources')
    .select('*')
    .eq('is_active', true)
    .order('position')

  const initials = (profile?.name || user.email || 'КР')
    .split(' ').map((w: string) => w[0]).join('').toUpperCase().slice(0, 2)

  // Group by category
  const grouped: Record<string, any[]> = {}
  ;(resources ?? []).forEach(r => {
    const cat = r.category || 'other'
    if (!grouped[cat]) grouped[cat] = []
    grouped[cat].push(r)
  })

  return (
    <div className="app">
      <CuratorSidebar userName={profile?.name || ''} userEmail={user.email || ''} initials={initials} activePage="resources" />
      <div className="main">
        <div className="topbar"><div className="pt">Ресурсы</div></div>
        <div style={{ padding: '20px 24px' }}>
          {Object.entries(grouped).map(([cat, items]) => (
            <div key={cat} style={{ marginBottom: 24 }}>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--muted)', marginBottom: 12 }}>
                {categoryLabel[cat] || cat}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
                {items.map((r: any) => {
                  const ic = iconColors[r.icon_code] || { bg: 'rgba(142,142,147,.1)', color: 'var(--muted)' }
                  const Wrapper = r.url ? 'a' : 'div'
                  const linkProps = r.url ? { href: r.url, target: '_blank', rel: 'noopener' } : {}
                  return (
                    <Wrapper key={r.id} {...linkProps as any} style={{
                      background: 'var(--surf)', border: '1px solid var(--bor2)', borderRadius: 14,
                      padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 14,
                      textDecoration: 'none', cursor: r.url ? 'pointer' : 'default',
                      transition: 'border-color .15s',
                    }}>
                      <div style={{
                        width: 44, height: 44, borderRadius: 12, flexShrink: 0,
                        background: ic.bg, color: ic.color,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 14, fontWeight: 800,
                      }}>
                        {r.icon_code || '🔗'}
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>{r.title}</div>
                        {r.description && <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>{r.description}</div>}
                      </div>
                      {r.url && (
                        <svg viewBox="0 0 16 16" fill="none" stroke="var(--muted)" strokeWidth="1.5" width="14" height="14" style={{ flexShrink: 0 }}>
                          <path d="M6 3h7v7M13 3L6 10" />
                        </svg>
                      )}
                    </Wrapper>
                  )
                })}
              </div>
            </div>
          ))}

          {(resources ?? []).length === 0 && (
            <div style={{ textAlign: 'center', padding: 40, color: 'var(--muted)', fontSize: 13 }}>
              Нет доступных ресурсов
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
