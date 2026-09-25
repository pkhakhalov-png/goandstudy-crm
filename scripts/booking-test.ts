/**
 * Пробная заявка: проходит тот же путь, что живая, но помечена тестом
 * и убирается одной командой.
 *
 *   npx tsx scripts/booking-test.ts                 # показать, что будет сделано
 *   npx tsx scripts/booking-test.ts --создать       # создать пробную заявку
 *   npx tsx scripts/booking-test.ts --что-вышло     # посмотреть, что доехало
 *   npx tsx scripts/booking-test.ts --убрать        # снести за собой всё
 *
 * Зачем не через форму на сайте. Живая форма займёт настоящий слот настоящего
 * продажника и дёрнет его уведомлением. Проверять автоматику ценой чужого
 * рабочего времени незачем — тем более что проверить надо код, а не форму.
 *
 * Поэтому здесь вызывается ровно та же функция `createBookingCore`, что и у
 * формы: назначение продажника, сделка в воронке, встреча Zoom, уведомление.
 * Отличается только одно — слот берётся заведомо пустой, поздний, и заводится
 * на время теста.
 *
 * Уведомление в телеграм всё-таки уйдёт: это часть того, что мы проверяем —
 * ссылка на встречу должна появиться именно в нём. Имя клиента поэтому
 * говорящее, чтобы никто не бросился перезванивать.
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

const ИМЯ = 'ТЕСТ Zoom — не звонить'
const ТЕЛЕФОН = '+70000000000'
// Поздний час, в который консультаций не бывает: слот гарантированно свободен
// и живому клиенту на него не попасть.
const ЧАС = '22:30'

function арг(имя: string): string | undefined {
  const i = process.argv.indexOf(имя)
  return i >= 0 ? process.argv[i + 1] : undefined
}

/** Завтра — чтобы слот точно не пересёкся с сегодняшними встречами. */
function завтра(): string {
  const d = new Date(Date.now() + 86400000)
  return d.toISOString().slice(0, 10)
}

async function продажник(): Promise<{ id: string; name: string }> {
  const явный = арг('--продажник')
  const q = sb.from('users').select('id, name').eq('role', 'salesperson').eq('is_active', true)
  const { data } = явный ? await q.ilike('name', `%${явный}%`).limit(1) : await q.order('name').limit(50)
  const живые = (data ?? []).filter(u => u.name && !String(u.name).includes('@'))
  const выбран = живые[0] ?? data?.[0]
  if (!выбран) throw new Error('не нашёл активного продажника')
  return { id: выбран.id, name: выбран.name ?? '—' }
}

async function создать() {
  const { createBookingCore } = await import('../lib/booking/create')

  const кто = await продажник()
  const дата = арг('--дата') ?? завтра()
  const время = арг('--время') ?? ЧАС
  const день = (new Date(дата + 'T00:00:00').getDay() + 6) % 7   // 0 = понедельник

  console.log(`продажник: ${кто.name}`)
  console.log(`слот: ${дата} ${время} (день недели ${день})`)

  // Слот в расписании — обязательное условие записи. Заводим временный и
  // помним, чтобы убрать за собой.
  const { data: уже } = await sb.from('schedule_slots')
    .select('id').eq('user_id', кто.id).eq('day_of_week', день).eq('start_time', `${время}:00`).maybeSingle()

  if (!уже) {
    const { error } = await sb.from('schedule_slots').insert({
      user_id: кто.id, day_of_week: день,
      start_time: `${время}:00`, end_time: `${добавить30(время)}:00`, is_active: true,
    })
    if (error) throw new Error(`слот не завёлся: ${error.message}`)
    console.log('временный слот заведён')
  } else {
    console.log('слот уже был — не трогаем')
  }

  const результат = await createBookingCore({
    date: дата,
    startTime: время,
    endTime: добавить30(время),
    clientName: ИМЯ,
    clientPhone: ТЕЛЕФОН,
    clientTelegram: null,
    quizData: { country: 'Германия', degree: 'Бакалавриат', year: '2027', budget: '150 000' },
    utm: {},
    managerId: кто.id,
  })

  if (результат.error) { console.error(`✕ заявка не прошла: ${результат.error}`); process.exit(1) }
  console.log(`\n✅ заявка создана, бронь ${результат.bookingId}`)

  await что_вышло()
}

