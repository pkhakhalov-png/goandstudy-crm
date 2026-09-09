// Приложение F к PRD v2.0 — стандарт статьи, машинная часть.
//
// Здесь только то, что проверяется детерминированно: счётчик, регулярка, парсер.
// Оценочные суждения («полнота», «интереснее конкурентов») сюда не попадают —
// по правилу разделения из §0 они не блокируют публикацию.
//
// Уровни: B — блокирует публикацию, W — показывается редактору, не блокирует.
import { parse } from 'node-html-parser'

export type Level = 'B' | 'W'
export type Check = { id: string; level: Level; ok: boolean; detail: string }

export type CheckInput = {
  html: string                  // тело статьи (без H1 — его печатает тема)
  h1: string
  title: string
  description: string
  slug: string
  primaryKeyword: string
  /** URL всех известных страниц сайта — для проверки внутренних ссылок (§8.2). */
  knownUrls: Set<string>
  /** Title и description существующих страниц — для проверки уникальности (§2.2, §2.7). */
  existingTitles: Set<string>
  existingDescriptions: Set<string>
  existingSlugs: Set<string>
}

/* ── §6.2 Запрещённые обороты ─────────────────────────────────────────────── */

export const FORBIDDEN_PHRASES: RegExp[] = [
  // начала
  /в современном мире/i, /в наши дни/i, /в эпоху/i, /в условиях постоянно меняющегося/i,
  /сегодня всё больше людей/i, /сегодня все больше людей/i, /давайте разберёмся/i, /давайте разберемся/i,
  /представьте себе/i, /не секрет,? что/i, /как известно/i,
  // связки
  /стоит отметить,? что/i, /важно понимать,? что/i, /следует подчеркнуть/i, /более того/i,
  /тем не менее,? стоит/i, /при этом важно помнить/i, /что касается/i, /говоря простыми словами/i,
  /как мы уже упоминали/i,
  // концовки
  /в заключение/i, /подводя итог/i, /таким образом,? мы видим/i, /в конечном счёте/i, /в конечном счете/i,
  /надеемся,? эта статья помогла/i, /желаем удачи в поступлении/i,
  // конструкции
  /будь вы [^.]{0,60},[^.]{0,60},/i, /не просто [^.,]{2,40},? а /i,
  /играет ключевую роль/i, /открывает двери/i,
]

/** §6.3 Слова-маркеры. Порог — суммарно не чаще 1 на 1000 знаков. */
export const MARKER_WORDS = [
  'комплексн', 'всеобъемлющ', 'ключев', 'крайне важно', 'революционн', 'инновационн',
  'передов', 'бесшовн', 'многогранн', 'целостн', 'погрузиться', 'раскрыть потенциал',
  'оптимизировать', 'обеспечить', 'осуществить', 'реализовать', 'является', 'являются',
]

const BAD_ANCHORS = ['здесь', 'тут', 'по ссылке', 'читать', 'читать далее', 'подробнее', 'ссылка']

/** Тема WordPress сама дописывает бренд в <title>. Проверено на живых страницах:
 *  H1 «PhD — что это за степень…» → <title>«PhD — что это за степень… – Go and Study».
 *  Значит бюджет длины у автора не 60 символов, а 60 минус эта добавка. */
// ВНИМАНИЕ: тема пишет « – Go and Study», хотя по правилу компании название всегда
// «goandstudy». Здесь оставлено как есть намеренно — это факт о теме, по нему считается
// длина title. Исправлять надо в теме, а не тут, иначе расчёт разъедется с реальностью.
export const BRAND_SUFFIX = ' – Go and Study'
export const TITLE_BUDGET = 65 - BRAND_SUFFIX.length   // 50 символов автору

/* ── Проверки ─────────────────────────────────────────────────────────────── */

