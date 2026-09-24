/**
 * Seed каталога: Китай (cn) — языковые курсы + англоязычные инженерные бакалавриаты.
 * Данные от партнёра (сентябрь 2026). Суммы даны в юанях; в поле `tuition`
 * кладём пересчёт в $ по курсу ~7,1 ¥/$ — иначе бюджетный фильтр и сортировка
 * по цене (они работают с «сырым» числом) отправят Китай в корзину «$10k–25k».
 *
 *   npx tsx scripts/add-china-programs.ts            # dry-run (ничего не пишет)
 *   npx tsx scripts/add-china-programs.ts --confirm  # выполнить вставку
 *
 * Идемпотентен: вуз/программа с совпадающим именем не дублируются.
 */
import { config } from 'dotenv'
import path from 'path'
import { createClient } from '@supabase/supabase-js'
config({ path: path.resolve(process.cwd(), '.env.local') })

const parser = createClient(
  process.env.NEXT_PUBLIC_PARSER_SUPABASE_URL!,
  process.env.PARSER_SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
)
const CONFIRM = process.argv.includes('--confirm')

const CNY_PER_USD = 7.1
/** ¥ → $ с округлением до сотни — только для числового поля сортировки/бюджета. */
const usd = (cny: number) => Math.round(cny / CNY_PER_USD / 100) * 100
/** «¥18,000/год (≈$2,500)» */
const money = (cny: number) => `¥${cny.toLocaleString('en-US')}/год (≈$${usd(cny).toLocaleString('en-US')})`

const HEDGE =
  'Стоимость по данным партнёра (сентябрь 2026), в юанях; $ — пересчёт по курсу ~7,1 ¥/$. ' +
  'Точные суммы, дедлайны и наличие мест уточняем при поступлении.'

type Prog = {
  name: string          // русское название
  en: string            // англ. название → в program_description
  specialty: string
  degree: 'Bachelor' | 'Master' | 'Языковые курсы'
  language: string
  cny: number           // стоимость обучения, ¥/год
  start: string
  duration: string
  reqs: string[]
  housing: string[]     // варианты проживания (как дал партнёр)
  livingCost: string    // сводная строка «сколько стоит жить»
  note?: string         // доп. оговорка перед HEDGE
}
type School = {
  name: string
  city: string
  type: string
  programs: Prog[]
}

// ───────── языковые курсы: общий каркас, у вузов отличаются только цена и жильё
const LANG_REQS = [
  'Аттестат о среднем образовании',
  'Загранпаспорт',
  'Уровень китайского не требуется (набор с нуля) — уточняется по вузу',
]
const LANG_START = 'Уточняется (обычно сентябрь и март)'
const LANG_DURATION = '1 год (2 семестра)'

function lang(cny: number, housing: string[], livingCost: string): Prog {
  return {
    name: 'Языковые курсы',
    en: 'Chinese Language Program (подготовка к HSK)',
    specialty: 'Языковые курсы',
    degree: 'Языковые курсы',
    language: 'Китайский',
    cny,
    start: LANG_START,
    duration: LANG_DURATION,
    reqs: LANG_REQS,
    housing,
    livingCost,
  }
}

// ───────── англоязычные бакалавриаты: требования по вузу
const ENG_START = 'Сентябрь'
const ENG_DURATION = '4 года'

