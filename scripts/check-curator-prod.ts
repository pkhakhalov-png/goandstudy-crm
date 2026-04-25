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
  const { data: curators } = await sb.from('curators').select('id,name,contact,user_id,is_active')
  console.log('curators:')
  curators?.forEach((c: any) =>
    console.log(' ', c.id, '|', c.name, '| contact=', c.contact, '| user_id=', c.user_id),
  )

  const { data: client50 } = await sb.from('clients').select('*').eq('id', 50).single()
  console.log('\nclient #50:', client50)
}
main().catch(e => { console.error(e); process.exit(1) })
