// Минимальный конвейер производства статьи: контекст → бриф → черновик → QA.
// Нарочно короткий: PRD-этапы 3–4 (реестр фактов, экспертный слой, 19 шагов) сюда
// не входят. Задача — довести одну тему до черновика, который человек читает и судит.
import type Anthropic from '@anthropic-ai/sdk'
import { getAnthropic } from '../ai'
import { COMPANY_FACTS } from './facts'
import { embed } from './embeddings'
import { checkStandard, type Check } from './standard'
export { summarize } from './standard'
export type { Check, Level } from './standard'

export const GEN_MODEL = 'claude-opus-5'
export const PROMPT_VERSION = 'v1'

export type PageRef = { id: number; url: string; title: string | null; page_type: string | null }
export type QueryRef = { query: string; impressions: number; clicks: number; position: number }

export type GenContext = {
  topicTitle: string
  primaryKeyword: string
  cluster: string | null
  /** Страницы сайта рядом по смыслу — для перелинковки и чтобы не написать дубль. */
  related: PageRef[]
  /** Реальные запросы из Search Console по этой теме. */
  queries: QueryRef[]
}

export type Brief = {
  title: string
  h1: string
  slug: string
  primary_keyword: string
  secondary_keywords: string[]
  intent: 'informational' | 'commercial' | 'navigational'
  audience: string
  /** Обязательное поле: чем эта статья отличается от типовой. Пустое — статью не пишем. */
  unique_value: string
  outline: { h2: string; points: string[] }[]
  internal_links: { url: string; anchor: string; why: string }[]
  meta_description: string
  word_count_target: number
}

export type QaIssue = {
  severity: 'blocker' | 'major' | 'minor'
  kind: 'facts' | 'promise' | 'seo' | 'style' | 'structure'
  quote: string
  why: string
}

export type QaReport = {
  checks: Check[]
  issues: QaIssue[]
  verdict: 'ready_for_review' | 'qa_failed'
}

/* ── Промпты ──────────────────────────────────────────────────────────────── */

const WRITING_RULES = `
СТРУКТУРА (приложение F, §4–5)
- Ответ на вопрос заголовка — в первых 300 знаках, до первого H2. Никаких вступлений.
- H2 от 3 до 12, иерархия без пропусков (H2 → H3, не H2 → H4). Под каждым H2 — минимум
  200 знаков текста. H2 не повторяются, ссылок внутри заголовков нет.
- При 4 и более H2 — оглавление в начале: список ссылок на якоря (<a href="#slug">),
  у соответствующих H2 проставь id.
- Минимум один блок под AI-выдачу: пошаговый нумерованный список, таблица сравнения
  (признаки в строках, варианты в столбцах, последняя строка «Кому подходит»)
  или FAQ — H2-вопросы с прямым ответом в первом предложении.
- Минимум один элемент экспертного слоя: разбор частой ошибки, «формально X — на практике Y»,
  чек-лист или наблюдение из работы с абитуриентами. Общие слова тут не считаются.
- Каждый раздел понятен, если вырвать его из статьи: без «как мы писали выше».
- Если в статье есть цифры или сроки — укажи дату актуальности данных.
- Раздела «Заключение» с пересказом статьи быть не должно. Вместо него — конкретный
  следующий шаг для читателя.
- В конце — блок H2 «Читайте также» с 3–5 ссылками на страницы кластера.
- В теле статьи 3–8 контекстных внутренних ссылок (не считая «Читайте также»).
  Анкор описывает целевую страницу; «здесь», «подробнее», «по ссылке» запрещены.

ЯЗЫК (§6) — по этому пункту текст узнают как машинный
- Длинное тире: не больше одного на 1500 знаков. Вместо него запятые, скобки, двоеточие.
  «Документы — оригинал и перевод — подаются вместе» → «Документы (оригинал и перевод)
  подаются вместе».
- Запрещены дословно: «в современном мире», «в наши дни», «давайте разберёмся»,
  «представьте себе», «не секрет, что», «как известно», «стоит отметить, что»,
  «важно понимать, что», «следует подчеркнуть», «более того», «что касается»,
  «говоря простыми словами», «в заключение», «подводя итог», «таким образом, мы видим»,
  «надеемся, эта статья помогла», «играет ключевую роль», «открывает двери»,
  «не просто X, а Y», «будь вы студентом, выпускником или специалистом».
- Не злоупотребляй словами: комплексный, ключевой, инновационный, передовой, целостный,
  обеспечить, осуществить, реализовать, является. Суммарно не чаще одного на 1000 знаков.
- Средняя длина предложения 12–20 слов. Обращение на «вы» со строчной буквы.
- Не более 40% текста в списках, абзац не длиннее 600 знаков.
- Никакого канцелярита: «осуществляется подача» → «подают».

ТОН (§6.5)
Пишешь так, как консультант объясняет клиенту на встрече: конкретно, с примерами из
практики, без продажи в каждом абзаце и без академизма. Если абзац можно без изменений
вставить в статью конкурента — он не нужен. Продажа — одна врезка в конце, по этапу
воронки: для информационной статьи это консультация, а не «купите пакет».

ЧЕГО НЕ ОБЕЩАЕМ
Поступление, визу, стипендию, сроки рассмотрения — это не в нашей власти.
`.trim()

