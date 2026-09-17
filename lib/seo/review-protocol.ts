/**
 * Протокол проверки статьи перед выпуском (E2.8).
 *
 * Порядок жёсткий и в нём весь смысл:
 *
 *   1. Код извлекает числа, даты и ссылки. Отдельно ловятся категоричные
 *      формулировки без чисел — в «визу дают всем» сверять нечего, а стоит она
 *      читателю отказа.
 *   2. Находки объединяются и дедуплицируются: одно и то же число, найденное
 *      двумя способами, — одно замечание, а не два.
 *   3. КОД выносит вердикт по доказательствам. Не модель. Есть дословная
 *      выдержка из источника с непросроченной годностью — supported; нет
 *      выдержки — insufficient; выдержка есть, но годность кончилась — stale.
 *   4. Только после этого работают две проверки моделью. Они видят утверждение
 *      и выдержку, но не видят ответов друг друга и не видят вердикта кода.
 *   5. Ревьюер может ухудшить вердикт и не может его улучшить.
 *
 * Пятое правило — это и есть гейт этапа: «неподтверждённый факт блокируется
 * даже при согласии обоих ревьюеров». Если бы ревьюер мог поднять insufficient
 * до supported, вся доказательная часть свелась бы к мнению модели о том, врёт
 * ли другая модель.
 *
 * О формулировках (E2.10). Это НЕ два независимых эксперта. Это два прогона
 * языковых моделей — сегодня вообще одной и той же модели одного провайдера,
 * см. `reviewersNote()`. Ошибаются они коррелированно: то, что пропустит одна,
 * с большой вероятностью пропустит и вторая. Защита здесь не в согласии двоих,
 * а в обязательном первоисточнике, который проверяет код. Поэтому здесь нет
 * ни средних баллов, ни голосования: разногласие не усредняется, а выносится
 * человеку.
 */
import { getAnthropic } from '../ai'
import { withSpend } from './spend'
import { resolveRole } from './model-roles'
import { expiryFor, type Expiry } from './expiry'
import { findSemanticClaims } from './semantic-claims'
import { CRITICAL_KINDS, isUsedInText, type ClaimWithSources } from './fact-gate'

export type Verdict = 'supported' | 'contradicted' | 'insufficient' | 'stale'

/** От безобидного к тяжёлому. Из двух вердиктов всегда берётся тяжёлый. */
const SEVERITY: Record<Verdict, number> = { supported: 0, stale: 1, insufficient: 2, contradicted: 3 }

export function worst(a: Verdict, b: Verdict): Verdict {
  return SEVERITY[a] >= SEVERITY[b] ? a : b
}

export type Statement = {
  /** Что именно утверждается — фрагмент статьи, а не пересказ. */
  fragment: string
  offset: number
  kind: string
  claimId: number | null
  via: 'реестр' | 'формулировка'
}

export type CodeCheck = {
  statement: Statement
  verdict: Verdict
  evidenceId: number | null
  quote: string | null
  why: string
  critical: boolean
  expiry: Expiry | null
}

export type ReviewerNote = {
  reviewer: string
  claimId: number | null
  fragment: string
  evidenceId: number | null
  verdict: Verdict
  explanation: string
  suggestedFix: string | null
}

export type Finding = {
  statement: Statement
  /** Итог: тяжелейший из вердикта кода и вердиктов проверок. */
  verdict: Verdict
  level: 'blocking' | 'warning'
  codeVerdict: Verdict
  notes: ReviewerNote[]
  /** Проверки разошлись — решает человек, а не большинство. */
  disagreement: boolean
  why: string
  quote: string | null
  evidenceId: number | null
}

export type ReviewResult = {
  findings: Finding[]
  blocking: Finding[]
  warnings: Finding[]
  /** Разногласия проверок: в очередь внимания, не в блокировку и не в тишину. */
  attention: Finding[]
  checked: number
  reviewersUsed: string[]
  note: string
  costUsd: number
}

/** Сколько кругов ремонта допускает протокол. Дальше — человеку. */
export const MAX_REPAIR_CYCLES = 2

/**
 * Честная подпись под результатом.
 *
 * Если обе проверки идут одной моделью одного провайдера, «две проверки» — это
 * два прогона одного и того же, и говорить о разных источниках ошибки нельзя.
 */
