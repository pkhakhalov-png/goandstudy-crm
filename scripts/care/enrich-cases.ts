// Наполнить заведённые дела тем, что уже известно в действующей CRM.
//
//   npx tsx scripts/care/enrich-cases.ts              # предпросмотр
//   npx tsx scripts/care/enrich-cases.ts --применить
//   npx tsx scripts/care/enrich-cases.ts --дело <case_id>
//
// ЗАЧЕМ. Дело, заведённое импортом, содержит имя и контакт — и больше
// ничего. Куратор открывает карточку и видит пустоту, хотя в старом кабинете
// по этому клиенту есть страна, бюджет, план поступления и подборка вузов.
// Пустая карточка при непустой CRM — не «ещё не заполнено», а «система не
// умеет читать то, что уже есть».
//
// ЧТО ОТКУДА:
//   clients.country, service_type   → факты (подтверждённые)
//   clients.project_data            → факты (черновики: свободный текст)
//   clients.roadmap_data.stages[]   → задачи
//   client_universities             → заявки
//
// ПОЧЕМУ ПРОФИЛЬ ЧЕРНОВИКАМИ. `project_data` — свободный текст, заполненный
// однажды и, судя по `updated_at`, не всегда свежий: «сертификата пока нет,
// ближе к B2» верно на момент записи, а не навсегда. Перенести это
// подтверждённым значит объявить проверенным то, что никто не проверял.
// Структурные поля (страна, услуга) — другое дело: там нет толкования.
//
// Читает рабочие таблицы, пишет только в care. Повторный запуск не плодит
// дублей: перед вставкой проверяется, нет ли уже такого.
import { config } from 'dotenv'
import path from 'path'

config({ path: path.resolve(process.cwd(), '.env.local') })

const SUPA = process.env.NEXT_PUBLIC_SUPABASE_URL
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const KEY = process.env.CARE_DB_KEY

function аргумент(имя: string): string | null {
  const i = process.argv.indexOf(`--${имя}`)
  return i > -1 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : null
}

async function запрос<T>(схема: 'public' | 'care', метод: string, путь: string, тело?: unknown): Promise<T[]> {
  const h: Record<string, string> = {
    apikey: ANON!,
    Authorization: `Bearer ${KEY}`,
    'Content-Type': 'application/json',
    [метод === 'GET' ? 'Accept-Profile' : 'Content-Profile']: схема,
  }
  if (метод !== 'GET') h.Prefer = 'return=representation'
  const r = await fetch(`${SUPA}/rest/v1/${путь}`, { method: метод, headers: h, body: тело ? JSON.stringify(тело) : undefined })
  const текст = await r.text()
  if (!r.ok) throw new Error(`${метод} ${путь} → ${r.status}: ${текст.slice(0, 220)}`)
  return текст ? (JSON.parse(текст) as T[]) : []
}

type Клиент = {
  id: number
  name: string | null
  country: string | null
  service_type: string | null
  current_stage_code: string | null
  project_data: Record<string, string> | null
  roadmap_data: { stages?: { title?: string; month?: string; items?: { title?: string; comment?: string; month?: string; done?: boolean }[] }[] } | unknown[] | null
}

type Вуз = {
  client_id: number
  university_name: string | null
  program_name: string | null
  country: string | null
  tuition_per_year: number | null
  currency: string | null
  deadline: string | null
  status: string | null
  priority: number | null
  notes: string | null
}

/**
 * Деньги из свободного текста.
 *
 * «до 8000 евро / год» → 8000 EUR. Не угадываем: если валюту не назвали,
 * возвращаем null и текст уходит отдельным полем как есть. Сумма без валюты
 * — не сумма, и ограничение в базе это подтверждает.
 */
function разобратьДеньги(текст: string): { сумма: number; валюта: string } | null {
  const числа = текст.replace(/\s/g, '').match(/(\d[\d.,]{2,})/)
  if (!числа) return null
  const сумма = Number(числа[1].replace(/[.,](?=\d{3})/g, '').replace(',', '.'))
  if (!Number.isFinite(сумма) || сумма <= 0) return null
  const н = текст.toLowerCase()
  const валюта = /евро|eur|€/.test(н)
    ? 'EUR'
    : /доллар|usd|\$/.test(н)
      ? 'USD'
      : /фунт|gbp|£/.test(н)
        ? 'GBP'
        : /руб|rub|₽/.test(н)
          ? 'RUB'
          : null
  return валюта ? { сумма, валюта } : null
}

