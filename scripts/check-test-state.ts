import { config } from 'dotenv'
import path from 'path'
import { createClient } from '@supabase/supabase-js'

config({ path: path.resolve(process.cwd(), '.env.local') })
const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } },
)

async function main() {
  const { data: cur } = await sb.from('curators').select('id, name, email, user_id').eq('id', '5b4ad7c2-dcd0-4d94-b025-a29d3698c3a8').single()
  console.log('test curator:', cur)
  if (cur?.user_id) {
    const { data: u } = await sb.from('users').select('email, name, role').eq('id', cur.user_id).single()
    console.log('linked auth user:', u)
  }
  const { data: deals } = await sb.from('deals').select('id, name, salesperson_id, stage_id').eq('salesperson_id', '89e935cd-f565-4c40-a6e7-c786f0629a03')
  console.log('deals на тестовом продажнике:', deals?.length || 0)
  deals?.forEach(d => console.log(`  ${d.id.slice(0,8)} | ${d.name} | stage=${d.stage_id?.slice(0,8)}`))

  const { data: clients50 } = await sb.from('clients').select('id, name, salesperson_id, curator_id').in('id', [50, 58])
  console.log('test clients still linked:', clients50)
}
main().catch(e => { console.error(e); process.exit(1) })