export function reviewersNote(a: { provider: string; model: string }, b: { provider: string; model: string }): string {
  const same = a.provider === b.provider && a.model === b.model
  if (same) {
    return `обе проверки — ${a.provider}/${a.model}: это два прогона одной модели, ошибки у них общие, а не независимые. `
      + 'Защита здесь — обязательная выдержка из первоисточника, а не согласие проверок между собой'
  }
  return `проверки: ${a.provider}/${a.model} и ${b.provider}/${b.model}. Разные провайдеры, но риск ошибки связанный — `
    + 'обе обучены на пересекающихся данных. Защита — обязательная выдержка из первоисточника'
}

/** Извлечение и дедупликация: одно утверждение — одно замечание. */
export function mergeStatements(fromRegistry: Statement[], fromWording: Statement[]): Statement[] {
  const out: Statement[] = []
  const seen = new Map<string, Statement>()
  const key = (s: Statement) => `${s.kind}|${s.fragment.trim().toLowerCase().replace(/\s+/g, ' ')}`

  for (const s of [...fromRegistry, ...fromWording]) {
    const k = key(s)
    const prev = seen.get(k)
    // Один фрагмент, найденный двумя способами, — одно замечание. Оставляем
    // тот, у которого есть связь с реестром: по нему есть что проверять.
    if (prev) { if (!prev.claimId && s.claimId) Object.assign(prev, s); continue }
    // Перекрытие по месту в тексте: находка внутри уже найденного фрагмента —
    // та же находка, увиденная крупнее.
    const overlap = out.find((o) => Math.abs(o.offset - s.offset) < 40
      && (o.fragment.includes(s.fragment) || s.fragment.includes(o.fragment)))
    if (overlap) { if (!overlap.claimId && s.claimId) Object.assign(overlap, s); continue }
    seen.set(k, s); out.push(s)
  }
  return out.sort((a, b) => a.offset - b.offset)
}

/**
 * Вердикт кода: единственный, который может сказать «подтверждено».
 *
 * Модель здесь не участвует намеренно. Подтверждение — это наличие дословной
 * выдержки из источника, а не мнение о правдоподобности.
 */
export function codeVerdict(
  s: Statement,
  evidence: { id: number; quote: string } | null,
  expiry: Expiry | null,
): CodeCheck {
  const critical = CRITICAL_KINDS.has(s.kind)
  if (!evidence) {
    return {
      statement: s, verdict: 'insufficient', evidenceId: null, quote: null, critical, expiry,
      why: s.claimId
        ? 'утверждение есть в реестре, но дословной выдержки из источника под ним нет'
        : 'категоричная формулировка без источника: сверять нечего, подтвердить нечем',
    }
  }
  if (expiry?.expired) {
    return {
      statement: s, verdict: 'stale', evidenceId: evidence.id, quote: evidence.quote, critical, expiry,
      why: expiry.neverVerified
        ? 'подтверждение ни разу не проверялось'
        : `годность кончилась ${expiry.at?.toISOString().slice(0, 10)} — ${expiry.reason}`,
    }
  }
  return {
    statement: s, verdict: 'supported', evidenceId: evidence.id, quote: evidence.quote, critical, expiry,
    why: `подтверждено выдержкой из источника, годно до ${expiry?.at?.toISOString().slice(0, 10) ?? '—'}`,
  }
}

/**
 * Свести вердикт кода с вердиктами проверок.
 *
 * Берётся тяжелейший. Проверка может сказать «источник говорит обратное» и
 * этим ухудшить supported до contradicted; сказать «да всё нормально» и этим
 * улучшить insufficient она не может — это и есть гейт этапа.
 */
export function settle(check: CodeCheck, notes: ReviewerNote[]): Finding {
  let verdict = check.verdict
  for (const n of notes) verdict = worst(verdict, n.verdict)

  const said = [...new Set(notes.map((n) => n.verdict))]
  const disagreement = said.length > 1

  const upgraded = notes.filter((n) => SEVERITY[n.verdict] < SEVERITY[check.verdict])
  const whyParts = [check.why]
  if (upgraded.length) {
    // Не молчим об этом: «проверка считает иначе» — это то, что человек должен
    // увидеть, а не то, что код должен выкинуть.
    whyParts.push(`проверка(и) сочли утверждение подтверждённым, но выдержки из источника нет — вердикт кода сильнее`)
  }
  const worseNote = notes.find((n) => n.verdict === verdict && verdict !== check.verdict)
  if (worseNote) whyParts.push(worseNote.explanation)

  return {
    statement: check.statement,
    verdict,
    level: check.critical && verdict !== 'supported' ? 'blocking' : 'warning',
    codeVerdict: check.verdict,
    notes,
    disagreement,
    why: whyParts.join('; '),
    quote: check.quote,
    evidenceId: check.evidenceId,
  }
}

