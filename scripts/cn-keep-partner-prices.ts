/**
 * Снимает у китайских программ денежные подписи, которые проставил ИИ.
 *
 *   npx tsx scripts/cn-keep-partner-prices.ts            # показать
 *   npx tsx scripts/cn-keep-partner-prices.ts --confirm  # применить
 *
 * Страница программы берёт цену так:
 *   curatorData.gross_tuition_label || program.tuition_text
 * то есть подпись из program_curator_data ПЕРЕКРЫВАЕТ цену, заведённую руками.
 *
 * После прогона /api/ai/fill-program по Китаю это дало прямой вред: у половины
 * программ модель нашла стоимость магистратуры там, где партнёр продаёт
 * бакалавриат (Ухань 38,000 против 28,000; Харбин 34,000 против 26,000;
 * Нанкин «22,000 (Master's)» против 16,000), а у Zhejiang Gongshang подпись
 * вышла честной, но бесполезной — «tuition not explicitly listed in search
 * results». Плюс все подписи на английском в русском интерфейсе.
 *
 * Дедлайны, IELTS/TOEFL, сборы и ссылки на источники модель добыла полезные —
 * их не трогаем. Снимаем только денежные подписи, чтобы наверх вернулись
 * цифры партнёра. Заполнить их заново можно руками в карточке программы.
 */
import { config } from 'dotenv'; import path from 'path'
import { createClient } from '@supabase/supabase-js'
config({ path: path.resolve(process.cwd(), '.env.local') })

const CONFIRM = process.argv.includes('--confirm')
const parser = createClient(
  process.env.NEXT_PUBLIC_PARSER_SUPABASE_URL!,
  process.env.PARSER_SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
)
const main_ = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
)

async function main() {
  const { data: schools } = await parser.from('schools').select('id, name').eq('country_code', 'cn')
  const byId = new Map((schools ?? []).map(s => [s.id, s.name]))
  const { data: progs } = await parser.from('programs')
    .select('id, school_id, name, tuition_text, living_cost_text')
    .in('school_id', (schools ?? []).map(s => s.id)).order('id')

  const { data: cd } = await main_.from('program_curator_data')
    .select('program_id, gross_tuition_label, cost_of_living_label')
    .in('program_id', (progs ?? []).map(p => p.id))
  const cdById = new Map((cd ?? []).map((r: any) => [r.program_id, r]))

  let n = 0
  for (const p of progs ?? []) {
    const c: any = cdById.get(p.id)
    if (!c) continue
    const clearing: Record<string, null> = {}
    if (c.gross_tuition_label) clearing.gross_tuition_label = null
    if (c.cost_of_living_label) clearing.cost_of_living_label = null
    if (!Object.keys(clearing).length) continue

    console.log(`${byId.get(p.school_id)} · ${p.name}`)
    if ('gross_tuition_label' in clearing) {
      console.log(`   цена:  «${c.gross_tuition_label}» → «${p.tuition_text}» (партнёр)`)
    }
    if ('cost_of_living_label' in clearing) {
      console.log(`   жильё: «${c.cost_of_living_label}» → «${p.living_cost_text}» (партнёр)`)
    }
    if (CONFIRM) {
      const { error } = await main_.from('program_curator_data')
        .update(clearing).eq('program_id', p.id)
      if (error) { console.error(`   ✗ ${error.message}`); process.exit(1) }
    }
    n++
  }

  console.log(`\nПрограмм затронуто: ${n}`)
  if (!CONFIRM) console.log('⚠️ Показ. Запусти с --confirm.')
}
main().catch(e => { console.error(e); process.exit(1) })
