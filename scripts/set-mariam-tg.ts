import { config } from 'dotenv'; import path from 'path'; import { createClient } from '@supabase/supabase-js'
config({ path: path.resolve(process.cwd(), '.env.local') })
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
async function main(){
  const { data: before } = await sb.from('users').select('id, name, email, telegram_username').eq('email','mariamavv@yandex.ru').single()
  console.log('до:', JSON.stringify(before))
  const { error } = await sb.from('users').update({ telegram_username: 'avmarrii' }).eq('id', before!.id)
  if (error){ console.error('err:', error.message); process.exit(1) }
  const { data: after } = await sb.from('users').select('id, name, email, telegram_username').eq('id', before!.id).single()
  console.log('после:', JSON.stringify(after))
}
main().catch(e=>{console.error(e);process.exit(1)})
