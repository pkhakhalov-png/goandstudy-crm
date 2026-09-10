import { config } from 'dotenv'
import path from 'path'
import { createClient } from '@supabase/supabase-js'

config({ path: path.resolve(process.cwd(), '.env.local') })

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false, autoRefreshToken: false },
})

async function main() {
  // Уникальные значения status
  const { data: statuses, error } = await sb.from('clients').select('status')
  if (error) throw error
  const uniq = Array.from(new Set((statuses ?? []).map(r => r.status)))
  console.log('Существующие значения clients.status:', uniq)

  // Покажем check-constraint через exec_sql RPC, если есть
  const { data: cdef, error: cdefErr } = await sb.rpc('pg_get_check_constraint_clients_status').single().then(r => r, () => ({ data: null, error: null } as any))
  if (cdef) console.log('check constraint:', cdef)

  // Анастасия — id и текущий статус
  const { data: nastya } = await sb.from('clients')
    .select('id, name, status, curator_id')
    .ilike('name', 'Анастасия')
  console.log('\nКлиенты с именем "Анастасия":', nastya)
}
main().catch(e => { console.error(e); process.exit(1) })