const REVIEW_SCHEMA = {
  type: 'object',
  properties: {
    verdict: { type: 'string', enum: ['supported', 'contradicted', 'insufficient', 'stale'] },
    explanation: { type: 'string' },
    suggested_fix: { type: ['string', 'null'] },
  },
  required: ['verdict', 'explanation', 'suggested_fix'],
  additionalProperties: false,
} as const

const PROMPTS: Record<'fact_reviewer' | 'context_reviewer', (c: CodeCheck) => string> = {
  // Первая проверка смотрит на сходимость утверждения с выдержкой.
  fact_reviewer: (c) => [
    'Ты сверяешь одно утверждение из статьи с выдержкой из первоисточника.',
    '',
    `Утверждение в статье: «${c.statement.fragment}»`,
    c.quote ? `Выдержка из источника: «${c.quote}»` : 'Выдержки из источника нет.',
    '',
    'Вопрос ровно один: следует ли утверждение из выдержки дословно.',
    'supported — да, число, единица и предмет совпадают.',
    'contradicted — выдержка говорит другое: другое число, другая валюта, другая программа, другой год.',
    'insufficient — выдержки нет или из неё это не следует.',
    'stale — следует, но выдержка описывает прошедший период.',
    '',
    'Не додумывай. «Похоже на правду» — это insufficient, а не supported.',
    'Предложи правку текста статьи, если она нужна, иначе null.',
  ].join('\n'),

  // Вторая смотрит на то, чего первая не видит: на объём утверждения.
  context_reviewer: (c) => [
    'Ты проверяешь, не шире ли утверждение в статье, чем то, что стоит в источнике.',
    '',
    `Утверждение в статье: «${c.statement.fragment}»`,
    c.quote ? `Выдержка из источника: «${c.quote}»` : 'Выдержки из источника нет.',
    '',
    'Частая ошибка — верное число, распространённое дальше, чем можно:',
    'цена одной программы выдана за цену вуза, условие для одной категории — за общее правило,',
    'данные одного набора — за действующие сейчас.',
    '',
    'supported — объём утверждения не шире источника.',
    'contradicted — шире: утверждается больше, чем сказано в выдержке.',
    'insufficient — по выдержке нельзя понять объём.',
    'stale — источник описывает прошедший набор или год.',
    '',
    'Предложи более узкую формулировку, если утверждение шире источника, иначе null.',
  ].join('\n'),
}

/** Одна проверка моделью. Ответов другой проверки она не видит — её нет в запросе. */
async function askReviewer(
  seo: any,
  role: 'fact_reviewer' | 'context_reviewer',
  check: CodeCheck,
  spend: { jobId?: number | null; articleId?: number | null; traceId?: string | null } = {},
): Promise<ReviewerNote | null> {
  const cfg = await resolveRole(seo, role)
  const client = getAnthropic()

  const call = async () => {
    const res = await client.messages.create({
      model: cfg.model,
      max_tokens: 1024,
      tools: [{ name: 'verdict', description: 'Вердикт по утверждению', input_schema: REVIEW_SCHEMA as any }],
      tool_choice: { type: 'tool', name: 'verdict' },
      messages: [{ role: 'user', content: PROMPTS[role](check) }],
    })
    return res
  }

  const res = await withSpend(
    {
      seo, jobId: spend.jobId, articleId: spend.articleId, traceId: spend.traceId,
      role, provider: cfg.provider, model: cfg.model, promptVersion: cfg.promptVersion,
      estimate: 0.05,
    },
    async () => {
      const r = await call()
      return {
        value: r,
        usage: {
          input_tokens: (r as any).usage?.input_tokens ?? 0,
          output_tokens: (r as any).usage?.output_tokens ?? 0,
          cache_creation_input_tokens: (r as any).usage?.cache_creation_input_tokens ?? 0,
          cache_read_input_tokens: (r as any).usage?.cache_read_input_tokens ?? 0,
        },
      }
    },
  )

  const block = (res as any).content?.find((b: any) => b.type === 'tool_use')
  if (!block) return null
  const out = block.input as { verdict: Verdict; explanation: string; suggested_fix: string | null }
  return {
    reviewer: `${role} (${cfg.provider}/${cfg.model})`,
    claimId: check.statement.claimId,
    fragment: check.statement.fragment,
    evidenceId: check.evidenceId,
    verdict: out.verdict,
    explanation: out.explanation,
    suggestedFix: out.suggested_fix,
  }
}

