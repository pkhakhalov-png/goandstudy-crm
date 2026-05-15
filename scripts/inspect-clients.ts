import { config } from 'dotenv'
import path from 'path'
import { createClient } from '@supabase/supabase-js'
config({ path: path.resolve(process.cwd(), '.env.local') })
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })

async function main() {
  // columns
  const { data: any1 } = await sb.from('clients').select('*').limit(1)
  console.log('clients columns:', any1?.[0] ? Object.keys(any1[0]).join(', ') : '(empty)')
  console.log()

  const { data } = await sb.from('clients')
    .select('id, name, country, status, curator_id, created_at, email')
    .or('name.ilike.%тест%,name.ilike.%test%,email.ilike.%test%')
    .order('id', { ascending: false })
    .limit(20)
  console.log('Кандидаты в тест-клиенты:')
  for (const c of data ?? []) {
    console.log(`  #${c.id} · ${c.name} · ${c.country || '—'} · status=${c.status} · curator_id=${c.curator_id || '—'}`)
  }
}
main().catch(console.error)
