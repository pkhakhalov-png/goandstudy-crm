import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Sidebar } from '../Sidebar'
import { SettingsClient } from './SettingsClient'

export default async function AdminSettingsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('users')
    .select('name, role')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'admin') redirect('/sales')

  const [
    { data: salespersons },
    { data: curators },
    { data: fixedExpenses },
    { data: allBookings },
  ] = await Promise.all([
    supabase.from('users').select('id, name, email, is_active, telegram_username, created_at').eq('role', 'salesperson').order('created_at', { ascending: true }),
    supabase.from('curators').select('id, name, is_active, created_at').order('created_at', { ascending: true }),
    supabase.from('fixed_expenses').select('*').order('created_at', { ascending: true }),
    supabase.from('bookings').select('id, salesperson_id, booking_date, start_time, end_time, client_name, client_phone, client_telegram, status, created_at').order('booking_date', { ascending: false }).limit(500),
  ])

  return (
    <div className="app">
      <Sidebar activePage="settings" userName={profile?.name || ''} userEmail={user.email || ''} />
      <div className="main">
        <div className="topbar">
          <div className="pt">Настройки</div>
          <span style={{fontSize:12,color:'var(--muted)'}}>{new Date().toLocaleDateString('ru-RU',{day:'numeric',month:'long',year:'numeric'})}</span>
        </div>
        <SettingsClient
          salespersons={salespersons ?? []}
          curators={curators ?? []}
          fixedExpenses={fixedExpenses ?? []}
          bookings={allBookings ?? []}
        />
      </div>
    </div>
  )
}