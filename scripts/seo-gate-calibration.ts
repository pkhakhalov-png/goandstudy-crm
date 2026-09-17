// Калибровка гейта достоверности (E2.11).
//
//   npx tsx scripts/seo-gate-calibration.ts            # теневой прогон, бесплатно
//   npx tsx scripts/seo-gate-calibration.ts --models   # с двумя проверками моделью
//   npx tsx scripts/seo-gate-calibration.ts --queue    # добавить статьи на согласовании
//
// Смысл калибровки в одном вопросе: если включить гейт в конвейер, сколько
// статей он остановит и сколько из них — зря. Ответ на второй вопрос даёт
// человек, поэтому отчёт заканчивается списком блокировок с цитатами и
// пустой колонкой для отметки.
//
// Ничего не меняется: гейт здесь только считает.
import { config } from 'dotenv'; import path from 'path'
import fs from 'fs'
config({ path: path.resolve(process.cwd(), '.env.local') })
import { createClient } from '@supabase/supabase-js'
import { reviewArticle, type Finding } from '../lib/seo/review-protocol'
import { subjectKeysFor } from '../lib/seo/claims'

const seo = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } }).schema('seo')
const WITH_MODELS = process.argv.includes('--models')
const WITH_QUEUE = process.argv.includes('--queue')

type Row = {
  articleId: number
  title: string
  status: string
  subject: string[]
  checked: number
  blocking: Finding[]
  warnings: Finding[]
  attention: number
  ms: number
}

async function spentUsd(since: string): Promise<number> {
  const { data } = await seo.from('runs').select('cost').gte('started_at', since)
  return (data ?? []).reduce((s: number, r: any) => s + Number(r.cost ?? 0), 0)
}

