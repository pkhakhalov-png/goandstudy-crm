import { config } from 'dotenv'
import path from 'path'
import { createClient } from '@supabase/supabase-js'

config({ path: path.resolve(process.cwd(), '.env.local') })

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } },
)

const CLIENT_ID = 50

const TABLES = [
  'client_shortlists',
  'client_documents',
  'client_essays',
  'client_motivation',
  'client_resume',
  'client_applications',
  'client_tasks',
  'client_messages',
  'client_program_priorities',
]

async function main() {
  for (const t of TABLES) {
    const { data, error } = await sb.from(t).select('*', { count: 'exact', head: false }).eq('client_id', CLIENT_ID)
    if (error) {
      console.log(`${t}: ❌ ${error.message}`)
      continue
    }
    console.log(`${t}: ${data?.length || 0} rows`)
  }
}
main().catch(e => { console.error(e); process.exit(1) })
