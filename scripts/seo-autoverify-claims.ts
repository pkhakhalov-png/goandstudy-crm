/**
 * Утверждения подтверждаются из сети, а не из заранее заведённого списка.
 *
 *   npx tsx scripts/seo-autoverify-claims.ts --subject cn          # показать
 *   npx tsx scripts/seo-autoverify-claims.ts --subject cn --apply  # записать
 *   npx tsx scripts/seo-autoverify-claims.ts --apply               # все предметы
 *
 * Зачем. Проверка умела сверять утверждение со страницей, но адрес страницы
 * заводил человек: нет строки в реестре источников — нечем подтверждать, и
 * статья не выходит. Десять утверждений про стипендии CSC так и лежали
 * непроверенными с 10 сентября, потому что источник по Китаю никто не завёл.
 *
 * Как устроено. Модель ходит в сеть и предлагает, ГДЕ смотреть — официальные
 * страницы по теме утверждения. Подтверждение остаётся machine-only: страницу
 * скачивает наш код, и утверждение засчитывается, только если число и единица
 * действительно найдены в её тексте (findEvidence). Модель не может объявить
 * факт подтверждённым — она может лишь показать, куда пойти проверять.
 * Разделение намеренное: ошибка модели в адресе стоит одного лишнего запроса,
 * ошибка модели в подтверждении стоила бы читателю неверной цифры.
 */
import { config } from 'dotenv'; import path from 'path'
config({ path: path.resolve(process.cwd(), '.env.local') })
import { createClient } from '@supabase/supabase-js'
import { getAnthropic } from '@/lib/ai'
import { snapshotSource, findEvidence, verifyClaimAgainst } from '@/lib/seo/provenance'

const c = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
)
const seo = c.schema('seo')
const APPLY = process.argv.includes('--apply')
const SUBJECT = process.argv.includes('--subject')
  ? process.argv[process.argv.indexOf('--subject') + 1]
  : null
const LIMIT = Number(process.argv.includes('--limit') ? process.argv[process.argv.indexOf('--limit') + 1] : 40)

const FIND_TOOL = {
  name: 'predlozhit_istochniki',
  description: 'Вернуть официальные страницы, на которых эти утверждения можно проверить.',
  input_schema: {
    type: 'object',
    properties: {
      sources: {
        type: 'array',
        description: 'От одной до пяти страниц, по убыванию авторитетности.',
        items: {
          type: 'object',
          properties: {
            url: { type: 'string', description: 'Прямая ссылка на страницу с фактами (не главная сайта, не PDF-каталог).' },
            owner: { type: 'string', description: 'Кто издаёт страницу: ведомство, совет, университет.' },
            kind: {
              type: 'string',
              enum: ['official_gov', 'official_org', 'university_program', 'other'],
              description: 'official_gov — государственный орган; official_org — официальный оператор программы (например China Scholarship Council); university_program — страница вуза.',
            },
            why: { type: 'string', description: 'Какие из перечисленных утверждений там должны быть.' },
          },
          required: ['url', 'owner', 'kind', 'why'],
        },
      },
    },
    required: ['sources'],
  },
}

type Claim = { id: number; subject_key: string; kind: string; statement: string; value: string | null; value_num: number | null; unit: string | null }

function domainOf(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, '') } catch { return '' }
}

/** Модель ищет в сети, где проверять. Подтверждать она не уполномочена. */
async function proposeSources(subject: string, claims: Claim[]) {
  const anthropic = getAnthropic()
  const list = claims.map((c) => `- [${c.kind}] ${c.statement}${c.value ? ` (значение: ${c.value}${c.unit ? ' ' + c.unit : ''})` : ''}`).join('\n')
  const res = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 4096,
    tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 8 }, FIND_TOOL] as any,
    messages: [{
      role: 'user',
      content: `Найди официальные страницы, на которых можно проверить эти утверждения (предмет: ${subject}).

${list}

Требования к ссылкам:
— первоисточник, а не пересказ: сайт ведомства, оператора программы или самого вуза;
— страница с самими цифрами, а не оглавление и не новость о них;
— по возможности англоязычная или местная официальная версия, агрегаторы и блоги агентств не годятся;
— если для разных утверждений нужны разные страницы — верни несколько.

Проверь ссылки поиском, прежде чем возвращать. Вызови predlozhit_istochniki ровно один раз.`,
    }],
  })
  const use = (res.content as any[]).find((b) => b.type === 'tool_use' && b.name === 'predlozhit_istochniki')
  return (use?.input?.sources ?? []) as { url: string; owner: string; kind: string; why: string }[]
}

