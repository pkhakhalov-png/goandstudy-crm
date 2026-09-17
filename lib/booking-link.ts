/**
 * Метки на ссылках «Записаться на консультацию».
 *
 * Зачем это здесь. В уведомлении о новой записи строка «Страница» показывала
 * `https://crm.goandstudy.com/book` — то есть саму форму записи. Это верно и
 * бесполезно: и так понятно, что запись пришла с формы записи. Нужен ответ на
 * другой вопрос — с какой страницы сайта и по какой кнопке человек на неё попал.
 *
 * Почему нельзя обойтись переходом (`document.referrer`). Во-первых, у всех
 * ссылок на запись стояло `rel="noopener noreferrer"`, а `noreferrer` стирает
 * переход целиком. Во-вторых, даже без него браузер по умолчанию отдаёт с
 * чужого домена только origin: получили бы `https://goandstudy.com/` без пути,
 * а нужен путь и кнопка. Поэтому источник несёт сама ссылка.
 *
 * Что кладём в ссылку:
 *   utm_source   всегда `goandstudy` — это наш сайт, а не реклама;
 *   utm_medium   вид места: статья блога, страница блога, страница сайта;
 *   utm_campaign слаг статьи или имя страницы — по нему группируются переходы;
 *   utm_content  какая именно ссылка на странице: в конце, в тексте, кнопка;
 *   from         путь страницы целиком.
 *
 * `from` — не стандартная метка, и это осознанно. Стандартные четыре нужны
 * счётчикам и не должны содержать косых черт, а человеку в уведомлении нужен
 * рабочий адрес, по которому можно кликнуть и увидеть ту самую страницу.
 * Собирать его обратно из слага — угадывание; проще передать как есть.
 */

/**
 * Адрес формы записи.
 *
 * Отдаётся через goandstudy.com, хотя сама форма живёт в CRM: сайт стоит в
 * Москве и доступен всем, а Vercel во Франкфурте часть посетителей из России
 * не открывает — и заявка терялась до заполнения. Посетитель общается только с
 * московским сервером, дальше запрос идёт сервер-сервер.
 */
export const BOOK_URL = 'https://goandstudy.com/book'

/** Ключи, которые форма записи читает из своего адреса. */
export const BOOK_SOURCE_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'from'] as const

export type BookSource = {
  /** Вид места: `blog_article`, `blog_index`, `site_page`. */
  medium: string
  /** Слаг статьи или имя страницы. */
  campaign?: string | null
  /** Какая ссылка на странице: `cta-final`, `cta-text-2`, `final-cta-button`. */
  content?: string | null
  /** Путь страницы: `/blog/kak-postupit-v-italiyu/`. */
  path?: string | null
}

/**
 * Ссылка на запись с метками.
 *
 * Если в адресе уже были свои параметры (например `?manager=`), они остаются:
 * метки добавляются, а не заменяют собой адрес.
 */
export function bookUrl(src: BookSource, base: string = BOOK_URL): string {
  let u: URL
  try { u = new URL(base) } catch { u = new URL(BOOK_URL) }
  u.searchParams.set('utm_source', 'goandstudy')
  u.searchParams.set('utm_medium', src.medium)
  if (src.campaign) u.searchParams.set('utm_campaign', src.campaign)
  if (src.content) u.searchParams.set('utm_content', src.content)
  if (src.path) u.searchParams.set('from', src.path)
  return u.toString()
}

/**
 * Проставить метки во все ссылки на запись внутри готового HTML.
 *
 * Делается один раз при публикации, а не при генерации: слаг статьи к моменту
 * публикации уже известен, а модель в тексте ставит ссылку сама и про метки
 * ничего не знает. Заодно это чинит ссылки, которые модель написала по-своему.
 *
 * Последняя ссылка на запись — это обязательный призыв в конце статьи (§3
 * стандарта), остальные стоят внутри текста. Различать их важно: «ссылка в
 * конце статьи» и «ссылка в третьем абзаце» — разные по смыслу переходы.
 *
 * Ещё здесь снимается `noreferrer`. Он стирает переход и ничего не защищает:
 * от подмены вкладки защищает `noopener`, который остаётся на месте.
 */
