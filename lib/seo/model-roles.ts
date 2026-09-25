/**
 * Роли через настройку, а не через константу в коде (E2.7).
 *
 * До сих пор модель писателя была зашита строкой в `generate.ts`. Это значит,
 * что смена модели — правка кода и выкладка, а вопрос «на какой модели написана
 * вот эта статья» отвечается через git blame по дате. PRD требует, чтобы
 * провайдер, модель, версия промпта и тариф задавались настройкой: тогда смену
 * видно в одном месте и её можно откатить, не трогая конвейер.
 *
 * Порядок предпочтений — от самого явного к самому общему:
 *   1. строка в `seo.model_roles` — кто-то решил осознанно;
 *   2. переменная окружения — так настроена выкладка;
 *   3. константа ниже — как было до этой задачи.
 *
 * Константы намеренно равны тому, что стоит в коде сегодня. Применение миграции
 * не должно менять ни одной буквы в том, как пишутся статьи: настройка сначала
 * появляется, и только потом кто-то её меняет.
 */

export type RoleName = 'writer' | 'fact_reviewer' | 'context_reviewer' | 'embeddings' | 'image' | 'diagrams'

export type RoleConfig = {
  role: RoleName
  provider: string
  model: string
  promptVersion: string | null
  maxTokens: number | null
  /** Откуда взялось значение — видно на экране и в отчёте. */
  source: 'настройка' | 'окружение' | 'по умолчанию'
}

/** Как есть сегодня. Менять здесь — значит менять поведение по умолчанию. */
const DEFAULTS: Record<RoleName, { provider: string; model: string; promptVersion: string | null; env?: string }> = {
  writer:           { provider: 'anthropic', model: 'claude-opus-5', promptVersion: 'v1' },
  fact_reviewer:    { provider: 'anthropic', model: 'claude-opus-5', promptVersion: 'v1' },
  context_reviewer: { provider: 'anthropic', model: 'claude-opus-5', promptVersion: 'v1' },
  diagrams:         { provider: 'anthropic', model: 'claude-opus-5', promptVersion: 'v1' },
  embeddings:       { provider: 'voyage',    model: 'voyage-3',      promptVersion: null, env: 'EMBEDDING_MODEL' },
  image:            { provider: 'fal',       model: 'fal-ai/nano-banana-2', promptVersion: null, env: 'FAL_IMAGE_MODEL' },
}

/**
 * Настройка читается редко, а спрашивают её на каждом шаге. Держим ненадолго
 * в памяти: полминуты — это несколько шагов одной статьи, и за это время
 * настройку никто не меняет. Дольше держать нельзя: смена модели должна
 * доезжать до конвейера без перезапуска.
 */
const TTL_MS = 30_000
let cache: { at: number; rows: Map<string, any> } | null = null
let tableMissing = false

function fallback(role: RoleName, why: RoleConfig['source']): RoleConfig {
  const d = DEFAULTS[role]
  const fromEnv = d.env ? process.env[d.env] : undefined
  return {
    role,
    provider: d.provider,
    model: fromEnv || d.model,
    promptVersion: d.promptVersion,
    maxTokens: null,
    source: fromEnv ? 'окружение' : why,
  }
}

async function load(seo: any): Promise<Map<string, any>> {
  const now = Date.now()
  if (cache && now - cache.at < TTL_MS) return cache.rows
  const { data, error } = await seo.from('model_roles').select('role, provider, model, prompt_version, max_tokens, enabled')
  if (error) {
    if (/schema cache|does not exist/i.test(error.message)) tableMissing = true
    return new Map()
  }
  const rows = new Map<string, any>()
  for (const r of (data ?? []) as any[]) if (r.enabled !== false) rows.set(r.role, r)
  cache = { at: now, rows }
  return rows
}

/**
 * Чем работает роль прямо сейчас.
 *
 * Без клиента базы или до применения миграции возвращает то же, что стояло в
 * коде: код обязан работать, когда настройки ещё нет.
 *
 * Проверяем не «есть ли объект», а «умеет ли он from». Разница стоила восьми
 * статей: контекст генерации ездит между шагами через jobs.payload, то есть
 * через JSON, и живой клиент Supabase этого не переживает — в базе от него
 * остаётся скелет {url, headers, schemaName}. Он непустой, проверку на !seo
 * проходил, а на первом же seo.from падал «e.from is not a function».
 */
export async function resolveRole(seo: any | null, role: RoleName): Promise<RoleConfig> {
  if (!seo || typeof seo.from !== 'function' || tableMissing) return fallback(role, 'по умолчанию')
  const rows = await load(seo)
  const r = rows.get(role)
  if (!r) return fallback(role, 'по умолчанию')
  return {
    role,
    provider: r.provider,
    model: r.model,
    promptVersion: r.prompt_version ?? DEFAULTS[role].promptVersion,
    maxTokens: r.max_tokens ?? null,
    source: 'настройка',
  }
}

/** Все роли разом — для экрана «Конвейер»: видно, что чем работает. */
export async function allRoles(seo: any | null): Promise<RoleConfig[]> {
  const names = Object.keys(DEFAULTS) as RoleName[]
  return Promise.all(names.map((n) => resolveRole(seo, n)))
}

/** Только для тестов: забыть прочитанное. */
export function __resetRoles() { cache = null; tableMissing = false }