const SCHOOLS: School[] = [
  // ══════════════════ ЯЗЫКОВЫЕ КУРСЫ ══════════════════
  {
    name: 'Shanghai Normal University', city: 'Шанхай', type: 'Государственный',
    programs: [
      lang(18000,
        ['Двухместное общежитие — ¥70/сутки (≈¥2,100/мес)', 'Аренда квартиры вне кампуса — от ¥2,000/мес'],
        '¥70/сутки (общежитие) · от ¥2,000/мес (аренда вне кампуса)'),
    ],
  },
  {
    name: 'Shanghai Maritime University', city: 'Шанхай', type: 'Государственный',
    programs: [
      lang(17000,
        ['Однокомнатная (одноместная) — ¥12,000/год', 'Двухместная — ¥6,000/год'],
        '¥6,000–12,000/год (общежитие)'),
    ],
  },
  {
    name: 'Zhejiang Sci-Tech University', city: 'Ханчжоу', type: 'Государственный',
    programs: [
      lang(14000, ['Общежитие — около ¥5,400/год'], '≈¥5,400/год (общежитие)'),
    ],
  },
  {
    name: 'Zhejiang Gongshang University', city: 'Ханчжоу', type: 'Государственный',
    programs: [
      lang(14000,
        ['Двухместное общежитие — ¥650/мес', 'Четырёхместное общежитие — ¥300/мес'],
        '¥300–650/мес (общежитие)'),
    ],
  },
  {
    name: 'Hangzhou Normal University', city: 'Ханчжоу', type: 'Государственный',
    programs: [
      lang(15000,
        ['Двухместное общежитие — ¥75/сутки', 'Трёхместное общежитие — ¥60/сутки'],
        '¥60–75/сутки (общежитие)'),
    ],
  },
  {
    name: 'Beijing Forestry University', city: 'Пекин', type: 'Государственный',
    programs: [
      lang(16400,
        ['Одноместное общежитие — ¥100–120/сутки', 'Двухместное общежитие — ¥50–60/сутки'],
        '¥50–120/сутки (общежитие)'),
    ],
  },
  {
    name: 'Dalian University of Technology', city: 'Далянь', type: 'Государственный',
    programs: [
      lang(16000,
        ['Одноместное общежитие — ¥1,800/мес', 'Двухместное общежитие — ¥1,200/мес'],
        '¥1,200–1,800/мес (общежитие)'),
    ],
  },
  {
    name: 'Qingdao University of Technology', city: 'Циндао', type: 'Государственный',
    programs: [
      lang(13600, ['Общежитие — ¥9,000/год'], '¥9,000/год (общежитие)'),
    ],
  },

  // ══════════════ ЯЗЫКОВЫЕ КУРСЫ + БАКАЛАВРИАТ В ОДНОМ ВУЗЕ ══════════════
  {
    // Nanjing Tech есть в обоих списках партнёра — вуз один, программы разные,
    // и языковой курс (¥15,000) дороже/дешевле бакалавриата (¥16,000) сам по себе.
    name: 'Nanjing Tech University', city: 'Нанкин', type: 'Государственный',
    programs: [
      lang(15000,
        ['Четырёхместное общежитие — ¥2,000/год', 'Двухместное общежитие — ¥4,000/год'],
        '¥2,000–4,000/год (общежитие)'),
      ...(['Химическая инженерия|Chemical Engineering|Инженерия',
           'Машиностроение|Mechanical Engineering|Инженерия',
           'Транспортная инженерия|Traffic Engineering|Инженерия',
           'Гражданское строительство|Civil Engineering|Инженерия'
      ].map(row => {
        const [name, en, specialty] = row.split('|')
        return {
          name, en, specialty, degree: 'Bachelor' as const, language: 'Английский',
          cny: 16000, start: ENG_START, duration: ENG_DURATION,
          reqs: ['Аттестат о среднем образовании', 'IELTS 6.5+ / TOEFL 80+'],
          housing: ['Четырёхместное общежитие — ¥2,000/год', 'Двухместное общежитие — ¥4,000/год'],
          livingCost: '¥2,000–4,000/год (общежитие)',
        }
      })),
    ],
  },

  // ══════════════════ АНГЛОЯЗЫЧНЫЕ БАКАЛАВРИАТЫ ══════════════════
  {
    name: 'Shanghai University of Engineering Science', city: 'Шанхай', type: 'Государственный',
    programs: [
      {
        name: 'Текстильная инженерия', en: 'Textile Engineering', specialty: 'Инженерия',
        degree: 'Bachelor', language: 'Английский', cny: 20000, start: ENG_START, duration: ENG_DURATION,
        reqs: ['Аттестат о среднем образовании', 'TOEFL 60+ / IELTS 6.0+'],
        housing: ['Аренда апартаментов (общежитие партнёром не заявлено — уточняется)'],
        livingCost: 'Аренда апартаментов — стоимость уточняется',
        note: 'Партнёр указал проживание как «аренда апартаментов» без суммы — стоимость жилья уточняем отдельно.',
      },
    ],
  },
  {
    name: 'Zhejiang University of Technology', city: 'Ханчжоу', type: 'Государственный',
    programs: (['Гражданское строительство|Civil Engineering|Инженерия|математика + физика',
                'Инженерная экология|Environmental Engineering|Инженерия|математика + химия',
                'Машиностроение|Mechanical Engineering|Инженерия|математика + физика',
                'Программная инженерия|Software Engineering|IT и технологии|математика + физика'
    ]).map(row => {
      const [name, en, specialty, csca] = row.split('|')
      return {
        name, en, specialty, degree: 'Bachelor' as const, language: 'Английский',
        cny: 18800, start: ENG_START, duration: ENG_DURATION,
        reqs: ['Аттестат о среднем образовании', `Экзамен CSCA: ${csca}`, 'IELTS 5.5+ / TOEFL 60+'],
        housing: ['Общежитие — около ¥5,000/год'],
        livingCost: '≈¥5,000/год (общежитие)',
      }
    }),
  },
  {
    name: 'Wuhan University', city: 'Ухань', type: 'Государственный',
    programs: [
      {
        name: 'Программная инженерия', en: 'Software Engineering', specialty: 'IT и технологии',
        degree: 'Bachelor', language: 'Английский', cny: 28000, start: ENG_START, duration: ENG_DURATION,
        reqs: ['Аттестат о среднем образовании', 'Экзамен CSCA: математика + физика', 'TOEFL 80+ / IELTS 6.0+'],
        housing: ['Одноместное общежитие — до ¥16,000/год'],
        livingCost: 'до ¥16,000/год (одноместное общежитие)',
      },
    ],
  },
  {
    name: 'Harbin Institute of Technology', city: 'Харбин', type: 'Государственный',
    programs: [
      {
        name: 'Гражданское строительство', en: 'Civil Engineering', specialty: 'Инженерия',
        degree: 'Bachelor', language: 'Английский', cny: 26000, start: ENG_START, duration: ENG_DURATION,
        reqs: ['Аттестат о среднем образовании', 'Экзамен CSCA: математика + физика', 'TOEFL 78+ / IELTS 6.0+'],
        housing: ['Общежитие — около ¥10,000/год'],
        livingCost: '≈¥10,000/год (общежитие)',
      },
      {
        name: 'Химическая инженерия и технологии', en: 'Chemical Engineering and Technology', specialty: 'Инженерия',
        degree: 'Bachelor', language: 'Английский', cny: 26000, start: ENG_START, duration: ENG_DURATION,
        reqs: ['Аттестат о среднем образовании', 'Экзамен CSCA: математика + химия (физика)', 'TOEFL 78+ / IELTS 6.0+'],
        housing: ['Общежитие — около ¥10,000/год'],
        livingCost: '≈¥10,000/год (общежитие)',
      },
    ],
  },
]

