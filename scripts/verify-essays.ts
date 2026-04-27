import { config } from 'dotenv'
import path from 'path'
import { createClient } from '@supabase/supabase-js'

const isDev = process.argv.includes('--dev')
config({ path: path.resolve(process.cwd(), isDev ? '.env.development.local' : '.env.local') })

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } },
)

async function main() {
  console.log(`env: ${process.env.NEXT_PUBLIC_SUPABASE_URL}`)
  const { error, count } = await sb.from('client_essays').select('id', { count: 'exact', head: true })
  if (error) {
    console.log(`❌ ${error.message}`)
    process.exit(1)
  }
  console.log(`✅ client_essays exists (${count ?? 0} row(s))`)
}
main().catch(e => { console.error(e); process.exit(1) })
