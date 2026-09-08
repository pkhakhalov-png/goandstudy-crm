// Реестр шагов SEO-пайплайна. Каждый шаг: (job) => { outcome, result }.
// outcome: done | retry | failed | awaiting_human.
// На этапе M0 есть только echo/noop — доказывают, что очередь и fan-in работают.
// Реальные шаги (10.1: dedup_check, serp_fetch, extract_claims, write_section, …)
// регистрируются здесь по мере готовности модулей M8/M9.

export type Job = {
  id: number
  step: string
  lane: string
  payload: Record<string, any>
  run_id: number | null
  run_item_id: number | null
  article_id: number | null
  topic_id: number | null
}

export type StepOutcome = {
  outcome: 'done' | 'retry' | 'failed' | 'awaiting_human'
  result?: Record<string, any>
}

type Handler = (job: Job) => Promise<StepOutcome>

const registry: Record<string, Handler> = {
  // Технические шаги M0 — для проверки воркера и fan-in.
  echo: async (job) => ({ outcome: 'done', result: { echoed: job.payload ?? {}, cost: 0 } }),
  noop: async () => ({ outcome: 'done', result: { cost: 0 } }),
}

export function registerStep(step: string, handler: Handler) {
  registry[step] = handler
}

export async function runStep(job: Job): Promise<StepOutcome> {
  const handler = registry[job.step]
  if (!handler) {
    // Нет обработчика — не крутим ретраи впустую, помечаем failed с явной причиной.
    return { outcome: 'failed', result: { error: `no handler for step "${job.step}"` } }
  }
  return handler(job)
}