/**
 * Полный протокол по одной статье.
 *
 * `askModels: false` — теневой прогон: вердикты выносит только код. Нужен для
 * калибровки (E2.11) и для того, чтобы посмотреть на результат, не платя за
 * него.
 */
export async function reviewArticle(
  seo: any,
  opts: {
    text: string
    subjectKeys: string[]
    askModels?: boolean
    jobId?: number | null
    articleId?: number | null
    traceId?: string | null
    now?: Date
  },
): Promise<ReviewResult> {
  const now = opts.now ?? new Date()
  const plain = opts.text.replace(/<[^>]+>/g, ' ')

  // ── 1. Извлечение
  const { data: claims } = await seo.from('claims')
    .select('id, kind, subject, statement, value, value_num, value_date, unit, qualifiers, confidence, status, expires_at')
    .in('subject_key', opts.subjectKeys.length ? opts.subjectKeys : ['—'])

  const used = ((claims ?? []) as ClaimWithSources[]).filter((c) => isUsedInText(c, opts.text))
  const fromRegistry: Statement[] = used.map((c) => ({
    fragment: String(c.statement), offset: plain.indexOf(String(c.value ?? '')), kind: String(c.kind),
    claimId: (c as any).id, via: 'реестр' as const,
  }))
  const fromWording: Statement[] = findSemanticClaims(opts.text).map((f) => ({
    fragment: f.quote, offset: f.offset, kind: f.kind, claimId: null, via: 'формулировка' as const,
  }))

  // ── 2. Дедупликация
  const statements = mergeStatements(fromRegistry, fromWording)

  // ── 3. Вердикт кода по доказательствам
  const claimIds = statements.map((s) => s.claimId).filter(Boolean) as number[]
  const expiry = await expiryFor(seo, claimIds, now)
  const { data: links } = claimIds.length
    ? await seo.from('claim_sources').select('claim_id, snapshot_id, quote, agreement').in('claim_id', claimIds)
    : { data: [] }
  const evidenceByClaim = new Map<number, { id: number; quote: string }>()
  for (const l of (links ?? []) as any[]) {
    if (l.agreement === 'supports' && l.quote && !evidenceByClaim.has(l.claim_id)) {
      evidenceByClaim.set(l.claim_id, { id: l.snapshot_id, quote: l.quote })
    }
  }

  const checks = statements.map((s) => codeVerdict(
    s,
    s.claimId ? evidenceByClaim.get(s.claimId) ?? null : null,
    s.claimId ? expiry.get(s.claimId) ?? null : null,
  ))

  // ── 4. Две проверки моделью, каждая сама по себе
  const a = await resolveRole(seo, 'fact_reviewer')
  const b = await resolveRole(seo, 'context_reviewer')
  const findings: Finding[] = []

  for (const check of checks) {
    let notes: ReviewerNote[] = []
    if (opts.askModels) {
      // Обе идут одновременно и ни одна не получает ответ другой: в запросе
      // его просто нет. Независимость здесь обеспечена устройством вызова,
      // а не просьбой к модели не подглядывать.
      const pair = await Promise.all([
        askReviewer(seo, 'fact_reviewer', check, opts).catch(() => null),
        askReviewer(seo, 'context_reviewer', check, opts).catch(() => null),
      ])
      notes = pair.filter(Boolean) as ReviewerNote[]
    }
    findings.push(settle(check, notes))
  }

  const blocking = findings.filter((f) => f.level === 'blocking')
  const warnings = findings.filter((f) => f.level === 'warning')
  const attention = findings.filter((f) => f.disagreement)

  return {
    findings, blocking, warnings, attention,
    checked: findings.length,
    reviewersUsed: opts.askModels ? [`${a.provider}/${a.model}`, `${b.provider}/${b.model}`] : [],
    note: opts.askModels ? reviewersNote(a, b) : 'теневой прогон: вердикты вынес только код, модели не вызывались',
    costUsd: 0,
  }
}