function curatorNote(p: Prog): string {
  return [p.note, HEDGE].filter(Boolean).join(' ')
}

async function main() {
  const totalPrograms = SCHOOLS.reduce((n, s) => n + s.programs.length, 0)
  console.log(`План: ${SCHOOLS.length} вузов, ${totalPrograms} программ (cn)\n`)

  let schoolsInserted = 0, schoolsReused = 0, progInserted = 0, progSkipped = 0

  for (const s of SCHOOLS) {
    const { data: exist } = await parser.from('schools')
      .select('id, name').eq('country_code', 'cn').ilike('name', s.name)
    let schoolId: number
    if (exist && exist.length) {
      schoolId = exist[0].id
      schoolsReused++
      console.log(`↺ вуз есть: ${s.name} (#${schoolId})`)
    } else {
      console.log(`＋ вуз: ${s.name} [cn] — ${s.city}`)
      if (CONFIRM) {
        const { data, error } = await parser.from('schools').insert({
          name: s.name, city: s.city, country_code: 'cn',
          university_type: s.type, qs_rank: null,
          curator_note: 'Добавлено вручную (данные партнёра, сентябрь 2026). QS не проставлен — уточняется.',
          source: 'curator_gh',
        }).select('id').single()
        if (error) { console.error(`  ✗ вставка вуза: ${error.message}`); process.exit(1) }
        schoolId = data.id
      } else {
        schoolId = -1
      }
      schoolsInserted++
    }

    for (const p of s.programs) {
      if (schoolId > 0) {
        const { data: existProg } = await parser.from('programs')
          .select('id').eq('school_id', schoolId).ilike('name', p.name)
        if (existProg && existProg.length) {
          progSkipped++
          console.log(`   ↺ программа есть: ${p.name}`)
          continue
        }
      }
      console.log(`   ＋ ${p.degree} · ${p.name} · ${p.specialty} · ${p.language} · ${money(p.cny)}`)
      if (CONFIRM) {
        const { error } = await parser.from('programs').insert({
          school_id: schoolId,
          name: p.name,
          program_description: p.en,
          specialty_group: p.specialty,
          degree_text: p.degree,
          language_text: p.language,
          tuition: usd(p.cny),
          tuition_text: money(p.cny),
          currency: 'CNY',
          start_date_text: p.start,
          deadline_text: 'Уточняется',
          duration_text: p.duration,
          entry_requirements: p.reqs,
          accommodation_options: p.housing,
          living_cost_text: p.livingCost,
          scholarships_text: null,
          curator_note: curatorNote(p),
          source: 'curator_gh',
        })
        if (error) { console.error(`     ✗ вставка программы: ${error.message}`); process.exit(1) }
      }
      progInserted++
    }
  }

  console.log(`\nИтог: вузы +${schoolsInserted} (переиспользовано ${schoolsReused}); программы +${progInserted} (пропущено ${progSkipped})`)

  if (!CONFIRM) {
    console.log('\n⚠️ dry-run. Ничего не записано. Запусти с --confirm чтобы выполнить.')
    return
  }

  console.log('\n=== Проверка search_programs (cn) ===')
  const { data, error } = await parser.rpc('search_programs', {
    p_country: 'cn', p_limit: 5, p_offset: 0, p_count_cap: null,
  })
  if (error) console.log(`  cn: RPC error — ${error.message}`)
  else console.log(`  cn: total = ${(data as any)?.total}`)
}
main().catch(e => { console.error(e); process.exit(1) })
