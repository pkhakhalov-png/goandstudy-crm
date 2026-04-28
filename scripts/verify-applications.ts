import { config } from 'dotenv'
import path from 'path'
import { createClient } from '@supabase/supabase-js'

const isDev = !process.argv.includes('--prod')
config({ path: path.resolve(process.cwd(), isDev ? '.env.development.local' : '.env.local') })

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } },
)

async function main() {
  console.log(`env: ${process.env.NEXT_PUBLIC_SUPABASE_URL}`)
  for (const tbl of ['client_applications', 'application_documents', 'application_events']) {
    const { error } = await sb.from(tbl).select('*').limit(0)
    console.log(error ? `❌ ${tbl}: ${error.message}` : `✅ ${tbl} exists`)
  }
}
main().catch(e => { console.error(e); process.exit(1) })
