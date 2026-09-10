import { config } from 'dotenv'
import path from 'path'
import { createClient } from '@supabase/supabase-js'

config({ path: path.resolve(process.cwd(), '.env.local') })

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false, autoRefreshToken: false },
})

async function main() {
  // Создадим временную строку с status='refunded' — не получится сделать без обязательных полей,
  // поэтому идём через update на тестовом id с откатом.
  // Проще: попробуем update Анастасии (id=95) на refunded и сразу обратно.
  const id = 95
  const { data: before } = await sb.from('clients').select('id, status').eq('id', id).single()
  console.log('До:', before)

  const { error: e1 } = await sb.from('clients').update({ status: 'refunded' }).eq('id', id)
  if (e1) {
    console.log('❌ Constraint всё ещё не разрешает refunded:', e1.message)
    process.exit(1)
  }
  console.log('✓ refunded принят БД — возврат теперь сработает')

  // откатим
  const { error: e2 } = await sb.from('clients').update({ status: before!.status }).eq('id', id)
  if (e2) console.warn('rollback warn:', e2.message)
  else console.log(`✓ Откатил статус обратно в "${before!.status}"`)
}
main().catch(e => { console.error(e); process.exit(1) })
