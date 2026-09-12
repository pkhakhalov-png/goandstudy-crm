/**
 * Служебные данные версий статей — одной выборкой на все статьи сразу.
 *
 * В четырёх местах воркера был один и тот же цикл: пройти по статьям и на
 * каждую сходить в базу за её версией, чтобы достать адрес из meta. При
 * тринадцати статьях это тринадцать походов подряд вместо одного, и дальше
 * только хуже: статьи выходят каждый день.
 */

export type Meta = Record<string, any>

/** Адрес статьи по её служебным данным. Класть его туда могли двумя способами. */
export function slugOf(meta: Meta | null | undefined): string | null {
  if (!meta) return null
  return (meta.publish?.slug ?? meta.slug ?? null) as string | null
}

export function urlOf(meta: Meta | null | undefined): string | null {
  const slug = slugOf(meta)
  return slug ? `https://goandstudy.com/blog/${slug}` : null
}

/**
 * Служебные данные версий по их идентификаторам. Читается пачками по 200:
 * длинный список идентификаторов в адресе запроса упирается в предел длины
 * строки, а не в скорость.
 */
export async function metaByVersion(seo: any, versionIds: (number | null | undefined)[]): Promise<Map<number, Meta>> {
  const ids = [...new Set(versionIds.filter((v): v is number => typeof v === 'number'))]
  const out = new Map<number, Meta>()
  if (!ids.length) return out

  for (let i = 0; i < ids.length; i += 200) {
    const { data, error } = await seo.from('article_versions').select('id, meta').in('id', ids.slice(i, i + 200))
    if (error) throw new Error(`версии статей: ${error.message}`)
    for (const v of data ?? []) out.set(v.id, (v.meta ?? {}) as Meta)
  }
  return out
}

/** Адреса опубликованных статей — то, что чаще всего и требуется. */
export async function urlsOfArticles(
  seo: any,
  articles: { current_version_id?: number | null }[],
): Promise<Map<number, string>> {
  const metas = await metaByVersion(seo, articles.map((a) => a.current_version_id))
  const out = new Map<number, string>()
  for (const [id, meta] of metas) {
    const url = urlOf(meta)
    if (url) out.set(id, url)
  }
  return out
}
