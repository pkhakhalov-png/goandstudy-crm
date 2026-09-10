import { config } from 'dotenv'; import path from 'path'; import { createClient } from '@supabase/supabase-js'
config({ path: path.resolve(process.cwd(), '.env.local') })
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
async function main() {
  const { data: curs } = await sb.from('curators').select('id, name, email, contact, user_id, is_active').or('name.ilike.%жанел%,name.ilike.%janel%,contact.ilike.%janelsabit%,email.ilike.%janelsabit%')
  console.log('=== curators-записи Жанель ===')
  for (const c of curs ?? []) console.log(JSON.stringify(c))
  const { data: u } = await sb.from('users').select('id, name, email, role, is_active').or('email.ilike.%janelsabit%,name.ilike.%жанел%,name.ilike.%janel%')
  console.log('\n=== users-записи Жанель ===')
  for (const x of u ?? []) console.log(JSON.stringify(x))
  // сколько клиентов у каждой curators-записи
  for (const c of curs ?? []) {
    const { count } = await sb.from('clients').select('id', { count: 'exact', head: true }).eq('curator_id', c.id)
    console.log(`\nclients у curator ${c.id} (${c.name}): ${count}`)
  }
}
main().catch(e=>{console.error(e);process.exit(1)})
