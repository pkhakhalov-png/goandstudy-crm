/**
 * Тестовые учётки: продажник, куратор, клиент — и тестовые клиенты между ними.
 *
 *   npx tsx scripts/test-accounts.ts --создать   # поднять всё и связать
 *   npx tsx scripts/test-accounts.ts --убрать    # снести созданное
 *   npx tsx scripts/test-accounts.ts             # показать, что сейчас есть
 *
 * Зачем. Три кабинета — продажника, куратора и клиента — видят разное, и
 * посмотреть их из-под админа нельзя: половина экранов просто не отрисуется.
 * Заходить под живыми людьми тоже нельзя: увидишь их клиентов, а они увидят
 * твои следы в своей работе.
 *
 * Поэтому здесь замкнутый контур: тестовый клиент закреплён за тестовым
 * продажником и тестовым куратором. Ни одна живая запись не трогается — всё
 * создаётся заново и помечено словом ТЕСТ.
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

const УЧЁТКИ = [
  { почта: 'test@goandstudy.com',         пароль: 'ТестПродажник2026!', имя: 'ТЕСТ Продажник', роль: 'salesperson' },
  { почта: 'curator-test@goandstudy.com', пароль: 'ТестКуратор2026!',   имя: 'ТЕСТ Куратор',   роль: 'curator' },
  { почта: 'test-client@goandstudy.com',  пароль: 'ТестКлиент2026!',    имя: 'ТЕСТ Клиент',    роль: 'client' },
]

const КЛИЕНТЫ = [
  { имя: 'ТЕСТ Иван Петров',   страна: 'Германия',   вуз: 'TU Berlin',            сумма: 290000, месяцев: 6 },
  { имя: 'ТЕСТ Анна Сидорова', страна: 'Чехия',      вуз: 'Charles University',   сумма: 175000, месяцев: 3 },
  { имя: 'ТЕСТ Марк Орлов',    страна: 'Испания',    вуз: 'Universitat de Girona', сумма: 455000, месяцев: 10 },
]

async function учётка(у: typeof УЧЁТКИ[number]): Promise<string> {
  const { data: есть } = await sb.from('users').select('id').eq('email', у.почта).maybeSingle()

  if (есть?.id) {
    await sb.auth.admin.updateUserById(есть.id, { password: у.пароль, email_confirm: true })
    await sb.from('users').update({ is_active: true, name: у.имя, role: у.роль }).eq('id', есть.id)
    console.log(`  ${у.имя.padEnd(16)} — была, пароль сброшен`)
    return есть.id
  }

  const { data, error } = await sb.auth.admin.createUser({ email: у.почта, password: у.пароль, email_confirm: true })
  if (error || !data.user) throw new Error(`${у.почта}: ${error?.message}`)
  await sb.from('users').insert({ id: data.user.id, email: у.почта, name: у.имя, role: у.роль, is_active: true })
  console.log(`  ${у.имя.padEnd(16)} — создана`)
  return data.user.id
}

async function создать() {
  console.log('учётки:')
  const ids: Record<string, string> = {}
  for (const у of УЧЁТКИ) ids[у.роль] = await учётка(у)

  // ── Куратор в справочнике ─────────────────────────────────────────────────
  //
  // Кабинет куратора ищет своих клиентов не по users.id, а по записи в
  // `curators`, связанной с пользователем. Без неё экран будет пустым, и
  // причина была бы неочевидной.
  let { data: куратор } = await sb.from('curators').select('id').eq('user_id', ids.curator).maybeSingle()
  if (!куратор) {
    const { data } = await sb.from('curators')
      .insert({ name: 'ТЕСТ Куратор', user_id: ids.curator, is_active: true, max_clients: 20 })
      .select('id').single()
    куратор = data
    console.log('запись в справочнике кураторов создана')
  }

  // ── Клиенты ───────────────────────────────────────────────────────────────
  console.log('\nклиенты:')
  for (const к of КЛИЕНТЫ) {
    const { data: был } = await sb.from('clients').select('id').eq('name', к.имя).maybeSingle()
    if (был) { console.log(`  ${к.имя} — уже есть`); continue }

    const { data: клиент, error } = await sb.from('clients').insert({
      name: к.имя,
      phone: null,                 // без телефона: чтобы случайно не позвонили
      country: к.страна,
      university: к.вуз,
      status: 'active',
      months: к.месяцев,
      salesperson_id: ids.salesperson,
      curator_id: куратор?.id ?? null,
      curator_assigned_at: new Date().toISOString(),
      current_stage_code: 'strategy_session',
      first_payment_date: new Date().toISOString().slice(0, 10),
    }).select('id').single()

    if (error || !клиент) { console.log(`  ${к.имя} — ошибка: ${error?.message}`); continue }

    // График платежей: без него экраны денег пустые, а они половина работы.
    const вМесяц = Math.round(к.сумма / к.месяцев)
    const строки = Array.from({ length: к.месяцев }, (_, i) => {
      const d = new Date(); d.setMonth(d.getMonth() + i)
      return {
        client_id: клиент.id, num: i + 1,
        plan_date: d.toISOString().slice(0, 10),
        plan_sum: i === к.месяцев - 1 ? к.сумма - вМесяц * (к.месяцев - 1) : вМесяц,
        // Первый транш отмечаем оплаченным — чтобы было видно и приход, и долг.
        is_paid: i === 0,
        fact_sum: i === 0 ? вМесяц : 0,
        fact_date: i === 0 ? new Date().toISOString().slice(0, 10) : null,
      }
    })
    await sb.from('payments').insert(строки)
    console.log(`  ${к.имя.padEnd(20)} ${к.страна.padEnd(10)} ${к.сумма.toLocaleString('ru')} ₽ на ${к.месяцев} мес.`)
  }

  console.log('\n══════════════════════════════════════════════════')
  for (const у of УЧЁТКИ) console.log(`  ${у.имя.padEnd(16)} ${у.почта.padEnd(30)} ${у.пароль}`)
  console.log('══════════════════════════════════════════════════')
  console.log('\nубрать:  npx tsx scripts/test-accounts.ts --убрать')
}

async function показать() {
  for (const у of УЧЁТКИ) {
    const { data } = await sb.from('users').select('id, is_active').eq('email', у.почта).maybeSingle()
    console.log(`${у.имя.padEnd(16)} ${data ? (data.is_active ? 'активна' : 'ВЫКЛЮЧЕНА') : 'нет'}`)
  }
  const { data: кл } = await sb.from('clients').select('name, country, status').ilike('name', 'ТЕСТ%')
  console.log(`\nтестовых клиентов: ${кл?.length ?? 0}`)
  for (const к of кл ?? []) console.log(`  ${к.name} · ${к.country} · ${к.status}`)
  console.log('\nсоздать:  npx tsx scripts/test-accounts.ts --создать')
}

async function убрать() {
  // Клиенты и всё, что к ним привязано.
  //
  // ТОЛЬКО по точным именам, а не по маске «ТЕСТ%». В базе живут чужие
  // тестовые записи — «Тест Клиент — Милена» и подобные из работы над
  // кабинетом куратора. Маска зацепила бы их все, и чужие фикстуры исчезли бы
  // вместе с нашими. Список длиннее, зато сносит ровно то, что создали мы.
  const наши = КЛИЕНТЫ.map(к => к.имя)
  const { data: кл } = await sb.from('clients').select('id, name').in('name', наши)
  for (const к of кл ?? []) {
    await sb.from('payments').delete().eq('client_id', к.id)
    await sb.from('expenses').delete().eq('client_id', к.id)
    await sb.from('clients').delete().eq('id', к.id)
    console.log(`клиент удалён: ${к.name}`)
  }

  // Сделки, брони и встречи тестового продажника.
  const { data: прод } = await sb.from('users').select('id').eq('email', 'test@goandstudy.com').maybeSingle()
  if (прод) {
    const { deleteMeeting } = await import('../lib/zoom/client')
    const { data: брони } = await sb.from('bookings').select('id, zoom_meeting_id').eq('salesperson_id', прод.id)
    for (const б of брони ?? []) {
      if (б.zoom_meeting_id) { try { await deleteMeeting(б.zoom_meeting_id) } catch { /* уже нет */ } }
    }
    await sb.from('bookings').delete().eq('salesperson_id', прод.id)
    await sb.from('schedule_slots').delete().eq('user_id', прод.id)

    const { data: сделки } = await sb.from('deals').select('id').eq('salesperson_id', прод.id)
    for (const с of сделки ?? []) {
      for (const t of ['deal_analyses', 'call_recordings', 'deal_messages', 'deal_activities', 'deal_tasks', 'deal_files']) {
        await sb.from(t).delete().eq('deal_id', с.id)
      }
    }
    await sb.from('deals').delete().eq('salesperson_id', прод.id)
    console.log(`удалено: сделок ${сделки?.length ?? 0}, броней ${брони?.length ?? 0}`)
  }

  // Учётки выключаем, а не удаляем: на них ссылаются журналы, и удаление
  // порвало бы историю. Выключенные они нигде не мешают.
  for (const у of УЧЁТКИ) {
    await sb.from('users').update({ is_active: false }).eq('email', у.почта)
  }
  await sb.from('curators').update({ is_active: false }).eq('name', 'ТЕСТ Куратор')
  console.log('учётки выключены (не удалены — на них ссылаются журналы)')
}

async function main() {
  if (process.argv.includes('--убрать')) return убрать()
  if (process.argv.includes('--создать')) return создать()
  return показать()
}

main().catch(e => { console.error(e?.message ?? e); process.exit(1) })
