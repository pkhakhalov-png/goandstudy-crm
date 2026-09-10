import { config } from 'dotenv'
import path from 'path'
import { createClient } from '@supabase/supabase-js'

config({ path: path.resolve(process.cwd(), '.env.local') })
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false, autoRefreshToken: false },
})

async function main() {
  const { data } = await sb.from('users').select('role')
  const counts: Record<string, number> = {}
  for (const r of data ?? []) counts[r.role || 'null'] = (counts[r.role || 'null'] || 0) + 1
  console.log('Распределение users.role:', counts)
}
main().catch(e => { console.error(e); process.exit(1) })
