import { config } from 'dotenv'
import path from 'path'
import { createClient } from '@supabase/supabase-js'
config({ path: path.resolve(process.cwd(), '.env.local') })

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })

async function main() {
  const { error } = await sb.from('clients').update({
    roadmap_data: null,
    roadmap_approved_at: null,
    roadmap_approved_by_name: null,
  }).eq('id', 76)
  if (error) { console.error(error); process.exit(1) }
  console.log('✓ Test client #76 roadmap reset — at next curator visit нажмите «Заполнить шаблон»')
}
main()
