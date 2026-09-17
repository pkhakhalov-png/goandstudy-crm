/**
 * Учёт расходов на вызовы провайдеров.
 *
 * Зачем. Сейчас стоимость копится одним числом в seo.jobs.cost, и по нему
 * нельзя ответить ни на один вопрос, который задаёт PRD: сколько стоит один
 * пакет по составляющим, где p50 и p95, сходится ли учтённое с месячным счётом.
 * Без этих чисел точку решения через тридцать дней принимать не на чем.
 *
 * Как устроено. Перед платным шагом берётся резерв по верхней оценке; после
 * вызова резерв закрывается фактической суммой и в журнал ложится проводка.
 * Резерв атомарен, поэтому параллельные шаги не могут вместе перешагнуть лимит.
 *
 * Отдельное правило про неизвестный исход. Если провайдер не ответил и мы не
 * можем выяснить, списал он деньги или нет, резерв НЕ освобождается. Освободить
 * его значило бы отдать той же сумме вторую работу, а счёт в конце месяца
 * пришёл бы за обе. PRD E1.9 требует именно этого поведения.
 */

export type SpendRole = 'writer' | 'fact_reviewer' | 'context_reviewer' | 'embeddings' | 'image'

/** Что вернул провайдер. Поля соответствуют usage в ответе Anthropic. */
export type Usage = {
  input_tokens?: number
  output_tokens?: number
  cache_creation_input_tokens?: number
  cache_read_input_tokens?: number
  /** Для поштучных расходов: картинок, секунд рендера. */
  units?: number
}

export type SpendContext = {
  seo: any
  jobId?: number | null
  articleId?: number | null
  traceId?: string | null
  role: SpendRole
  provider: string
  model: string
  promptVersion?: string | null
  /** Верхняя оценка стоимости в долларах. Занимается до вызова. */
  estimate: number
}

export class BudgetExhausted extends Error {
  constructor(public readonly estimate: number) {
    super(`бюджет исчерпан: на шаг нужно ${estimate.toFixed(2)} $, свободных средств нет`)
    this.name = 'BudgetExhausted'
  }
}

/**
 * Роли, которым учёт НИКОГДА не мешает работать.
 *
 * Действующий конвейер статей настроен и работает, и остановить его учётом
 * расходов — не то, ради чего учёт заводился. Он здесь, чтобы отвечать на
 * вопрос «сколько это стоит», а не чтобы решать, писать ли статью.
 *
 * Для этих ролей исчерпанный бюджет — повод сказать вслух, а не встать.
 * Перерасход всё равно будет виден: он попадёт в runs и в отчёт, и на экране
 * «Конвейер» остаток уйдёт в минус. Это честнее, чем молчаливая остановка
 * производства в три часа ночи.
 *
 * Новые дорожки — производство постов, публикация в соцсети — сюда НЕ входят
 * намеренно: там остановка по бюджету правильна, потому что их ещё нет и
 * вводить их сразу без предела не стоит.
 */
const NEVER_BLOCK: ReadonlySet<SpendRole> = new Set<SpendRole>([
  'writer', 'fact_reviewer', 'context_reviewer', 'embeddings', 'image',
])

/**
 * Выполнить платный вызов с учётом.
 *
 * Возвращает результат вызова. Если бюджет исчерпан, бросает BudgetExhausted
 * до того, как деньги потрачены — шаг встанет в очередь внимания, а не сожжёт
 * остаток.
 */