async function main() {
  const startedAt = new Date().toISOString()
  const statuses = WITH_QUEUE ? ['published', 'approved', 'ready_for_review'] : ['published']

  const { data: arts } = await seo.from('articles')
    .select('id, status, current_version_id, published_at').in('status', statuses).order('id')
  if (!arts?.length) { console.log('статей нет'); return }

  console.log(`статей: ${arts.length} (${statuses.join(', ')}), режим: ${WITH_MODELS ? 'с проверками моделью' : 'теневой'}\n`)

  const rows: Row[] = []
  for (const a of arts as any[]) {
    const { data: v } = a.current_version_id
      ? await seo.from('article_versions').select('title, body').eq('id', a.current_version_id).maybeSingle()
      : await seo.from('article_versions').select('title, body').eq('article_id', a.id)
          .order('version_no', { ascending: false }).limit(1).maybeSingle()
    if (!v?.body) { console.log(`#${a.id} — тела нет, пропуск`); continue }

    const subject = subjectKeysFor(String(v.title ?? ''))
    const t0 = Date.now()
    const res = await reviewArticle(seo, { text: v.body, subjectKeys: subject, askModels: WITH_MODELS, articleId: a.id })
    const ms = Date.now() - t0

    rows.push({
      articleId: a.id, title: String(v.title ?? '—'), status: a.status, subject,
      checked: res.checked, blocking: res.blocking, warnings: res.warnings,
      attention: res.attention.length, ms,
    })
    console.log(`#${a.id} ${String(v.title).slice(0, 48).padEnd(50)} ${res.blocking.length ? '✗' : '✓'} `
      + `проверено ${res.checked}, блокирует ${res.blocking.length}, предупреждает ${res.warnings.length}, ${ms} мс`)
  }

  const blocked = rows.filter((r) => r.blocking.length)
  const totalFindings = rows.reduce((s, r) => s + r.checked, 0)
  const totalBlocking = rows.reduce((s, r) => s + r.blocking.length, 0)
  const ms = rows.reduce((s, r) => s + r.ms, 0)
  const cost = WITH_MODELS ? await spentUsd(startedAt) : 0

  // По какой причине блокирует — важнее, чем сколько. Один просроченный
  // источник даёт восемь блокировок в одной статье, и это одна проблема.
  // Группируем по вердикту кода и его причине, а не по итоговому тексту:
  // в текст подмешаны объяснения проверок, и одинаковые по сути блокировки
  // расползались бы по разным строкам.
  const byReason = new Map<string, number>()
  for (const r of rows) for (const f of r.blocking) {
    const k = `${f.codeVerdict}: ${f.why.split(';')[0].trim()}`
    byReason.set(k, (byReason.get(k) ?? 0) + 1)
  }

  const pct = (n: number, d: number) => d ? `${Math.round((n / d) * 100)}%` : '—'

  // Охват. Без него доля блокировок читается как «гейт почти не мешает», хотя
  // на деле он про большинство статей просто не имеет что сказать.
  const { data: allClaims } = await seo.from('claims').select('subject_key')
  const subjectsWithClaims = new Set((allClaims ?? []).map((c: any) => c.subject_key))
  const silent = rows.filter((r) => r.checked === 0)
  const noFacts = silent.filter((r) => !r.subject.some((k) => subjectsWithClaims.has(k)))
  const covered = rows.length - silent.length

  const md: string[] = []
  md.push('# Калибровка гейта достоверности', '')
  md.push(`Прогон ${new Date().toISOString().slice(0, 10)}, режим: ${WITH_MODELS ? 'полный протокол с двумя проверками моделью' : 'теневой, вердикты вынес только код'}.`, '')
  md.push('**Гейт в конвейере не включён.** Этот отчёт — основание для решения, включать ли его.', '')

  if (rows.length < 20) {
    md.push(`> PRD просит калибровку на двадцати статьях. Опубликованных статей ${rows.length}`
      + `${WITH_QUEUE ? ' вместе с очередью согласования' : ''} — больше взять неоткуда.`
      + ' Доля ложных блокировок, посчитанная по такой выборке, имеет широкий доверительный интервал:'
      + ' одна ошибочная отметка сдвигает её на несколько процентов. Это не повод не считать, но повод'
      + ' не принимать по ней необратимых решений.', '')
  }

  md.push('## Что гейт вообще способен оценить', '')
  md.push('Это первое число, а не доля блокировок. Гейт проверяет утверждение, только если оно есть',
    'в реестре фактов или подпадает под проверку формулировок. Про статью, темы которой в реестре нет,',
    'он не говорит ничего — и это читается как «нарушений не найдено», хотя означает «не проверялось».', '')
  md.push('| Показатель | Значение |', '|---|---|')
  md.push(`| Статей, по которым гейт что-то проверил | ${covered} из ${rows.length} (${pct(covered, rows.length)}) |`)
  md.push(`| Статей, по которым он промолчал | ${silent.length} (${pct(silent.length, rows.length)}) |`)
  md.push(`| Из них — нет ни одного факта по их предмету | ${noFacts.length} |`)
  md.push(`| Предметов в реестре | ${[...subjectsWithClaims].join(', ') || '—'} |`)
  md.push('')
  md.push('Вывод, который стоит проговорить: включённый сегодня гейт пропустит любую статью про страну,',
    'которой нет в реестре, и пропустит молча. Это не аргумент против включения — это аргумент за то,',
    'чтобы молчание гейта не показывалось человеку как «проверено».', '')

  md.push('## Итог', '')
  md.push('| Показатель | Значение |', '|---|---|')
  md.push(`| Статей прогнано | ${rows.length} |`)
  md.push(`| Статей остановлено | ${blocked.length} (${pct(blocked.length, rows.length)}) |`)
  md.push(`| Замечаний всего | ${totalFindings} |`)
  md.push(`| Из них блокирующих | ${totalBlocking} |`)
  md.push(`| Замечаний на статью | ${(totalFindings / Math.max(rows.length, 1)).toFixed(1)} |`)
  md.push(`| Время на статью | ${Math.round(ms / Math.max(rows.length, 1))} мс |`)
  md.push(`| Стоимость прогона | ${WITH_MODELS ? '$' + cost.toFixed(2) : 'ноль — модели не вызывались'} |`)
  md.push(`| Стоимость одной статьи | ${WITH_MODELS ? '$' + (cost / Math.max(rows.length, 1)).toFixed(3) : '—'} |`)
  md.push('')

  md.push('## Почему блокирует', '')
  md.push('Причин меньше, чем блокировок: один просроченный источник останавливает столько статей,', 'сколько на него опирается.', '')
  md.push('| Причина | Блокировок |', '|---|---|')
  for (const [k, n] of [...byReason].sort((a, b) => b[1] - a[1])) md.push(`| ${k} | ${n} |`)
  md.push('')

  md.push('## По статьям', '')
  md.push('| Статья | Предмет | Проверено | Блокирует | Предупреждает |', '|---|---|---|---|---|')
  for (const r of rows) {
    md.push(`| #${r.articleId} ${r.title.slice(0, 44)} | ${r.subject.join(', ') || '—'} | ${r.checked} | ${r.blocking.length} | ${r.warnings.length} |`)
  }
  md.push('')

  md.push('## Блокировки — на проверку человеку', '')
  md.push('Ложная блокировка — это когда утверждение в статье верно, а гейт его остановил.', 'Отметить в последней колонке: `да` — блокировка ложная, `нет` — справедливая.', '')
  md.push('| Статья | Утверждение | Вердикт | Почему | Ложная? |', '|---|---|---|---|---|')
  for (const r of rows) for (const f of r.blocking) {
    const frag = f.statement.fragment.replace(/\|/g, '\\|').slice(0, 70)
    const why = f.why.replace(/\|/g, '\\|').slice(0, 80)
    md.push(`| #${r.articleId} | ${frag} | ${f.verdict} | ${why} |  |`)
  }
  md.push('')

  md.push('## Что делать с этим числом', '')
  md.push('PRD: если доля ложных блокировок выше 20% — сначала правка политик, только потом включение', 'гейта в конвейер.', '')
  md.push('Считать так: доля ложных = отмеченных `да` / всех строк в таблице выше.', '')

  fs.writeFileSync('docs/gate-calibration.md', md.join('\n') + '\n')

  console.log(`\nгейт смог оценить: ${covered} статей из ${rows.length} (${pct(covered, rows.length)}); молчал по ${silent.length}, из них ${noFacts.length} — нет фактов по предмету`)
  console.log(`статей остановлено: ${blocked.length} из ${rows.length} (${pct(blocked.length, rows.length)})`)
  console.log(`замечаний: ${totalFindings}, из них блокирующих ${totalBlocking}`)
  console.log(`причин блокировки: ${byReason.size} — сильно меньше, чем самих блокировок`)
  console.log(`время: ${Math.round(ms / Math.max(rows.length, 1))} мс на статью`)
  if (WITH_MODELS) console.log(`стоимость: $${cost.toFixed(2)} за прогон, $${(cost / Math.max(rows.length, 1)).toFixed(3)} за статью`)
  console.log('\nотчёт: docs/gate-calibration.md')
}
main()
