import { config } from 'dotenv'; import path from 'path'; import { randomBytes } from 'crypto'
import { createClient } from '@supabase/supabase-js'
config({ path: path.resolve(process.cwd(), '.env.local') })
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
const APP_URL = 'https://crm.goandstudy.com'
const EMAIL = 'janelsabit@gmail.com'
async function main() {
  const { data: exists } = await sb.from('curators').select('id').or(`contact.ilike.%janelsabit%,email.ilike.%janelsabit%`)
  if (exists?.length) { console.log('⚠ Уже существует, id=', exists[0].id, '— прерываю'); return }

  const { data: cur, error: e1 } = await sb.from('curators')
    .insert({ name: 'Жанель', email: EMAIL, contact: EMAIL, is_active: true, max_clients: 20 })
    .select('id, name, email').single()
  if (e1 || !cur) { console.error('curators insert error:', e1?.message); process.exit(1) }
  console.log('✓ Куратор создан:', cur.id, cur.name, cur.email)

  const token = randomBytes(24).toString('hex')
  const expiresAt = new Date(Date.now() + 30 * 86400_000).toISOString()
  const { error: e2 } = await sb.from('curator_invitations')
    .insert({ curator_id: cur.id, token, email: EMAIL, expires_at: expiresAt })
  if (e2) { console.error('invitation insert error:', e2.message); process.exit(1) }

  console.log('\n=== INVITE-ССЫЛКА (действует 30 дней) ===')
  console.log(`${APP_URL}/invite/curator/${token}`)
  console.log('\ncurator_id:', cur.id)
}
main().catch(e=>{console.error(e);process.exit(1)})