/** Месяц «2026-05» → первое число: срок у этапа плана привязан к месяцу, а не к дню. */
function месяцВДату(месяц: string | undefined): string | null {
  return месяц && /^\d{4}-\d{2}$/.test(месяц) ? `${месяц}-01` : null
}

type Черновик = { field: string; value: unknown; currency?: string | null; quote?: string | null; status: 'draft' | 'confirmed' }

/** Профиль из старого кабинета → набор фактов. */
function фактыИзПрофиля(p: Record<string, string>): Черновик[] {
  const ф: Черновик[] = []
  const добавить = (field: string, значение: string | undefined, доп?: Partial<Черновик>) => {
    if (!значение || !String(значение).trim()) return
    ф.push({ field, value: String(значение).trim(), status: 'draft', quote: String(значение).trim(), ...доп })
  }

  if (p.budget) {
    const деньги = разобратьДеньги(p.budget)
    if (деньги) {
      ф.push({
        field: 'budget.tuition.max',
        value: деньги.сумма,
        currency: деньги.валюта,
        quote: p.budget,
        status: 'draft',
      })
    } else {
      // Валюту не назвали — записать как сумму нельзя. Сохраняем текст,
      // чтобы куратор увидел и уточнил, а не чтобы мы догадались за него.
      добавить('profile.budget_text', p.budget)
    }
  }

  добавить('education.level_target', p.level)
  добавить('education.current', p.education)
  добавить('program.field', p.specialty)
  добавить('language.english.level', p.english)
  добавить('intake.start_text', p.start_date)
  добавить('profile.notes', p.other)
  return ф
}

