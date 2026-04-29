/**
 * Классифицирует все парсер-программы по 12 специальностям через keyword-rules.
 * Программы с непонятными именами получают 'Другое'.
 */

import { config } from 'dotenv'
import path from 'path'
import { createClient } from '@supabase/supabase-js'

config({ path: path.resolve(process.cwd(), '.env.local') })

const sb = createClient(
  process.env.NEXT_PUBLIC_PARSER_SUPABASE_URL!,
  process.env.PARSER_SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } },
)

const isDry = process.argv.includes('--dry')

// Порядок важен — первый совпавший выигрывает
const RULES: { specialty: string; keywords: RegExp }[] = [
  { specialty: 'IT и технологии', keywords: /\b(computer|computing|software|data|cyber|cybersecurity|ai|artificial intelligence|machine learning|programming|web dev|cloud|devops|robotic|robotics|game(s)? dev|информатик|программирован|програмірован|инфорком)\b/i },
  { specialty: 'Право', keywords: /\b(law|jurisprudence|legal|justice|criminolog|llb|llm|право|юридич|юриспруд|crimin)\b/i },
  { specialty: 'Медицина и здоровье', keywords: /\b(medicine|medical|nursing|nurs|dental|pharmacy|pharmacol|public health|nutrition|veterinar|biomed|paramedic|health|медицин|здравоохран|стоматолог|фармац|сестринск|ветеринар)\b/i },
  { specialty: 'Инженерия', keywords: /\b(engineering|engineer|mechanical|electrical|civil|aerospace|aeronautic|chemical|petroleum|mining|nuclear|automotive|robot|инженер|механиз|инжен|механич|электротех|строитель)\b/i },
  { specialty: 'Бизнес и управление', keywords: /\b(business|management|mba|administration|hr|human resources|leadership|entrepreneur|operation|supply chain|logistic|project manag|бизнес|управлен|менедж|администрирование|управление проект|логистик|предприним)\b/i },
  { specialty: 'Экономика и финансы', keywords: /\b(econom|finance|financial|accounting|banking|investment|insurance|economic|actuarial|financ|эконом|финанс|бухгалтер|банк|страхов|инвестир|актуарн)\b/i },
  { specialty: 'Архитектура', keywords: /\b(architectur|urban planning|city planning|landscape architect|архитектур|градостро)\b/i },
  { specialty: 'Дизайн и искусство', keywords: /\b(design|art|fine art|fashion|graphic|visual art|illustration|interior design|industrial design|jewellery|sculpture|painting|photography|film|cinema|theatre|theater|drama|music|performing|дизайн|искусств|графич|мода|фотограф|кино|театр|музык)\b/i },
  { specialty: 'Гуманитарные науки', keywords: /\b(history|histor|literature|philosophy|theology|religious studies|cultural|classics|linguist|philolog|history of art|liberal arts|humanit|истори|литератур|философ|теолог|религиоведен|лингвистик|филолог|культурологии)\b/i },
  { specialty: 'Естественные науки', keywords: /\b(physic|chem|biology|biolog|geology|geosci|astronom|astrophys|earth science|environmental|ecology|mathematic|maths|statistic|physical|natural science|материал|материалов|biotechnol|biochem|molecular|microbiolog|agricultur|оптикa|физик|химия|химич|биологи|геологи|астроном|математик|статистик|экологи|агроном|материаловед)\b/i },
  { specialty: 'Социальные науки', keywords: /\b(psycholog|sociolog|anthropolog|political|public policy|public administr|international relation|social work|social science|criminal justice|развит|психоло|социолог|антрополог|политолог|международные отношения|социальн)\b/i },
  { specialty: 'Образование', keywords: /\b(education|teaching|teacher|pedagog|early childhood|primary education|secondary education|tesol|elt|образовани|педагог|преподава|учительск)\b/i },
  { specialty: 'Медиа и коммуникации', keywords: /\b(media|journalism|communication|broadcast|public relations|pr |advertising|marketing|digital media|content|publishing|медиа|журнал|коммуникац|реклам|маркетинг|связи с общественностью)\b/i },
  { specialty: 'Туризм и гостиничный', keywords: /\b(tourism|hospitality|hotel|culinary|gastronom|event managem|туризм|гостинич|отель|кулинар)\b/i },
  { specialty: 'Языковые курсы', keywords: /\b(english|french|german|spanish|italian|chinese|japanese|esl|efl|language course|foundation language|pre-sessional|english as a second|академический английский|язык препода|препода язык|русский как иностранн|english pathway)\b/i },
]

function classify(name: string, rawData: any): string {
  const t = name + ' ' + (rawData?.attributes?.level_text || '')
  for (const r of RULES) {
    if (r.keywords.test(t)) return r.specialty
  }
  return 'Другое'
}

async function main() {
  console.log('mode:', isDry ? 'DRY' : 'REAL')

  const STATS: Record<string, number> = {}
  let processed = 0
  let updated = 0

  // Process in batches
  while (true) {
    const { data: chunk } = await sb
      .from('programs')
      .select('id, name, raw_data')
      .is('specialty_group', null)
      .order('id')
      .limit(1000)
    if (!chunk || chunk.length === 0) break

    const updates: { id: number; specialty_group: string }[] = chunk.map((p: any) => {
      const sp = classify(p.name || '', p.raw_data)
      STATS[sp] = (STATS[sp] || 0) + 1
      return { id: p.id, specialty_group: sp }
    })

    if (isDry) {
      // В dry — выходим после первой пачки чтобы не зациклиться
      console.log('(dry) sample classifications from first 1000:')
      for (let i = 0; i < Math.min(10, updates.length); i++) {
        console.log('  ', chunk[i].name, '→', updates[i].specialty_group)
      }
      processed += chunk.length
      break
    }

    // Update via single SQL UPDATE per chunk grouped by specialty
    const groups = new Map<string, number[]>()
    for (const u of updates) {
      const arr = groups.get(u.specialty_group) || []
      arr.push(u.id)
      groups.set(u.specialty_group, arr)
    }
    for (const [sp, ids] of groups) {
      const { error } = await sb.from('programs').update({ specialty_group: sp }).in('id', ids)
      if (error) { console.error('update err:', error.message); process.exit(1) }
      updated += ids.length
    }
    processed += chunk.length
    console.log(`  processed ${processed}, updated ${updated}`)
    if (chunk.length < 1000) break
  }

  console.log('\nStats by specialty:')
  for (const [k, v] of Object.entries(STATS).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${k}: ${v}`)
  }
}

main().catch(e => { console.error(e); process.exit(1) })
