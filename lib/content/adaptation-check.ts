/**
 * Проверка адаптации: не появилось ли в посте того, чего не было в пакете (E4.8).
 *
 * Пакет уже прошёл гейт достоверности. Пост из него — не новый материал, а
 * сокращение, и вопрос к нему ровно один: не приехало ли вместе с сокращением
 * новое утверждение и не поехал ли смысл. Всё остальное про пост — длину,
 * ссылки, оговорки — проверяет профиль площадки, здесь этого нет.
 *
 * Порядок жёсткий, и он тот же, что в протоколе проверки статей (E2.8).
 *
 *   1. Код. Числа поста обязаны быть подмножеством чисел пакета, ссылки — из
 *      пакета, новых категоричных формулировок быть не должно. Это бесплатно и
 *      идёт первым: если пост принёс цену, которой в пакете нет, платить за
 *      мнение модели незачем.
 *   2. Две проверки моделью — и только если код пропустил. Первая ищет
 *      утверждения, которых в пакете нет; вторая смотрит, не изменился ли смысл
 *      при сокращении. Ответов друг друга они не видят.
 *
 * ГЛАВНОЕ ПРАВИЛО, ради которого всё написано: недоступность второго провайдера
 * НЕ означает «пройдено». Провайдер не ответил — исход «ждёт»: задача вернётся
 * позже. Не «замечаний нет», не предупреждение, не тихий пропуск. Проверка,
 * которая при отказе провайдера превращается в одобрение, — это не проверка, а
 * её изображение, и именно так она выглядит в журнале постфактум.
 *
 * Поэтому при исходе «ждёт» строка в content.reviews НЕ пишется: запись там
 * означает «проверка состоялась», а она не состоялась.
 */
import { createHash } from 'node:crypto'
import { findSemanticClaims } from '../seo/semantic-claims'
import { worst, type Verdict } from '../seo/review-protocol'
import { resolveRole } from '../seo/model-roles'
import { withSpend } from '../seo/spend'
import { checkPost, type ComposedPost } from './social-compose'
import type { PostParts } from './social-compose'
import type { Platform } from './social-profile'

/* ── Что на входе и что на выходе ─────────────────────────────────────────── */

export type AdaptationInput = {
  platform: Platform
  /** Текст проверенного пакета: источник всего, что может быть в посте. */
  packageText: string
  /** Пост: собранный или готовым текстом. */
  post: ComposedPost | string
  parts?: PostParts
  /** Язык пакета и поста. Перевод — это всегда полная проверка. */
  packageLanguage?: string
  postLanguage?: string
  /** Прошлый уже проверенный текст этого же варианта, если он был. */
  previousVerifiedText?: string | null
}

export type CodeFinding = {
  level: 'блокирует' | 'замечание'
  what: string
  why: string
}

export type AdaptationOutcome = 'passed' | 'failed' | 'waiting'

export type AdaptationReport = {
  outcome: AdaptationOutcome
  /** Вердикт словарём протокола проверки. У «ждёт» вердикта нет вовсе. */
  verdict: Verdict | 'passed' | 'failed' | null
  scope: ReviewScope
  code: { ok: boolean; findings: CodeFinding[] }
  reviewers: ReviewerAnswer[]
  /** Почему исход такой. Читает человек, поэтому без сокращений. */
  why: string
  /** Хеш проверенного текста: правка текста обнуляет одобрение. */
  targetHash: string
}

export type ReviewerAnswer = {
  role: 'fact_reviewer' | 'context_reviewer'
  provider: string
  model: string
  verdict: Verdict
  explanation: string
  /** Провайдер не ответил. Тогда это не ответ, а его отсутствие. */
  unavailable?: boolean
  error?: string
}

/* ── 1. Кодовые проверки ──────────────────────────────────────────────────── */

/**
 * Значимые числа текста.
 *
 * Значимое — это число, которое читатель унесёт с собой: сумма, процент, балл,
 * срок, год. Порядковые мелочи вроде «три шага» не значимы: они появляются от
 * структуры поста, а не из пакета, и требовать их присутствия в исходнике
 * значило бы ловить сам факт того, что пост короче.
 */
