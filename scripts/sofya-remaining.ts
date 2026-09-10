import { config } from 'dotenv'; import path from 'path'; import { createClient } from '@supabase/supabase-js'
config({ path: path.resolve(process.cwd(), '.env.local') })
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
const SOFYA = '5a49d5d0-f660-4202-96eb-4899e840588f'
async function main(){
  const { data } = await sb.from('clients').select('id, name, status, current_stage_code').eq('curator_id', SOFYA).order('name')
  console.log(`Сейчас у Софьи: ${data?.length}`)
  for (const c of data ?? []) console.log(`  id=${String(c.id).padStart(4)} | ${c.status.padEnd(9)} | stage=${c.current_stage_code||'—'} | ${c.name}`)
}
main().catch(e=>{console.error(e);process.exit(1)})
