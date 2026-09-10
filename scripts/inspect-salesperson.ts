import { config } from 'dotenv'; import path from 'path'; import { createClient } from '@supabase/supabase-js'
config({ path: path.resolve(process.cwd(), '.env.local') })
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
async function main(){
  const { data } = await sb.from('users').select('*').eq('role','salesperson').limit(1)
  console.log('users columns:', data?.[0] ? Object.keys(data[0]).join(', ') : '—')
  const { data: exist } = await sb.from('users').select('id,name,email,role,is_active').or('email.ilike.%mariamavv%,name.ilike.%мариам%,name.ilike.%авакян%')
  console.log('Мариам уже есть?', exist?.length ? JSON.stringify(exist) : 'нет')
}
main().catch(e=>{console.error(e);process.exit(1)})