function contextBlock(ctx: GenContext): string {
  const pages = ctx.related.map((p) => `- ${p.url} — ${p.title ?? '(без title)'} [${p.page_type ?? '?'}]`).join('\n')
  const queries = ctx.queries
    .map((q) => `- «${q.query}» — ${q.impressions} показов, ${q.clicks} кликов, средняя позиция ${q.position.toFixed(1)}`)
    .join('\n')
  return `
${COMPANY_FACTS}

ТЕМА
${ctx.topicTitle}
Главный запрос: ${ctx.primaryKeyword}${ctx.cluster ? `\nКластер: ${ctx.cluster}` : ''}

ЧТО ЛЮДИ РЕАЛЬНО ИЩУТ (Google Search Console, последние 90 дней)
${queries || '(данных нет)'}

СТРАНИЦЫ САЙТА РЯДОМ ПО СМЫСЛУ — только на них можно ставить внутренние ссылки
${pages || '(нет)'}
`.trim()
}

/* ── Шаг 1: бриф ──────────────────────────────────────────────────────────── */

const BRIEF_SCHEMA = {
  type: 'object',
  properties: {
    title: { type: 'string' },
    h1: { type: 'string' },
    slug: { type: 'string' },
    primary_keyword: { type: 'string' },
    secondary_keywords: { type: 'array', items: { type: 'string' } },
    intent: { type: 'string', enum: ['informational', 'commercial', 'navigational'] },
    audience: { type: 'string' },
    unique_value: { type: 'string' },
    outline: {
      type: 'array',
      items: {
        type: 'object',
        properties: { h2: { type: 'string' }, points: { type: 'array', items: { type: 'string' } } },
        required: ['h2', 'points'], additionalProperties: false,
      },
    },
    internal_links: {
      type: 'array',
      items: {
        type: 'object',
        properties: { url: { type: 'string' }, anchor: { type: 'string' }, why: { type: 'string' } },
        required: ['url', 'anchor', 'why'], additionalProperties: false,
      },
    },
    meta_description: { type: 'string' },
    word_count_target: { type: 'integer' },
  },
  required: ['title', 'h1', 'slug', 'primary_keyword', 'secondary_keywords', 'intent', 'audience',
    'unique_value', 'outline', 'internal_links', 'meta_description', 'word_count_target'],
  additionalProperties: false,
} as const

export async function generateBrief(ctx: GenContext): Promise<Brief> {
  const client = getAnthropic()
  const res = await client.messages.create({
    model: GEN_MODEL,
    max_tokens: 8000,
    output_config: { effort: 'high', format: { type: 'json_schema', schema: BRIEF_SCHEMA as any } },
    system: `Ты редактор блога goandstudy. Составляешь бриф на статью: что писать, для кого,
и чем этот материал будет отличаться от десятка похожих в выдаче.

ЖЁСТКИЕ ТРЕБОВАНИЯ К ПОЛЯМ (приложение F, §2 и §7 — проверяются машиной)
- title: НЕ ДЛИННЕЕ 50 СИМВОЛОВ. Тема WordPress сама дописывает « – Go and Study»
  (15 символов), поэтому бренд не добавляй — иначе в выдаче title обрежется. Проверено
  на живых страницах сайта. Уникален по сайту, главный запрос в первой половине,
  без капса, эмодзи и перечисления ключей через запятую.
- h1: отвечает тому же запросу, но сформулирован иначе, чем title.
- meta_description: 140–160 символов, с конкретикой (цифра, срок, перечень), не дублирует
  первое предложение статьи.
- slug: только строчные латинские буквы, цифры и дефис; транслит по ГОСТ 7.79-2000
  (щ→sch, ж→zh, ю→yu, я→ya, й→y, ъ/ь выпадают); не длиннее 60 символов и 6 слов;
  предлоги выкидываются; без года, дат и ID.
- outline: от 3 до 12 разделов H2, среди них обязательно блок под AI-выдачу
  (пошаговый список, таблица сравнения или FAQ) и блок «Читайте также» последним.
- internal_links: от 3 до 8 штук.

unique_value — ответ на вопрос «что здесь есть, чего нет в типовой статье по этому запросу».
Общие слова («подробный разбор», «актуальная информация») там недопустимы: пиши, за счёт чего
именно — наш опыт с конкретными вузами, разбор частой ошибки, сравнение вариантов, которого нет
у других. Если такого ответа нет — так и напиши, это сигнал не писать статью.

internal_links — только из списка страниц в контексте, URL копируй дословно.

${WRITING_RULES}`,
    messages: [{ role: 'user', content: `${contextBlock(ctx)}\n\nСоставь бриф.` }],
  })
  return parseJson<Brief>(res, 'brief')
}

