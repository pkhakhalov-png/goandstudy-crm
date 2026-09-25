/**
 * Тестовая учётка продажника со своими данными.
 *
 *   npx tsx scripts/test-salesperson.ts --создать   # поднять учётку и наполнить
 *   npx tsx scripts/test-salesperson.ts --убрать    # снести всё, что создали
 *
 * Зачем. Чтобы посмотреть новое глазами продажника, нужен продажник — админ
 * половины экранов просто не видит. Заходить под живым человеком нельзя:
 * увидишь его клиентов, а он увидит твои следы в своей работе.
 *
 * Поэтому здесь отдельная учётка с ОТДЕЛЬНЫМИ данными. Сделки не отбираются у
 * живых продажников, а копируются: берём пару настоящих переписок и делаем с
 * них копии на тестового. Оригиналы не трогаются вовсе, а материал остаётся
 * настоящим — на выдуманном «привет-привет» разбор нечего показывать.
 *
 * Всё созданное помечено и сносится одной командой.
 */
import { config } from 'dotenv'
import path from 'path'
import { createClient } from '@supabase/supabase-js'

config({ path: path.resolve(process.cwd(), '.env.local') })

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
)

const ПОЧТА = 'test@goandstudy.com'
const ПАРОЛЬ = 'ТестПродажник2026!'
const МЕТКА = 'ТЕСТ'          // по ней потом всё находим и убираем

async function создать() {
  // ── 1. Учётка ─────────────────────────────────────────────────────────────
  const { data: строка } = await sb.from('users').select('id, name').eq('email', ПОЧТА).maybeSingle()
  let userId = строка?.id as string | undefined

  if (userId) {
    // Учётка уже была, но выключена и с неизвестным паролем — задаём заново.
    await sb.auth.admin.updateUserById(userId, { password: ПАРОЛЬ, email_confirm: true })
    await sb.from('users').update({ is_active: true, name: 'ТЕСТ Продажник', role: 'salesperson' }).eq('id', userId)
    console.log('учётка была — включил и сбросил пароль')
  } else {
    const { data, error } = await sb.auth.admin.createUser({
      email: ПОЧТА, password: ПАРОЛЬ, email_confirm: true,
    })
    if (error || !data.user) throw new Error(`учётка не создалась: ${error?.message}`)
    userId = data.user.id
    await sb.from('users').insert({ id: userId, email: ПОЧТА, name: 'ТЕСТ Продажник', role: 'salesperson', is_active: true })
    console.log('учётка создана')
  }

  // ── 2. Сделки: копии настоящих, оригиналы не трогаем ──────────────────────
  const { data: доноры } = await sb
    .from('deals')
    .select('id, title, contact_name, contact_phone, contact_email, contact_telegram, budget, source, custom_fields, stage_id')
    .is('deleted_at', null)
    .not('contact_name', 'is', null)
    .order('created_at', { ascending: false })
    .limit(300)

  // Берём те, где переписка живая: иначе разбирать будет нечего.
  const подходящие: any[] = []
  for (const d of доноры ?? []) {
    const { count } = await sb.from('deal_messages').select('*', { count: 'exact', head: true }).eq('deal_id', d.id)
    if ((count ?? 0) >= 6) подходящие.push({ ...d, реплик: count })
    if (подходящие.length >= 3) break
  }

  for (const донор of подходящие) {
    const { data: копия } = await sb.from('deals').insert({
      title: `${МЕТКА} · ${донор.title}`.slice(0, 200),
      stage_id: донор.stage_id,
      salesperson_id: userId,
      contact_name: `${МЕТКА} ${донор.contact_name}`,
      contact_phone: null,            // без телефона: чтобы случайно не позвонили
      contact_email: null,
      contact_telegram: null,
      budget: донор.budget,
      source: донор.source,
      custom_fields: донор.custom_fields,
    }).select('id').single()

    if (!копия) continue

    const { data: реплики } = await sb.from('deal_messages')
      .select('direction, channel, sender_name, content, created_at')
      .eq('deal_id', донор.id).order('created_at')

    if (реплики?.length) {
      await sb.from('deal_messages').insert(реплики.map((m, i) => ({
        deal_id: копия.id,
        direction: m.direction, channel: m.channel,
        sender_name: m.sender_name, content: m.content,
        external_id: `test_${копия.id}_${i}`,
        created_at: m.created_at,
      })))
    }

    console.log(`сделка-копия: ${донор.contact_name} (${донор.реплик} реплик)`)
  }

  // ── 3. Бронь на сегодня + встреча Zoom ────────────────────────────────────
  //
  // Нужна, чтобы увидеть сразу три вещи: панель «отметьте исход» на главной,
  // ссылку на встречу в расписании и её же в карточке сделки.
  const сегодня = new Date().toISOString().slice(0, 10)
  const час = new Date(Date.now() - 30 * 60_000)   // полчаса назад: встреча «идёт»
  const начало = `${String(час.getUTCHours() + 3).padStart(2, '0')}:${String(час.getUTCMinutes()).padStart(2, '0')}:00`
  const конец = `${String(час.getUTCHours() + 3).padStart(2, '0')}:${String(час.getUTCMinutes()).padStart(2, '0')}:00`.replace(/^(\d+)/, m => String(Number(m) + 1).padStart(2, '0'))

  const { data: бронь } = await sb.from('bookings').insert({
    salesperson_id: userId,
    booking_date: сегодня,
    start_time: начало,
    end_time: конец,
    client_name: `${МЕТКА} Клиент Консультация`,
    client_phone: '+70000000001',
    status: 'confirmed',
  }).select('id').single()

  if (бронь) {
    console.log(`бронь на сегодня ${начало.slice(0, 5)} создана`)
    try {
      const { создатьВстречуДляБрони } = await import('../lib/zoom/meeting-for-booking')
      const в = await создатьВстречуДляБрони(sb as any, {
        bookingId: бронь.id, date: сегодня,
        startTime: начало, endTime: конец,
        clientName: `${МЕТКА} Клиент`, salespersonName: 'ТЕСТ Продажник',
      })
      console.log(в.создана ? `встреча Zoom: ${в.joinUrl}` : `встреча не создана — ${в.почему}`)
    } catch (e: any) { console.log('Zoom:', e.message) }

    // Сделка под эту бронь — чтобы ссылка была видна и в карточке.
    const { data: стадия } = await sb.from('pipeline_stages').select('id').eq('name', 'Презентация/Консультация').maybeSingle()
    await sb.from('deals').insert({
      title: `${МЕТКА} · Клиент с консультацией`,
      stage_id: стадия?.id,
      salesperson_id: userId,
      contact_name: `${МЕТКА} Клиент Консультация`,
      booking_id: бронь.id,
      source: 'booking',
    })
    console.log('сделка под бронь создана')
  }

  // ── 4. Расписание, чтобы экран не был пустым ──────────────────────────────
  const день = (new Date(сегодня + 'T00:00:00').getDay() + 6) % 7
  await sb.from('schedule_slots').upsert({
    user_id: userId, day_of_week: день, start_time: начало, end_time: конец, is_active: true,
  }, { onConflict: 'user_id,day_of_week,start_time' })

  console.log(`\n══════════════════════════════════════════`)
  console.log(`  вход:   ${ПОЧТА}`)
  console.log(`  пароль: ${ПАРОЛЬ}`)
  console.log(`══════════════════════════════════════════`)
  console.log(`\nубрать всё:  npx tsx scripts/test-salesperson.ts --убрать`)
}

