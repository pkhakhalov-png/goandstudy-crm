import { config } from 'dotenv'
import path from 'path'
import { createClient } from '@supabase/supabase-js'

config({ path: path.resolve(process.cwd(), '.env.local') })

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false, autoRefreshToken: false },
})

async function main() {
  const { data: curator } = await sb
    .from('curators').select('id, name, email, contact, user_id').eq('name', 'Анастасия').maybeSingle()
  console.log('curator:', curator)
  if (!curator) return

  const { data: invs } = await sb
    .from('curator_invitations')
    .select('id, token, email, expires_at, used_at, created_at')
    .eq('curator_id', curator.id)
    .order('created_at', { ascending: false })
  console.log('\ninvitations:', invs)

  if (curator.user_id) {
    const { data: u } = await sb.from('users').select('id, email, name, role, is_active, created_at').eq('id', curator.user_id).maybeSingle()
    console.log('\npublic.users:', u)
    const { data: au } = await sb.auth.admin.getUserById(curator.user_id)
    console.log('\nauth user:', au?.user ? { id: au.user.id, email: au.user.email, last_sign_in_at: au.user.last_sign_in_at, created_at: au.user.created_at } : null)
  }
}
main().catch(e => { console.error(e); process.exit(1) })
