import { createAdminClient } from '@/lib/supabase/server'
import { CancelClient } from './CancelClient'

export default async function CancelPage({ searchParams }: { searchParams: Promise<{ id?: string }> }) {
  const { id } = await searchParams
  if (!id) return <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>Неверная ссылка</div>

  const supabase = await createAdminClient()
  const { data: booking } = await supabase
    .from('bookings')
    .select('id, booking_date, start_time, end_time, client_name, status')
    .eq('id', id)
    .single()

  if (!booking) return <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><div style={{ textAlign: 'center', color: 'var(--muted)' }}>Запись не найдена</div></div>

  return <CancelClient booking={booking} />
}
