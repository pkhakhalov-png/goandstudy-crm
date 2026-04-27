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
  // Check columns
  const { error: colErr } = await sb
    .from('client_documents')
    .select('storage_path, file_name, file_size_bytes, mime_type, uploaded_by, uploaded_at')
    .limit(1)
  console.log(colErr ? `❌ columns: ${colErr.message}` : '✅ columns added')

  // Check bucket
  const { data: buckets, error: bErr } = await sb.storage.listBuckets()
  if (bErr) { console.log(`❌ bucket list: ${bErr.message}`); return }
  const target = buckets?.find(b => b.name === 'client-docs')
  console.log(target ? `✅ bucket client-docs exists (public=${target.public})` : '❌ bucket client-docs NOT FOUND')
}
main().catch(e => { console.error(e); process.exit(1) })
