// Embedding-клиент (PRD 4.5). Claude API эмбеддингов не даёт — отдельный провайдер.
// Дефолт: Voyage (vector(1024)). Провайдер и модель — из env; размерность зашита в
// vector(N) миграции 001, менять синхронно.

export const EMBEDDING_DIM = Number(process.env.EMBEDDING_DIM || 1024)

type EmbedInput = string | string[]

/** Ответ провайдера: векторы и то, во что обошёлся запрос. */
type EmbedResult = { vectors: number[][]; tokens: number }

async function voyageEmbed(input: string[], model: string, apiKey: string): Promise<EmbedResult> {
  const res = await fetch('https://api.voyageai.com/v1/embeddings', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, input }),
    signal: AbortSignal.timeout(30_000),
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`voyage ${res.status}: ${body.slice(0, 300)}`)
  }
  const json = await res.json()
  // { data: [{ embedding: number[] }], ... } в порядке входа
  return {
    vectors: (json.data as any[]).map((d) => d.embedding as number[]),
    tokens: Number(json.usage?.total_tokens ?? 0),
  }
}

async function openaiEmbed(input: string[], model: string, apiKey: string): Promise<EmbedResult> {
  const res = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, input, dimensions: EMBEDDING_DIM }),
    signal: AbortSignal.timeout(30_000),
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`openai ${res.status}: ${body.slice(0, 300)}`)
  }
  const json = await res.json()
  return {
    vectors: (json.data as any[]).map((d) => d.embedding as number[]),
    tokens: Number(json.usage?.total_tokens ?? json.usage?.prompt_tokens ?? 0),
  }
}

/** Вернуть эмбеддинги в порядке входа. Размерность = EMBEDDING_DIM. */
export async function embed(input: EmbedInput): Promise<number[][]> {
  const items = Array.isArray(input) ? input : [input]
  if (items.length === 0) return []
  const provider = (process.env.EMBEDDING_PROVIDER || 'voyage').toLowerCase()
  const apiKey = process.env.EMBEDDING_API_KEY
  const model = process.env.EMBEDDING_MODEL || (provider === 'voyage' ? 'voyage-3' : 'text-embedding-3-small')
  if (!apiKey) throw new Error('EMBEDDING_API_KEY не задан')

  if (provider !== 'voyage' && provider !== 'openai') {
    throw new Error(`embedding provider "${provider}" не реализован (voyage|openai)`)
  }
  const ask = (): Promise<EmbedResult> => provider === 'voyage'
    ? voyageEmbed(items, model, apiKey)
    : openaiEmbed(items, model, apiKey)

  // Эмбеддинги стоят денег и зовутся отовсюду: из подбора тем, плана ссылок,
  // проверки каннибализации, обхода страниц. Поодиночке копейки, но их много —
  // и раньше ни одна не попадала в отчёт. Контекст задачи берём из хранилища:
  // протаскивать его через восемь мест вызова ради учёта было бы дороже.
  //
  // Оценка — верхняя граница резерва: даже пачка в сотни текстов у Voyage
  // укладывается в центы.
  const { withSpend } = await import('./spend')
  const { currentSpendContext } = await import('./spend-context')
  const spend = currentSpendContext()

  const res: EmbedResult = spend
    ? await withSpend(
        { ...spend, role: 'embeddings', provider, model, estimate: 0.05 },
        async () => {
          const r = await ask()
          // Токены считает провайдер; units — сколько текстов ушло, по ним
          // видно объём, даже пока тариф не заведён
          return { value: r, usage: { input_tokens: r.tokens, units: items.length } }
        },
      )
    : await ask()   // вне задачи (скрипт, ручной прогон) относить расход не к чему

  const out = res.vectors

  for (const v of out) {
    if (v.length !== EMBEDDING_DIM) {
      throw new Error(`размерность эмбеддинга ${v.length} ≠ EMBEDDING_DIM ${EMBEDDING_DIM} — проверь модель/миграцию 001`)
    }
  }
  return out
}

/** Формат pgvector-литерала для записи в колонку vector(N): '[0.1,0.2,...]'. */
export function toPgVector(v: number[]): string {
  return `[${v.join(',')}]`
}
