// Embedding-клиент (PRD 4.5). Claude API эмбеддингов не даёт — отдельный провайдер.
// Дефолт: Voyage (vector(1024)). Провайдер и модель — из env; размерность зашита в
// vector(N) миграции 001, менять синхронно.

export const EMBEDDING_DIM = Number(process.env.EMBEDDING_DIM || 1024)

type EmbedInput = string | string[]

async function voyageEmbed(input: string[], model: string, apiKey: string): Promise<number[][]> {
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
  return (json.data as any[]).map((d) => d.embedding as number[])
}

async function openaiEmbed(input: string[], model: string, apiKey: string): Promise<number[][]> {
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
  return (json.data as any[]).map((d) => d.embedding as number[])
}

/** Вернуть эмбеддинги в порядке входа. Размерность = EMBEDDING_DIM. */
export async function embed(input: EmbedInput): Promise<number[][]> {
  const items = Array.isArray(input) ? input : [input]
  if (items.length === 0) return []
  const provider = (process.env.EMBEDDING_PROVIDER || 'voyage').toLowerCase()
  const apiKey = process.env.EMBEDDING_API_KEY
  const model = process.env.EMBEDDING_MODEL || (provider === 'voyage' ? 'voyage-3' : 'text-embedding-3-small')
  if (!apiKey) throw new Error('EMBEDDING_API_KEY не задан')

  let out: number[][]
  if (provider === 'voyage') out = await voyageEmbed(items, model, apiKey)
  else if (provider === 'openai') out = await openaiEmbed(items, model, apiKey)
  else throw new Error(`embedding provider "${provider}" не реализован (voyage|openai)`)

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
