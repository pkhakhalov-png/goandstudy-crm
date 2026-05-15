import { config } from 'dotenv'
import path from 'path'
import { createClient } from '@supabase/supabase-js'
config({ path: path.resolve(process.cwd(), '.env.local') })

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })

async function main() {
  const { data, error } = await sb
    .from('curators')
    .select('id, name, email, contact, user_id, is_active, created_at')
    .order('name')
  if (error) { console.error(error); return }
  console.log(`Всего кураторов: ${data?.length}\n`)
  for (const c of data ?? []) {
    console.log(`${c.is_active ? '✓' : '✕'} ${c.name}`)
    console.log(`    id: ${c.id}`)
    console.log(`    email: ${c.email || '—'}`)
    console.log(`    contact: ${c.contact || '—'}`)
    console.log(`    user_id (cabinet): ${c.user_id || '— (нет кабинета)'}`)
    console.log()
  }
}
main().catch(console.error)
