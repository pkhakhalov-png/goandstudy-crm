import { createClient, createAdminClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { logout } from '@/app/login/actions'
import { Sidebar } from '../Sidebar'
import { CuratorsPage } from './CuratorsPage'

export default async function AdminCuratorsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('users')
    .select('name, role')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'admin') redirect('/sales')

  const admin = await createAdminClient()

  const [
    { data: curators },
    { data: clients },
    { data: users },
  ] = await Promise.all([
    admin.from('curators').select('id, name, contact, email, is_active, user_id, specializations, languages, max_clients, telegram_username, created_at').order('name'),
    admin.from('clients').select('id, curator_id, status').eq('status', 'active'),
    admin.from('users').select('id, email, role').eq('role', 'curator'),
  ])

  // Enrich curators with client count and user email
  const userMap = Object.fromEntries((users ?? []).map(u => [u.id, u]))
  const enriched = (curators ?? []).map(c => {
    const activeClients = (clients ?? []).filter(cl => cl.curator_id === c.id).length
    const linkedUser = c.user_id ? userMap[c.user_id] : null
    const email = linkedUser?.email || c.email || c.contact || ''
    return { ...c, activeClients, email: email || '—', emailRaw: email }
  })

  return (
    <div className="app">
      <Sidebar activePage="curators" userName={profile?.name || ''} userEmail={user.email || ''} />
      <div className="main">
        <div className="topbar">
          <div className="pt">Кураторы</div>
          <div className="tbr">
            <span style={{ fontSize: 12, color: 'var(--muted)' }}>{enriched.length} кураторов</span>
            <form action={logout}>
              <button className="btn-s">Выйти</button>
            </form>
          </div>
        </div>
        <CuratorsPage curators={enriched} />
      </div>
    </div>
  )
}