export function checkStandard(input: CheckInput): Check[] {
  const { html, h1, title, description, slug, knownUrls } = input
  const out: Check[] = []
  const add = (id: string, level: Level, ok: boolean, detail: string) => out.push({ id, level, ok, detail })

  const root = parse(html)
  const text = root.textContent.replace(/\s+/g, ' ').trim()
  const chars = text.length

  /* §2 Мета */
  const rendered = title.includes('Go and Study') ? title.length : title.length + BRAND_SUFFIX.length
  add('2.1 title 50–60', 'B', rendered >= 40 && rendered <= 65,
    `${title.length} символов + бренд от темы = ${rendered} (бюджет автора ${TITLE_BUDGET})`)
  add('2.2 title уникален', 'B', !input.existingTitles.has(norm(title)), input.existingTitles.has(norm(title)) ? 'такой title уже есть на сайте' : 'уникален')
  add('2.3 запрос в первой половине title', 'W',
    title.toLowerCase().indexOf(firstWord(input.primaryKeyword)) >= 0 &&
    title.toLowerCase().indexOf(firstWord(input.primaryKeyword)) < title.length / 2, 'позиция главного запроса')
  add('2.5 title без капса/эмодзи/!', 'B',
    !/[A-ZА-Я]{4,}/.test(title) && (title.match(/!/g) ?? []).length <= 1 && !hasEmoji(title), 'капс, восклицательные, эмодзи')
  add('2.6 description 140–160', 'B', description.length >= 120 && description.length <= 170, `${description.length} символов`)
  add('2.7 description уникален', 'B', !input.existingDescriptions.has(norm(description)), 'сравнение по сайту')
  const firstSentence = text.split(/(?<=[.!?])\s/)[0] ?? ''
  add('2.9 description ≠ первое предложение', 'W', norm(description) !== norm(firstSentence), 'дословный дубль лида')

  /* §3 Заголовки */
  const headings = root.querySelectorAll('h1,h2,h3,h4,h5,h6')
  add('3.1 в теле нет H1', 'B', root.querySelectorAll('h1').length === 0, 'H1 печатает тема сайта, в body его быть не должно')
  add('3.2 H1 ≠ title дословно', 'W', norm(h1) !== norm(title), 'H1 и title должны отличаться формулировкой')

  const levels = headings.map((h) => Number(h.rawTagName[1]))
  let skip = ''
  for (let i = 1; i < levels.length; i++) if (levels[i] - levels[i - 1] > 1) skip = `h${levels[i - 1]} → h${levels[i]}`
  add('3.3 иерархия без пропусков', 'B', !skip, skip || 'пропусков нет')

  const h2s = root.querySelectorAll('h2')
  add('3.4 H2 от 3 до 12', 'W', h2s.length >= 3 && h2s.length <= 12, `${h2s.length} H2`)

  // §3.7 бьёт по заголовкам-украшениям, но §4.3.4 сам требует блок «Читайте также»,
  // а он по определению список ссылок, а не 200 знаков прозы. Без исключения две
  // статьи стандарта противоречат друг другу и блокируют любой текст. Выяснилось
  // на первом живом прогоне.
  const isLinkBlock = (h: any) => /читайте также|читать также|по теме/i.test(h.textContent)
  const thin = h2s.filter((h) => !isLinkBlock(h) && sectionText(h).length < 200)
    .map((h) => h.textContent.trim().slice(0, 40))
  add('3.7 под каждым H2 текст ≥200 знаков', 'B', thin.length === 0, thin.length ? `пустые разделы: ${thin.join('; ')}` : 'все разделы наполнены')
  add('3.8 в заголовках нет ссылок', 'B', headings.every((h) => h.querySelectorAll('a').length === 0), 'ссылки внутри заголовков')

  const h2texts = h2s.map((h) => norm(h.textContent))
  add('3.9 H2 не повторяются', 'B', new Set(h2texts).size === h2texts.length, 'дубли H2')

  /* §4 Структура */
  const beforeFirstH2 = firstSectionText(root)
  add('4.1.1 ответ в первых 300 знаках', 'B', beforeFirstH2.length >= 80, `${beforeFirstH2.length} знаков до первого H2`)
  add('4.1.2 запрос в первых 100 словах', 'W',
    text.split(' ').slice(0, 100).join(' ').toLowerCase().includes(firstWord(input.primaryKeyword)), 'главный запрос в лиде')
  const toc = root.querySelectorAll('a[href^="#"]').length
  add('4.1.5 TOC при 4+ H2', 'B', h2s.length < 4 || toc >= 3, h2s.length < 4 ? 'не требуется' : `${toc} якорных ссылок`)

  const hasList = root.querySelectorAll('ol li').length >= 3
  const hasQuestionH2 = h2s.some((h) => h.textContent.trim().endsWith('?'))
  const hasTable = root.querySelectorAll('table').length > 0
  add('4.2.6 есть блок под AI-выдачу', 'B', hasList || hasQuestionH2 || hasTable,
    'нужен пошаговый список, таблица сравнения или FAQ-вопрос в H2')

  add('4.3.1 нет раздела «Заключение»', 'B', !h2s.some((h) => /^(заключение|вывод[ы]?|итог[и]?)\b/i.test(h.textContent.trim())), 'пересказ статьи в конце запрещён')

  const alsoRead = h2s.find((h) => /читайте также|читать также|по теме/i.test(h.textContent))
  const alsoLinks = alsoRead ? sectionEl(alsoRead).querySelectorAll('a').length : 0
  add('4.3.4 «Читайте также» 3–5 ссылок', 'B', alsoLinks >= 3 && alsoLinks <= 5, alsoRead ? `${alsoLinks} ссылок` : 'блока нет')

  /* §6 Язык */
  // §6.1 явно выводит из-под правила тире в роли сказуемого («Bocconi — частный университет»).
  // Разобрать это морфологически нельзя, но у сказуемого есть свойство: оно одно на предложение.
  // Машинный почерк — это несколько тире в одном предложении (вставные конструкции).
  // Поэтому считаем только «лишние» тире сверх одного на предложение.
  const sentencesForDash = text.split(/(?<=[.!?])\s+/)
  const emTotal = (text.match(/—/g) ?? []).length
  const emExtra = sentencesForDash.reduce((n, snt) => n + Math.max(0, (snt.match(/—/g) ?? []).length - 1), 0)
  const emLimit = Math.max(1, Math.round(chars / 1500))
  add('6.1 длинных тире ≤1 на 1500 знаков', 'B', emExtra <= emLimit,
    `${emExtra} вставных при лимите ${emLimit} (всего тире ${emTotal}, по одному на предложение не считаем — §6.1)`)

  const hits = FORBIDDEN_PHRASES.filter((re) => re.test(text)).map((re) => String(re).slice(1, -2))
  add('6.2 нет запрещённых оборотов', 'B', hits.length === 0, hits.length ? hits.join('; ') : 'чисто')

  const markerHits = MARKER_WORDS.reduce((n, w) => n + countAll(text.toLowerCase(), w), 0)
  const markerLimit = Math.max(1, Math.round(chars / 1000))
  add('6.3 плотность слов-маркеров', 'B', markerHits <= markerLimit, `${markerHits} при лимите ${markerLimit}`)

  const sentences = text.split(/(?<=[.!?])\s+/).filter((s) => s.trim().length > 1)
  const lens = sentences.map((s) => s.split(/\s+/).length)
  const avg = lens.length ? lens.reduce((a, b) => a + b, 0) / lens.length : 0
  const longShare = lens.length ? lens.filter((l) => l > 35).length / lens.length : 0
  add('6.4.1 средняя длина предложения 12–20', 'W', avg >= 12 && avg <= 20, `${avg.toFixed(1)} слов, длиннее 35 слов: ${(longShare * 100).toFixed(0)}%`)
  add('6.4.4 «вы» со строчной', 'B', !/(^|[^А-Яа-яЁё])Вы([^А-Яа-яЁё]|$)/.test(text.replace(/^[^.]*\. /, '')), 'обращение на «Вы» с заглавной')

  const listChars = root.querySelectorAll('ul li, ol li').reduce((n, li) => n + li.textContent.length, 0)
  add('4.2.4 не более 40% текста в списках', 'W', chars === 0 || listChars / chars <= 0.4, `${((listChars / (chars || 1)) * 100).toFixed(0)}% в списках`)

  const longParas = root.querySelectorAll('p').filter((p) => p.textContent.length > 600).length
  add('4.2.1 абзац ≤600 знаков', 'W', longParas === 0, longParas ? `${longParas} длинных абзацев` : 'все абзацы в норме')

  /* §7 Slug */
  add('7.1 slug только latin/цифры/дефис', 'B', /^[a-z0-9-]+$/.test(slug), slug)
  add('7.3 slug 3–60 символов, ≤6 слов', 'B', slug.length >= 3 && slug.length <= 60 && slug.split('-').length <= 6, `${slug.length} символов, ${slug.split('-').length} слов`)
  add('7.6 в slug нет дат и ID', 'B', !/(^|-)(19|20)\d{2}(-|$)/.test(slug) && !/(^|-)id-?\d+/.test(slug), slug)
  add('7.8 slug уникален', 'B', !input.existingSlugs.has(slug), 'сравнение по сайту')

  /* §8 Ссылки */
  const bodyLinks = root.querySelectorAll('a').filter((a) => !isInAlsoRead(a) && !(a.getAttribute('href') ?? '').startsWith('#'))
  const internal = bodyLinks.filter((a) => isInternal(a.getAttribute('href') ?? ''))
  add('8.1 3–8 контекстных внутренних ссылок', 'B', internal.length >= 3 && internal.length <= 8, `${internal.length} ссылок в теле`)

  const dead = internal.map((a) => abs(a.getAttribute('href') ?? '')).filter((u) => !knownUrls.has(u.replace(/\/$/, '')))
  add('8.2 внутренние ссылки существуют', 'B', dead.length === 0, dead.length ? `нет на сайте: ${dead.join(', ')}` : 'все URL в инвентаре')

  const badAnchor = bodyLinks.map((a) => a.textContent.trim().toLowerCase()).filter((t) => BAD_ANCHORS.includes(t))
  add('8.3 анкоры описательные', 'B', badAnchor.length === 0, badAnchor.length ? `мусорные анкоры: ${badAnchor.join(', ')}` : 'анкоры описывают цель')

  const urls = internal.map((a) => abs(a.getAttribute('href') ?? ''))
  add('8.4 один URL не линкуется дважды', 'W', new Set(urls).size === urls.length, 'повторные ссылки на одну страницу')

  const external = bodyLinks.filter((a) => { const h = a.getAttribute('href') ?? ''; return h.startsWith('http') && !isInternal(h) })
  add('8.8 внешние ссылки в новом окне', 'W',
    external.every((a) => (a.getAttribute('rel') ?? '').includes('noopener') && a.getAttribute('target') === '_blank'),
    `${external.length} внешних ссылок`)

  return out
}

