/**
 * Контракт коннектора публикации (E5.10–E5.12).
 *
 * Один контракт на обе площадки, потому что различия между ними — не в том,
 * как вызывать, а в том, что площадка умеет и чего не умеет. Разведка уже
 * показала, что различия существенные:
 *
 *   Telegram отдаёт ссылку наружу как есть, но не даёт ни ключа
 *   идемпотентности, ни чтения истории. Значит, если запрос ушёл, а ответ не
 *   дошёл, узнать исход нечем.
 *
 *   VK переписывает ссылку своим переходником, из-за чего реферером приходит
 *   сам VK, а не пост.
 *
 * Поэтому в контракте нет допущения «после publish мы знаем результат».
 * Неизвестный исход — такой же законный ответ, как успех, и он обязан
 * называться своим именем. Коннектор, который в этом случае вернёт ошибку,
 * заставит систему повторить отправку и получить второй пост; коннектор,
 * который вернёт успех, потеряет публикацию, которой нет.
 *
 * Второе правило: НИЧЕГО не уходит наружу, пока попытка не записана. Сначала
 * строка в publication_attempts с хешем запроса, потом внешний вызов. Иначе
 * после падения процесса не остаётся даже следа того, что мы пытались.
 */
import crypto from 'node:crypto'

/* ── Что площадка умеет ─────────────────────────────────────────────────── */

export type LinkBehaviour =
  /** Ссылка уходит как есть: реферер придёт от площадки-источника. */
  | 'как_есть'
  /** Площадка переписывает ссылку переходником: реферером придёт она сама. */
  | 'переписывается'
  /** Ссылки не поддерживаются вовсе. */
  | 'не_поддерживаются'

export type Capabilities = {
  platform: 'telegram' | 'vk'
  formats: string[]
  maxTextLength: number
  supportsPhoto: boolean
  linkBehaviour: LinkBehaviour
  /** Есть ли у площадки свой ключ повтора: `guid` у VK, ничего у Telegram. */
  hasIdempotencyKey: boolean
  /** Можно ли прочитать недавние записи и тем самым разобрать неизвестный исход. */
  canReadOwnHistory: boolean
  /**
   * Ссылка на успешный вызов, которым это проверено.
   *
   * Пусто — значит взято из документации. Документация описывает намерение
   * авторов площадки, а не поведение конкретного аккаунта с конкретным
   * токеном, и разница выясняется в тот момент, когда пост уходит не так.
   */
  proofRef: string | null
  checkedAt: string | null
}

/** Проверено вызовом, записано без проверки, или не проверяли вовсе. */
export function capabilityConfidence(c: Capabilities | null): 'проверено' | 'записано_без_проверки' | 'не_проверяли' {
  if (!c) return 'не_проверяли'
  return c.proofRef ? 'проверено' : 'записано_без_проверки'
}

/* ── Что отправляем ─────────────────────────────────────────────────────── */

export type Payload = {
  text: string
  photoUrl?: string | null
  /** Ссылка, ради которой пост и делается. Попадает в текст с метками. */
  link?: string | null
  /** Метки кампании: utm_campaign = пакет, utm_content = публикация. */
  utm?: Record<string, string>
}

export type ValidationIssue = { field: string; problem: string; blocking: boolean }

/* ── Чем кончилась отправка ─────────────────────────────────────────────── */

export type Outcome =
  /** Пост опубликован, идентификатор получен. */
  | { kind: 'опубликовано'; remoteId: string; remoteUrl: string | null }
  /** Площадка отказала по существу: повтор не поможет. */
  | { kind: 'отказано'; reason: string; code?: string | number }
  /** Временная помеха: повтор уместен не раньше retryAfterSec. */
  | { kind: 'повторить_позже'; reason: string; retryAfterSec: number }
  /**
   * Токен не принят. Канал останавливается, остальные не трогаются.
   * Это требование гейта E5: отзыв токена одного канала не ломает остальные.
   */
  | { kind: 'нужна_авторизация'; reason: string }
  /**
   * Запрос ушёл, ответ не дошёл. Опубликовано или нет — НЕИЗВЕСТНО.
   *
   * Самое важное состояние во всём контракте. Слепой повтор здесь даёт второй
   * пост; молчаливый успех — публикацию, которой нет; ошибка — бесконечные
   * попытки. Правильный разбор: сначала reconcile, и только если площадка не
   * умеет — человеку.
   */
  | { kind: 'исход_неизвестен'; reason: string }

export type ReconcileResult =
  | { kind: 'нашли'; remoteId: string; remoteUrl: string | null }
  | { kind: 'не_публиковалось' }
  /** Площадка не даёт способа выяснить. Не «нет», а «нечем проверить». */
  | { kind: 'выяснить_нечем'; why: string }

export type RemoteStatus =
  | { kind: 'на_месте'; remoteUrl: string | null }
  | { kind: 'исчез' }
  | { kind: 'не_проверить'; why: string }

export type Metric = { name: string; value: number | null; completeness: 'полная' | 'частичная' | 'недоступна'; why?: string }

/**
 * Контракт целиком.
 *
 * Все методы обязаны быть устойчивы к повтору: их вызывают после падений и
 * таймаутов, и второй вызов не должен делать второй пост.
 */
