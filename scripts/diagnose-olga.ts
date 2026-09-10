import { config } from 'dotenv'
import path from 'path'
import { createClient } from '@supabase/supabase-js'
config({ path: path.resolve(process.cwd(), '.env.local') })
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })

const DAYS = ['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс']

async function main() {
  console.log('=== ВСЕ ПРОДАВЦЫ ===\n')
  const { data: sp } = await sb.from('users')
    .select('id, name, email, role, is_active, round_robin_count, telegram_username')
    .eq('role', 'salesperson')
    .order('round_robin_count', { ascending: true })
  for (const u of sp ?? []) {
    console.log(`${u.is_active ? '✓' : '✕'} ${u.name?.padEnd(20)} rr=${String(u.round_robin_count).padStart(4)}  ${u.email}  tg=${u.telegram_username || '—'}`)
  }

  console.log('\n=== СЛОТЫ РАСПИСАНИЯ ПО КАЖДОМУ ===\n')
  for (const u of sp ?? []) {
    const { data: slots } = await sb.from('schedule_slots')
      .select('day_of_week, start_time, end_time, is_active')
      .eq('user_id', u.id)
      .order('day_of_week').order('start_time')
    const activeSlots = (slots ?? []).filter(s => s.is_active)
    console.log(`${u.name}: ${activeSlots.length} активных слотов`)
    const byDay: Record<number, string[]> = {}
    for (const s of activeSlots) {
      if (!byDay[s.day_of_week]) byDay[s.day_of_week] = []
      byDay[s.day_of_week].push(`${s.start_time.slice(0,5)}-${s.end_time.slice(0,5)}`)
    }
    for (const [d, times] of Object.entries(byDay)) {
      console.log(`  ${DAYS[Number(d)]}: ${times.join(', ')}`)
    }
    if (activeSlots.length === 0) console.log('  ⚠ НЕТ АКТИВНЫХ СЛОТОВ → не получает заявки')
    console.log()
  }

  console.log('=== БРОНИ ЗА ПОСЛЕДНИЕ 14 ДНЕЙ ===\n')
  const since = new Date(Date.now() - 14 * 86400_000).toISOString().slice(0, 10)
  for (const u of sp ?? []) {
    const { data: bks, count } = await sb.from('bookings')
      .select('id, booking_date, start_time, status, client_name', { count: 'exact' })
      .eq('salesperson_id', u.id)
      .gte('booking_date', since)
      .order('booking_date', { ascending: false })
      .limit(10)
    console.log(`${u.name}: ${count ?? 0} броней с ${since}`)
    for (const b of bks ?? []) {
      console.log(`  ${b.booking_date} ${b.start_time.slice(0,5)} · ${b.status} · ${b.client_name}`)
    }
    console.log()
  }
}

main().catch(console.error)