/* ── Шаг 2: черновик ──────────────────────────────────────────────────────── */

export async function generateDraft(ctx: GenContext, brief: Brief): Promise<string> {
  const client = getAnthropic()
  const stream = client.messages.stream({
    model: GEN_MODEL,
    max_tokens: 32000,
    output_config: { effort: 'high' },
    system: `Ты пишешь статью для блога goandstudy по готовому брифу.

Формат ответа — только HTML тела статьи, без <html>, <head>, <body> и без markdown-обёрток.
Разрешённые теги: h2, h3, p, ul, ol, li, a, strong, em, table, thead, tbody, tr, th, td, blockquote.
H1 не ставь — его печатает тема сайта.
Внутренние ссылки — только те, что в брифе, дословно по URL.

${WRITING_RULES}`,
    messages: [{
      role: 'user',
      content: `${contextBlock(ctx)}\n\nБРИФ\n${JSON.stringify(brief, null, 2)}\n\nНапиши статью.`,
    }],
  })
  const msg = await stream.finalMessage()
  const html = msg.content.filter((b) => b.type === 'text').map((b: any) => b.text).join('').trim()
  return stripFence(html)
}

/* ── Шаг 2б: починка по замечаниям (§12.2) ───────────────────────────────── */

/**
 * Переписать черновик под конкретные провалы проверок. По §12.2 — максимум две попытки,
 * дальше статья уходит человеку. Модель получает список нарушений дословно, а не
 * «сделай лучше»: расплывчатая правка ломает то, что уже прошло.
 */
export async function reviseDraft(
  ctx: GenContext, brief: Brief, html: string,
  failures: { id: string; detail: string }[], modelIssues: QaIssue[],
): Promise<string> {
  const client = getAnthropic()
  const list = [
    ...failures.map((f) => `- [проверка ${f.id}] ${f.detail}`),
    ...modelIssues.filter((i) => i.severity !== 'minor').map((i) => `- [${i.kind}] ${i.why}\n  цитата: «${i.quote}»`),
  ].join('\n')

  const stream = client.messages.stream({
    model: GEN_MODEL,
    max_tokens: 32000,
    output_config: { effort: 'high' },
    system: `Ты правишь готовый черновик под замечания проверок. Не переписываешь статью заново.

Правила правки:
- Меняй только то, что названо в замечаниях. Остальной текст оставляй дословно —
  он уже прошёл проверки, и лишняя правка их ломает.
- Если замечание про выдуманный факт — убери утверждение или замени обобщением
  («требования различаются по вузам»), не подставляй другое число.
- Ответ — только HTML тела статьи, без markdown-обёрток и без H1.

${WRITING_RULES}`,
    messages: [{
      role: 'user',
      content: `${contextBlock(ctx)}\n\nБРИФ\n${JSON.stringify(brief, null, 2)}\n\nЧЕРНОВИК\n${html}\n\nЗАМЕЧАНИЯ, КОТОРЫЕ НАДО ЗАКРЫТЬ\n${list}`,
    }],
  })
  const msg = await stream.finalMessage()
  const out = msg.content.filter((b) => b.type === 'text').map((b: any) => b.text).join('').trim()
  return stripFence(out)
}

/* ── Шаг 3: QA ────────────────────────────────────────────────────────────── */

const QA_SCHEMA = {
  type: 'object',
  properties: {
    issues: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          severity: { type: 'string', enum: ['blocker', 'major', 'minor'] },
          kind: { type: 'string', enum: ['facts', 'promise', 'seo', 'style', 'structure'] },
          quote: { type: 'string' },
          why: { type: 'string' },
        },
        required: ['severity', 'kind', 'quote', 'why'], additionalProperties: false,
      },
    },
  },
  required: ['issues'], additionalProperties: false,
} as const