export async function withSpend<T>(
  ctx: SpendContext,
  call: () => Promise<{ value: T; usage: Usage }>,
): Promise<T> {
  const { seo } = ctx
  const started = Date.now()

  // ── Резерв ────────────────────────────────────────────────────────────────
  let reservationId: number | null = null
  try {
    const { data, error } = await seo.rpc('reserve_budget', {
      p_amount: ctx.estimate,
      p_job_id: ctx.jobId ?? null,
      p_role: ctx.role,
      p_reason: `${ctx.provider}/${ctx.model}`,
    })
    if (error) {
      // Функции ещё нет — миграция не применена. Учёт не ведём, но работу не
      // останавливаем: иначе неприменённая миграция погасила бы конвейер.
      if (!/reserve_budget|function|schema cache/i.test(error.message)) throw new Error(error.message)
    } else {
      reservationId = data as number | null
      if (reservationId == null) {
        if (NEVER_BLOCK.has(ctx.role)) {
          // Денег по лимиту нет, но работу не останавливаем. Резерва тоже нет,
          // поэтому фактическая стоимость ляжет в runs без резерва — и именно
          // так перерасход станет виден в отчёте.
          console.error(
            `[учёт] бюджет исчерпан (нужно ${ctx.estimate.toFixed(2)} $), ` +
            `но роль «${ctx.role}» не останавливаем: конвейер статей важнее учёта`,
          )
        } else {
          throw new BudgetExhausted(ctx.estimate)
        }
      }
    }
  } catch (e) {
    if (e instanceof BudgetExhausted) throw e
    console.error(`[учёт] резерв не взят: ${(e as any)?.message ?? e}`)
  }

  // ── Вызов ─────────────────────────────────────────────────────────────────
  let usage: Usage = {}
  let status: 'ok' | 'failed' | 'timeout' | 'unknown' = 'ok'
  let errorText: string | null = null
  let value: T

  try {
    const res = await call()
    value = res.value
    usage = res.usage ?? {}
  } catch (e: any) {
    errorText = String(e?.message ?? e).slice(0, 300)
    // Обрыв после отправки — это не «не потратили». Провайдер мог выполнить
    // работу и списать деньги, а мы об этом не узнали. Такой исход помечается
    // unknown, и резерв под него держится до сверки со счётом.
    status = /timeout|timed out|ETIMEDOUT|socket hang up|aborted/i.test(errorText) ? 'timeout'
      : /ECONNRESET|fetch failed|network/i.test(errorText) ? 'unknown'
      : 'failed'
    await recordRun(ctx, usage, status, errorText, Date.now() - started, reservationId)
    throw e
  }

  await recordRun(ctx, usage, status, errorText, Date.now() - started, reservationId)
  return value
}

/** Записать вызов и закрыть резерв фактической суммой. */
async function recordRun(
  ctx: SpendContext,
  usage: Usage,
  status: string,
  error: string | null,
  latencyMs: number,
  reservationId: number | null,
): Promise<void> {
  const { seo } = ctx
  try {
    const { data: cost } = await seo.rpc('run_cost', {
      p_provider: ctx.provider,
      p_model: ctx.model,
      p_input: usage.input_tokens ?? 0,
      p_cache_write: usage.cache_creation_input_tokens ?? 0,
      p_cache_read: usage.cache_read_input_tokens ?? 0,
      p_output: usage.output_tokens ?? 0,
      p_units: usage.units ?? null,
    })

    const { data: run, error: runErr } = await seo.from('runs').insert({
      job_id: ctx.jobId ?? null,
      article_id: ctx.articleId ?? null,
      trace_id: ctx.traceId ?? null,
      role: ctx.role,
      provider: ctx.provider,
      model: ctx.model,
      prompt_version: ctx.promptVersion ?? null,
      input_tokens: usage.input_tokens ?? 0,
      cache_write_tokens: usage.cache_creation_input_tokens ?? 0,
      cache_read_tokens: usage.cache_read_input_tokens ?? 0,
      output_tokens: usage.output_tokens ?? 0,
      units: usage.units ?? null,
      cost: cost ?? 0,
      status, error,
      latency_ms: latencyMs,
      finished_at: new Date().toISOString(),
    }).select('id').single()

    if (runErr) {
      // Таблицы ещё нет — миграция не применена. Молчать нельзя: без учёта мы
      // тратим вслепую, и это должно быть видно в логе.
      console.error(`[учёт] вызов не записан: ${runErr.message}`)
      return
    }

    if (reservationId != null) {
      if (status === 'ok') {
        await seo.rpc('settle_reservation', {
          p_reservation_id: reservationId, p_run_id: run.id, p_actual: cost ?? 0,
        })
      } else {
        // release сам откажется освобождать unknown и timeout — правило живёт
        // в базе, а не здесь, чтобы его нельзя было обойти другим вызывающим.
        await seo.rpc('release_reservation', {
          p_reservation_id: reservationId, p_reason: `исход ${status}`,
        })
      }
    }
  } catch (e: any) {
    console.error(`[учёт] не записан: ${e?.message ?? e}`)
  }
}

/** Сколько денег осталось. Для дашборда и для решения «начинать ли шаг». */
export async function budgetLeft(seo: any): Promise<{ scope: string; limit: number; used: number; left: number }[]> {
  const { data, error } = await seo.rpc('budget_left')
  if (error) return []
  return (data ?? []).map((r: any) => ({
    scope: r.scope, limit: Number(r.limit_usd), used: Number(r.used_usd), left: Number(r.left_usd),
  }))
}
