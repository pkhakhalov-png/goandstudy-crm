/**
 * Отчёт: кто сколько времени открыл под консультации.
 *
 *   npx tsx scripts/report-schedule.ts            — до конца месяца и следующий
 *   npx tsx scripts/report-schedule.ts --md отчёт.md
 *
 * Расписание в CRM недельное: слот привязан к дню недели, а не к дате. Поэтому
 * «сколько часов в октябре» — это раскладка недельной сетки по календарю, а не
 * готовое число из базы. Так же это делает и страница записи, поэтому цифры
 * отчёта совпадают с тем, что видит клиент.
 *
 * Занятость считается по фактическим записям. Отменённые не в счёт: время
 * снова свободно.
 */
import { config } from 'dotenv'
import path from 'path'
import fs from 'fs'
import { createClient } from '@supabase/supabase-js'
config({ path: path.resolve(process.cwd(), '.env.local') })

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
) as any

const DAYS = ['понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота', 'воскресенье']
const MONTHS = ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль',
  'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь']

type Slot = { user_id: string; day_of_week: number; start_time: string; end_time: string }
type Person = { id: string; name: string; role: string }

const minutes = (t: string) => {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}

/** Дни периода с понедельника-нулём, как в расписании. */
function daysOf(from: Date, to: Date): { date: string; dow: number }[] {
  const out: { date: string; dow: number }[] = []
  for (const d = new Date(from); d <= to; d.setDate(d.getDate() + 1)) {
    out.push({ date: d.toISOString().slice(0, 10), dow: (d.getDay() + 6) % 7 })
  }
  return out
}

function periodStats(slots: Slot[], days: { date: string; dow: number }[], booked: Set<string>) {
  let slotCount = 0
  let minutesTotal = 0
  let busy = 0
  const workDays = new Set<string>()

  for (const day of days) {
    const todays = slots.filter((s) => s.day_of_week === day.dow)
    if (!todays.length) continue
    workDays.add(day.date)
    for (const s of todays) {
      slotCount++
      minutesTotal += Math.max(0, minutes(s.end_time) - minutes(s.start_time))
      if (booked.has(`${day.date} ${s.start_time.slice(0, 5)}`)) busy++
    }
  }
  return { days: workDays.size, slots: slotCount, hours: minutesTotal / 60, busy }
}

async function main() {
  const now = new Date()
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0)
  const nextStart = new Date(now.getFullYear(), now.getMonth() + 1, 1)
  const nextEnd = new Date(now.getFullYear(), now.getMonth() + 2, 0)

  const [{ data: slots }, { data: bookings }] = await Promise.all([
    sb.from('schedule_slots').select('user_id, day_of_week, start_time, end_time').eq('is_active', true),
    sb.from('bookings').select('salesperson_id, booking_date, start_time, status')
      .gte('booking_date', now.toISOString().slice(0, 10))
      .lte('booking_date', nextEnd.toISOString().slice(0, 10))
      .neq('status', 'cancelled'),
  ])

  const ids = [...new Set((slots ?? []).map((s: Slot) => s.user_id))]
  const { data: users } = await sb.from('users').select('id, name, role, is_active').in('id', ids)
  const people: Person[] = (users ?? []).filter((u: any) => u.is_active)

  const thisDays = daysOf(now, endOfMonth)
  const nextDays = daysOf(nextStart, nextEnd)

  const lines: string[] = []
  const say = (s = '') => { lines.push(s); console.log(s) }

  say(`# Кто сколько времени открыл под консультации`)
  say()
  say(`Считано ${now.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })}. `
    + `Периоды: с сегодняшнего дня по ${endOfMonth.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })} `
    + `и весь ${MONTHS[nextStart.getMonth()]}.`)
  say()
  say('Расписание в CRM недельное: слот привязан к дню недели, а не к дате. Числа ниже — '
    + 'раскладка этой сетки по календарю, ровно так же её видит клиент на странице записи.')
  say()

  const head = `| Кто | ${MONTHS[now.getMonth()]}: дней | слотов | часов | занято | ${MONTHS[nextStart.getMonth()]}: дней | слотов | часов | занято |`
  say(head)
  say('|---|---:|---:|---:|---:|---:|---:|---:|---:|')

  const totals = { a: { days: 0, slots: 0, hours: 0, busy: 0 }, b: { days: 0, slots: 0, hours: 0, busy: 0 } }

  for (const p of people.sort((x, y) => x.name.localeCompare(y.name, 'ru'))) {
    const mine = (slots ?? []).filter((s: Slot) => s.user_id === p.id)
    const booked = new Set(
      (bookings ?? [])
        .filter((b: any) => b.salesperson_id === p.id)
        .map((b: any) => `${b.booking_date} ${String(b.start_time).slice(0, 5)}`),
    )
    const a = periodStats(mine, thisDays, booked)
    const b = periodStats(mine, nextDays, booked)
    totals.a.days += a.days; totals.a.slots += a.slots; totals.a.hours += a.hours; totals.a.busy += a.busy
    totals.b.days += b.days; totals.b.slots += b.slots; totals.b.hours += b.hours; totals.b.busy += b.busy

    say(`| ${p.name} | ${a.days} | ${a.slots} | ${a.hours.toFixed(1)} | ${a.busy} | ${b.days} | ${b.slots} | ${b.hours.toFixed(1)} | ${b.busy} |`)
  }

  say(`| **Всего** | — | **${totals.a.slots}** | **${totals.a.hours.toFixed(1)}** | **${totals.a.busy}** | — | **${totals.b.slots}** | **${totals.b.hours.toFixed(1)}** | **${totals.b.busy}** |`)
  say()

  say('## Кто в какие дни недели работает')
  say()
  for (const p of people.sort((x, y) => x.name.localeCompare(y.name, 'ru'))) {
    const mine = (slots ?? []).filter((s: Slot) => s.user_id === p.id)
    const byDay = new Map<number, string[]>()
    for (const s of mine) {
      const list = byDay.get(s.day_of_week) ?? []
      list.push(s.start_time.slice(0, 5))
      byDay.set(s.day_of_week, list)
    }
    say(`**${p.name}** — ${mine.length} слотов в неделю`)
    say()
    if (!byDay.size) { say('— расписание не заполнено'); say(); continue }
    for (const dow of [...byDay.keys()].sort()) {
      const times = (byDay.get(dow) ?? []).sort()
      say(`- ${DAYS[dow]}: ${times.join(', ')} (${times.length})`)
    }
    say()
  }

  const outIdx = process.argv.indexOf('--md')
  if (outIdx > 0 && process.argv[outIdx + 1]) {
    fs.writeFileSync(process.argv[outIdx + 1], lines.join('\n') + '\n')
    console.log(`\nфайл записан: ${process.argv[outIdx + 1]}`)
  }
}

main()