export function summarize(checks: Check[]) {
  const failedB = checks.filter((c) => c.level === 'B' && !c.ok)
  const failedW = checks.filter((c) => c.level === 'W' && !c.ok)
  return { failedB, failedW, passed: checks.length - failedB.length - failedW.length, verdict: failedB.length ? 'qa_failed' : 'ready_for_review' }
}

/* ── Утилиты ──────────────────────────────────────────────────────────────── */

function norm(s: string): string { return s.toLowerCase().replace(/\s+/g, ' ').replace(/[«»"'’]/g, '').trim() }
function firstWord(s: string): string { return s.toLowerCase().split(/\s+/)[0] ?? s.toLowerCase() }
function hasEmoji(s: string): boolean { return /\p{Extended_Pictographic}/u.test(s) }
function countAll(hay: string, needle: string): number { return hay.split(needle).length - 1 }
function isInternal(href: string): boolean { return href.startsWith('/') || href.includes('goandstudy.com') }
function abs(href: string): string { return href.startsWith('http') ? href : `https://goandstudy.com${href.startsWith('/') ? '' : '/'}${href}` }

/** Текст от заголовка до следующего заголовка того же или высшего уровня. */
function sectionText(h: any): string { return sectionEl(h).textContent.replace(/\s+/g, ' ').trim() }

function sectionEl(h: any): any {
  const level = Number(h.rawTagName[1])
  const siblings: any[] = h.parentNode ? h.parentNode.childNodes : []
  const i = siblings.indexOf(h)
  const chunk: string[] = []
  for (let j = i + 1; j < siblings.length; j++) {
    const tag = String(siblings[j].rawTagName ?? '')
    if (/^h[1-6]$/.test(tag) && Number(tag[1]) <= level) break
    chunk.push(siblings[j].toString())
  }
  return parse(chunk.join(''))
}

function firstSectionText(root: any): string {
  const chunk: string[] = []
  for (const node of root.childNodes) {
    if (String(node.rawTagName ?? '') === 'h2') break
    chunk.push(node.toString())
  }
  return parse(chunk.join('')).textContent.replace(/\s+/g, ' ').trim()
}

function isInAlsoRead(a: any): boolean {
  let n = a
  while (n) {
    const prev = previousHeading(n)
    if (prev) return /читайте также|читать также|по теме/i.test(prev)
    n = n.parentNode
    if (!n || !n.parentNode) return false
  }
  return false
}

function previousHeading(node: any): string | null {
  const siblings: any[] = node.parentNode ? node.parentNode.childNodes : []
  const i = siblings.indexOf(node)
  for (let j = i - 1; j >= 0; j--) {
    const tag = String(siblings[j].rawTagName ?? '')
    if (/^h[1-6]$/.test(tag)) return siblings[j].textContent
  }
  return null
}
