/**
 * Лиды после консультации — в кабинет: дело, контакты, звонок источником,
 * профиль черновиками фактов и план «что дальше» задачами.
 *
 *   npx tsx scripts/care/import-call-leads.ts --папка <dir>               # показать, что будет
 *   npx tsx scripts/care/import-call-leads.ts --папка <dir> --применить   # записать
 *
 * В папке: `index.json` (сделки и анкеты), `<имя>.txt` (расшифровки звонков
 * с заголовками `===== ЗВОНОК <дата> · N мин · recording_id=<uuid> =====`) и
 * `<имя>.profile.json` (разбор звонка: факты с цитатами, резюме, шаги).
 *
 * Правила те же, что у помощника кабинета (lib/care/ai/extract.ts):
 *   · факт ложится черновиком — подтверждает куратор;
 *   · цитата обязана найтись в расшифровке дословно, иначе факт выброшен;
 *   · источник факта — конкретный звонок, а не «консультация вообще».
 *
 * Идемпотентно: дело ищется по `deal_id`, уже заведённое не трогается.
 * Пишет под ролью care_app — в рабочие таблицы CRM не заходит вовсе.
 * Нужна миграция 040 (дела-лиды).
 */
import { config } from 'dotenv'
import path from 'path'
import fs from 'fs'

config({ path: path.resolve(process.cwd(), '.env.local'), quiet: true } as never)
config({ path: path.resolve(process.cwd(), '../goandstudy-crm/.env.local'), quiet: true } as never)

type Факт = {
  field: string
  value: string | number
  currency?: string | null
  period?: string | null
  speaker: string
  quote: string
  is_plan: boolean
}
type Шаг = { title: string; details?: string; waiting_on: 'none' | 'client'; due_on: string | null }
type Профиль = {
  name: string
  contacts: { kind: 'student' | 'parent' | 'payer'; name: string; note?: string }[]
  facts: Факт[]
  summary: string
  objections?: string[]
  agreed?: string
  temperature?: string
  temperature_why?: string
  next_steps: Шаг[]
  open_questions?: string[]
}
type Сделка = {
  deal_id: string
  file: string
  name: string
  phone: string | null
  telegram: string | null
  stage: string | null
  quiz: Record<string, unknown>
}

function арг(имя: string): string | undefined {
  const i = process.argv.indexOf(имя)
  return i >= 0 ? process.argv[i + 1] : undefined
}

/** Звонки из файла расшифровки: id записи, дата, длительность и текст. */
function звонки(текст: string) {
  const части = текст.split(/^===== ЗВОНОК (\S+) · (\d+) мин · recording_id=([0-9a-f-]+) =====$/m)
  const итог: { recordingId: string; начало: string; минут: number; текст: string }[] = []
  for (let i = 1; i + 3 < части.length + 1; i += 4) {
    const текстЗвонка = части[i + 3] ?? ''
    // Встреча без расшифровки — клиент не пришёл, в записи тишина. Источником
    // профиля такая встреча не служит.
    if (текстЗвонка.includes('[расшифровки нет]')) continue
    итог.push({ начало: части[i], минут: Number(части[i + 1]), recordingId: части[i + 2], текст: текстЗвонка })
  }
  return итог
}

/** Год набора: из факта, иначе первый год из анкеты («В 2027 / 2028» → 2027). */
function годНабора(п: Профиль, сделка: Сделка): number {
  // Набор текущего года уже прошёл: анкета «В 2026 / 2027», заполненная
  // осенью 2026, означает ближайший реальный набор — 2027.
  const ближайший = new Date().getFullYear() + 1
  const изФакта = п.facts.find((ф) => ф.field === 'intake.year')
  if (изФакта && Number(изФакта.value)) return Math.max(Number(изФакта.value), ближайший)
  const m = /20\d\d/.exec(String(сделка.quiz.quiz_year ?? ''))
  return Math.max(m ? Number(m[0]) : ближайший, ближайший)
}

