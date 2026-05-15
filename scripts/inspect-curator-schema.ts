import { config } from 'dotenv'
import path from 'path'
import { createClient } from '@supabase/supabase-js'
config({ path: path.resolve(process.cwd(), '.env.local') })

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })

async function main() {
  // 1 row from each to see columns
  const { data: c } = await sb.from('curators').select('*').limit(1)
  console.log('curators columns:', c?.[0] ? Object.keys(c[0]) : '(empty table)')

  const { data: inv } = await sb.from('curator_invitations').select('*').limit(1)
  console.log('curator_invitations exists:', !!inv)
  if (inv?.[0]) console.log('  columns:', Object.keys(inv[0]))

  console.log('RESEND_API_KEY set:', !!process.env.RESEND_API_KEY)
  console.log('RESEND_FROM_ADDRESS:', process.env.RESEND_FROM_ADDRESS || '(default)')
  console.log('NEXT_PUBLIC_APP_URL:', process.env.NEXT_PUBLIC_APP_URL || '(default)')

  // Auth check for Милена's user_id
  const { data: m } = await sb.from('curators').select('user_id, contact').eq('name', 'Милена').single()
  if (m?.user_id) {
    const { data: u } = await sb.auth.admin.getUserById(m.user_id)
    console.log('\nМилена user:')
    console.log('  email_in_auth:', u?.user?.email)
    console.log('  curators.contact:', m.contact)
    console.log('  last_sign_in:', u?.user?.last_sign_in_at || 'never')
  }
}
main().catch(console.error)