async function убрать() {
  const { data: u } = await sb.from('users').select('id').eq('email', ПОЧТА).maybeSingle()
  if (!u) { console.log('учётки нет'); return }

  const { deleteMeeting } = await import('../lib/zoom/client')

  const { data: сделки } = await sb.from('deals').select('id').eq('salesperson_id', u.id)
  for (const с of сделки ?? []) {
    await sb.from('deal_analyses').delete().eq('deal_id', с.id)
    await sb.from('call_recordings').delete().eq('deal_id', с.id)
    await sb.from('deal_messages').delete().eq('deal_id', с.id)
    await sb.from('deal_activities').delete().eq('deal_id', с.id)
    await sb.from('deal_tasks').delete().eq('deal_id', с.id)
    await sb.from('deal_files').delete().eq('deal_id', с.id)
  }
  await sb.from('deals').delete().eq('salesperson_id', u.id)
  console.log(`сделок удалено: ${сделки?.length ?? 0}`)

  const { data: брони } = await sb.from('bookings').select('id, zoom_meeting_id').eq('salesperson_id', u.id)
  for (const б of брони ?? []) {
    if (б.zoom_meeting_id) {
      try { await deleteMeeting(б.zoom_meeting_id) } catch { /* уже нет — и хорошо */ }
    }
  }
  await sb.from('bookings').delete().eq('salesperson_id', u.id)
  await sb.from('schedule_slots').delete().eq('user_id', u.id)
  console.log(`броней удалено: ${брони?.length ?? 0}`)

  // Саму учётку не удаляем, а выключаем: на неё могут ссылаться журналы, и
  // удаление порвало бы историю. Выключенная она нигде не мешает.
  await sb.from('users').update({ is_active: false }).eq('id', u.id)
  console.log('учётка выключена (не удалена — на неё ссылаются журналы)')
}

async function main() {
  if (process.argv.includes('--убрать')) return убрать()
  if (process.argv.includes('--создать')) return создать()
  console.log('что делает: поднимает тестового продажника, копирует ему 3 сделки с перепиской,')
  console.log('заводит бронь на сегодня со встречей Zoom и слот в расписании.')
  console.log('\nсоздать:  npx tsx scripts/test-salesperson.ts --создать')
  console.log('убрать:   npx tsx scripts/test-salesperson.ts --убрать')
}

main().catch(e => { console.error(e?.message ?? e); process.exit(1) })
