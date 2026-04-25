import { config } from 'dotenv'
import path from 'path'
import { createClient } from '@supabase/supabase-js'

const isDev = process.argv.includes('--dev')
const envFile = isDev ? '.env.development.local' : '.env.local'
config({ path: path.resolve(process.cwd(), envFile) })

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } },
)

// Pass client id + type as args, e.g. `npx tsx scripts/reset-client-essay.ts 42 resume --dev`
const CLIENT_ID = Number(process.argv[2])
const ESSAY_TYPE = (process.argv[3] || 'resume') as 'resume' | 'motivation'

async function main() {
  if (!CLIENT_ID) {
    console.error('Usage: npx tsx scripts/reset-client-essay.ts <clientId> [resume|motivation] [--dev]')
    process.exit(1)
  }
  console.log(`env: ${process.env.NEXT_PUBLIC_SUPABASE_URL}`)
  console.log(`deleting client_essays for client=${CLIENT_ID} type=${ESSAY_TYPE}...`)

  const { data, error } = await sb
    .from('client_essays')
    .delete()
    .eq('client_id', CLIENT_ID)
    .eq('type', ESSAY_TYPE)
    .select('id, status')

  if (error) { console.error(error.message); process.exit(1) }
  console.log(`deleted ${data?.length ?? 0} row(s)`)
  data?.forEach(r => console.log(' ', r))
}
main().catch(e => { console.error(e); process.exit(1) })
