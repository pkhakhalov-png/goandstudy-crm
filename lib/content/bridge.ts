/**
 * Событийный мост: проверенная версия статьи → пакет (E4.3–E4.6).
 *
 * Здесь только тонкая обёртка. Вся работа идёт в функциях базы, и это не
 * вопрос вкуса: PRD требует, чтобы результат проверки и событие о нём
 * записывались одной транзакцией, а через PostgREST это два запроса, между
 * которыми процесс может умереть. Тогда бывает результат без события — пакет
 * не создастся никогда, — или событие без результата, и пакет появится из
 * воздуха. Граница транзакции поэтому живёт в базе.
 *
 * Сетевые проверки выполняются ДО вызова: транзакция, ждущая чужой сервер,
 * держит блокировки столько, сколько тот сервер думает.
 */

export type Verdict = 'supported' | 'passed' | 'contradicted' | 'insufficient' | 'stale' | 'failed'

export type VerifiedInput = {
  articleId: number
  version: number
  /** Хеш проверенного содержимого. Без него повтор не отличить от новой версии. */
  contentHash: string
  evidenceBundleId?: number | null
  verdict: Verdict
  findings?: unknown[]
  provider?: string
  model?: string
  promptVersion?: string | null
}

const content = (seo: any) => seo.schema('content')

/**
 * Записать результат проверки и, если она пройдена, событие о ней.
 *
 * `emitted: false` при пройденной проверке означает, что событие с таким
 * содержимым уже было: идентификатор считается из (статья, версия, хеш).
 * Это не ошибка, это ровно то поведение, которого требует гейт этапа.
 */
export async function recordVerified(seo: any, input: VerifiedInput): Promise<{ eventId: string; emitted: boolean }> {
  const { data, error } = await content(seo).rpc('record_verified', {
    p_article_id: input.articleId,
    p_version: input.version,
    p_content_hash: input.contentHash,
    p_evidence_bundle_id: input.evidenceBundleId ?? null,
    p_verdict: input.verdict,
    p_findings: input.findings ?? [],
    p_provider: input.provider ?? 'code',
    p_model: input.model ?? 'code/v1',
    p_prompt_version: input.promptVersion ?? null,
  })
  if (error) throw new Error(`событие не записалось: ${error.message}`)
  const row = Array.isArray(data) ? data[0] : data
  // Имена с приставкой out_ — не украшение: без неё Postgres не отличает
  // выходную колонку функции от столбца таблицы в `on conflict (event_id)`.
  return { eventId: row.out_event_id, emitted: !!row.out_emitted }
}

/** Разобрать накопившиеся события: создать пакеты. Повтор ничего не удваивает. */
export async function consumeVerified(
  seo: any,
  consumer = 'package_builder',
  limit = 20,
): Promise<{ eventId: string; packageId: number; created: boolean }[]> {
  const { data, error } = await content(seo).rpc('consume_verified', { p_consumer: consumer, p_limit: limit })
  if (error) throw new Error(`события не разобрались: ${error.message}`)
  return (data ?? []).map((r: any) => ({ eventId: r.out_event_id, packageId: r.out_package_id, created: !!r.out_created }))
}

/**
 * Ночной сверщик: проверенная версия без события.
 *
 * Нужен не потому, что мост дырявый, а потому, что до моста уже что-то
 * случилось. Идемпотентен: идентификатор события считается из содержимого.
 */
export async function reconcileVerified(seo: any): Promise<{ articleId: number; version: number; restored: boolean }[]> {
  const { data, error } = await content(seo).rpc('reconcile_verified', {})
  if (error) throw new Error(`сверка не прошла: ${error.message}`)
  return (data ?? []).map((r: any) => ({ articleId: r.out_article_id, version: r.out_article_version, restored: !!r.out_restored }))
}