export function significantNumbers(text: string): Set<string> {
  const out = new Set<string>()
  // Адреса выбрасываем целиком: в метке utm_content стоит номер публикации, и
  // он всегда «новый» — пакет о нём не знает и знать не может. Без этого честный
  // пост не проходил проверку из-за собственной метки
  const plain = text.replace(/https?:\/\/[^\s<>"')]+/g, ' ').replace(/<[^>]+>/g, ' ')

  // Число рядом с единицей: 2 500 €, 15 тысяч долларов, 6.5 балла, 20 часов
  const withUnit = /(\d[\d\s ]*(?:[.,]\d+)?)\s*(?:тыс[\p{L}.]*\s*)?(?:₽|руб[\p{L}]*|€|\$|¥|£|%|евро|доллар[\p{L}]*|балл[\p{L}]*|час[\p{L}]*|лет|год[\p{L}]*|дн[\p{L}]*|месяц[\p{L}]*|недел[\p{L}]*)/giu
  for (const m of plain.matchAll(withUnit)) out.add(normalizeNumber(m[1]))

  // Валюта перед числом: €2 500
  for (const m of plain.matchAll(/[€$₽¥£]\s?(\d[\d\s ]*(?:[.,]\d+)?)/gu)) out.add(normalizeNumber(m[1]))

  // Крупные числа и годы значимы сами по себе
  for (const m of plain.matchAll(/(?<![\p{L}\d])(\d{4,})(?![\p{L}\d])/gu)) out.add(normalizeNumber(m[1]))

  out.delete('')
  return out
}

function normalizeNumber(s: string): string {
  return s.replace(/[\s ]/g, '').replace(',', '.').replace(/\.0+$/, '')
}

/** Адреса без меток: utm — наше, а не из пакета, и сравнивать по ним нечего. */
export function linksIn(text: string): Set<string> {
  const out = new Set<string>()
  for (const m of text.matchAll(/https?:\/\/[^\s<>"')]+/g)) {
    try {
      const u = new URL(m[0])
      for (const key of [...u.searchParams.keys()]) if (key.startsWith('utm_')) u.searchParams.delete(key)
      out.add(`${u.host}${u.pathname.replace(/\/+$/, '')}${u.search}`)
    } catch { out.add(m[0]) }
  }
  return out
}

/** Категоричные формулировки как отпечаток: категория плюс сработавший оборот. */
function wordingKeys(text: string): Set<string> {
  return new Set(findSemanticClaims(text).map((f) => `${f.category}:${f.trigger.toLowerCase().replace(/\s+/g, ' ')}`))
}

/**
 * Бесплатная часть проверки.
 *
 * Всё, что здесь ловится, ловится без единого обращения к провайдеру. Это не
 * оптимизация, а порядок: за мнение модели о посте, который принёс новую цену,
 * платить незачем — такой пост не проходит в любом случае.
 */
export function codeChecks(input: AdaptationInput): { ok: boolean; findings: CodeFinding[] } {
  const postText = typeof input.post === 'string' ? input.post : input.post.text
  const findings: CodeFinding[] = []

  // Числа
  const inPackage = significantNumbers(input.packageText)
  for (const n of significantNumbers(postText)) {
    if (!inPackage.has(n)) {
      findings.push({
        level: 'блокирует',
        what: `в посте число ${n}, которого нет в пакете`,
        why: 'пакет проверен, пост — нет: число, появившееся при сокращении, не проверял никто',
      })
    }
  }

  // Ссылки
  const packageLinks = linksIn(input.packageText)
  for (const link of linksIn(postText)) {
    if (!packageLinks.has(link)) {
      findings.push({
        level: 'блокирует',
        what: `в посте ссылка ${link}, которой нет в пакете`,
        why: 'ссылка ведёт читателя туда, куда пакет его не отправлял, и это место не проверено',
      })
    }
  }

  // Категоричные формулировки: новых быть не должно
  const packageWording = wordingKeys(input.packageText)
  for (const key of wordingKeys(postText)) {
    if (!packageWording.has(key)) {
      const [category, trigger] = key.split(':')
      findings.push({
        level: 'блокирует',
        what: `новая категоричная формулировка (${category}): «${trigger}»`,
        why: 'при сокращении оговорки теряются первыми, и осторожная фраза пакета превращается в категоричную',
      })
    }
  }

  // Лимиты площадки — тем же кодом, что собирал пост
  if (typeof input.post !== 'string') {
    for (const p of checkPost(input.post, input.parts).problems) {
      findings.push({ level: p.level, what: p.what, why: p.why })
    }
  }

  return { ok: !findings.some((f) => f.level === 'блокирует'), findings }
}

/* ── Глубина проверки ─────────────────────────────────────────────────────── */

export type ReviewScope = { scope: 'полная' | 'сокращённая'; why: string }

/**
 * Полная проверка или сокращённая.
 *
 * Сокращённая допустима ровно в одном случае: текст пересобран из того же, что
 * уже проверено. Любое новое утверждение, перевод или изменение условий
 * возвращают полную — иначе «сокращённая» станет способом протащить правку
 * мимо проверки, а именно так проверки и перестают работать.
 */
export function reviewScope(input: AdaptationInput): ReviewScope {
  const postText = typeof input.post === 'string' ? input.post : input.post.text
  const from = input.packageLanguage ?? 'ru'
  const to = input.postLanguage ?? from

  if (from !== to) {
    return { scope: 'полная', why: `перевод ${from} → ${to}: смысл переносится другими словами целиком, и сверять надо всё` }
  }

  const newNumbers = [...significantNumbers(postText)].filter((n) => !significantNumbers(input.packageText).has(n))
  if (newNumbers.length) {
    return { scope: 'полная', why: `в посте числа, которых нет в пакете (${newNumbers.slice(0, 3).join(', ')}) — это новое утверждение` }
  }

  const packageWording = wordingKeys(input.packageText)
  const newWording = [...wordingKeys(postText)].filter((k) => !packageWording.has(k))
  if (newWording.length) {
    return { scope: 'полная', why: `появились категоричные формулировки, которых в пакете не было: ${newWording.slice(0, 2).join('; ')}` }
  }

  if (!input.previousVerifiedText) {
    return { scope: 'полная', why: 'этот вариант проверяется впервые: сокращать нечего' }
  }

  return {
    scope: 'сокращённая',
    why: 'текст пересобран из того же, что уже проверено: новых чисел, ссылок и категоричных формулировок нет',
  }
}

/* ── 2. Смысловое соответствие ────────────────────────────────────────────── */

const PROMPTS: Record<'fact_reviewer' | 'context_reviewer', (packageText: string, post: string) => string> = {
  // Первая ищет то, чего в пакете нет.
  fact_reviewer: (pkg, post) => [
    'Ты сверяешь пост с материалом, из которого он сделан.',
    '',
    'МАТЕРИАЛ (проверен, считается верным):',
    pkg,
    '',
    'ПОСТ:',
    post,
    '',
    'Вопрос ровно один: есть ли в посте утверждение, которого нет в материале.',
    'supported — всё, что утверждает пост, есть в материале.',
    'contradicted — пост утверждает то, чему материал противоречит.',
    'insufficient — в посте есть утверждение, которого в материале нет.',
    'stale — пост говорит о прошедшем периоде как о действующем.',
    '',
    'Сокращение само по себе не нарушение: пост короче материала по определению.',
    'Нарушение — это когда в посте появилось то, чего в материале не было.',
  ].join('\n'),

  // Вторая смотрит, не поехал ли смысл при сокращении.
  context_reviewer: (pkg, post) => [
    'Ты проверяешь, не изменился ли смысл материала при сокращении до поста.',
    '',
    'МАТЕРИАЛ (проверен, считается верным):',
    pkg,
    '',
    'ПОСТ:',
    post,
    '',
    'Частая беда сокращения — оговорка теряется первой, и осторожное утверждение',
    'становится общим правилом: условие для одной категории подаётся как общее,',
    'диапазон превращается в одно число, «как правило» исчезает.',
    '',
    'supported — смысл сохранён, объём утверждений не шире материала.',
    'contradicted — смысл изменился: пост утверждает шире или иначе, чем материал.',
    'insufficient — по посту нельзя понять, то же ли это утверждение.',
    'stale — пост подаёт прошедшее как действующее.',
  ].join('\n'),
}

const ANSWER_SCHEMA = {
  type: 'object',
  properties: {
    verdict: { type: 'string', enum: ['supported', 'contradicted', 'insufficient', 'stale'] },
    explanation: { type: 'string' },
  },
  required: ['verdict', 'explanation'],
  additionalProperties: false,
} as const

/**
 * Одна проверка моделью.
 *
 * Ошибку НЕ глотаем. Это здесь главное: пойманное и превращённое в «ответа нет»
 * исключение неотличимо от «ответ есть, замечаний нет», и вся проверка
 * становится украшением. Поэтому отказ провайдера возвращается как отказ и
 * выше по стеку превращается в исход «ждёт».
 */
async function askReviewer(
  seo: any,
  role: 'fact_reviewer' | 'context_reviewer',
  packageText: string,
  postText: string,
  spend: { jobId?: number | null; traceId?: string | null } = {},
): Promise<ReviewerAnswer> {
  const cfg = await resolveRole(seo, role)
  const { getAnthropic } = await import('../ai')
  const client = getAnthropic()

  try {
    const res = await withSpend(
      {
        seo, jobId: spend.jobId ?? null, traceId: spend.traceId ?? null,
        role, provider: cfg.provider, model: cfg.model, promptVersion: cfg.promptVersion, estimate: 0.05,
      },
      async () => {
        const r = await client.messages.create({
          model: cfg.model,
          max_tokens: 1024,
          tools: [{ name: 'verdict', description: 'Вердикт по адаптации', input_schema: ANSWER_SCHEMA as any }],
          tool_choice: { type: 'tool', name: 'verdict' },
          messages: [{ role: 'user', content: PROMPTS[role](packageText, postText) }],
        })
        const u = r.usage
        return {
          value: r,
          usage: {
            input_tokens: u?.input_tokens ?? 0,
            output_tokens: u?.output_tokens ?? 0,
            cache_creation_input_tokens: u?.cache_creation_input_tokens ?? 0,
            cache_read_input_tokens: u?.cache_read_input_tokens ?? 0,
          },
        }
      },
    )

    const block = res.content.find((b) => b.type === 'tool_use')
    if (!block) {
      return {
        role, provider: cfg.provider, model: cfg.model, verdict: 'insufficient',
        explanation: 'модель не вернула вердикт', unavailable: true, error: 'ответ без вердикта',
      }
    }
    const out = block.input as { verdict: Verdict; explanation: string }
    return { role, provider: cfg.provider, model: cfg.model, verdict: out.verdict, explanation: out.explanation }
  } catch (e) {
    return {
      role, provider: cfg.provider, model: cfg.model, verdict: 'insufficient',
      explanation: 'провайдер не ответил', unavailable: true,
      error: e instanceof Error ? e.message : String(e),
    }
  }
}

/* ── Проверка целиком ─────────────────────────────────────────────────────── */

export type AdaptationOptions = {
  /** Не звать модели: только код. Для калибровки и для того, чтобы не платить. */
  askModels?: boolean
  jobId?: number | null
  traceId?: string | null
  /** Подмена вызова провайдера — нужна тесту, чтобы подсунуть отказ. */
  ask?: (role: 'fact_reviewer' | 'context_reviewer', packageText: string, postText: string) => Promise<ReviewerAnswer>
}

export async function adaptationReview(
  seo: any,
  input: AdaptationInput,
  opts: AdaptationOptions = {},
): Promise<AdaptationReport> {
  const postText = typeof input.post === 'string' ? input.post : input.post.text
  const targetHash = createHash('sha256').update(postText).digest('hex').slice(0, 32)
  const scope = reviewScope(input)
  const code = codeChecks(input)

  // Код сказал «нет» — модели не зовём. Пост с новой ценой не пройдёт при любом
  // мнении модели, а вызов стоит денег.
  if (!code.ok) {
    const blockers = code.findings.filter((f) => f.level === 'блокирует')
    return {
      outcome: 'failed', verdict: 'failed', scope, code, reviewers: [], targetHash,
      why: `код нашёл ${blockers.length} нарушени${blockers.length === 1 ? 'е' : 'я'}: ${blockers.map((f) => f.what).join('; ')}`,
    }
  }

  if (opts.askModels === false) {
    return {
      outcome: 'waiting', verdict: null, scope, code, reviewers: [], targetHash,
      why: 'смысловую проверку не запускали (теневой прогон) — это не «пройдено», а «ещё не проверено»',
    }
  }

  const ask = opts.ask ?? ((role, pkg, post) => askReviewer(seo, role, pkg, post, opts))
  const reviewers = await Promise.all([
    ask('fact_reviewer', input.packageText, postText),
    ask('context_reviewer', input.packageText, postText),
  ])

  // ГЛАВНОЕ ПРАВИЛО. Хотя бы один провайдер не ответил — исход «ждёт».
  // Не «прошло», не предупреждение: отсутствие проверки не бывает её
  // положительным результатом, сколько бы проверок ни прошло до этого.
  const missing = reviewers.filter((r) => r.unavailable)
  if (missing.length) {
    return {
      outcome: 'waiting', verdict: null, scope, code, reviewers, targetHash,
      why: `не ответил${missing.length > 1 ? 'и' : ''} ${missing.map((m) => m.role).join(' и ')}: `
        + `${missing.map((m) => m.error ?? 'без причины').join('; ')}. `
        + 'Задача возвращается в очередь: недоступность проверки — это не её прохождение.',
    }
  }

  const verdict = reviewers.map((r) => r.verdict).reduce(worst)
  const ok = verdict === 'supported'

  return {
    outcome: ok ? 'passed' : 'failed',
    verdict: ok ? 'passed' : verdict,
    scope, code, reviewers, targetHash,
    why: ok
      ? `обе проверки подтвердили соответствие пакету (проверка ${scope.scope})`
      : `тяжелейший вердикт — ${verdict}: ${reviewers.filter((r) => r.verdict !== 'supported').map((r) => `${r.role}: ${r.explanation}`).join('; ')}`,
  }
}

/* ── Запись результата ────────────────────────────────────────────────────── */

/**
 * Записать проверку в content.reviews.
 *
 * При исходе «ждёт» не пишем ничего и говорим об этом вслух: строка в reviews
 * означает «проверка состоялась». Запись с вердиктом «ждём» выглядела бы в
 * журнале как проверка, которой не было, — а через месяц никто уже не отличит.
 */
export async function recordAdaptationReview(
  /** Клиент, уже привязанный к схеме content: .schema('content') делается снаружи. */
  content: any,
  variantVersionId: number,
  report: AdaptationReport,
  extra: { version?: number; runId?: number | null } = {},
): Promise<{ written: boolean; id?: number; why: string }> {
  if (report.outcome === 'waiting') {
    return { written: false, why: 'проверка не состоялась: провайдер не ответил, задача вернётся позже' }
  }

  const first = report.reviewers[0]
  const { data, error } = await content.from('reviews').insert({
    target_type: 'variant_version',
    target_id: variantVersionId,
    target_version: extra.version ?? null,
    target_hash: report.targetHash,
    provider: first?.provider ?? 'код',
    model: first?.model ?? 'без модели',
    verdict: report.verdict === 'passed' ? 'passed' : report.verdict === 'failed' ? 'failed' : String(report.verdict),
    findings_json: {
      scope: report.scope,
      code: report.code.findings,
      reviewers: report.reviewers,
      why: report.why,
    },
    run_id: extra.runId ?? null,
  }).select('id').single()

  if (error) return { written: false, why: `не записалось: ${error.message}` }
  return { written: true, id: data.id, why: 'проверка записана' }
}
