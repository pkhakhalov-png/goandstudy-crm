import { config } from 'dotenv'
import path from 'path'
import { createClient } from '@supabase/supabase-js'
config({ path: path.resolve(process.cwd(), '.env.local') })
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })

const CID = 93

const TABLES = [
  'payments', 'expenses', 'invoices', 'deals',
  'client_activities', 'client_applications', 'client_checklist_progress',
  'client_documents', 'client_essays', 'client_invitations', 'client_scholarships',
  'client_shortlists', 'client_stages', 'client_tg_files', 'client_tg_messages',
  'client_universities', 'bookings', 'application_documents', 'application_events',
  'application_profile_data', 'schedule_slots', 'school_application_profiles',
]

async function counts(label: string) {
  console.log(`\n--- ${label} (client_id=${CID}) ---`)
  for (const t of TABLES) {
    const { count, error } = await db.from(t).select('*', { count: 'exact', head: true }).eq('client_id', CID)
    if (error) continue // таблица без client_id — пропускаем
    if ((count ?? 0) > 0) console.log(`  ${t}: ${count}`)
  }
}

async function main() {
  // Гарантия что это именно Розалия
  const { data: c } = await db.from('clients').select('id, name').eq('id', CID).single()
  if (!c) { console.log(`Клиент #${CID} уже отсутствует.`); return }
  console.log(`Клиент к удалению: #${c.id} "${c.name}"`)
  if (!(c.name || '').toLowerCase().includes('розали')) {
    console.log('!!! Имя НЕ содержит "Розали" — СТОП, ничего не удаляю.'); return
  }

  await counts('ДО удаления')

  // Удаляем клиента — FK ON DELETE CASCADE снесёт платежи, расходы и пр.;
  // deals/invoices получат client_id = NULL (ON DELETE SET NULL).
  const { error } = await db.from('clients').delete().eq('id', CID)
  if (error) { console.log('\nОШИБКА удаления:', error.message); return }
  console.log('\n>>> Клиент удалён (DELETE FROM clients WHERE id=93).')

  await counts('ПОСЛЕ удаления')

  const { data: gone } = await db.from('clients').select('id').eq('id', CID)
  console.log(`\nПроверка: клиент #${CID} ${(!gone || gone.length === 0) ? 'отсутствует ✅' : 'ВСЁ ЕЩЁ ЕСТЬ ❌'}`)
}
main()
