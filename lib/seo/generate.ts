// Минимальный конвейер производства статьи: контекст → бриф → черновик → QA.
// Нарочно короткий: PRD-этапы 3–4 (реестр фактов, экспертный слой, 19 шагов) сюда
// не входят. Задача — довести одну тему до черновика, который человек читает и судит.
import type Anthropic from '@anthropic-ai/sdk'
import { getAnthropic } from '../ai'
import { COMPANY_FACTS } from './facts'
import { embed } from './embeddings'
import { checkStandard, languageChecks, type Check } from './standard'
import { checkBlogStandard, BLOG_CATEGORIES } from './blog-style'
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
  /** §8: категория из фиксированного списка темы, иначе фильтр её не покажет. */
  category: string
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
РАЗМЕТКА — только Гутенберг, ровно пять типов блоков
Тема сайта стилизует лишь их. Любой другой блок отрендерится голым HTML.

<!-- wp:paragraph -->
<p>Текст абзаца. Два-четыре предложения.</p>
<!-- /wp:paragraph -->

<!-- wp:heading {"level":2} -->
<h2>Заголовок раздела</h2>
<!-- /wp:heading -->

<!-- wp:heading {"level":3} -->
<h3>Подраздел</h3>
<!-- /wp:heading -->

<!-- wp:list -->
<ul><li>Пункт один.</li><li>Пункт два.</li></ul>
<!-- /wp:list -->

<!-- wp:list {"ordered":true} -->
<ol><li>Шаг один.</li><li>Шаг два.</li></ol>
<!-- /wp:list -->

<!-- wp:table -->
<figure class="wp-block-table"><table> <thead> <tr> <th>Критерий</th> <th>Вариант А</th> <th>Вариант Б</th> </tr> </thead> <tbody> <tr> <td><strong>Срок</strong></td> <td>1–2 года</td> <td>3–6 лет</td> </tr> </tbody> </table></figure>
<!-- /wp:table -->

<!-- wp:quote -->
<blockquote class="wp-block-quote"><p>Реплика консультанта или отзыв клиента.</p><cite>— из практики консультаций Go And Study</cite></blockquote>
<!-- /wp:quote -->

Форматирование жёсткое: открывающий комментарий на своей строке, HTML — на
следующей ОДНОЙ строкой даже для таблицы, закрывающий комментарий на своей строке,
между блоками одна пустая строка.

ЗАПРЕЩЕНО
- <h1> в теле: заголовок отдаёт страница.
- Любые class= кроме wp-block-table и wp-block-quote. Никаких style=, id=, <br>.
- Картинки, кнопки, колонки, разделители, врезки-группы — в теме не стилизованы.
- Эмодзи.
- Абсолютные ссылки на свой сайт: только относительные /blog/{slug} и /{slug}.

СКЕЛЕТ
1. Лид: 2–4 предложения — кто читатель и какую задачу решаем. Без вступлений ни о чём.
2. 6–14 разделов H2. H3 только внутри H2.
3. Обязательный предпоследний раздел — H2 «Частые вопросы»: 4–8 пар,
   каждая это H3 с вопросом и абзац с ответом на 1–3 предложения. Вопросы берутся
   из реальных длинных запросов, а не перефразируют заголовок.
4. Итог на 2–3 предложения без воды.
5. Последний блок — дословно, символ в символ:
<!-- wp:paragraph -->
<p>Хотите поступить за рубеж? <a href="https://crm.goandstudy.com/book" target="_blank" rel="noopener noreferrer">Запишитесь на бесплатную консультацию</a> — разберём ваш случай и составим план.</p>
<!-- /wp:paragraph -->

ОБЪЁМ 900–1600 слов. Таблиц 0–3, цитата максимум одна и только если есть что цитировать.

ЗАГОЛОВКИ H2
Формулируются как вопрос пользователя или обещание конкретики: «Сколько стоит PhD
за границей и бывают ли стипендии», «Какие документы обычно нужны», «Частые ошибки
при подготовке документов». Без «ТОП-10 секретов» и двоеточий-заманух.

ЯЗЫК
- Обращение на «вы» со строчной. Про агентство — «Go And Study» или «мы», по делу.
- Читатель — абитуриент из СНГ, который не знает системы. Термин вводится и тут же
  расшифровывается: «Sperrkonto (блокированный счёт) — …».
- Латиница остаётся латиницей: tuition fee, permesso di soggiorno, Studienkolleg.
- Конкретика диапазонами: «€800–1 200 в месяц», «обычно 3–6 лет», «GPA 3.8+».
  Где правила плавают — «часто», «обычно», «зависит от вуза и года набора».