export interface PublishingConnector {
  readonly platform: 'telegram' | 'vk'

  /** Что площадка умеет. Читается из справочника, а не выдумывается на месте. */
  capabilities(): Promise<Capabilities>

  /** Пройдёт ли этот текст здесь. Без сети: длина, ссылки, медиа, обязательные оговорки. */
  validate(payload: Payload, caps: Capabilities): ValidationIssue[]

  /** Подготовить медиа: скачать, ужать, загрузить — что требуется площадке. */
  prepareMedia(payload: Payload): Promise<Payload>

  /**
   * Отправить.
   *
   * `idempotencyKey` передаётся площадке, если та умеет (VK), и в любом случае
   * используется нами для распознавания повтора.
   */
  publish(payload: Payload, idempotencyKey: string): Promise<Outcome>

  /** Разобрать неизвестный исход: искать ли пост и нашёлся ли. */
  reconcile(idempotencyKey: string, sentAt: Date): Promise<ReconcileResult>

  /** Жив ли пост сейчас. «API принял» ≠ «видно в аккаунте» ≠ «доступно публично». */
  getStatus(remoteId: string): Promise<RemoteStatus>

  /** Метрики поста. Недоступная метрика — `недоступна`, а не ноль. */
  fetchMetrics(remoteId: string, date: string): Promise<Metric[]>
}

/* ── Дисциплина попытки ─────────────────────────────────────────────────── */

/** Хеш запроса: по нему видно, что повторяем ровно то же, а не что-то новое. */
export function requestHash(payload: Payload, idempotencyKey: string): string {
  return crypto.createHash('sha256')
    .update(JSON.stringify({
      text: payload.text, photoUrl: payload.photoUrl ?? null,
      link: payload.link ?? null, utm: payload.utm ?? {}, idempotencyKey,
    }))
    .digest('hex').slice(0, 32)
}

export type AttemptPhase = 'подготовка' | 'отправлено' | 'ответ_получен' | 'ответа_нет'

/**
 * Одна попытка отправки со следом в базе.
 *
 * Порядок здесь принципиален и не подлежит оптимизации:
 *
 *   1. Запись «собираюсь отправить» с хешем запроса — ДО внешнего вызова.
 *   2. Отметка «отправлено» — сразу перед вызовом.
 *   3. Внешний вызов.
 *   4. Запись исхода.
 *
 * Если процесс умрёт между 2 и 4, в базе останется попытка в состоянии
 * «отправлено», и это ровно то, что нужно: следующий проход увидит её и
 * поймёт, что исход неизвестен. Если бы запись шла после вызова, он не увидел
 * бы ничего и отправил бы второй раз.
 */
export async function attemptPublish(
  content: any,
  publicationId: number,
  connector: PublishingConnector,
  payload: Payload,
  idempotencyKey: string,
): Promise<{ outcome: Outcome; attempt: number }> {
  const { data: prev } = await content.from('publication_attempts')
    .select('attempt').eq('publication_id', publicationId).order('attempt', { ascending: false }).limit(1)
  const attempt = (prev?.[0]?.attempt ?? 0) + 1
  const hash = requestHash(payload, idempotencyKey)

  const { error: insErr } = await content.from('publication_attempts').insert({
    publication_id: publicationId, attempt, request_hash: hash, phase: 'подготовка' as AttemptPhase,
  })
  // Не смогли записать попытку — наружу не идём. Отправка без следа хуже
  // неотправки: неотправку видно, а отправку без следа — нет.
  if (insErr) throw new Error(`попытка не записалась, наружу не идём: ${insErr.message}`)

  const mark = async (phase: AttemptPhase, patch: Record<string, unknown> = {}) =>
    content.from('publication_attempts').update({ phase, ...patch })
      .eq('publication_id', publicationId).eq('attempt', attempt)

  await mark('отправлено')

  let outcome: Outcome
  try {
    outcome = await connector.publish(payload, idempotencyKey)
  } catch (e: any) {
    // Исключение здесь — это НЕ «не отправилось». Это «мы не знаем».
    // Различить обрыв до отправки и обрыв после неё нечем, и притворяться,
    // что различить можно, — самый дорогой способ получить второй пост.
    outcome = { kind: 'исход_неизвестен', reason: String(e?.message ?? e) }
  }

  await mark(outcome.kind === 'исход_неизвестен' ? 'ответа_нет' : 'ответ_получен', {
    result: outcome.kind,
    error: 'reason' in outcome ? outcome.reason : null,
    provider_request_id: outcome.kind === 'опубликовано' ? outcome.remoteId : null,
    finished_at: new Date().toISOString(),
  })

  return { outcome, attempt }
}

/** Куда переводить публикацию по исходу. Отдельной функцией — чтобы это было видно. */
export function statusFor(outcome: Outcome): 'published' | 'failed' | 'scheduled' | 'unknown' {
  switch (outcome.kind) {
    case 'опубликовано': return 'published'
    case 'отказано': return 'failed'
    // Повтор позже и отзыв токена возвращают публикацию в план: она не
    // провалилась, она ещё не ушла.
    case 'повторить_позже': return 'scheduled'
    case 'нужна_авторизация': return 'scheduled'
    case 'исход_неизвестен': return 'unknown'
  }
}
