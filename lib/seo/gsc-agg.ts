/**
 * Сводка показов по страницам.
 *
 * Через обычный select это не собрать: клиент отдаёт максимум тысячу строк за
 * запрос и молча обрезает остальное — на 160 страницах за 28 дней данные врут.
 * Поэтому читаем страницами до конца.
 */
export type Traffic = { clicks: number; impressions: number; lastImpression: string | null }

export async function trafficByPage(seo: any, opts: { since?: string } = {}): Promise<Map<string, Traffic>> {
  const out = new Map<string, Traffic>()
  const PAGE = 1000

  for (let from = 0; ; from += PAGE) {
    let q = seo.from('gsc_page_daily').select('normalized_url, date, clicks, impressions')
      .order('date', { ascending: false }).range(from, from + PAGE - 1)
    if (opts.since) q = q.gte('date', opts.since)

    const { data, error } = await q
    if (error || !data?.length) break

    for (const r of data) {
      const t = out.get(r.normalized_url) ?? { clicks: 0, impressions: 0, lastImpression: null }
      t.clicks += r.clicks
      t.impressions += r.impressions
      if (r.impressions > 0 && (!t.lastImpression || r.date > t.lastImpression)) t.lastImpression = r.date
      out.set(r.normalized_url, t)
    }
    if (data.length < PAGE) break
  }
  return out
}