- Кавычки-ёлочки, буква ё, длинное тире с пробелами и не чаще одного на 1500 знаков.
- Абзац не длиннее 4–5 предложений. Стена текста переписывается в список.
- В списках термин выделяется: <li><strong>Weighted GPA</strong> — учитывает сложность предмета.</li>
- Запрещены дословно: «в современном мире», «как известно», «давайте разберёмся»,
  «стоит отметить, что», «важно понимать, что», «более того», «что касается»,
  «в заключение», «подводя итог», «играет ключевую роль», «открывает двери».

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
    category: { type: 'string', enum: [...BLOG_CATEGORIES] },
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
  required: ['title', 'category', 'h1', 'slug', 'primary_keyword', 'secondary_keywords', 'intent', 'audience',
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
- title: НЕ ДЛИННЕЕ 65 СИМВОЛОВ, медиана живых статей 57. Тема сама дописывает
  « – Go and Study», поэтому бренд не добавляй. Ключ — в первых трёх-четырёх словах.
  Двоеточие как разделитель это норма: «Бакалавриат в США: как устроена система,
  требования и стоимость».
- h1: отвечает тому же запросу, но сформулирован иначе, чем title.
- meta_description: 90–150 символов, жёсткий предел 160 — дальше режется. Это текст
  под заголовком карточки в ленте блога. Отдельное предложение с пользой, а не первый
  абзац статьи.
- slug: только строчные латинские буквы, цифры и дефис; транслит по ГОСТ 7.79-2000
  (щ→sch, ж→zh, ю→yu, я→ya, й→y, ъ/ь выпадают); не длиннее 60 символов и 6 слов;
  предлоги выкидываются; без года, дат и ID.
- outline: 6–14 разделов H2. Предпоследний — обязательно «Частые вопросы».
  Блока «Читайте также» в этом блоге не бывает: ссылки вплетаются в текст.
- internal_links: 2–5 штук, только относительные пути (/blog/{slug} или /{slug}).
- category: строго одна из тринадцати: США, Германия, Великобритания, Италия, Франция,
  Китай, ОАЭ, Стипендии, Экзамены, Визы, Языковые курсы, Поступление, Жизнь студента.
  Выбирается по главной теме статьи: страна важнее темы, если статья про конкретную страну.

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

Формат ответа — только тело статьи разметкой Гутенберга, без markdown-обёрток,
без пояснений до и после. Первый символ ответа — «<!--», последний — «-->».

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

/**
 * Детерминированные проверки статьи блога.
 *
 * Структуру и разметку проверяет стандарт блога (выведен из 76 живых статей),
 * язык — приложение F: эти правила не спорят и работают поверх любой разметки.
 * Плюс каннибализация по эмбеддингам и обязательное «чем отличается» из PRD §13.
 */
export async function qaDeterministic(
  ctx: GenContext, brief: Brief, body: string,
  opts: {
    pageEmbeddings: { url: string; title: string | null; vec: number[] }[]
    knownBlogSlugs: Set<string>
    knownPagePaths: Set<string>
    category?: string
  },
): Promise<{ checks: Check[]; issues: QaIssue[] }> {
  const checks = checkBlogStandard({
    body,
    title: brief.title,
    excerpt: brief.meta_description,
    slug: brief.slug,
    category: opts.category ?? (brief as any).category ?? '',
    knownBlogSlugs: opts.knownBlogSlugs,
    knownPagePaths: opts.knownPagePaths,
  })

  const text = body.replace(/<!--[\s\S]*?-->/g, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
  checks.push(...languageChecks(text))

  const issues: QaIssue[] = []

  // PRD §13: без ответа «чем отличается» статью не публикуем — защита от scaled content
  const uvOk = brief.unique_value.trim().length > 40
  checks.push({ id: 'PRD §13 unique_value заполнен', level: 'B', ok: uvOk, detail: uvOk ? 'заполнено' : 'пустое или отписка' })
  if (!uvOk) issues.push({ severity: 'blocker', kind: 'seo', quote: brief.unique_value, why: 'нет ответа, чем материал отличается от типового' })

  // Каннибализация: близость к существующим страницам
  if (opts.pageEmbeddings.length) {
    const [vec] = await embed([`${brief.title}\n${text.slice(0, 4000)}`])
    const top = opts.pageEmbeddings
      .map((p) => ({ url: p.url, sim: cosine(vec, p.vec) }))
      .sort((a, b) => b.sim - a.sim)[0]
    const ok = !top || top.sim < 0.9
    checks.push({ id: 'каннибализация', level: 'B', ok, detail: top ? `ближайшая ${top.url} — ${top.sim.toFixed(3)}` : 'не с чем сравнивать' })
    if (!ok) issues.push({ severity: 'blocker', kind: 'seo', quote: top!.url, why: `сходство ${top!.sim.toFixed(3)} — статья будет конкурировать с существующей страницей` })
  }

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
