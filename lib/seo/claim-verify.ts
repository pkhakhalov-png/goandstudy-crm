/**
 * Самостоятельный сбор подтверждений: система сама идёт в сеть за источником.
 *
 * Зачем это здесь, а не остаётся скриптом. Реестр фактов заполнял человек, и
 * пока он этого не сделал, ворота выпуска держали готовые статьи: десять
 * утверждений про стипендии CSC пролежали непроверенными две недели только
 * потому, что источник по Китаю никто не завёл. Ритм «статья в день» не может
 * зависеть от того, дошли ли у кого-то руки до блокнота.
 *
 * Роли разделены намеренно и менять это разделение нельзя:
 *
 *   модель  — ходит в сеть и предлагает, ГДЕ смотреть;
 *   код     — скачивает страницу и решает, подтверждено ли.
 *
 * Утверждение засчитывается, только если число и единица действительно найдены
 * в тексте страницы (findEvidence). Модель не может объявить факт
 * подтверждённым: ошибка в адресе стоит лишнего запроса, ошибка в
 * подтверждении стоила бы читателю неверной цифры.
 */
import { getAnthropic } from '@/lib/ai'
import { snapshotSource, findEvidence, verifyClaimAgainst } from './provenance'

export type VerifyClaim = {
  id: number
  subject_key: string
  kind: string
  statement: string
  value: string | null
  value_num: number | null
  unit: string | null
}

export type VerifyReport = {
  confirmed: number
  notFound: number
  sourcesAdded: number
  /** Поимённо — чтобы в результате задачи было видно, что именно подтвердилось. */
  confirmedIds: number[]
  notes: string[]
}

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
            url: { type: 'string', description: 'Прямая ссылка на страницу с фактами, не главная сайта и не оглавление.' },
            owner: { type: 'string', description: 'Кто издаёт страницу: ведомство, оператор программы, университет.' },
            kind: {
              type: 'string',
              enum: ['official_gov', 'official_org', 'university_program', 'other'],
              description: 'official_gov — государственный орган; official_org — оператор программы; university_program — страница вуза.',
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

type Proposed = { url: string; owner: string; kind: string; why: string }

function domainOf(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, '') } catch { return '' }
}

async function proposeSources(subject: string, claims: VerifyClaim[]): Promise<Proposed[]> {
  const list = claims
    .map((c) => `- [${c.kind}] ${c.statement}${c.value ? ` (значение: ${c.value}${c.unit ? ' ' + c.unit : ''})` : ''}`)
    .join('\n')
  const res = await getAnthropic().messages.create({
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
— агрегаторы, блоги агентств и посредники не годятся;
— если для разных утверждений нужны разные страницы — верни несколько.

Проверь ссылки поиском, прежде чем возвращать. Вызови predlozhit_istochniki ровно один раз.`,
    }],
  })
  const use = (res.content as any[]).find((b) => b.type === 'tool_use' && b.name === 'predlozhit_istochniki')
  return (use?.input?.sources ?? []) as Proposed[]
}

/** Источник заводим один раз; повторный прогон переиспользует строку. */
async function ensureSource(seo: any, s: Proposed, subject: string): Promise<number | null> {
  const { data: exist } = await seo.from('sources').select('id').eq('url', s.url).maybeSingle()
  if (exist) return exist.id
  const { data, error } = await seo.from('sources').insert({
    source_type: 'web', url: s.url, domain: domainOf(s.url),
    kind: ['official_gov', 'official_org', 'university_program'].includes(s.kind) ? s.kind : 'other',
    lang: 'en', active: true, added_by: 'autoverify', subject_key: subject,
    owner: s.owner, critical: false, recheck_hours: 24,
  }).select('id').single()
  if (error) return null
  return data.id
}

/**
 * Разобрать пачку неподтверждённых утверждений.
 *
 * Отбор идёт по `verified_at`, а не по `status`: подтверждённое утверждение
 * получает status 'active', и фильтр по слову «verified» брал бы уже
 * проверенные заново.
 */
export async function autoverifyClaims(
  seo: any,
  opts: { subject?: string | null; limit?: number } = {},
): Promise<VerifyReport> {
  const report: VerifyReport = { confirmed: 0, notFound: 0, sourcesAdded: 0, confirmedIds: [], notes: [] }

  let q = seo.from('claims')
    .select('id, subject_key, kind, statement, value, value_num, unit')
    .is('verified_at', null).order('id').limit(opts.limit ?? 20)
  if (opts.subject) q = q.eq('subject_key', opts.subject)
  const { data: claims } = await q
  if (!claims?.length) return report

  const bySubject = new Map<string, VerifyClaim[]>()
  for (const c of claims as VerifyClaim[]) {
    const list = bySubject.get(c.subject_key) ?? []
    list.push(c)
    bySubject.set(c.subject_key, list)
  }

  for (const [subject, list] of bySubject) {
    let proposed: Proposed[] = []
    try { proposed = await proposeSources(subject, list) }
    catch (e: any) { report.notes.push(`${subject}: поиск источников не удался — ${e?.message ?? e}`); continue }
    if (!proposed.length) { report.notes.push(`${subject}: модель не нашла источников`); continue }

    const pending = new Set(list.map((c) => c.id))

    for (const p of proposed) {
      if (!pending.size) break
      const sourceId = await ensureSource(seo, p, subject)
      if (!sourceId) { report.notes.push(`${domainOf(p.url)}: источник не завёлся`); continue }
      report.sourcesAdded++

      let snap
      try { snap = await snapshotSource(seo, sourceId, { maxAgeMin: 10 }) }
      catch (e: any) { report.notes.push(`${domainOf(p.url)}: снимок не снялся — ${e?.message ?? e}`); continue }
      if (snap.error) { report.notes.push(`${domainOf(p.url)}: ${snap.error}`); continue }

      for (const claim of list) {
        if (!pending.has(claim.id)) continue
        const found = findEvidence(snap.text, claim as any)
        if (!found) continue
        const ev = await verifyClaimAgainst(seo, claim.id, snap)
        if (!ev) continue
        pending.delete(claim.id)
        report.confirmed++
        report.confirmedIds.push(claim.id)
      }
    }
    report.notFound += pending.size
  }

  return report
}
