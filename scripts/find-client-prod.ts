import { config } from 'dotenv'
import path from 'path'
import { createClient } from '@supabase/supabase-js'

config({ path: path.resolve(process.cwd(), '.env.local') })

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } },
)

const NEEDLE = (process.argv[2] || 'Кристина').toLowerCase()

async function main() {
  const { data } = await sb.from('clients').select('id,name,email,curator_id,salesperson_id,status').order('id')
  console.log(`prod clients matching "${NEEDLE}":`)
  data?.filter(c => (c.name || '').toLowerCase().includes(NEEDLE)).forEach(c =>
    console.log(' ', c.id, '|', c.name, '|', c.email, '| curator=', c.curator_id, '| status=', c.status),
  )

  console.log('\nall clients of Тест Куратор (5b4ad7c2-dcd0-4d94-b025-a29d3698c3a8):')
  data?.filter(c => c.curator_id === '5b4ad7c2-dcd0-4d94-b025-a29d3698c3a8').forEach(c =>
    console.log(' ', c.id, '|', c.name, '|', c.email, '| status=', c.status),
  )
}
main().catch(e => { console.error(e); process.exit(1) })
