/**
 * Полная очистка тестовых данных перед E2E прогоном.
 * Удаляет всё связанное с тестовыми клиентами #50, #58
 * + сбрасывает пароли test sp и test curator.
 */

import { config } from 'dotenv'
import path from 'path'
import { createClient } from '@supabase/supabase-js'

config({ path: path.resolve(process.cwd(), '.env.local') })

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } },
)

const TEST_CLIENT_IDS = [50, 58]
const TEST_SP_USER_ID = '89e935cd-f565-4c40-a6e7-c786f0629a03'
const TEST_CURATOR_ID = '5b4ad7c2-dcd0-4d94-b025-a29d3698c3a8'
const TEST_CURATOR_USER_ID_FROM_CURATORS = null as string | null // resolved at runtime

const SP_PASSWORD = 'TestSales2026!'
const CURATOR_PASSWORD = 'TestCurator2026!'

async function main() {
  console.log('=== STEP 1: загружаем emails тестовых клиентов ===')
  const { data: clients } = await sb.from('clients').select('id, email').in('id', TEST_CLIENT_IDS)
  const clientEmails = (clients || []).map(c => c.email).filter(Boolean) as string[]
  console.log('client emails:', clientEmails)

  console.log('\n=== STEP 2: удаляем application_* и client_* данные ===')
  // Каскадно прицеплены к client_applications: application_documents, application_events, application_profile_data
  const { error: appErr } = await sb.from('client_applications').delete().in('client_id', TEST_CLIENT_IDS)
  if (appErr) console.error('client_applications:', appErr.message)
  else console.log('  ✓ client_applications + cascades')

  for (const tbl of ['client_universities', 'client_documents', 'client_essays', 'client_invitations']) {
    const { error } = await sb.from(tbl).delete().in('client_id', TEST_CLIENT_IDS)
    if (error) console.error(`${tbl}:`, error.message)
    else console.log(`  ✓ ${tbl}`)
  }

  // client_shortlists (legacy таблица — на всякий случай)
  try {
    await sb.from('client_shortlists').delete().in('client_id', TEST_CLIENT_IDS)
    console.log('  ✓ client_shortlists')
  } catch {}

  // unlocked scholarships
  try {
    await sb.from('client_scholarship_unlocks').delete().in('client_id', TEST_CLIENT_IDS)
    console.log('  ✓ client_scholarship_unlocks')
  } catch {}

  console.log('\n=== STEP 3: payments, deals, expenses тестовых клиентов ===')
  for (const tbl of ['payments', 'expenses']) {
    const { error } = await sb.from(tbl).delete().in('client_id', TEST_CLIENT_IDS)
    if (error) console.error(`${tbl}:`, error.message)
    else console.log(`  ✓ ${tbl}`)
  }

  // deals: ссылаются на client_id ИЛИ phone/email — почистим всё что связано
  const { data: testDeals } = await sb.from('deals').select('id').in('client_id', TEST_CLIENT_IDS)
  if (testDeals && testDeals.length > 0) {
    const dealIds = testDeals.map(d => d.id)
    for (const tbl of ['deal_messages', 'deal_files', 'deal_tasks', 'deal_activities']) {
      try {
        await sb.from(tbl).delete().in('deal_id', dealIds)
        console.log(`  ✓ ${tbl}`)
      } catch {}
    }
    await sb.from('deals').delete().in('id', dealIds)
    console.log('  ✓ deals')
  } else {
    console.log('  ✓ deals (нет привязанных)')
  }

  console.log('\n=== STEP 4: удаляем самих клиентов ===')
  const { error: cliErr } = await sb.from('clients').delete().in('id', TEST_CLIENT_IDS)
  if (cliErr) console.error('clients:', cliErr.message)
  else console.log('  ✓ clients')

  console.log('\n=== STEP 5: удаляем auth users + public.users этих клиентов ===')
  const { data: authList } = await sb.auth.admin.listUsers()
  for (const email of clientEmails) {
    const authUser = authList?.users?.find(u => u.email?.toLowerCase() === email.toLowerCase())
    if (authUser) {
      // public.users
      await sb.from('users').delete().eq('id', authUser.id)
      // auth.users
      await sb.auth.admin.deleteUser(authUser.id)
      console.log(`  ✓ удалён auth+public для ${email}`)
    } else {
      // На всякий — public.users по email
      await sb.from('users').delete().eq('email', email)
      console.log(`  · ${email}: auth не найден, public.users удалён по email`)
    }
  }

  console.log('\n=== STEP 6: bookings/slots тестового продажника ===')
  await sb.from('bookings').delete().eq('salesperson_id', TEST_SP_USER_ID).then(() => console.log('  ✓ bookings'))
  await sb.from('schedule_slots').update({ booked_count: 0 }).eq('salesperson_id', TEST_SP_USER_ID).then(() => console.log('  ✓ schedule_slots reset'))
  await sb.from('users').update({ round_robin_count: 0 }).eq('id', TEST_SP_USER_ID).then(() => console.log('  ✓ round_robin_count reset'))

  console.log('\n=== STEP 7: сбрасываем пароли тестовых аккаунтов ===')
  // Test SP
  await sb.auth.admin.updateUserById(TEST_SP_USER_ID, { password: SP_PASSWORD, email_confirm: true })
  console.log(`  ✓ Test Sales: test@goandstudy.com / ${SP_PASSWORD}`)

  // Test Curator (по curator_id находим user_id)
  const { data: curator } = await sb.from('curators').select('user_id').eq('id', TEST_CURATOR_ID).single()
  if (curator?.user_id) {
    await sb.auth.admin.updateUserById(curator.user_id, { password: CURATOR_PASSWORD, email_confirm: true })
    const { data: u } = await sb.from('users').select('email').eq('id', curator.user_id).single()
    console.log(`  ✓ Test Curator: ${u?.email} / ${CURATOR_PASSWORD}`)
  }

  console.log('\n=== STEP 8: финальная проверка ===')
  const { data: leftClients } = await sb.from('clients').select('id, name').in('id', TEST_CLIENT_IDS)
  console.log('осталось test clients:', leftClients?.length || 0)
  const { data: leftDeals } = await sb.from('deals').select('id').eq('salesperson_id', TEST_SP_USER_ID)
  console.log('осталось deals на test sp:', leftDeals?.length || 0)
  const { data: leftCuratorClients } = await sb.from('clients').select('id').eq('curator_id', TEST_CURATOR_ID)
  console.log('clients привязанных к test curator:', leftCuratorClients?.length || 0)

  console.log('\n=== ✅ ГОТОВО ===')
}
main().catch(e => { console.error(e); process.exit(1) })
