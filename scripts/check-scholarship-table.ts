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
  const { error } = await sb.from('client_scholarships').select('id').limit(1)
  if (error) {
    console.log(`❌ ${error.message}`)
    console.log('\n— нужно применить SQL в Supabase Dashboard:')
    console.log('   supabase/migrations/20260427000000_client_scholarships.sql')
    process.exit(1)
  }
  console.log('✅ client_scholarships exists')
}
main().catch(e => { console.error(e); process.exit(1) })
