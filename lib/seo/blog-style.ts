// Стандарт статьи блога goandstudy (goandstudy-ARTICLE-STYLE.md).
//
// Выведен из 76 живых статей и описывает конкретную тему сайта, поэтому там,
// где он спорит с приложением F (оглавление, блок «Читайте также», длина
// excerpt), главный он. От приложения F остаётся то, что не противоречит:
// язык, тире, запрещённые обороты, факты, обещания, каннибализация.
import type { Check } from './standard'

/** §8: категория только из этого списка, иначе пилюля фильтра её не покажет. */
export const BLOG_CATEGORIES = [
  'США', 'Германия', 'Великобритания', 'Италия', 'Франция', 'Китай', 'ОАЭ',
  'Стипендии', 'Экзамены', 'Визы', 'Языковые курсы', 'Поступление', 'Жизнь студента',
] as const
export type BlogCategory = typeof BLOG_CATEGORIES[number]

/** §3: последний блок статьи, дословно. */
export const CTA_HTML =
  '<p>Хотите поступить за рубеж? <a href="https://crm.goandstudy.com/book" target="_blank" rel="noopener noreferrer">Запишитесь на бесплатную консультацию</a> — разберём ваш случай и составим план.</p>'

/**
 * §2: белый список блоков. Всё остальное в теме не стилизовано.
 *
 * Блок картинки добавлен позже остальных: в 77 старых статьях изображений внутри
 * текста нет, формат заводится заново. Ставит его машина после генерации, руками
 * модель картинки в текст не вписывает.
 */
export const ALLOWED_BLOCKS = ['paragraph', 'heading', 'list', 'table', 'quote', 'image'] as const

/**
 * Привести тело к стандарту в том, что не должно зависеть от модели.
 *
 * Финальный CTA обязан быть дословным (§3). Полагаться на то, что модель повторит
 * его символ в символ, нельзя: на живом прогоне она выбросила слово «бесплатную»,
 * потому что предыдущая проверка ошибочно сочла бесплатность противоречием прайсу.
 * Требование, которое проверяется побуквенно, дешевле проставить кодом.
 */
export function normalizeBody(body: string): string {
  // Режем по границам блоков и работаем с целыми блоками. Регулярное выражение
  // «от начала абзаца до ссылки» уже показало, чем это кончается: на живых статьях
  // оно съело весь текст между первым абзацем и призывом в конце.
  const blocks = splitBlocks(body)
  while (blocks.length && blocks[blocks.length - 1].includes('crm.goandstudy.com/book')) blocks.pop()
  blocks.push(`<!-- wp:paragraph -->\n${CTA_HTML}\n<!-- /wp:paragraph -->`)
  return blocks.join('\n\n')
}

/** Разбор тела на блоки Гутенберга: от «<!-- wp:x -->» до парного «<!-- /wp:x -->». */
export function splitBlocks(body: string): string[] {
  const out: string[] = []
  const re = /<!--\s*wp:([a-z]+)[^]*?<!--\s*\/wp:\1\s*-->/g
  let m: RegExpExecArray | null
  while ((m = re.exec(body)) !== null) out.push(m[0].trim())
  return out
}

export type BlogCheckInput = {
  body: string          // разметка Гутенберга
  title: string
  excerpt: string
  slug: string
  category: string
  /** Слаги существующих статей блога — для проверки внутренних ссылок. */
  knownBlogSlugs: Set<string>
  /** Пути посадочных страниц вида /stipendii. */
  knownPagePaths: Set<string>
}