function заметка(п: Профиль, сделка: Сделка): string {
  const строки = [
    `Лид после консультации продаж (этап воронки: ${сделка.stage ?? '—'}). Профиль собран по записи звонка.`,
    '',
    п.summary,
  ]
  if (п.temperature) строки.push('', `Температура: ${п.temperature}${п.temperature_why ? ` — ${п.temperature_why}` : ''}`)
  if (п.agreed) строки.push('', `Договорились: ${п.agreed}`)
  if (п.objections?.length) строки.push('', 'Сомнения клиента:', ...п.objections.map((о) => `· ${о}`))
  if (п.open_questions?.length) строки.push('', 'Выяснить:', ...п.open_questions.map((о) => `· ${о}`))
  return строки.join('\n')
}

async function main() {
  const папка = арг('--папка')
  if (!папка) throw new Error('нужен --папка <dir>')
  const применить = process.argv.includes('--применить')

  const { базаCare } = await import('../../lib/care/db')
  const { длясверки, ПОЛЯ_ИЗВЛЕЧЕНИЯ } = await import('../../lib/care/ai/extract')
  const care = базаCare()

  const { data: руководитель } = await care.from('members').select('id').eq('care_role', 'lead').eq('active', true).limit(1).maybeSingle()
  const владелец = арг('--владелец') ?? руководитель?.id
  if (!владелец) throw new Error('не нашёлся владелец дел: передайте --владелец <member_id>')

  const сделки = JSON.parse(fs.readFileSync(path.join(папка, 'index.json'), 'utf8')) as Сделка[]
  // Ольга — без звонка, профиль по анкете: её файла расшифровки нет в index.
  const файлы = fs.readdirSync(папка).filter((ф) => ф.endsWith('.profile.json'))

  for (const файл of файлы) {
    const п = JSON.parse(fs.readFileSync(path.join(папка, файл), 'utf8')) as Профиль & { deal_id?: string }
    const сделка = сделки.find((с) => с.file === файл.replace('.profile.json', '.txt'))
      ?? сделки.find((с) => с.deal_id === п.deal_id)
    if (!сделка) { console.log(`✕ ${файл}: сделка не найдена в index.json`); continue }

    const путьТекста = path.join(папка, сделка.file)
    const текст = fs.existsSync(путьТекста) ? fs.readFileSync(путьТекста, 'utf8') : ''
    const списокЗвонков = звонки(текст)

    // ── Факты: только из словаря и только с дословной цитатой ──────────────
    const годные: (Факт & { recordingId: string })[] = []
    const отброшено: string[] = []
    for (const ф of п.facts) {
      if (!(ПОЛЯ_ИЗВЛЕЧЕНИЯ as readonly string[]).includes(ф.field)) { отброшено.push(`${ф.field}: не из словаря`); continue }
      if (ф.field.startsWith('budget.') && !ф.currency) { отброшено.push(`${ф.field}: сумма без валюты`); continue }
      const искомое = длясверки(ф.quote ?? '')
      const звонок = искомое.length >= 6 ? списокЗвонков.find((з) => длясверки(з.текст).includes(искомое)) : undefined
      if (!звонок) { отброшено.push(`${ф.field}: цитаты нет в расшифровке`); continue }
      годные.push({ ...ф, speaker: ['student', 'parent', 'curator', 'other'].includes(ф.speaker) ? ф.speaker : 'other', recordingId: звонок.recordingId })
    }

    console.log(`\n── ${п.name} · сделка ${сделка.deal_id.slice(0, 8)} · набор ${годНабора(п, сделка)}`)
    console.log(`   звонков ${списокЗвонков.length}, фактов ${годные.length}${отброшено.length ? `, отброшено ${отброшено.length} (${отброшено.join('; ')})` : ''}, шагов ${п.next_steps.length}`)

    if (!применить) continue

    const { data: уже } = await care.from('cases').select('id').eq('deal_id', сделка.deal_id).maybeSingle()
    if (уже) { console.log(`   ↺ дело уже есть (${уже.id}) — не трогаю`); continue }

    const факт = (поле: string) => годные.find((ф) => ф.field === поле)?.value
    const { data: дело, error: ошибкаДела } = await care.from('cases').insert({
      client_id: null,
      deal_id: сделка.deal_id,
      lead_name: п.name,
      intake_year: годНабора(п, сделка),
      intake_term: факт('intake.term') ? String(факт('intake.term')) : null,
      status: 'lead',
      owner_member_id: владелец,
      notes: заметка(п, сделка),
    }).select('id').single()
    if (ошибкаДела || !дело) throw new Error(`${п.name}: дело не создалось — ${ошибкаДела?.message}`)

    await care.from('case_members').insert({ case_id: дело.id, member_id: владелец, role: 'owner' })

    // ── Контакты: кто был на звонке. Телефон и Telegram — из сделки ─────────
    const контакты = п.contacts.length ? п.contacts : [{ kind: 'student' as const, name: п.name }]
    for (const [i, к] of контакты.entries()) {
      const { error } = await care.from('contacts').insert({
        case_id: дело.id,
        kind: к.kind,
        name: к.note ? `${к.name} (${к.note})` : к.name,
        phone: i === 0 ? сделка.phone : null,
        can_decide: к.kind !== 'student' || контакты.length === 1,
      })
      if (error) console.log(`   ! контакт ${к.name}: ${error.message}`)
    }

    // ── Источники: каждый звонок — отдельный, к нему привязаны его цитаты ──
    const источникЗвонка = new Map<string, string>()
    for (const з of списокЗвонков) {
      const { data: и, error } = await care.from('sources').insert({
        case_id: дело.id,
        kind: 'meeting',
        ref: { recording_id: з.recordingId, deal_id: сделка.deal_id, started_at: з.начало, duration_min: з.минут },
        captured_at: з.начало,
        note: `консультация продаж, запись Zoom, ${з.минут} мин`,
      }).select('id').single()
      if (error) console.log(`   ! источник ${з.recordingId}: ${error.message}`)
      if (и) источникЗвонка.set(з.recordingId, и.id)
    }

    let фактов = 0
    for (const ф of годные) {
      const { error } = await care.from('facts').insert({
        case_id: дело.id,
        field: ф.field,
        value: ф.value,
        currency: ф.currency ?? null,
        period: ф.period ?? null,
        is_plan: ф.is_plan,
        speaker: ф.speaker,
        quote: ф.quote,
        source_id: источникЗвонка.get(ф.recordingId) ?? null,
        status: 'draft',
      })
      if (error) console.log(`   ! факт ${ф.field}: ${error.message}`)
      else фактов++
    }

    let задач = 0
    for (const ш of п.next_steps) {
      const { error } = await care.from('tasks').insert({
        case_id: дело.id,
        title: ш.title,
        details: ш.details || null,
        due_on: ш.due_on || null,
        waiting_on: ш.waiting_on === 'client' ? 'client' : 'none',
        status: ш.waiting_on === 'client' ? 'waiting' : 'todo',
        assignee_member_id: владелец,
      })
      if (error) console.log(`   ! задача «${ш.title}»: ${error.message}`)
      else задач++
    }

    await care.from('events').insert({
      actor_kind: 'system',
      case_id: дело.id,
      action: 'lead_imported',
      after: { deal_id: сделка.deal_id, фактов, задач, звонков: списокЗвонков.length },
      source: { откуда: 'scripts/care/import-call-leads.ts' },
      reason: 'лид после консультации: профиль и план по записи звонка',
    })

    console.log(`   ✓ дело ${дело.id}: фактов ${фактов}, задач ${задач}`)
  }

  if (!применить) console.log('\nПросмотр. Записать: --применить')
}

main().catch((e) => { console.error(e?.message ?? e); process.exit(1) })