/** Проверка фактов и обещаний свежим контекстом — отдельным вызовом, не самокритикой автора. */
export async function qaWithModel(ctx: GenContext, brief: Brief, html: string): Promise<QaIssue[]> {
  const client = getAnthropic()
  const res = await client.messages.create({
    model: GEN_MODEL,
    max_tokens: 8000,
    output_config: { effort: 'high', format: { type: 'json_schema', schema: QA_SCHEMA as any } },
    system: `Ты редактор-проверяющий. Тебе дают факты компании и черновик статьи.
Твоя задача — найти места, которые нельзя публиковать.

Длину title, тире, запрещённые обороты, ссылки и структуру уже проверил код —
не дублируй его. Твоя часть — то, что счётчиком не поймать:

- facts — числа, цены, сроки, требования, статистика, которых нет в блоке фактов и не следует
  из контекста. Это главное: выдуманное число дороже любой стилистики. Сюда же выдуманные
  вузы, программы и кейсы.
- promise — обещания и гарантии (поступления, визы, стипендии, сроков).
- seo — ответ на главный запрос отсутствует, размыт или спрятан ниже; вода вместо конкретики.
- structure — раздел, непонятный в отрыве от статьи («как мы писали выше»); заголовок,
  не описывающий содержание раздела; экспертного слоя нет — только общие слова.
- style — текст, который можно без изменений вставить в статью конкурента (§6.5).

Цитируй дословно (поле quote). Сообщай обо всём, что нашёл, включая спорное: фильтровать
по важности будет человек. Если нарушений нет — верни пустой список.`,
    messages: [{
      role: 'user',
      content: `${contextBlock(ctx)}\n\nБРИФ\n${JSON.stringify(brief, null, 2)}\n\nЧЕРНОВИК\n${html}`,
    }],
  })
  return parseJson<{ issues: QaIssue[] }>(res, 'qa').issues
}

/** Детерминированные проверки: стандарт (приложение F) + каннибализация по эмбеддингам. */
export async function qaDeterministic(
  ctx: GenContext, brief: Brief, html: string,
  opts: {
    pageEmbeddings: { url: string; title: string | null; vec: number[] }[]
    knownUrls: Set<string>
    existingTitles: Set<string>
    existingDescriptions: Set<string>
    existingSlugs: Set<string>
  },
): Promise<{ checks: Check[]; issues: QaIssue[] }> {
  const checks = checkStandard({
    html, h1: brief.h1, title: brief.title, description: brief.meta_description,
    slug: brief.slug, primaryKeyword: brief.primary_keyword,
    knownUrls: opts.knownUrls,
    existingTitles: opts.existingTitles,
    existingDescriptions: opts.existingDescriptions,
    existingSlugs: opts.existingSlugs,
  })
  const issues: QaIssue[] = []

  // §13 PRD: без ответа «чем отличается» статью не публикуем — это защита от scaled content
  const uvOk = brief.unique_value.trim().length > 40
  checks.push({ id: 'PRD §13 unique_value заполнен', level: 'B', ok: uvOk, detail: uvOk ? 'заполнено' : 'пустое или отписка' })
  if (!uvOk) issues.push({ severity: 'blocker', kind: 'seo', quote: brief.unique_value, why: 'нет ответа, чем материал отличается от типового' })

  // §14.27 каннибализация: близость к существующим страницам
  if (opts.pageEmbeddings.length) {
    const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
    const [vec] = await embed([`${brief.title}\n${text.slice(0, 4000)}`])
    const top = opts.pageEmbeddings
      .map((p) => ({ url: p.url, sim: cosine(vec, p.vec) }))
      .sort((a, b) => b.sim - a.sim)[0]
    const ok = !top || top.sim < 0.9
    checks.push({ id: '14.27 каннибализация', level: 'B', ok, detail: top ? `ближайшая ${top.url} — ${top.sim.toFixed(3)}` : 'не с чем сравнивать' })
    if (!ok) issues.push({ severity: 'blocker', kind: 'seo', quote: top!.url, why: `сходство ${top!.sim.toFixed(3)} — статья будет конкурировать с существующей страницей` })
  }

  // Провалы блокирующих проверок дублируем в список замечаний — редактор видит одним списком
  for (const c of checks.filter((c) => c.level === 'B' && !c.ok)) {
    issues.push({ severity: 'blocker', kind: 'structure', quote: c.id, why: c.detail })
  }

  return { checks, issues }
}

/* ── Утилиты ──────────────────────────────────────────────────────────────── */

function absolute(href: string): string {
  return href.startsWith('http') ? href : `https://goandstudy.com${href.startsWith('/') ? '' : '/'}${href}`
}

function stripFence(s: string): string {
  const m = s.match(/^```(?:html)?\s*([\s\S]*?)\s*```$/)
  return m ? m[1] : s
}

function cosine(a: number[], b: number[]): number {
  let dot = 0, na = 0, nb = 0
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i] }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) || 1)
}

function parseJson<T>(res: Anthropic.Message, what: string): T {
  const text = res.content.filter((b) => b.type === 'text').map((b: any) => b.text).join('').trim()
  try { return JSON.parse(stripFence(text)) as T } catch {
    throw new Error(`${what}: модель вернула не-JSON (stop_reason=${res.stop_reason}): ${text.slice(0, 300)}`)
  }
}