export function stampBookLinks(html: string, src: Omit<BookSource, 'content'>): { html: string; stamped: number } {
  // Ловим оба адреса: старые статьи ссылаются на crm.goandstudy.com, и их
  // тоже переводим на московский домен — иначе половина ссылок останется вести
  // туда, куда часть читателей не попадает.
  const re = /href="(https:\/\/(?:crm\.)?goandstudy\.com\/book[^"]*)"/g
  const hits = [...html.matchAll(re)]
  if (!hits.length) return { html, stamped: 0 }

  let i = 0
  const out = html.replace(re, (_m, href: string) => {
    const last = i === hits.length - 1
    const content = last ? 'cta-final' : `cta-text-${i + 1}`
    i++
    const onSiteDomain = href.replace('https://crm.goandstudy.com/book', BOOK_URL)
    return `href="${bookUrl({ ...src, content }, onSiteDomain)}"`
  })

  return {
    html: out.replace(/rel="noopener noreferrer"/g, 'rel="noopener"'),
    stamped: hits.length,
  }
}

/**
 * Человеческое описание источника для уведомления: строка «откуда» и адрес
 * страницы, если он известен.
 */
export function describeBookSource(u: Record<string, string>): { where: string; url: string | null } {
  const url = pageUrl(u)

  // Наши метки узнаём по источнику: `utm_source=goandstudy` ставим только мы.
  // Чужие (реклама, рассылки) показываем как есть — придумывать им описание
  // нельзя, мы не знаем, что там за площадка.
  const place = u.utm_source === 'goandstudy' ? MEDIUM_NAMES[u.utm_medium] : undefined
  if (place) {
    // Имя страницы добавляем, только если оно что-то добавляет: у самой страницы
    // блога кампания и есть «blog», и «страница блога «blog»» звучит глупо.
    const named = u.utm_campaign && u.utm_campaign !== 'blog' ? `${place} «${u.utm_campaign}»` : place
    const spot = describeContent(u.utm_content)
    return { where: [named, spot].filter(Boolean).join(' · '), url }
  }

  const foreign = [u.utm_source, u.utm_medium, u.utm_campaign].filter(Boolean).join(' / ')
  if (foreign) return { where: foreign, url }

  // Меток нет совсем. Так и говорим: молчание здесь хуже, чем прямое «меток не
  // было» — иначе непонятно, то ли человек пришёл ниоткуда, то ли на кнопке их
  // забыли поставить.
  return {
    where: url ? `переход с ${url}` : 'метки не переданы — ссылка была без них',
    url: null,
  }
}

const MEDIUM_NAMES: Record<string, string> = {
  blog_article: 'статья блога',
  blog_index: 'страница блога',
  site_page: 'страница сайта',
}

function describeContent(content?: string): string | null {
  if (!content) return null
  if (content === 'cta-final') return 'ссылка в конце статьи'
  const inText = content.match(/^cta-text-(\d+)$/)
  if (inText) return `ссылка в тексте, ${inText[1]}-я`
  if (content === 'final-cta-button') return 'кнопка «Записаться» внизу страницы'
  return content
}

/**
 * Адрес страницы-источника. Форма записи источником не считается: именно её
 * подстановка и делала строку «Страница» бессмысленной.
 */
function pageUrl(u: Record<string, string>): string | null {
  if (u.from) {
    const path = u.from.startsWith('/') ? u.from : `/${u.from}`
    return `https://goandstudy.com${path}`
  }
  for (const raw of [u.referrer, u.landing_url]) {
    if (!raw) continue
    try {
      const parsed = new URL(raw)
      // Сама форма источником не является. Раньше отсекали её по домену `crm.`,
      // но теперь она отдаётся с goandstudy.com — значит отсекаем по пути,
      // иначе строка «Откуда» снова начнёт показывать саму форму.
      if (parsed.hostname.startsWith('crm.')) continue
      if (parsed.pathname === '/book' || parsed.pathname.startsWith('/book/')) continue
      return raw
    } catch { /* не адрес — пропускаем */ }
  }
  return null
}
