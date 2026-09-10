import { config } from 'dotenv'; import path from 'path'; import { createClient } from '@supabase/supabase-js'
config({ path: path.resolve(process.cwd(), '.env.local') })
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
async function main() {
  const { data } = await sb.from('curators').select('*').limit(1)
  console.log('curators columns:', data?.[0] ? Object.keys(data[0]).join(', ') : '(нет строк)')
  const { data: janel } = await sb.from('curators').select('id,name,email,contact,user_id').or('contact.ilike.%janelsabit%,email.ilike.%janelsabit%,name.ilike.%жанел%,name.ilike.%janel%')
  console.log('Жанель уже есть?', janel?.length ? JSON.stringify(janel) : 'нет')
  const { data: inv } = await sb.from('curator_invitations').select('*').limit(1)
  console.log('curator_invitations columns:', inv?.[0] ? Object.keys(inv[0]).join(', ') : '(нет строк)')
}
main().catch(e=>{console.error(e);process.exit(1)})
