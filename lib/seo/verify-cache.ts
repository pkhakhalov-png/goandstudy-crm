/**
 * Кэш проверок утверждений (E2.6).
 *
 * Проверка — дорогая операция: снимок страницы, извлечение, а с E2.8 ещё и два
 * независимых ревьюера. Повторяется она постоянно: перед сборкой пакета, перед
 * каждой попыткой выпуска, после правки соседнего абзаца, после каждого сбоя.
 * Входные данные при этом не меняются, значит и ответ не изменится.
 *
 * Ключ — пара версий: версия утверждения и версия источника (хеш извлечённого
 * текста), плюс имя проверяющего с версией промпта. Изменилось любое из трёх —
 * ключ другой, и проверка идёт заново. Правка утверждения НЕ наследует старое
 * подтверждение: в этом весь смысл версии в ключе.
 *
 * Отрицательный ответ кэшируется наравне с положительным. Он и повторяется
 * чаще: заблокированная статья перепроверяется перед каждой следующей попыткой.
 *
 * Код переживает неприменённую миграцию: нет таблицы — проверка просто идёт
 * каждый раз, как и раньше.
 */
import type { Evidence } from './provenance'

export type Outcome = 'supports' | 'not_found' | 'refutes'

export type VerifyResult = {
  outcome: Outcome
  evidence: Evidence | null
  /** Во что обошлась сама проверка. Для проверки кодом — ноль. */
  costUsd?: number
}

export type CacheKey = {
  claimId: number
  claimVersion: number
  sourceId: number
  /** Версия источника: хеш извлечённого текста. Нет хеша — кэшировать нечего. */
  contentHash: string | null
  snapshotId?: number | null
  /** Кто проверял и чем: `code/v1`, `fact_reviewer/claude-opus-5/p3`. */
  checker: string
}

/** Имя проверки кодом. Растёт, когда меняется сам способ поиска. */
export const CODE_CHECKER = 'code/v1'

/**
 * Один раз обнаружив отсутствие таблицы, больше не долбимся в неё на каждой
 * проверке: до применения миграции ответ не изменится.
 */
let tableMissing = false

/** Таблицы нет — это не ошибка кэша, это неприменённая миграция. */
function isMissingTable(message: string | undefined): boolean {
  return !!message && /(schema cache|does not exist)/i.test(message)
}

export type Cached = VerifyResult & {
  /** true — ответ отдан из кэша, проверка не запускалась. */
  fromCache: boolean
}

/**
 * Взять ответ из кэша или проверить и запомнить.
 *
 * `run` вызывается ровно в том случае, когда ответа в кэше нет. Всё, что стоит
 * денег, должно жить внутри `run`, иначе кэш ничего не экономит.
 */
export async function cachedVerify(
  seo: any,
  key: CacheKey,
  run: () => Promise<VerifyResult>,
): Promise<Cached> {
  // Снимок не снялся — версии источника нет, кэшировать нечего.
  if (!key.contentHash) return { ...(await run()), fromCache: false }

  if (!tableMissing) {
    const { data, error } = await seo.from('verification_cache')
      .select('id, outcome, quote, locator, method, cost_usd, hits')
      .eq('claim_id', key.claimId)
      .eq('claim_version', key.claimVersion)
      .eq('source_id', key.sourceId)
      .eq('content_hash', key.contentHash)
      .eq('checker', key.checker)
      .maybeSingle()

    if (error && isMissingTable(error.message)) tableMissing = true

    if (!error && data) {
      // Считаем попадания: без них не ответить, окупается ли кэш вообще.
      await seo.from('verification_cache')
        .update({ hits: (data.hits ?? 0) + 1, last_hit_at: new Date().toISOString() })
        .eq('id', data.id)
      return {
        outcome: data.outcome as Outcome,
        evidence: data.outcome === 'supports' && data.quote
          ? { quote: data.quote, locator: data.locator ?? '', method: (data.method ?? 'exact_phrase') as Evidence['method'] }
          : null,
        costUsd: Number(data.cost_usd ?? 0),
        fromCache: true,
      }
    }
  }

  const res = await run()

  if (!tableMissing) {
    const { error } = await seo.from('verification_cache').insert({
      claim_id: key.claimId,
      claim_version: key.claimVersion,
      source_id: key.sourceId,
      content_hash: key.contentHash,
      checker: key.checker,
      outcome: res.outcome,
      quote: res.evidence?.quote ?? null,
      locator: res.evidence?.locator ?? null,
      method: res.evidence?.method ?? null,
      snapshot_id: key.snapshotId ?? null,
      cost_usd: res.costUsd ?? 0,
    })
    // 23505 — параллельная проверка успела записать тот же ключ. Это не ошибка:
    // ответ уже в кэше, а лишний вызов мы потратили и без того.
    const duplicate = String(error?.code ?? '') === '23505'
    if (error && !duplicate && isMissingTable(error.message)) tableMissing = true
  }

  return { ...res, fromCache: false }
}

/** Сколько кэш сэкономил: попадания и во что обошлись сами проверки. */
export async function cacheStats(seo: any): Promise<{
  entries: number; hits: number; spentUsd: number; savedUsd: number; available: boolean
}> {
  const { data, error } = await seo.from('verification_cache').select('hits, cost_usd')
  if (error || !data) return { entries: 0, hits: 0, spentUsd: 0, savedUsd: 0, available: false }
  let hits = 0, spent = 0, saved = 0
  for (const r of data as any[]) {
    const h = Number(r.hits ?? 0), c = Number(r.cost_usd ?? 0)
    hits += h; spent += c; saved += h * c
  }
  return { entries: data.length, hits, spentUsd: spent, savedUsd: saved, available: true }
}

/** Только для тестов: забыть, что таблицы нет. */
export function __resetCacheProbe() { tableMissing = false }
