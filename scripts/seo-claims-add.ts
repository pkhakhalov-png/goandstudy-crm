// Внесение фактов в реестр — то, что диктует куратор.
//
//   npx tsx scripts/seo-claims-add.ts china     # заготовка по Китаю от куратора
//   npx tsx scripts/seo-claims-add.ts --list cn # что уже есть
//
// Факты от куратора идут как single_source: один источник, пусть и живой эксперт.
// В статье такие числа подаются с оговоркой «обычно», «как правило» — пока их
// не подтвердит официальный источник.
import { config } from 'dotenv'; import path from 'path'
import { createClient } from '@supabase/supabase-js'
config({ path: path.resolve(process.cwd(), '.env.local') })

const seo = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } }).schema('seo')

type Draft = {
  kind: string; subject: string; subject_key: string; statement: string
  value?: string; value_num?: number; unit?: string; qualifiers?: Record<string, any>
}

/** Продиктовано куратором по Китаю. Числа не выдуманы конвейером — их дал человек. */
const CHINA: Draft[] = [
  { kind: 'scholarship', subject: 'CSC, стипендия правительства КНР', subject_key: 'cn',
    statement: 'Стипендия CSC для бакалавриата — около 2 500 ¥ в месяц', value: '2500', value_num: 2500, unit: 'cny',
    qualifiers: { degree_level: 'bachelor', program: 'CSC' } },
  { kind: 'scholarship', subject: 'CSC, стипендия правительства КНР', subject_key: 'cn',
    statement: 'Стипендия CSC для магистратуры — около 3 000 ¥ в месяц', value: '3000', value_num: 3000, unit: 'cny',
    qualifiers: { degree_level: 'master', program: 'CSC' } },
  { kind: 'scholarship', subject: 'CSC, стипендия правительства КНР', subject_key: 'cn',
    statement: 'Стипендия CSC для аспирантуры — около 3 500 ¥ в месяц', value: '3500', value_num: 3500, unit: 'cny',
    qualifiers: { degree_level: 'phd', program: 'CSC' } },
  { kind: 'eligibility', subject: 'Возрастные рамки CSC', subject_key: 'cn',
    statement: 'На бакалавриат по CSC принимают до 25 лет', value: '25', value_num: 25, unit: 'years',
    qualifiers: { degree_level: 'bachelor', program: 'CSC' } },
  { kind: 'eligibility', subject: 'Возрастные рамки CSC', subject_key: 'cn',
    statement: 'На магистратуру по CSC принимают до 35 лет', value: '35', value_num: 35, unit: 'years',
    qualifiers: { degree_level: 'master', program: 'CSC' } },
  { kind: 'eligibility', subject: 'Возрастные рамки CSC', subject_key: 'cn',
    statement: 'На аспирантуру по CSC принимают до 40 лет', value: '40', value_num: 40, unit: 'years',
    qualifiers: { degree_level: 'phd', program: 'CSC' } },
  { kind: 'eligibility', subject: 'Возрастные рамки CSC', subject_key: 'cn',
    statement: 'На языковые стажировки по CSC принимают до 45 лет', value: '45', value_num: 45, unit: 'years',
    qualifiers: { degree_level: 'language', program: 'CSC' } },
  { kind: 'scholarship', subject: 'Провинциальные программы КНР', subject_key: 'cn',
    statement: 'Помимо CSC есть провинциальные программы: Shanghai, Beijing, Jiangsu',
    qualifiers: { program: 'provincial' } },
  { kind: 'practice_vs_official', subject: 'Провинциальные программы КНР', subject_key: 'cn',
    statement: 'Провинциальные программы обычно не покрывают языковые курсы, а Shanghai исключает языковых студентов',
    qualifiers: { program: 'provincial' } },
  { kind: 'system_basics', subject: 'Стипендия для изучающих китайский', subject_key: 'cn',
    statement: 'Программа для изучающих китайский называется «Международная стипендия преподавателей китайского языка» — прежнее название «институты Конфуция» устарело' },
]

const SETS: Record<string, { key: string; drafts: Draft[] }> = {
  china: { key: 'cn', drafts: CHINA },
}

async function main() {
  const arg = process.argv[2]
  if (arg === '--list') {
    const key = process.argv[3] ?? 'cn'
    const { data } = await seo.from('claims').select('kind,statement,confidence,expires_at').eq('subject_key', key).eq('status', 'active')
    console.log(`фактов по «${key}»: ${(data ?? []).length}`)
    for (const c of data ?? []) console.log(`  [${c.kind}/${c.confidence}] ${c.statement}`)
    return
  }

  const set = SETS[arg ?? '']
  if (!set) { console.error(`Наборы: ${Object.keys(SETS).join(', ')}`); process.exit(1) }

  // Источник — живой эксперт, а не сайт
  const { data: src, error: serr } = await seo.from('sources')
    .upsert({ source_type: 'internal_expert', locator: 'expert:curator_china', kind: 'internal_expert', lang: 'ru', added_by: 'human' },
      { onConflict: 'locator' })
    .select('id').maybeSingle()
  if (serr) console.log(`источник: ${serr.message}`)

  let added = 0, skipped = 0
  for (const d of set.drafts) {
    const { data: exists } = await seo.from('claims').select('id')
      .eq('subject_key', d.subject_key).eq('statement', d.statement).eq('status', 'active').maybeSingle()
    if (exists) { skipped++; continue }

    const { data: pol } = await seo.from('claim_policy').select('default_ttl').eq('kind', d.kind).single()
    const ttlDays = Number(String(pol?.default_ttl ?? '180 days').match(/\d+/)?.[0] ?? 180)
    const { error } = await seo.from('claims').insert({
      kind: d.kind, subject: d.subject, subject_key: d.subject_key, statement: d.statement,
      value: d.value ?? null, value_num: d.value_num ?? null, unit: d.unit ?? null,
      qualifiers: d.qualifiers ?? {},
      confidence: 'single_source',
      expires_at: new Date(Date.now() + ttlDays * 864e5).toISOString(),
      status: 'active',
    })
    if (error) console.log(`  ✗ ${d.statement.slice(0, 50)}: ${error.message}`)
    else added++
  }
  console.log(`Внесено: ${added}, уже было: ${skipped}`)
  console.log(`Источник — куратор${src?.id ? ` (sources.id=${src.id})` : ''}. Уверенность: один источник.`)
  console.log('В статье такие числа пойдут с оговоркой «обычно» — пока их не подтвердит официальный портал.')
}
main().catch((e) => { console.error('✗', e.message || e); process.exit(1) })