async function main() {
  if (!SUPA || !ANON || !KEY) {
    console.error('Нужны NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY и CARE_DB_KEY')
    process.exit(1)
  }

  const писать = process.argv.includes('--применить')
  const одноДело = аргумент('дело')

  const дела = await запрос<{ id: string; client_id: number }>(
    'care',
    'GET',
    `cases?select=id,client_id&is_synthetic=eq.false${одноДело ? `&id=eq.${одноДело}` : ''}`
  )
  if (!дела.length) {
    console.log('Настоящих дел нет. Сначала: npx tsx scripts/care/import-cases.ts')
    return
  }

  const ids = дела.map((д) => д.client_id).join(',')
  const [клиенты, вузы] = await Promise.all([
    запрос<Клиент>(
      'public',
      'GET',
      `clients?select=id,name,country,service_type,current_stage_code,project_data,roadmap_data&id=in.(${ids})`
    ),
    запрос<Вуз>(
      'public',
      'GET',
      `client_universities?select=client_id,university_name,program_name,country,tuition_per_year,currency,deadline,status,priority,notes&client_id=in.(${ids})`
    ),
  ])
  const клиентПоId = new Map(клиенты.map((к) => [к.id, к]))

  console.log(`\n${писать ? 'ПРИМЕНЯЮ' : 'ПРЕДПРОСМОТР'} · дел ${дела.length}\n`)

  let итогФактов = 0
  let итогЗадач = 0
  let итогЗаявок = 0

  for (const дело of дела) {
    const к = клиентПоId.get(дело.client_id)
    if (!к) continue
    const подпись = (к.name ?? `#${к.id}`).slice(0, 22).padEnd(24)

    // ── Факты ──────────────────────────────────────────────────────────
    const факты: Черновик[] = []
    // Структурные поля переносим подтверждёнными: там нет толкования —
    // страна это страна.
    if (к.country) факты.push({ field: 'country.target', value: к.country, status: 'confirmed' })
    if (к.service_type) факты.push({ field: 'service.scope', value: к.service_type, status: 'confirmed' })
    if (к.project_data && Object.keys(к.project_data).length) {
      факты.push(...фактыИзПрофиля(к.project_data))
    }

    // ── Задачи из плана ────────────────────────────────────────────────
    const план = к.roadmap_data
    const этапы = план && !Array.isArray(план) ? (план.stages ?? []) : []
    const задачи: { title: string; details: string | null; due_on: string | null; done: boolean }[] = []
    for (const этап of этапы) {
      for (const пункт of этап.items ?? []) {
        if (!пункт.title?.trim()) continue
        задачи.push({
          title: пункт.title.trim(),
          // Этап плана идёт в подробности: без него «Выбранные университеты»
          // не говорит, к какому шагу относится.
          details: [этап.title ? `Этап: ${этап.title}` : null, пункт.comment?.trim() || null]
            .filter(Boolean)
            .join('\n\n') || null,
          due_on: месяцВДату(пункт.month ?? этап.month),
          done: пункт.done === true,
        })
      }
    }

    // ── Заявки из подборки ─────────────────────────────────────────────
    const мои = вузы.filter((в) => в.client_id === к.id)

    console.log(
      `  ${подпись} факты ${факты.length}, задачи ${задачи.length}, заявки ${мои.length}` +
        (факты.length + задачи.length + мои.length === 0 ? '  — переносить нечего' : '')
    )

    if (!писать) {
      итогФактов += факты.length
      итогЗадач += задачи.length
      итогЗаявок += мои.length
      continue
    }

    // Источник: карточка в старом кабинете. Без него факт не проверить —
    // непонятно, откуда он взялся и насколько свежий.
    const [источник] = await запрос<{ id: string }>('care', 'POST', 'sources', {
      case_id: дело.id,
      kind: 'manual',
      ref: { kind: 'crm_client_card', client_id: к.id },
      available: true,
      note: 'Карточка клиента в действующей CRM',
    })

    for (const ф of факты) {
      const уже = await запрос<{ id: string }>(
        'care',
        'GET',
        `facts?select=id&case_id=eq.${дело.id}&field=eq.${encodeURIComponent(ф.field)}`
      )
      if (уже.length) continue
      await запрос('care', 'POST', 'facts', {
        case_id: дело.id,
        field: ф.field,
        value: ф.value,
        currency: ф.currency ?? null,
        status: ф.status,
        quote: ф.quote ?? null,
        source_id: источник.id,
        speaker: 'curator',
      })
      итогФактов += 1
    }

    for (const з of задачи) {
      const уже = await запрос<{ id: string }>(
        'care',
        'GET',
        `tasks?select=id&case_id=eq.${дело.id}&title=eq.${encodeURIComponent(з.title)}`
      )
      if (уже.length) continue
      await запрос('care', 'POST', 'tasks', {
        case_id: дело.id,
        title: з.title,
        details: з.details,
        due_on: з.due_on,
        status: з.done ? 'done' : 'todo',
        closed_at: з.done ? new Date().toISOString() : null,
        waiting_on: 'none',
      })
      итогЗадач += 1
    }

    for (const в of мои) {
      const название = [в.university_name, в.program_name].filter(Boolean).join(' · ') || 'без названия'
      const уже = await запрос<{ id: string }>(
        'care',
        'GET',
        `applications?select=id&case_id=eq.${дело.id}&program_ref->>title=eq.${encodeURIComponent(название)}`
      )
      if (уже.length) continue
      await запрос('care', 'POST', 'applications', {
        case_id: дело.id,
        program_ref: {
          title: название,
          university: в.university_name,
          program: в.program_name,
          country: в.country,
          tuition: в.tuition_per_year,
          currency: в.currency,
          deadline: в.deadline,
          source: 'client_universities',
        },
        status: 'planned',
        note: в.notes,
      })
      итогЗаявок += 1
    }

    await запрос('care', 'POST', 'events', {
      actor_kind: 'system',
      case_id: дело.id,
      action: 'case_enriched',
      after: { факты: факты.length, задачи: задачи.length, заявки: мои.length },
      source: { script: 'scripts/care/enrich-cases.ts' },
      reason: 'перенос известного из действующей CRM',
    })
  }

  console.log(
    `\nИтого: ${писать ? 'перенесено' : 'будет перенесено'} фактов ${итогФактов}, задач ${итогЗадач}, заявок ${итогЗаявок}`
  )
  if (!писать) console.log('Это предпросмотр. Чтобы записать, добавь --применить')
  else console.log('\nПрофиль перенесён черновиками: свободный текст из старой карточки никто не проверял.')
}

main().catch((e) => {
  console.error('✗', e instanceof Error ? e.message : e)
  process.exit(1)
})
