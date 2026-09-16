import { config } from 'dotenv'
import path from 'path'
import { createClient } from '@supabase/supabase-js'
config({ path: path.resolve(process.cwd(), '.env.local') })
const seo = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } }).schema('seo') as any

const URL_ = 'https://www.chula.ac.th/en/academics/admissions/tuition-and-fees/'
const SUBJECT = 'Чулалонгкорн, международные программы'
// Полгода — столько живёт факт о стоимости по политике реестра (claim_policy).
const EXPIRES = new Date(Date.now() + 180 * 864e5).toISOString()

const CLAIMS = [
  { kind: 'tuition_fee', statement: 'Бакалавриат Чулалонгкорна для иностранцев: 76 000–106 000 батов за семестр в зависимости от направления', value: '76000-106000', value_num: 106000, unit: 'thb', qualifiers: { degree_level: 'bachelor', per: 'semester', source_url: URL_, official_schedule: 'B.E. 2562 (2019)' } },
  { kind: 'tuition_fee', statement: 'Магистратура и аспирантура Чулалонгкорна: 76 000–133 900 батов за семестр', value: '76000-133900', value_num: 133900, unit: 'thb', qualifiers: { degree_level: 'master', per: 'semester', source_url: URL_, official_schedule: 'B.E. 2562 (2019)' } },
  { kind: 'tuition_fee', statement: 'Самое дорогое направление бакалавриата — Life Science (1): 106 000 батов за семестр', value: '106000', value_num: 106000, unit: 'thb', qualifiers: { degree_level: 'bachelor', field: 'Life Science (1)', per: 'semester', source_url: URL_ } },
  { kind: 'tuition_fee', statement: 'Гуманитарные и социальные направления бакалавриата — 76 000 батов за семестр', value: '76000', value_num: 76000, unit: 'thb', qualifiers: { degree_level: 'bachelor', field: 'Arts, Social Science', per: 'semester', source_url: URL_ } },
  { kind: 'tuition_fee', statement: 'Студенты без получения степени (non-degree), бакалавриат: 18 990–26 510 батов за семестр', value: '18990-26510', value_num: 26510, unit: 'thb', qualifiers: { degree_level: 'non_degree_bachelor', per: 'semester', source_url: URL_ } },
  { kind: 'tuition_fee', statement: 'Студенты без получения степени (non-degree), магистратура: 42 610–66 970 батов за семестр', value: '42610-66970', value_num: 66970, unit: 'thb', qualifiers: { degree_level: 'non_degree_master', per: 'semester', source_url: URL_ } },
  { kind: 'tuition_fee', statement: 'Долларовые суммы на странице университета пересчитаны по курсу 34,26 бата за доллар на 12 апреля 2023 года — это не сегодняшний курс', value: '34.26', value_num: 34.26, unit: 'thb_per_usd', qualifiers: { as_of: '2023-04-12', source_url: URL_ } },
  { kind: 'tuition_fee', statement: 'В стоимость обучения не входят программные сборы (Program Fees): они зависят от конкретной программы', value: null, value_num: null, unit: null, qualifiers: { source_url: URL_ } },
  { kind: 'tuition_fee', statement: 'Тарифы не распространяются на Petroleum and Petrochemical College: у него своя сетка цен', value: null, value_num: null, unit: null, qualifiers: { source_url: URL_ } },
]

async function main() {
  const { data: existing } = await seo.from('sources').select('id').eq('url', URL_).maybeSingle()
  const { error: srcErr } = existing ? { error: null } : await seo.from('sources').insert({
    source_type: 'university_program', url: URL_, domain: 'chula.ac.th',
    kind: 'tuition_fee', lang: 'en', active: true, allowlisted: true, added_by: 'owner_request',
  })
  console.log(srcErr ? `источник: ✗ ${srcErr.message}` : 'источник: ✓ записан')

  const rows = CLAIMS.map((c) => ({
    ...c, subject: SUBJECT, subject_key: 'th',
    confidence: 'single_source', status: 'active', expires_at: EXPIRES,
  }))
  const { error, data } = await seo.from('claims').insert(rows).select('id')
  console.log(error ? `факты: ✗ ${error.message}` : `факты: ✓ добавлено ${data.length}`)
}
main()
