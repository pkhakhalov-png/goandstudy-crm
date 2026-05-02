import { config } from 'dotenv'
import path from 'path'
import { createClient } from '@supabase/supabase-js'

config({ path: path.resolve(process.cwd(), '.env.local') })

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } },
)

const CLIENT_ID = 50
const NEW_EMAIL = 'p.khakhalov@gmail.com'

async function main() {
  const { data: before } = await sb
    .from('clients').select('id, name, email').eq('id', CLIENT_ID).single()
  console.log('before:', before)

  const { data: invs } = await sb
    .from('client_invitations').select('id, email, used_at, expires_at')
    .eq('client_id', CLIENT_ID)
  console.log('existing invitations:', invs)

  for (const inv of invs || []) {
    if (!inv.used_at && new Date(inv.expires_at) > new Date()) {
      await sb.from('client_invitations')
        .update({ expires_at: new Date(Date.now() - 1000).toISOString() })
        .eq('id', inv.id)
      console.log('expired stale invitation', inv.id)
    }
  }

  const { error } = await sb.from('clients')
    .update({ email: NEW_EMAIL })
    .eq('id', CLIENT_ID)
  if (error) throw error

  const { data: after } = await sb
    .from('clients').select('id, name, email').eq('id', CLIENT_ID).single()
  console.log('after:', after)
}
main().catch(e => { console.error(e); process.exit(1) })
