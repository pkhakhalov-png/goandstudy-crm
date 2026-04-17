import { config } from 'dotenv'
import path from 'path'
import { createClient } from '@supabase/supabase-js'

config({ path: path.resolve(process.cwd(), '.env.development.local') })

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
})

const EMAIL = 'curator-test@goandstudy.com'
const PASSWORD = 'Test12345'
const NAME = 'Тест Куратор'

async function main() {
  console.log('Creating test curator...')
  console.log(`Email: ${EMAIL}`)

  // 1. Create auth user
  const { data: authData, error: authError } = await supabase.auth.admin.createUser({
    email: EMAIL,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { name: NAME },
  })

  if (authError) {
    if (authError.message.includes('already been registered') || authError.message.includes('already exists')) {
      console.log('Auth user already exists, looking up...')
      const { data: listData } = await supabase.auth.admin.listUsers()
      const existing = listData?.users?.find(u => u.email === EMAIL)
      if (!existing) {
        console.error('Cannot find existing user by email')
        process.exit(1)
      }
      console.log(`Found existing auth user: ${existing.id}`)
      await setupProfile(existing.id)
      return
    }
    console.error('Auth error:', authError.message)
    process.exit(1)
  }

  const userId = authData.user.id
  console.log(`Auth user created: ${userId}`)

  await setupProfile(userId)
}

async function setupProfile(userId: string) {
  // 2. Upsert into public.users
  const { error: usersError } = await supabase
    .from('users')
    .upsert({ id: userId, email: EMAIL, name: NAME, role: 'curator', is_active: true }, { onConflict: 'id' })

  if (usersError) {
    console.error('users upsert error:', usersError.message)
    process.exit(1)
  }
  console.log('public.users → role=curator ✓')

  // 3. Insert into public.curators (if not linked yet)
  const { data: existingCurator } = await supabase
    .from('curators')
    .select('id')
    .eq('user_id', userId)
    .maybeSingle()

  if (existingCurator) {
    console.log(`public.curators → already linked (${existingCurator.id}) ✓`)
  } else {
    const { data: newCurator, error: curatorError } = await supabase
      .from('curators')
      .insert({ name: NAME, contact: EMAIL, is_active: true, user_id: userId })
      .select('id')
      .single()

    if (curatorError) {
      console.error('curators insert error:', curatorError.message)
      process.exit(1)
    }
    console.log(`public.curators → created (${newCurator.id}) ✓`)
  }

  console.log('\n✅ Done!')
  console.log(`   user_id: ${userId}`)
  console.log(`   email:   ${EMAIL}`)
  console.log(`   password: ${PASSWORD}`)
  console.log(`   role:    curator`)
  console.log(`\nLogin at http://localhost:3000/login`)
}

main().catch(e => { console.error(e); process.exit(1) })