/** Источник заводим один раз; повторный прогон переиспользует строку. */
async function ensureSource(s: { url: string; owner: string; kind: string }, subject: string): Promise<number | null> {
  const { data: exist } = await seo.from('sources').select('id').eq('url', s.url).maybeSingle()
  if (exist) return exist.id
  if (!APPLY) return null
  const { data, error } = await seo.from('sources').insert({
    source_type: 'web', url: s.url, domain: domainOf(s.url),
    kind: ['official_gov', 'official_org', 'university_program'].includes(s.kind) ? s.kind : 'other',
    lang: 'en', active: true, added_by: 'autoverify', subject_key: subject,
    owner: s.owner, critical: false, recheck_hours: 24,
  }).select('id').single()
  if (error) { console.log(`     ✗ источник не завёлся: ${error.message}`); return null }
  return data.id
}

async function main() {
  console.log(APPLY ? 'РЕЖИМ ЗАПИСИ' : 'режим показа — ничего не меняется, для записи добавь --apply')

  // Отбираем по verified_at, а не по status: подтверждённое утверждение
  // получает status='active', и фильтр по слову «verified» брал его снова —
  // первый прогон честно перепроверял уже подтверждённые три.
  let q = seo.from('claims')
    .select('id, subject_key, kind, statement, value, value_num, unit, status')
    .is('verified_at', null).order('id').limit(LIMIT)
  if (SUBJECT) q = q.eq('subject_key', SUBJECT)
  const { data: claims } = await q
  if (!claims?.length) { console.log('неподтверждённых утверждений нет'); return }

  const bySubject = new Map<string, Claim[]>()
  for (const c of claims as Claim[]) {
    const list = bySubject.get(c.subject_key) ?? []
    list.push(c)
    bySubject.set(c.subject_key, list)
  }
  console.log(`неподтверждённых: ${claims.length}, предметов: ${bySubject.size}\n`)

  let confirmed = 0, notFound = 0, sourcesAdded = 0

  for (const [subject, list] of bySubject) {
    console.log(`── предмет «${subject}», утверждений ${list.length}`)
    const proposed = await proposeSources(subject, list)
    if (!proposed.length) { console.log('   модель не нашла источников\n'); continue }

    const pending = new Set(list.map((c) => c.id))

    for (const p of proposed) {
      console.log(`   ${p.url}\n     ${p.owner} · ${p.kind} · ${p.why.slice(0, 100)}`)
      const sourceId = await ensureSource(p, subject)
      if (!sourceId) { console.log('     (в режиме показа источник не заводится — проверить нечем)'); continue }
      sourcesAdded++

      let snap
      try { snap = await snapshotSource(seo, sourceId, { maxAgeMin: 10 }) }
      catch (e: any) { console.log(`     ✗ снимок не снялся: ${e?.message ?? e}`); continue }
      if (snap.error) { console.log(`     ✗ страница не прочиталась: ${snap.error}`); continue }
      console.log(`     снимок #${snap.id}: HTTP ${snap.httpStatus}, ${snap.text.length} символов`)

      for (const claim of list) {
        if (!pending.has(claim.id)) continue
        const found = findEvidence(snap.text, claim as any)
        if (!found) continue
        console.log(`     ✓ #${claim.id} ${claim.statement.slice(0, 64)}`)
        console.log(`        «${found.quote.slice(0, 140)}»`)
        const ev = await verifyClaimAgainst(seo, claim.id, snap)
        if (ev) { pending.delete(claim.id); confirmed++ }
        else console.log('        ✗ запись подтверждения не прошла')
      }
    }

    for (const claim of list) {
      if (!pending.has(claim.id)) continue
      notFound++
      console.log(`   • #${claim.id} не нашлось ни на одной странице: ${claim.statement.slice(0, 64)}`)
    }
    console.log('')
  }

  console.log(`Итог: подтверждено ${confirmed}, не нашлось ${notFound}, источников заведено ${sourcesAdded}`)
  if (!APPLY) console.log('\n⚠️ Показ. Источники не заводились и проверка не выполнялась — запусти с --apply.')
}
main().catch((e) => { console.error('✗', e?.message ?? e); process.exit(1) })