export function checkBlogStandard(input: BlogCheckInput): Check[] {
  const out: Check[] = []
  const add = (id: string, level: 'B' | 'W', ok: boolean, detail: string) => out.push({ id, level, ok, detail })
  const { body } = input

  /* §1 Slug */
  add('1 slug только [a-z0-9-]', 'B', /^[a-z0-9-]+$/.test(input.slug), input.slug)
  const slugWords = input.slug.split('-').filter(Boolean).length
  add('1 slug 3–7 слов', 'W', slugWords >= 3 && slugWords <= 7, `${slugWords} слов`)

  /* §2.1 Ничего исполняемого в теле */
  const danger = findDangerous(body)
  add('2.1 нет исполняемой разметки', 'B', danger.length === 0,
    danger.length ? `найдено: ${danger.join(', ')}` : 'скриптов, форм и обработчиков нет')

  /* §2 Белый список блоков */
  const blocks = [...body.matchAll(/<!--\s*wp:([a-z]+)/g)].map((m) => m[1])
  const alien = [...new Set(blocks.filter((b) => !ALLOWED_BLOCKS.includes(b as any)))]
  add('2 только разрешённые типы блоков', 'B', alien.length === 0,
    alien.length ? `посторонние: ${alien.join(', ')}` : `${blocks.length} блоков, все разрешённые`)

  const opens = (body.match(/<!--\s*wp:/g) ?? []).length
  const closes = (body.match(/<!--\s*\/wp:/g) ?? []).length
  add('2 блоки закрыты', 'B', opens === closes, `открыто ${opens}, закрыто ${closes}`)

  add('2 нет h1 в теле', 'B', !/<h1[\s>]/i.test(body), 'h1 отдаёт заголовок страницы')
  const badClass = [...body.matchAll(/class="([^"]+)"/g)].map((m) => m[1])
    .filter((c) => !/^wp-block-(table|quote)$/.test(c.trim()))
  add('2 нет посторонних class', 'B', badClass.length === 0,
    badClass.length ? `${[...new Set(badClass)].slice(0, 3).join(', ')}` : 'только классы Гутенберга')
  add('2 нет style= и <br>', 'B', !/style="/i.test(body) && !/<br\s*\/?>/i.test(body), 'инлайновые стили и переносы ломают ритм')
  add('2 нет эмодзи', 'B', !/\p{Extended_Pictographic}/u.test(body), 'эмодзи встречаются только в мёртвом блоке')

  /* §3 Скелет */
  const text = body.replace(/<!--[\s\S]*?-->/g, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
  const words = text.split(' ').filter(Boolean).length
  add('3 длина 900–1600 слов', 'W', words >= 900 && words <= 1600, `${words} слов`)

  const h2 = [...body.matchAll(/<h2[^>]*>([\s\S]*?)<\/h2>/gi)].map((m) => strip(m[1]))
  add('3 от 6 до 14 разделов H2', 'W', h2.length >= 6 && h2.length <= 14, `${h2.length} H2`)

  const faqIdx = h2.findIndex((t) => /^частые вопросы$|^часто задаваемые вопросы$/i.test(t.trim()))
  add('3 есть раздел «Частые вопросы»', 'B', faqIdx >= 0, faqIdx >= 0 ? h2[faqIdx] : 'обязательный раздел отсутствует')

  if (faqIdx >= 0) {
    const tail = body.slice(body.indexOf(`<h2`, indexOfNth(body, '<h2', faqIdx)))
    const pairs = (tail.match(/<h3[^>]*>/gi) ?? []).length
    add('3 в FAQ 4–8 пар вопрос-ответ', 'W', pairs >= 4 && pairs <= 8, `${pairs} вопросов`)
    add('3 FAQ сделан на H3, не кнопками', 'B', !/gas-faq-question/.test(body), 'кнопки-аккордеоны в теме не стилизованы')
  }

  const lastBlock = body.trimEnd().split(/<!--\s*\/wp:[a-z]+\s*-->/).filter((s) => s.trim()).pop() ?? ''
  const hasLink = lastBlock.includes('crm.goandstudy.com/book')
  const exact = lastBlock.includes('Запишитесь на бесплатную консультацию')
  add('3 последний блок — дословный CTA', 'B', hasLink && exact,
    !hasLink ? 'CTA отсутствует или стоит не последним'
      : !exact ? 'текст призыва изменён: нужен дословный «Запишитесь на бесплатную консультацию»'
      : 'на месте')

  /* §5 Таблицы, §6 цитаты */
  const tables = (body.match(/<!--\s*wp:table/g) ?? []).length
  add('5 не больше трёх таблиц', 'W', tables <= 3, `${tables}`)
  const tablesNoHead = (body.match(/<table>(?![\s\S]{0,200}<thead>)/g) ?? []).length
  add('5 у таблиц есть thead', 'B', tablesNoHead === 0, tablesNoHead ? `${tablesNoHead} без шапки` : 'все с шапкой')
  const quotes = (body.match(/<!--\s*wp:quote/g) ?? []).length
  add('6 не больше одной цитаты', 'W', quotes <= 1, `${quotes}`)

  /* §7 Перелинковка */
  const hrefs = [...body.matchAll(/href="([^"]+)"/g)].map((m) => m[1])
  const absolute = hrefs.filter((h) => h.includes('goandstudy.com') && !h.includes('crm.goandstudy.com/book'))
  add('7 внутренние ссылки относительные', 'B', absolute.length === 0,
    absolute.length ? `абсолютных: ${absolute.length}` : 'все относительные')

  const internal = hrefs.filter((h) => h.startsWith('/'))
  add('7 от 2 до 5 внутренних ссылок', 'W', internal.length >= 2 && internal.length <= 5, `${internal.length}`)

  const broken = internal.filter((h) => {
    const path = h.replace(/\/$/, '')
    if (path.startsWith('/blog/')) return !input.knownBlogSlugs.has(path.replace('/blog/', ''))
    return !input.knownPagePaths.has(path)
  })
  add('7 все внутренние ссылки существуют', 'B', broken.length === 0,
    broken.length ? `битые: ${broken.join(', ')}` : `${internal.length} проверено`)

  /* §8 Реестр */
  add('8 title не длиннее 65', 'B', input.title.length <= 65, `${input.title.length} символов`)
  add('8 excerpt 90–150', 'B', input.excerpt.length >= 90 && input.excerpt.length <= 160, `${input.excerpt.length} символов`)
  add('8 категория из списка', 'B', (BLOG_CATEGORIES as readonly string[]).includes(input.category), input.category || '(пусто)')

  return out
}

function strip(s: string): string { return s.replace(/<[^>]+>/g, '').trim() }

function indexOfNth(hay: string, needle: string, n: number): number {
  let i = -1
  for (let k = 0; k <= n; k++) { i = hay.indexOf(needle, i + 1); if (i < 0) return 0 }
  return i
}


/** Слаги статей блога и пути посадочных из инвентаря — для проверки ссылок (§7). */
export async function loadSiteTargets(seo: any): Promise<{ knownBlogSlugs: Set<string>; knownPagePaths: Set<string> }> {
  const knownBlogSlugs = new Set<string>()
  const knownPagePaths = new Set<string>()
  for (let from = 0; ; from += 1000) {
    const { data, error } = await seo.from('pages').select('normalized_url').is('removed_at', null).range(from, from + 999)
    if (error) throw new Error(`pages: ${error.message}`)
    for (const p of data ?? []) {
      const path = String(p.normalized_url).replace('https://goandstudy.com', '').replace(/\/$/, '')
      if (!path) continue
      if (path.startsWith('/blog/')) knownBlogSlugs.add(path.replace('/blog/', ''))
      else knownPagePaths.add(path)
    }
    if (!data || data.length < 1000) break
  }
  return { knownBlogSlugs, knownPagePaths }
}

/* ── Санитария тела статьи ────────────────────────────────────────────────── */

/**
 * Опасные куски разметки. Тело статьи пишет модель, а тема выводит его в
 * страницу как есть — значит между моделью и посетителем не должно оставаться
 * ничего исполняемого. PHP не страшен: тема читает файл через file_get_contents,
 * а не подключает его. А вот скрипт, обработчик события или рамка с чужим
 * сайтом отработают в браузере читателя.
 */
const DANGEROUS: { re: RegExp; what: string }[] = [
  { re: /<script[\s\S]*?<\/script>|<script[^>]*>/gi, what: 'скрипт' },
  { re: /<iframe[\s\S]*?<\/iframe>|<iframe[^>]*>/gi, what: 'рамка iframe' },
  { re: /<object[\s\S]*?<\/object>|<embed[^>]*>/gi, what: 'встроенный объект' },
  { re: /<form[\s\S]*?<\/form>|<form[^>]*>/gi, what: 'форма' },
  { re: /<style[\s\S]*?<\/style>/gi, what: 'блок стилей' },
  { re: /\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, what: 'обработчик события' },
  { re: /(href|src)\s*=\s*("|')?\s*(javascript|data|vbscript):/gi, what: 'ссылка со скриптом' },
  { re: /<\?php|<\?=/gi, what: 'вставка PHP' },
]

export function findDangerous(body: string): string[] {
  const found: string[] = []
  for (const d of DANGEROUS) if (d.re.test(body)) found.push(d.what)
  for (const d of DANGEROUS) d.re.lastIndex = 0
  return [...new Set(found)]
}

/**
 * Вырезать опасное. Возвращает очищенный текст и список того, что убрали —
 * молча чистить нельзя: это признак того, что с генерацией что-то не так,
 * и человек должен об этом узнать.
 */
export function sanitizeBody(body: string): { body: string; removed: string[] } {
  let out = body
  const removed: string[] = []
  for (const d of DANGEROUS) {
    d.re.lastIndex = 0
    if (d.re.test(out)) {
      removed.push(d.what)
      d.re.lastIndex = 0
      out = out.replace(d.re, '')
    }
  }
  return { body: out, removed: [...new Set(removed)] }
}
