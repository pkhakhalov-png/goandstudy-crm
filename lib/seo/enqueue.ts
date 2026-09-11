/**
 * Постановка задачи в очередь.
 *
 * Отдельная функция нужна из-за одной практической детали: колонка `runner`
 * появляется миграцией, а код выкладывается раньше или позже неё. Вставка с
 * неизвестной колонкой отлетает целиком — и публикация бы просто перестала
 * ставиться. Поэтому при такой ошибке повторяем без неё: маршрутизация
 * деградирует до прежнего поведения, но работа не встаёт.
 */
export type JobRow = Record<string, unknown> & { step: string; runner?: 'any' | 'vercel' | 'agent' }

export async function enqueueJob(seo: any, row: JobRow): Promise<{ error?: string; degraded?: boolean }> {
  const { error } = await seo.from('jobs').insert(row)
  if (!error) return {}

  if (/runner/.test(error.message)) {
    const { runner, ...withoutRunner } = row
    const retry = await seo.from('jobs').insert(withoutRunner)
    return retry.error ? { error: retry.error.message } : { degraded: true }
  }
  return { error: error.message }
}
