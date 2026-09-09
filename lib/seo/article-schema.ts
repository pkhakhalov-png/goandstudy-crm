// JSON-LD для статьи по §10.1 приложения F.
// Правило скила `schema`: разметка описывает то, что реально есть на странице.
// Выдуманные рейтинги, отзывы, цены и авторы — прямой путь к ручным санкциям,
// поэтому здесь нет ни aggregateRating, ни Review, ни Offer.

export type ArticleSchemaInput = {
  h1: string
  description: string
  url: string
  datePublished: string        // ISO
  dateModified: string         // ISO
  /** §10.2.3: реальный человек со страницей автора. Пока страницы нет — null. */
  author: { name: string; url: string | null } | null
  imageUrl: string | null
  /** Видимые хлебные крошки — §10.2.6 требует совпадения с BreadcrumbList. */
  breadcrumbs: { name: string; url: string }[]
}

export const PUBLISHER = {
  '@type': 'Organization',
  name: 'goandstudy',
  url: 'https://goandstudy.com',
  logo: { '@type': 'ImageObject', url: 'https://goandstudy.com/wp-content/uploads/logo.png' },
}

export function buildArticleSchema(input: ArticleSchemaInput): { jsonld: any; problems: string[] } {
  const problems: string[] = []

  // §10.2.2: headline совпадает с H1, допускается сокращение до 110 символов
  const headline = input.h1.length > 110 ? input.h1.slice(0, 107).trimEnd() + '…' : input.h1

  const blogPosting: any = {
    '@type': 'BlogPosting',
    headline,
    description: input.description,
    mainEntityOfPage: { '@type': 'WebPage', '@id': input.url },
    url: input.url,
    datePublished: input.datePublished,
    dateModified: input.dateModified,
    publisher: PUBLISHER,
    inLanguage: 'ru-RU',
  }

  if (input.imageUrl) blogPosting.image = input.imageUrl
  else problems.push('§10.1: у BlogPosting нет image — поле обязательное, нужна обложка (§9.1)')

  if (input.author) {
    // url ставим только если страница автора действительно есть: ссылка в разметке
    // на несуществующую страницу хуже, чем Person с одним именем
    const person: any = { '@type': 'Person', name: input.author.name }
    if (input.author.url) person.url = input.author.url
    else problems.push(`§10.2.3: у автора «${input.author.name}» нет страницы автора — разметка уйдёт без ссылки`)
    blogPosting.author = person
  } else {
    problems.push('§10.2.3: автор не указан вовсе')
  }

  const graph: any[] = [blogPosting]

  if (input.breadcrumbs.length) {
    graph.push({
      '@type': 'BreadcrumbList',
      itemListElement: input.breadcrumbs.map((b, i) => ({
        '@type': 'ListItem', position: i + 1, name: b.name, item: b.url,
      })),
    })
  } else problems.push('§10.2.6: нет хлебных крошек')

  return { jsonld: { '@context': 'https://schema.org', '@graph': graph }, problems }
}

/** §2.10 Open Graph. Ставит мост, тема этого не делает. */
export function buildOpenGraph(input: { title: string; description: string; url: string; imageUrl: string | null }) {
  const og: Record<string, string> = {
    'og:type': 'article',
    'og:title': input.title,
    'og:description': input.description,
    'og:url': input.url,
  }
  if (input.imageUrl) og['og:image'] = input.imageUrl
  return og
}
