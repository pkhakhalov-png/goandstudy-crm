/**
 * Seed каталога: Словения (si), Португалия (pt), Турция (tr).
 * Топ-вузы и англоязычные программы — ресёрч из открытых источников (июль 2026).
 * Данные вставляются в parser DB (schools + programs), source='curator_gh'.
 *
 *   npx tsx scripts/add-countries-si-pt-tr.ts            # dry-run (ничего не пишет)
 *   npx tsx scripts/add-countries-si-pt-tr.ts --confirm  # выполнить вставку
 *
 * Скрипт идемпотентен: вуз/программа с совпадающим именем не дублируются.
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

type Prog = {
  name: string          // русское название
  en: string            // англ. название (в program_description)
  faculty?: string      // факультет/школа — добавится в описание
  specialty: string
  degree: 'Bachelor' | 'Master' | 'PhD'
  language: string
  tuition: number | null
  tuitionText: string
  start: string
  deadline?: string     // если нет — подставится страновой дефолт
  duration: string
  reqs: string[]
  scholarships?: string | null
  caveat?: string       // доп. оговорка в curator_note (напр. источник 403)
  url: string
}
type School = {
  name: string
  city: string
  cc: 'si' | 'pt' | 'tr'
  type: string
  qs: number | null
  programs: Prog[]
}

// Страновые дефолты для дедлайна и хедж-оговорки в curator_note
const CC_HEDGE: Record<string, string> = {
  si: 'Не-ЕС студенты платят обучение (граждане ЕС учатся бесплатно в госвузах). Точную стоимость и дедлайны уточняем при поступлении.',
  pt: 'Приём для не-ЕС по International Student Statute (отдельный конкурс). Точную стоимость и дедлайны уточняем при поступлении.',
  tr: 'Набор — сентябрь; точные дедлайны и стоимость уточняем при поступлении.',
}
const CC_DEADLINE: Record<string, string> = {
  si: 'Уточняется (обычно весна, отдельный конкурс для не-ЕС)',
  pt: 'Уточняется (см. сайт вуза)',
  tr: 'Уточняется (набор — осень)',
}

const SCHOOLS: School[] = [
  // ─────────────────────────── ТУРЦИЯ ───────────────────────────
  {
    name: 'Koç University', city: 'Стамбул', cc: 'tr', type: 'Частный (фонд)', qs: 323,
    programs: [
      { name: 'Компьютерная инженерия', en: 'Computer Engineering', specialty: 'IT и технологии', degree: 'Bachelor', language: 'Английский', tuition: 21500, tuitionText: '~$21,000–22,000/год', start: 'Сентябрь', duration: '4 года', reqs: ['Аттестат о среднем образовании', 'SAT / ACT / нац. экзамен', 'Английский (TOEFL/IELTS) или экзамен Koç'], scholarships: 'Merit-стипендии 25%/50%/75%/100% (автооценка при поступлении)', caveat: 'Официальная страница цен недоступна (403) — сумма по вторичным источникам, перепроверить.', url: 'https://international.ku.edu.tr/undergraduate-programs/tuition-and-scholarships/' },
      { name: 'Управление бизнесом', en: 'Business Administration', specialty: 'Бизнес и управление', degree: 'Bachelor', language: 'Английский', tuition: 21500, tuitionText: '~$21,000–22,000/год', start: 'Сентябрь', duration: '4 года', reqs: ['Аттестат о среднем образовании', 'SAT / ACT / нац. экзамен', 'Английский (TOEFL/IELTS) или экзамен Koç'], scholarships: 'Merit-стипендии до 100%', caveat: 'Официальная страница цен недоступна (403) — сумма по вторичным источникам, перепроверить.', url: 'https://international.ku.edu.tr/undergraduate-programs/tuition-and-scholarships/' },
      { name: 'Медицина (лечебное дело, MD)', en: 'Doctor of Medicine (MD)', specialty: 'Медицина и здоровье', degree: 'Bachelor', language: 'Английский', tuition: 29000, tuitionText: '~$29,000/год (клиническое обучение)', start: 'Сентябрь', duration: '6 лет', reqs: ['Аттестат (естественнонаучный профиль)', 'SAT / нац. экзамен', 'Английский (TOEFL/IELTS)'], scholarships: 'Merit-стипендии до 100%', caveat: 'Официальная страница цен недоступна (403) — сумма по вторичным источникам, перепроверить.', url: 'https://international.ku.edu.tr/undergraduate-programs/tuition-and-scholarships/' },
    ],
  },
  {
    name: 'Sabancı University', city: 'Стамбул', cc: 'tr', type: 'Частный (фонд)', qs: 404,
    programs: [
      { name: 'Компьютерные науки и инженерия', en: 'Computer Science and Engineering', specialty: 'IT и технологии', degree: 'Bachelor', language: 'Английский', tuition: 36500, tuitionText: '$36,500/год', start: 'Сентябрь', duration: '4 года', reqs: ['Аттестат о среднем образовании', 'SAT / нац. экзамен', 'Английский (TOEFL/IELTS)'], scholarships: 'Merit tuition waivers 25–100%; стипендии на общежитие', url: 'http://iro.sabanciuniv.edu/en/tuition-fee' },
      { name: 'Менеджмент', en: 'Management', specialty: 'Бизнес и управление', degree: 'Bachelor', language: 'Английский', tuition: 36500, tuitionText: '$36,500/год', start: 'Сентябрь', duration: '4 года', reqs: ['Аттестат о среднем образовании', 'SAT / нац. экзамен', 'Английский (TOEFL/IELTS)'], scholarships: 'Merit tuition waivers до 100%; стипендии на проживание', url: 'http://iro.sabanciuniv.edu/en/tuition-fee' },
      { name: 'Наука о данных', en: 'Data Science (MSc)', specialty: 'IT и технологии', degree: 'Master', language: 'Английский', tuition: null, tuitionText: 'Уточняется', start: 'Сентябрь', duration: '2 года', reqs: ['Диплом бакалавра', 'Английский (TOEFL/IELTS)', 'GRE (по требованию программы)'], scholarships: 'Стипендии по академическим достижениям', url: 'https://ects.sabanciuniv.edu/en/masters/data-science' },
    ],
  },
  {
    name: 'Bilkent University', city: 'Анкара', cc: 'tr', type: 'Частный (фонд)', qs: 415,
    programs: [
      { name: 'Электротехника и электроника', en: 'Electrical and Electronics Engineering', specialty: 'Инженерия', degree: 'Bachelor', language: 'Английский', tuition: 18400, tuitionText: '~$17,600–18,400/год (вкл. НДС)', start: 'Сентябрь', duration: '4 года', reqs: ['Аттестат о среднем образовании', 'SAT / нац. экзамен', 'Английский (TOEFL/IELTS) или экзамен Bilkent'], scholarships: 'Скидки 25–75% и полные стипендии по досье', url: 'https://w3.bilkent.edu.tr/bilkent/international-and-other-students-tuition-fees/' },
      { name: 'Архитектура', en: 'Architecture', specialty: 'Архитектура', degree: 'Bachelor', language: 'Английский', tuition: 18400, tuitionText: '~$17,600–18,400/год (вкл. НДС)', start: 'Сентябрь', duration: '4 года', reqs: ['Аттестат о среднем образовании', 'SAT / нац. экзамен', 'Английский (TOEFL/IELTS)'], scholarships: 'Скидки 25–75% по досье', url: 'https://w3.bilkent.edu.tr/international/undergraduate-programs/' },
      { name: 'Международные отношения', en: 'International Relations', specialty: 'Социальные науки', degree: 'Bachelor', language: 'Английский', tuition: 18400, tuitionText: '~$17,600–18,400/год (вкл. НДС)', start: 'Сентябрь', duration: '4 года', reqs: ['Аттестат о среднем образовании', 'SAT / нац. экзамен', 'Английский (TOEFL/IELTS)'], scholarships: 'Скидки 25–75% по досье', url: 'https://w3.bilkent.edu.tr/international/undergraduate-programs/' },
    ],
  },
  {
    name: 'Middle East Technical University (METU)', city: 'Анкара', cc: 'tr', type: 'Государственный', qs: 269,
    programs: [
      { name: 'Машиностроение', en: 'Mechanical Engineering', specialty: 'Инженерия', degree: 'Bachelor', language: 'Английский', tuition: 1500, tuitionText: '~$1,000–1,500/год (гос.)', start: 'Сентябрь', duration: '4 года', reqs: ['Аттестат о среднем образовании', 'Экзамен YÖS / SAT / ACT', 'Английский (TOEFL/IELTS) или экзамен METU'], scholarships: 'Türkiye Bursları (гос. стипендия); ограниченные внутренние гранты', url: 'https://iso.metu.edu.tr/en/tuition-fee' },
      { name: 'Экономика', en: 'Economics', specialty: 'Экономика и финансы', degree: 'Bachelor', language: 'Английский', tuition: 1500, tuitionText: '~$1,000–1,500/год (гос.)', start: 'Сентябрь', duration: '4 года', reqs: ['Аттестат о среднем образовании', 'Экзамен YÖS / SAT / ACT', 'Английский (TOEFL/IELTS) или экзамен METU'], scholarships: 'Türkiye Bursları (гос. стипендия)', url: 'https://iso.metu.edu.tr/en/tuition-fee' },
    ],
  },
  {
    name: 'Boğaziçi University', city: 'Стамбул', cc: 'tr', type: 'Государственный', qs: 371,
    programs: [
      { name: 'Компьютерная инженерия', en: 'Computer Engineering', specialty: 'IT и технологии', degree: 'Bachelor', language: 'Английский', tuition: 10000, tuitionText: '~$10,000/год ($5,000/семестр)', start: 'Сентябрь', duration: '4 года', reqs: ['Аттестат о среднем образовании', 'SAT / YÖS / нац. экзамен', 'Английский: IELTS 6.5 / TOEFL 79 или экзамен BUEPT'], scholarships: 'Türkiye Bursları; вузовские гранты', url: 'https://intl.bogazici.edu.tr/?q=tuition-undergraduate-and-graduate-degree-programs' },
      { name: 'Управление бизнесом', en: 'Business Administration', specialty: 'Бизнес и управление', degree: 'Bachelor', language: 'Английский', tuition: 10000, tuitionText: '~$10,000/год ($5,000/семестр)', start: 'Сентябрь', duration: '4 года', reqs: ['Аттестат о среднем образовании', 'SAT / YÖS / нац. экзамен', 'Английский: IELTS 6.5 / TOEFL 79 или экзамен BUEPT'], scholarships: 'Türkiye Bursları; вузовские гранты', url: 'https://intl.bogazici.edu.tr/?q=tuition-undergraduate-and-graduate-degree-programs' },
    ],
  },
  {
    name: 'Istanbul Technical University (ITU)', city: 'Стамбул', cc: 'tr', type: 'Государственный', qs: 298,
    programs: [
      { name: 'Архитектура', en: 'Architecture', specialty: 'Архитектура', degree: 'Bachelor', language: 'Английский', tuition: null, tuitionText: '~$1,500–5,000/год (гос.)', start: 'Сентябрь', duration: '4 года', reqs: ['Аттестат о среднем образовании', 'Экзамен YÖS / SAT', 'Английский (TOEFL/IELTS) или экзамен ITU'], scholarships: 'Merit-стипендии, tuition waivers; Türkiye Bursları', url: 'https://www.sis.itu.edu.tr/EN/student/intenational-students/undergraduate.php' },
    ],
  },
  {
    name: 'Bahçeşehir University (BAU)', city: 'Стамбул', cc: 'tr', type: 'Частный (фонд)', qs: null,
    programs: [
      { name: 'Медицина (лечебное дело, MD)', en: 'Medicine (MD)', specialty: 'Медицина и здоровье', degree: 'Bachelor', language: 'Английский', tuition: 28000, tuitionText: '~$28,000/год', start: 'Сентябрь', duration: '6 лет', reqs: ['Аттестат (естественнонаучный профиль)', 'SAT / нац. экзамен', 'Английский (TOEFL/IELTS)'], scholarships: 'Merit-скидки для иностранцев (зависят от программы)', caveat: 'Сумма по вторичному источнику — перепроверить на официальном сайте.', url: 'https://studyinturkiye.com/bahcesehir-university-tuition-international-2025-2026/' },
    ],
  },

  // ─────────────────────────── СЛОВЕНИЯ ───────────────────────────
  {
    name: 'University of Ljubljana', city: 'Любляна', cc: 'si', type: 'Государственный', qs: 535,
    programs: [
      { name: 'Бизнес и экономика', en: 'Business and Economics (English track)', faculty: 'School of Economics and Business', specialty: 'Экономика и финансы', degree: 'Bachelor', language: 'Английский', tuition: 3400, tuitionText: '€3,400/год (не-ЕС)', start: 'Октябрь', duration: '3 года', reqs: ['Аттестат о среднем образовании', 'Английский (IELTS 6.0+ / TOEFL iBT 80+)'], scholarships: 'Ad futura, CEEPUS, Erasmus+', url: 'https://www.ef.uni-lj.si/en/study/bachelors-programmes/solnina-in-cenik' },
      { name: 'Устойчивое управление туризмом', en: 'Sustainable Tourism Management', faculty: 'School of Economics and Business', specialty: 'Туризм и гостиничный', degree: 'Master', language: 'Английский', tuition: 4700, tuitionText: '€4,700/год (не-ЕС)', start: 'Октябрь', duration: '2 года', reqs: ['Диплом бакалавра', 'Английский (IELTS 6.0+ / TOEFL iBT 80+)'], scholarships: 'Ad futura, CEEPUS, Erasmus+', url: 'https://www.ef.uni-lj.si/en/study/masters-programmes/fees-and-price-list' },
      { name: 'Маркетинг', en: 'Marketing', faculty: 'School of Economics and Business', specialty: 'Бизнес и управление', degree: 'Master', language: 'Английский', tuition: 4700, tuitionText: '€4,700/год (не-ЕС)', start: 'Октябрь', duration: '2 года', reqs: ['Диплом бакалавра', 'Английский (IELTS 6.0+ / TOEFL iBT 80+)'], scholarships: 'Ad futura, CEEPUS, Erasmus+', url: 'https://www.ef.uni-lj.si/en/study/masters-programmes/fees-and-price-list' },
      { name: 'Международные отношения', en: 'International Relations', faculty: 'Faculty of Social Sciences', specialty: 'Социальные науки', degree: 'Master', language: 'Английский', tuition: null, tuitionText: 'Ориентир €3,000–5,000/год (не-ЕС; уточнять на сайте факультета)', start: 'Октябрь', duration: '2 года', reqs: ['Диплом бакалавра', 'Английский (IELTS 6.0+)'], scholarships: 'Ad futura, CEEPUS, Erasmus+', caveat: 'Квоты для не-ЕС ограничены.', url: 'https://www.uni-lj.si/en/study/international-students/programmes-in-english' },
      { name: 'Промышленная фармация', en: 'Industrial Pharmacy', faculty: 'Faculty of Pharmacy', specialty: 'Медицина и здоровье', degree: 'Master', language: 'Английский', tuition: null, tuitionText: 'Уточнять на сайте факультета (не-ЕС)', start: 'Октябрь', duration: '2 года', reqs: ['Диплом бакалавра в родственной области', 'Английский (IELTS 6.0+)'], scholarships: 'Ad futura, CEEPUS, Erasmus+', url: 'https://studyinslovenia.si/study/programmes-in-english/' },
    ],
  },
  {
    name: 'University of Maribor', city: 'Марибор', cc: 'si', type: 'Государственный', qs: 901,
    programs: [
      { name: 'Бизнес-администрирование', en: 'Business Administration', faculty: 'Faculty of Economics and Business', specialty: 'Бизнес и управление', degree: 'Bachelor', language: 'Английский', tuition: null, tuitionText: '€1,800–3,850/год (не-ЕС, бакалавриат UM)', start: 'Октябрь', duration: '3 года', reqs: ['Аттестат о среднем образовании', 'Английский (IELTS 6.0+)'], scholarships: 'CEEPUS, Erasmus+, Ad futura', url: 'https://moja.um.si/en/future-students/Documents/Price_List_2025/UM_Price_List_2025-26_Tuition_fees_full-time_studies.pdf' },
      { name: 'Современные практики туризма', en: 'Contemporary Tourism Practices', faculty: 'Faculty of Tourism (Brežice)', specialty: 'Туризм и гостиничный', degree: 'Bachelor', language: 'Английский', tuition: null, tuitionText: '€1,800–3,850/год (не-ЕС, бакалавриат UM)', start: 'Октябрь', duration: '3 года', reqs: ['Аттестат о среднем образовании', 'Английский (IELTS 6.0+)'], scholarships: 'CEEPUS, Erasmus+, Ad futura', url: 'https://studyinslovenia.si/study/programmes-in-english/' },
      { name: 'Европейское право', en: 'European Legal Studies', faculty: 'Faculty of Law', specialty: 'Право', degree: 'Master', language: 'Английский', tuition: null, tuitionText: '€2,500–4,000/год (не-ЕС, магистратура UM)', start: 'Октябрь', duration: '2 года', reqs: ['Диплом бакалавра (право/родственное)', 'Английский (IELTS 6.0+)'], scholarships: 'CEEPUS, Erasmus+, Ad futura', url: 'https://studyinslovenia.si/study/programmes-in-english/' },
    ],
  },
  {
    name: 'University of Primorska', city: 'Копер', cc: 'si', type: 'Государственный', qs: null,
    programs: [
      { name: 'Компьютерные науки', en: 'Computer Science', faculty: 'FAMNIT', specialty: 'IT и технологии', degree: 'Bachelor', language: 'Английский', tuition: 3150, tuitionText: '€3,150/год (не-ЕС)', start: 'Октябрь', duration: '3 года', reqs: ['Аттестат о среднем образовании', 'Английский (IELTS 6.0+)'], scholarships: 'CEEPUS, Erasmus+, Ad futura', url: 'https://famnit.upr.si/en/resources/files/education/general-information/022526cenikfamniten.pdf' },
      { name: 'Наука о данных', en: 'Data Science', faculty: 'FAMNIT', specialty: 'IT и технологии', degree: 'Master', language: 'Английский', tuition: null, tuitionText: 'Ориентир ~€3,000–5,000/год (не-ЕС; уточнять в прайс-листе FAMNIT)', start: 'Октябрь', duration: '2 года', reqs: ['Диплом бакалавра (математика/CS/родственное)', 'Английский (IELTS 6.0+)'], scholarships: 'CEEPUS, Erasmus+, Ad futura', url: 'https://welcome.upr.si/student/choose/study-programmes-in-english/' },
      { name: 'Менеджмент', en: 'Management', faculty: 'Faculty of Management', specialty: 'Бизнес и управление', degree: 'Bachelor', language: 'Английский', tuition: 3800, tuitionText: '€3,800/год (не-ЕС, 2026/27)', start: 'Октябрь', duration: '3 года', reqs: ['Аттестат о среднем образовании', 'Английский (IELTS 6.0+)'], scholarships: 'CEEPUS, Erasmus+, Ad futura', url: 'https://www.fm-kp.si/en/study/programmes_in_english/tuition_and_fees' },
      { name: 'Управление туристическими дестинациями', en: 'Tourism Destination Management', faculty: 'Faculty of Tourism Studies (Turistica, Portorož)', specialty: 'Туризм и гостиничный', degree: 'Bachelor', language: 'Английский', tuition: null, tuitionText: 'Ориентир ~€3,000–5,000/год (не-ЕС; уточнять)', start: 'Октябрь', duration: '3 года', reqs: ['Аттестат о среднем образовании', 'Английский (IELTS 6.0+)'], scholarships: 'CEEPUS, Erasmus+, Ad futura', url: 'https://welcome.upr.si/student/choose/study-programmes-in-english/' },
    ],
  },
  {
    name: 'University of Nova Gorica', city: 'Нова-Горица', cc: 'si', type: 'Государственный', qs: null,
    programs: [
      { name: 'Физика и астрофизика', en: 'Physics and Astrophysics', faculty: 'School of Science', specialty: 'Естественные науки', degree: 'Bachelor', language: 'Английский', tuition: 3000, tuitionText: '€3,000/год (не-ЕС)', start: 'Октябрь', duration: '3 года', reqs: ['Аттестат о среднем образовании', 'Английский (IELTS 6.0+)'], scholarships: 'CEEPUS, Erasmus+, Ad futura', url: 'https://ung.si/en/education/fees/fees25/' },
      { name: 'Виноградарство и энология', en: 'Viticulture and Enology', faculty: 'School for Viticulture and Enology (Vipava)', specialty: 'Естественные науки', degree: 'Master', language: 'Английский', tuition: 3000, tuitionText: '€3,000/год (не-ЕС)', start: 'Октябрь', duration: '2 года', reqs: ['Диплом бакалавра (родственная область)', 'Английский (IELTS 6.0+)'], scholarships: 'CEEPUS, Erasmus+, Ad futura', url: 'https://ung.si/en/education/fees/fees25/' },
    ],
  },
  {
    name: 'GEA College', city: 'Любляна', cc: 'si', type: 'Частный', qs: null,
    programs: [
      { name: 'Предпринимательство', en: 'Entrepreneurship', faculty: 'Faculty of Entrepreneurship', specialty: 'Бизнес и управление', degree: 'Bachelor', language: 'Английский', tuition: 7350, tuitionText: '€7,350/год (не-ЕС) + сбор за зачисление €255', start: 'Октябрь', deadline: 'Ролловый приём (уточнять на сайте)', duration: '3 года', reqs: ['Аттестат о среднем образовании', 'Английский (IELTS 6.0+)'], scholarships: null, url: 'https://gea-college.si/en/fakulteta/entrepreneurship/tuition-fee/' },
    ],
  },

  // ─────────────────────────── ПОРТУГАЛИЯ ───────────────────────────
  {
    name: 'University of Lisbon', city: 'Лиссабон', cc: 'pt', type: 'Государственный', qs: 245,
    programs: [
      { name: 'Общая инженерия', en: 'General Engineering (GENI)', faculty: 'Instituto Superior Técnico', specialty: 'Инженерия', degree: 'Bachelor', language: 'Английский', tuition: 7000, tuitionText: '€7,000/год (не-ЕС)', start: 'Сентябрь', duration: '3 года (180 ECTS)', reqs: ['Полное среднее образование', 'Вступительные экзамены (математика, физика/химия)', 'Английский B1', 'International Student Statute'], scholarships: null, url: 'https://tecnico.ulisboa.pt/en/education/courses/undergraduate-programmes/general-engineering/' },
      { name: 'Наука о данных', en: 'Master in Data Science', faculty: 'Faculty of Sciences', specialty: 'IT и технологии', degree: 'Master', language: 'Английский', tuition: 3500, tuitionText: '€3,500/год (не-ЕС)', start: 'Сентябрь', duration: '2 года (120 ECTS)', reqs: ['Диплом бакалавра (естественные науки/инженерия)', 'Базовые статистика, алгебра, программирование', 'Английский'], scholarships: null, url: 'https://www.ulisboa.pt/en/curso/mestrado/data-science' },
      { name: 'Финансы', en: 'Master in Finance', faculty: 'ISEG Lisbon School of Economics & Management', specialty: 'Экономика и финансы', degree: 'Master', language: 'Английский', tuition: 8000, tuitionText: '€8,000 (1-й год) + €3,900 (2-й), всего €11,900 (не-ЕС)', start: 'Сентябрь', duration: '2 года (120 ECTS)', reqs: ['Бакалавр (управление/экономика/финансы/математика/смежное)', 'Конкурсный отбор + английский'], scholarships: 'Стипендии CFA/FRM/CAIA; Montepio Merit Award', url: 'https://www.iseg.ulisboa.pt/en/study/masters/finance/' },
    ],
  },
  {
    name: 'University of Porto', city: 'Порту', cc: 'pt', type: 'Государственный', qs: 275,
    programs: [
      { name: 'Менеджмент', en: 'Master in Management', faculty: 'School of Economics and Management (FEP)', specialty: 'Бизнес и управление', degree: 'Master', language: 'Английский', tuition: 5000, tuitionText: '€5,000/год (не-ЕС); CPLP €2,750/год', start: 'Сентябрь', duration: '2 года (120 ECTS)', reqs: ['Диплом бакалавра', 'Английский', 'Отбор по CV'], scholarships: null, url: 'https://www.up.pt/portal/en/study/masters-degrees/courses/fep/1081/' },
      { name: 'Мультимедиа', en: 'Master in Multimedia', faculty: 'Faculty of Engineering (FEUP)', specialty: 'Медиа и коммуникации', degree: 'Master', language: 'Английский/Португальский', tuition: 4700, tuitionText: '€4,700/год (не-ЕС); CPLP €2,600/год', start: 'Сентябрь', duration: '2 года (120 ECTS)', reqs: ['Диплом бакалавра', 'Портфолио/мотивация', 'Программа на португальском, адаптирована для англоязычных'], scholarships: null, url: 'https://www.up.pt/portal/en/study/masters-degrees/courses/feup/732/' },
    ],
  },
  {
    name: 'Nova School of Business and Economics (NOVA SBE)', city: 'Лиссабон (Каркавелуш)', cc: 'pt', type: 'Государственный', qs: null,
    programs: [
      { name: 'Экономика (бакалавр)', en: 'Bachelor in Economics', specialty: 'Экономика и финансы', degree: 'Bachelor', language: 'Английский', tuition: 7500, tuitionText: '€7,500/год (не-ЕС); €697/год (ЕС)', start: 'Сентябрь', deadline: '14 апреля – 16 июня 2026 (осенний набор)', duration: '3 года', reqs: ['Аттестат о полном среднем образовании', 'Высокий проходной балл (напр. A-Level AAB, математика)', 'Английский', 'Взнос за заявку €70'], scholarships: null, url: 'https://www.novasbe.unl.pt/en/programs/apply/bachelors/international-students' },
      { name: 'Финансы (магистр)', en: 'Master in Finance', specialty: 'Экономика и финансы', degree: 'Master', language: 'Английский', tuition: 14450, tuitionText: '€14,450 за программу (1,5 года, не-ЕС); €13,250 для ЕС', start: 'Сентябрь', duration: '3 семестра (1,5 года)', reqs: ['Бакалавр (экономика/менеджмент/смежное)', 'Английский', 'Регистрационный взнос €2,450 (не-ЕС)'], scholarships: null, url: 'https://www.novasbe.unl.pt/en/programs/masters/finance/fees' },
    ],
  },
  {
    name: 'NOVA Information Management School (NOVA IMS)', city: 'Лиссабон', cc: 'pt', type: 'Государственный', qs: null,
    programs: [
      { name: 'Наука о данных и продвинутая аналитика', en: 'Master in Data Science and Advanced Analytics (Data Science)', specialty: 'IT и технологии', degree: 'Master', language: 'Английский', tuition: 5300, tuitionText: '€8,000 за программу (не-ЕС): €5,300 (1 год) + €2,700 (2 год); €6,200 для ЕС', start: 'Сентябрь', deadline: '5 февраля – 5 марта 2026', duration: '2 года (120 ECTS)', reqs: ['Диплом бакалавра', 'Английский', 'Пре-регистрационный взнос €2,500 (не-ЕС)'], scholarships: null, url: 'https://novaims.unl.pt/en/education/programs/postgraduate-programs-and-master-degree-programs/master-degree-program-in-data-science-and-advanced-analytics-with-a-specialization-in-data-science/' },
    ],
  },
  {
    name: 'ISCTE – University Institute of Lisbon', city: 'Лиссабон', cc: 'pt', type: 'Государственный', qs: null,
    programs: [
      { name: 'Менеджмент (бакалавр)', en: 'Bachelor Degree in Management', specialty: 'Бизнес и управление', degree: 'Bachelor', language: 'Английский', tuition: 7000, tuitionText: '€7,000/год (не-ЕС)', start: 'Сентябрь', duration: '3 года (180 ECTS)', reqs: ['Аттестат о полном среднем образовании', 'Английский (есть полностью англоязычная группа)'], scholarships: null, url: 'https://www.iscte-iul.pt/course/4/bachelor-degree-in-management/conditions' },
      { name: 'Международный менеджмент', en: 'MSc in International Management', specialty: 'Бизнес и управление', degree: 'Master', language: 'Английский', tuition: 7000, tuitionText: '€9,800 за программу (не-ЕС): €7,000 (1 год) + €2,800 (2 год)', start: 'Сентябрь', duration: '2 года (120 ECTS)', reqs: ['Бакалавр по менеджменту или релевантный опыт', 'Английский'], scholarships: null, url: 'https://www.iscte-iul.pt/degree/code/B42/master-degree-in-international-management' },
    ],
  },
  {
    name: 'Católica Lisbon School of Business & Economics', city: 'Лиссабон', cc: 'pt', type: 'Частный', qs: null,
    programs: [
      { name: 'Международный менеджмент', en: 'International MSc in Management', specialty: 'Бизнес и управление', degree: 'Master', language: 'Английский', tuition: 10375, tuitionText: '€10,375/год + €700 регистрация; от €21,900 за программу (частный)', start: 'Сентябрь', duration: '2 года', reqs: ['Диплом бакалавра', 'GMAT/GRE (желательно)', 'Английский (TOEFL/IELTS)', 'CV + мотивационное письмо'], scholarships: 'Católica TOP+ — merit-стипендия (частичное покрытие)', url: 'https://www.clsbe.lisboa.ucp.pt/international-msc-management/fees-scholarships' },
      { name: 'Международные финансы', en: 'International MSc in Finance', specialty: 'Экономика и финансы', degree: 'Master', language: 'Английский', tuition: 11875, tuitionText: '€11,875/год + €700 регистрация; от €24,900 за программу (частный)', start: 'Сентябрь', duration: '2 года', reqs: ['Диплом бакалавра (желательно количественная подготовка)', 'GMAT/GRE', 'Английский (TOEFL/IELTS)', 'CV + мотивационное письмо'], scholarships: 'Católica TOP+ — merit-стипендия (частичное покрытие)', url: 'https://clsbe.lisboa.ucp.pt/international-msc-finance/fees-scholarships' },
    ],
  },
  {
    name: 'University of Coimbra', city: 'Коимбра', cc: 'pt', type: 'Государственный', qs: 386,
    programs: [
      { name: 'Биомедицинская инженерия', en: 'Master in Biomedical Engineering', specialty: 'Инженерия', degree: 'Master', language: 'Английский/Португальский', tuition: 7000, tuitionText: '€7,000/год (не-ЕС)', start: 'Сентябрь', duration: '2 года (120 ECTS)', reqs: ['Бакалавр (биомедицинская/родственная инженерия)', 'Английский: IELTS 6.5 / TOEFL 92'], scholarships: null, caveat: 'Сумма по общей тарифной сетке UC (страница цен 403) — перепроверить.', url: 'https://apps.uc.pt/courses/EN/course/9081' },
      { name: 'Медицина (интегрированный магистр)', en: 'Integrated Master in Medicine', specialty: 'Медицина и здоровье', degree: 'Master', language: 'Португальский', tuition: 18000, tuitionText: '≈€18,000/год (не-ЕС)', start: 'Сентябрь', duration: '6 лет (360 ECTS)', reqs: ['Полное среднее образование (спец. конкурс для иностранцев)', 'Обучение на португальском языке'], scholarships: null, caveat: 'Обучение на португальском — языковой барьер для абитуриентов. Сумма по тарифной сетке UC (403) — перепроверить.', url: 'https://apps.uc.pt/courses/en/course/5841' },
    ],
  },
  {
    name: 'University of Minho', city: 'Брага', cc: 'pt', type: 'Государственный', qs: null,
    programs: [
      { name: 'Английский язык, литература и культура', en: 'Master in English Language, Literature and Culture', specialty: 'Гуманитарные науки', degree: 'Master', language: 'Английский', tuition: 6500, tuitionText: '≈€6,500/год (не-ЕС, стандартная межд. ставка UMinho)', start: 'Сентябрь', duration: '2 года (120 ECTS)', reqs: ['Бакалавр по английскому языку или смежному', 'Английский C1', 'Мотивационное письмо на английском'], scholarships: null, caveat: 'Ставка приблизительная (не указана на странице программы) — перепроверить.', url: 'https://www.elach.uminho.pt/en/Study/Pages/Master/English-Language-Literature-and-Culture.aspx' },
    ],
  },
]

function buildCuratorNote(s: School, p: Prog): string {
  const parts: string[] = []
  if (p.faculty) parts.push(`${p.faculty}.`)
  if (p.caveat) parts.push(p.caveat)
  parts.push(CC_HEDGE[s.cc])
  return parts.join(' ')
}

async function main() {
  const totalSchools = SCHOOLS.length
  const totalPrograms = SCHOOLS.reduce((n, s) => n + s.programs.length, 0)
  console.log(`План: ${totalSchools} вузов, ${totalPrograms} программ (si/pt/tr)\n`)

  let schoolsInserted = 0, schoolsReused = 0, progInserted = 0, progSkipped = 0

  for (const s of SCHOOLS) {
    // Дедуп вуза: точное имя + страна
    const { data: existSchools } = await parser.from('schools')
      .select('id, name, country_code').eq('country_code', s.cc).ilike('name', s.name)
    let schoolId: number
    if (existSchools && existSchools.length) {
      schoolId = existSchools[0].id
      schoolsReused++
      console.log(`↺ вуз есть: ${s.name} (#${schoolId})`)
    } else {
      console.log(`＋ вуз: ${s.name} [${s.cc}] — ${s.city}${s.qs ? `, QS ${s.qs}` : ''}`)
      if (CONFIRM) {
        const { data, error } = await parser.from('schools').insert({
          name: s.name, city: s.city, country_code: s.cc,
          university_type: s.type, qs_rank: s.qs,
          curator_note: `Добавлено вручную (ресёрч GH, июль 2026).`,
          source: 'curator_gh',
        }).select('id').single()
        if (error) { console.error(`  ✗ вставка вуза: ${error.message}`); process.exit(1) }
        schoolId = data.id
        schoolsInserted++
      } else {
        schoolId = -1 // dry-run placeholder
        schoolsInserted++
      }
    }

    for (const p of s.programs) {
      // Дедуп программы: тот же вуз + похожее имя
      if (schoolId > 0) {
        const { data: existProg } = await parser.from('programs')
          .select('id').eq('school_id', schoolId).ilike('name', p.name)
        if (existProg && existProg.length) {
          progSkipped++
          console.log(`   ↺ программа есть: ${p.name}`)
          continue
        }
      }
      console.log(`   ＋ ${p.degree} · ${p.name} · ${p.specialty} · ${p.language} · ${p.tuitionText}`)
      if (CONFIRM && schoolId > 0) {
        const { error } = await parser.from('programs').insert({
          school_id: schoolId,
          name: p.name,
          program_description: p.faculty ? `${p.en} — ${p.faculty}` : p.en,
          specialty_group: p.specialty,
          degree_text: p.degree,
          language_text: p.language,
          tuition: p.tuition,
          tuition_text: p.tuitionText,
          start_date_text: p.start,
          deadline_text: p.deadline || CC_DEADLINE[s.cc],
          duration_text: p.duration,
          entry_requirements: p.reqs,
          scholarships_text: p.scholarships ?? null,
          curator_note: buildCuratorNote(s, p),
          source: 'curator_gh',
          source_url: p.url,
          course_website: p.url,
        })
        if (error) { console.error(`     ✗ вставка программы: ${error.message}`); process.exit(1) }
        progInserted++
      } else if (!CONFIRM) {
        progInserted++
      }
    }
  }

  console.log(`\nИтог: вузы +${schoolsInserted} (переиспользовано ${schoolsReused}), программы +${progInserted} (пропущено ${progSkipped})`)

  if (!CONFIRM) {
    console.log('\n⚠️ dry-run. Ничего не записано. Запусти с --confirm чтобы выполнить.')
    return
  }

  // Проверка через каталожный RPC
  console.log('\n=== Проверка search_programs по странам ===')
  for (const cc of ['si', 'pt', 'tr']) {
    const { data, error } = await parser.rpc('search_programs', {
      p_country: cc, p_limit: 5, p_offset: 0, p_count_cap: null,
    })
    if (error) { console.log(`  ${cc}: RPC error — ${error.message}`); continue }
    console.log(`  ${cc}: total = ${(data as any)?.total}`)
  }
}
main().catch(e => { console.error(e); process.exit(1) })
