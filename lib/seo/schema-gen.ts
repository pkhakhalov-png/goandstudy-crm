// Генерация schema.org (JSON-LD) для страниц без разметки — PRD v2.0 §5.6.
// Строгое правило §12.3: только ПОДТВЕРЖДЁННЫЕ, видимые в контенте поля.
// Запрещено выдумывать: рейтинги, отзывы, цены, даты, авторов, FAQ.
// Пишет предложения в seo.page_schema (source='recommend', status='proposed').

type P = { id: number; normalized_url: string; url: string | null; title: string | null; h1: string | null; meta_desc: string | null; page_type: string; has_schema: boolean | null }

const ORG = { '@type': 'Organization', name: 'Go&Study', url: 'https://goandstudy.com' }

function titleCase(seg: string): string {
  const s = decodeURIComponent(seg).replace(/[-_]+/g, ' ').trim()
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s
}

// BreadcrumbList из пути URL — структурная разметка, не утверждение о фактах
function breadcrumb(url: string, lastName: string): any {
  let path = ''
  try { path = new URL(url).pathname } catch { return null }
  const segs = path.split('/').filter(Boolean)
  const items: any[] = [{ '@type': 'ListItem', position: 1, name: 'Главная', item: 'https://goandstudy.com/' }]
  let acc = 'https://goandstudy.com'
  segs.forEach((seg, i) => {
    acc += '/' + seg
    items.push({ '@type': 'ListItem', position: i + 2, name: i === segs.length - 1 ? lastName : titleCase(seg), item: acc })
  })
  return { '@type': 'BreadcrumbList', itemListElement: items }
}

function buildJsonLd(p: P): { schema_type: string; jsonld: any } {
  const url = p.url || p.normalized_url
  const name = (p.h1 || p.title || '').trim()
  const desc = (p.meta_desc || '').trim()
  const isArticle = p.page_type === 'article'
  const mainType = isArticle ? 'BlogPosting' : 'Service'

  const main: any = isArticle
    ? {
        '@type': 'BlogPosting',
        headline: name.slice(0, 110),
        ...(desc ? { description: desc } : {}),
        inLanguage: 'ru-RU',
        url,
        mainEntityOfPage: { '@type': 'WebPage', '@id': url },
        publisher: ORG,
      }
    : {
        '@type': 'Service',
        name: name || p.title || url,
        ...(desc ? { description: desc } : {}),
        serviceType: 'Образовательный консалтинг',
        areaServed: { '@type': 'Country', name: 'Россия' },
        provider: ORG,
        url,
      }
  // никаких datePublished/author/aggregateRating/offers — их нет в подтверждённом виде

  const graph = [main]
  const bc = breadcrumb(url, name || 'Страница')
  if (bc) graph.push(bc)

  return { schema_type: mainType, jsonld: { '@context': 'https://schema.org', '@graph': graph } }
}

/** Сгенерировать/обновить предложения schema для страниц без JSON-LD. Возвращает счётчики. */
export async function generateSchemaProposals(seo: any): Promise<{ generated: number; by_type: Record<string, number> }> {
  const out: P[] = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await seo.from('pages')
      .select('id, normalized_url, url, title, h1, meta_desc, page_type, has_schema')
      .eq('has_schema', false).is('removed_at', null).range(from, from + 999)
    if (error) throw new Error(`pages: ${error.message}`)
    for (const p of data ?? []) out.push(p)
    if (!data || data.length < 1000) break
  }
  // утилитарные/юридические страницы не размечаем как Service (§5.6 применимость типа)
  const UTIL = /oferta|politik|policy|privacy|terms|cookie|soglasie|dogovor-oferty|personal|confiden/i
  const content = out.filter((p) =>
    (p.page_type === 'article' || p.page_type === 'service' || p.page_type === 'landing' || p.page_type === 'commercial')
    && !UTIL.test(p.normalized_url))

  // пере-генерируем только необработанные предложения (status='proposed', source='recommend')
  const ids = content.map((p) => p.id)
  if (ids.length) await seo.from('page_schema').delete().eq('source', 'recommend').eq('status', 'proposed').in('page_id', ids)

  const byType: Record<string, number> = {}
  const rows = content.map((p) => {
    const { schema_type, jsonld } = buildJsonLd(p)
    byType[schema_type] = (byType[schema_type] || 0) + 1
    return { page_id: p.id, schema_type, jsonld, source: 'recommend', status: 'proposed' }
  })
  for (let i = 0; i < rows.length; i += 200) {
    const { error } = await seo.from('page_schema').insert(rows.slice(i, i + 200))
    if (error) throw new Error(`page_schema insert: ${error.message}`)
  }
  return { generated: rows.length, by_type: byType }
}