async function что_вышло() {
  const { data: бронь } = await sb.from('bookings')
    .select('id, booking_date, start_time, salesperson_id, status, zoom_meeting_id, zoom_join_url, zoom_host_email')
    .eq('client_name', ИМЯ).order('created_at', { ascending: false }).limit(1).maybeSingle()

  if (!бронь) { console.log('пробной брони нет'); return }

  const { data: сделка } = await sb.from('deals')
    .select('id, title, stage_id, booking_id').eq('booking_id', бронь.id).maybeSingle()

  const { data: запись } = await sb.from('call_recordings')
    .select('id, status, error, duration_sec, deal_id, purged_at')
    .eq('meeting_id', бронь.zoom_meeting_id ?? '—').maybeSingle()

  const { data: разбор } = сделка
    ? await sb.from('deal_analyses').select('source, client_type, next_step, summary, created_at')
        .eq('deal_id', сделка.id).order('created_at', { ascending: false }).limit(1).maybeSingle()
    : { data: null }

  const п = (ок: boolean, что: string, деталь = '') =>
    console.log(`${ок ? '✅' : '⬜'} ${что}${деталь ? ' — ' + деталь : ''}`)

  console.log('\nчто доехало:')
  п(true, 'бронь создана', `${бронь.booking_date} ${String(бронь.start_time).slice(0, 5)}`)
  п(Boolean(сделка), 'сделка в воронке', сделка?.id ?? '')
  п(Boolean(бронь.zoom_meeting_id), 'встреча Zoom создана', бронь.zoom_meeting_id ?? '')
  п(Boolean(бронь.zoom_host_email), 'хост выбран', бронь.zoom_host_email ?? '')
  п(Boolean(запись), 'запись приехала', запись ? `${запись.status}${запись.error ? ': ' + запись.error : ''}` : 'ещё нет')
  п(Boolean(запись?.deal_id), 'запись сшита со сделкой', запись?.deal_id ?? '')
  п(Boolean(разбор), 'разбор в карточке', разбор ? `${разбор.client_type}, следующий шаг ${разбор.next_step ? 'есть' : 'НЕТ'}` : 'ещё нет')
  п(Boolean(запись?.purged_at), 'облако Zoom освобождено')

  if (бронь.zoom_join_url) console.log(`\nссылка на встречу:\n  ${бронь.zoom_join_url}`)
  if (сделка) console.log(`\nкарточка сделки:\n  https://crm.goandstudy.com/admin/funnel/${сделка.id}`)
  if (разбор?.summary) console.log(`\nрезюме разбора:\n  ${разбор.summary}`)
}

async function убрать() {
  const { data: брони } = await sb.from('bookings').select('id, zoom_meeting_id, salesperson_id, start_time, booking_date').eq('client_name', ИМЯ)
  if (!брони?.length) { console.log('убирать нечего'); return }

  const { deleteMeeting } = await import('../lib/zoom/client')

  for (const б of брони) {
    if (б.zoom_meeting_id) {
      try { await deleteMeeting(б.zoom_meeting_id); console.log(`встреча ${б.zoom_meeting_id} удалена`) }
      catch (e: any) { console.log(`встреча ${б.zoom_meeting_id}: ${e.message}`) }
    }

    const { data: сделки } = await sb.from('deals').select('id').eq('booking_id', б.id)
    for (const с of сделки ?? []) {
      await sb.from('deal_analyses').delete().eq('deal_id', с.id)
      await sb.from('call_recordings').delete().eq('deal_id', с.id)
      await sb.from('deal_activities').delete().eq('deal_id', с.id)
      await sb.from('deal_tasks').delete().eq('deal_id', с.id)
      await sb.from('deals').delete().eq('id', с.id)
      console.log(`сделка ${с.id} удалена`)
    }

    const день = (new Date(б.booking_date + 'T00:00:00').getDay() + 6) % 7
    await sb.from('schedule_slots').delete()
      .eq('user_id', б.salesperson_id).eq('day_of_week', день).eq('start_time', б.start_time)

    await sb.from('bookings').delete().eq('id', б.id)
    console.log(`бронь ${б.id} удалена`)
  }
  console.log('\nубрано.')
}

function добавить30(t: string): string {
  const [ч, м] = t.split(':').map(Number)
  const всего = ч * 60 + м + 30
  return `${String(Math.floor(всего / 60) % 24).padStart(2, '0')}:${String(всего % 60).padStart(2, '0')}`
}

async function main() {
  if (process.argv.includes('--убрать')) return убрать()
  if (process.argv.includes('--что-вышло')) return что_вышло()
  if (process.argv.includes('--создать')) return создать()

  const кто = await продажник()
  console.log('пробная заявка сделает следующее:')
  console.log(`  · заведёт временный слот ${завтра()} ${ЧАС} у продажника ${кто.name}`)
  console.log(`  · создаст бронь на имя «${ИМЯ}»`)
  console.log('  · создаст сделку в воронке и встречу Zoom')
  console.log('  · отправит уведомление в телеграм-чат броней — со ссылкой на встречу')
  console.log('\nсоздать:  npx tsx scripts/booking-test.ts --создать')
  console.log('убрать:   npx tsx scripts/booking-test.ts --убрать')
}

main().catch(e => { console.error(e?.message ?? e); process.exit(1) })
