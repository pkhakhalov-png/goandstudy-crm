/**
 * Правка опубликованного архива (E3.5).
 *
 * Ревизия нашла в восьмидесяти четырёх вышедших статьях 685 утверждений без
 * подтверждения, из них 93 критичных — виза, право на работу, обещание
 * поступления, стоимость. Эти статьи писались до гейта достоверности, и гейт их
 * не видел ни разу. Отчёт `docs/legacy-content-risk.md` показывает, что чинить;
 * этот шаг чинит.
 *
 * Требование этапа одно, и оно важнее удобства: правка идёт через ТОТ ЖЕ verify,
 * что и новые статьи. Соблазн понятен — архив большой, сделать ему отдельный
 * упрощённый путь быстрее. Но тогда получилось бы две планки качества: строгая
 * для восьми статей конвейера и мягкая для восьмидесяти, которые и читают.
 * Поэтому здесь тот же писатель с той же инструкцией, тот же гейт фактов и те же
 * проверки стандарта, а результат ложится предложением на просмотр человеку —
 * никакой автопубликации.
 *
 * Что считается закрытой находкой: её фразы больше нет в тексте. Не «смягчена»,
 * не «переписана аккуратнее» — нет. Непроверяемое утверждение нельзя починить
 * словом «обычно»: проверить его от этого не станет чем, а читатель по-прежнему
 * примет за факт.
 */
import { registerStep, type Job, type StepOutcome } from './steps'
import { buildContext, insertVersion } from './steps-article'
import { factGate } from './fact-gate'
import { subjectKeysFor } from './claims'
import { reviseFragment } from './generate'
import { checkBlogStandard, loadSiteTargets } from './blog-style'
import { readThemeArticle } from './theme-publish'
import { trafficByPage } from './gsc-agg'
import { RISK_ORDER, type RiskLevel } from './legacy-audit'

/** Максимум кругов правки — как у новых статей (PRD §12.2). */
const КРУГОВ = 2

/**
 * На сколько правка вправе удлинить статью.
 *
 * Правка убирает непроверяемое, значит текст должен укоротиться или остаться при
 * своём. Заметный рост означает, что писатель не чинил, а дописывал.
 */
const ПРЕДЕЛ_РОСТА = 1.02

type Находка = {
  claimId: number
  kind: string
  risk: RiskLevel
  statement: string
  why: string
  action: string
}

/** Текст без разметки: находки ревизии — это проза, а не HTML. */
export function проза(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&laquo;|&raquo;/g, '"')
    .replace(/\s+/g, ' ')
    .toLowerCase()
    .trim()
}

/* ── Разбор статьи на блоки ─────────────────────────────────────────────── */
/**
 * В каком блоке стоит находка.
 *
 * Сначала ищем фразу целиком. Если не нашлась — ищем её самое длинное
 * предложение: ревизия часто цитирует заголовок вместе со следующим абзацем, и
 * такая цитата не лежит ни в одном блоке, хотя в статье она есть. Первый живой
 * прогон оставил из-за этого три находки неисправленными, две из них критичные.
 *
 * По кускам короче сорока символов не ищем: «€750–1 500 в семестр» встречается в
 * трёх абзацах, и правка ушла бы не в тот.
 */
export function блокНаходки(из: Блок[], фраза: string): { блок: number; цитата: string } {
  const прямо = из.findIndex((б) => встречается(б.html, фраза))
  if (прямо >= 0) return { блок: прямо, цитата: фраза }

  const предложения = фраза
    .split(/(?<=[.!?])\s+|\n+/)
    .map((п) => п.trim())
    .filter((п) => п.length >= 40)
    .sort((a, b) => b.length - a.length)

  for (const п of предложения) {
    const i = из.findIndex((б) => встречается(б.html, п))
    // Отдаём именно найденное предложение: писателю показывают цитату, и она
    // обязана быть в том фрагменте, который он видит. Цитата из соседнего блока
    // для него — просьба поправить то, чего перед ним нет.
    if (i >= 0) return { блок: i, цитата: п }
  }
  return { блок: -1, цитата: фраза }
}


export type Блок = { начало: number; конец: number; html: string }

/**
 * Статья по блокам.
 *
 * Тело статьи размечено комментариями Gutenberg — `<!-- wp:paragraph -->` и
 * закрывающим к нему. Это не догадка о структуре, а её явная запись, поэтому
 * границы абзаца известны точно, без разбора вложенности тегов.
 *
 * Если разметки блоков нет — статья пришла не из редактора, — разбираем по
 * элементам верхнего уровня. Хуже, но лучше, чем считать всю статью одним куском:
 * тогда правка одной цифры снова означала бы переписывание целого.
 */
export function блоки(html: string): Блок[] {
  const из: Блок[] = []
  const маркер = /<!--\s*(\/?)wp:([a-z0-9-]+)[\s\S]*?(\/?)-->/gi
  let глубина = 0
  let началоБлока = -1
  let m: RegExpExecArray | null

  while ((m = маркер.exec(html))) {
    const закрывающий = m[1] === '/'
    const самозакрытый = m[3] === '/'
    if (самозакрытый) {
      if (глубина === 0) из.push({ начало: m.index, конец: m.index + m[0].length, html: m[0] })
      continue
    }
    if (!закрывающий) {
      if (глубина === 0) началоБлока = m.index
      глубина++
    } else {
      глубина = Math.max(0, глубина - 1)
      if (глубина === 0 && началоБлока >= 0) {
        const конец = m.index + m[0].length
        из.push({ начало: началоБлока, конец, html: html.slice(началоБлока, конец) })
        началоБлока = -1
      }
    }
  }

  if (из.length) return из

  // Запасной разбор: элементы верхнего уровня.
  const элемент = /<(p|ul|ol|h[2-6]|blockquote|table)\b[^>]*>[\s\S]*?<\/\1>/gi
  let e: RegExpExecArray | null
  while ((e = элемент.exec(html))) {
    из.push({ начало: e.index, конец: e.index + e[0].length, html: e[0] })
  }
  return из
}

/** Заменить блоки на месте. Всё, что между ними, остаётся побайтово прежним. */
export function заменить(html: string, замены: { блок: Блок; на: string }[]): string {
  const по = [...замены].sort((a, b) => a.блок.начало - b.блок.начало)
  let out = ''
  let курсор = 0
  for (const з of по) {
    out += html.slice(курсор, з.блок.начало) + з.на
    курсор = з.блок.конец
  }
  return out + html.slice(курсор)
}

/**
 * Стоит ли находка ещё в тексте.
 *
 * Сравниваем по прозе: статья с тех пор могла поменять разметку, и находка,
 * пережившая смену тегов, никуда не делась. Если фразы нет — находка относилась
 * к прежнему тексту, и чинить в ней нечего.
 */
export function встречается(текст: string, фраза: string): boolean {
  const ф = проза(фраза)
  if (ф.length < 8) return false
  return проза(текст).includes(ф)
}

registerStep('content_legacy_fix', async (job: Job, seo: any): Promise<StepOutcome> => {
  /* ── 1. Какую страницу чиним ───────────────────────────────────────────── */

  const { data: находки, error: ошНаходки } = await seo.from('claims')
    .select('id, kind, statement, qualifiers, page_id, subject_key, status')
    .eq('status', 'unverified').not('page_id', 'is', null)
  if (ошНаходки) {
    return {
      outcome: 'failed',
      result: {
        error: /page_id|column/i.test(ошНаходки.message)
          ? 'не применена docs/sql/утверждения-из-архива.sql — находки ревизии некуда привязать'
          : `claims: ${ошНаходки.message}`,
      },
    }
  }
  if (!находки?.length) return { outcome: 'done', result: { чинить_нечего: true, cost: 0 } }

  const поСтраницам = new Map<number, Находка[]>()
  for (const c of находки as any[]) {
    const risk = (c.qualifiers?.risk ?? 'низко') as RiskLevel
    const список = поСтраницам.get(c.page_id) ?? []
    список.push({
      claimId: c.id, kind: c.kind, risk, statement: c.statement,
      why: c.qualifiers?.why ?? '', action: c.qualifiers?.action ?? '',
    })
    поСтраницам.set(c.page_id, список)
  }

  let pageId: number | null = job.payload?.page_id ? Number(job.payload.page_id) : null
  const { data: страницы } = await seo.from('pages')
    .select('id, normalized_url, title').in('id', [...поСтраницам.keys()])
  const поId = new Map<number, any>((страницы ?? []).map((p: any) => [p.id, p]))

  if (!pageId && job.payload?.slug) {
    const s = String(job.payload.slug)
    pageId = (страницы ?? []).find((p: any) => p.normalized_url.replace(/\/$/, '').endsWith(`/${s}`))?.id ?? null
    if (!pageId) return { outcome: 'failed', result: { error: `страницы ${s} нет среди размеченных ревизией` } }
  }

  if (!pageId) {
    // Риск умножается на читателей: устаревшая цена на странице с тысячей
    // показов и та же цена на странице без показов — разные задачи. Вес —
    // критичные находки × показы, поэтому порядок отличается от таблицы в
    // отчёте: она отсортирована по одним показам, и страница с семью критичными
    // находками стоит там ниже страницы с одной.
    const трафик = await trafficByPage(seo).catch(() => new Map())
    let лучшая = { id: 0, вес: -1 }
    for (const [id, список] of поСтраницам) {
      const стр = поId.get(id)
      if (!стр) continue
      const крит = список.filter((f) => f.risk === 'критично').length
      if (!крит) continue
      const показы = (трафик.get(стр.normalized_url)?.impressions ?? 0) as number
      const вес = крит * Math.max(показы, 1)
      if (вес > лучшая.вес) лучшая = { id, вес }
    }
    if (!лучшая.id) return { outcome: 'done', result: { критичных_находок: 0, cost: 0 } }
    pageId = лучшая.id
  }

  const страница = поId.get(pageId!)
  if (!страница) return { outcome: 'failed', result: { error: `страницы #${pageId} нет в реестре` } }
  const slug = String(страница.normalized_url).replace(/\/$/, '').split('/').pop() ?? ''
  if (!/^[a-z0-9-]+$/.test(slug)) return { outcome: 'failed', result: { error: `не разобрать адрес: ${страница.normalized_url}` } }

  /* ── 2. Что сейчас на сайте ────────────────────────────────────────────── */

  const текущий = await readThemeArticle(slug)
  if (!текущий) {
    return {
      outcome: 'failed',
      result: { error: `статьи ${slug} нет в теме — править нечего`, page_id: pageId },
    }
  }

  const всеНаходки = (поСтраницам.get(pageId!) ?? [])
    .sort((a, b) => RISK_ORDER.indexOf(a.risk) - RISK_ORDER.indexOf(b.risk))

  // Находка, чьей фразы в тексте больше нет, относилась к прежней версии
  // статьи. Отдавать её писателю — значит просить убрать то, чего нет, и
  // получить правку наугад.
  const живые = всеНаходки.filter((f) => встречается(текущий, f.statement))
  const устаревшие = всеНаходки.length - живые.length
  if (!живые.length) {
    return {
      outcome: 'done',
      result: {
        page_id: pageId, slug, находок: всеНаходки.length, устаревших: устаревшие,
        нечего_править: 'все находки относятся к прежнему тексту — нужна новая ревизия страницы',
        cost: 0,
      },
    }
  }

  // Прикидка: что бы чинили и сколько это находок. Модель не зовётся, версия не
  // заводится. Нужна не для отладки — перед тем как пустить писателя в живую
  // статью, полезно увидеть список глазами.
  if (job.payload?.dry) {
    return {
      outcome: 'done',
      result: {
        прикидка: true, page_id: pageId, slug,
        находок: живые.length, устаревших: устаревшие,
        по_риску: {
          критично: живые.filter((f) => f.risk === 'критично').length,
          средне: живые.filter((f) => f.risk === 'средне').length,
          низко: живые.filter((f) => f.risk === 'низко').length,
        },
        первые: живые.slice(0, 5).map((f) => `${f.risk}/${f.kind}: ${f.statement.slice(0, 90)}`),
        cost: 0,
      },
    }
  }

  /* ── 3. Запись статьи и снимок до правки ───────────────────────────────── */

  // Статьи архива живут в seo.pages и строк в articles не имеют: конвейер их не
  // писал. Чтобы у правки была история версий и согласование, запись заводится
  // здесь — тем же способом, каким это делает обновление вышедшей статьи.
  const заголовок = текущий.match(/<h2[^>]*>([\s\S]*?)<\/h2>/i)?.[1]?.replace(/<[^>]+>/g, '').trim()
    || страница.title || slug

  let articleId: number | null = null
  const { data: уже } = await seo.from('articles')
    .select('id').eq('primary_keyword', slug).limit(1)
  articleId = уже?.[0]?.id ?? null
  if (!articleId) {
    const { data: создана, error } = await seo.from('articles')
      .insert({ topic_id: null, primary_keyword: slug, status: 'in_production' })
      .select('id').single()
    if (error) return { outcome: 'failed', result: { error: `запись статьи: ${error.message}` } }
    articleId = создана.id
  }
  if (!articleId) return { outcome: 'failed', result: { error: 'не удалось определить статью для правки' } }

  let снимок: { id: number; version_no: number }
  try {
    снимок = await insertVersion(seo, articleId, {
      origin: 'human_edited', title: заголовок, body: текущий,
      meta: {
        slug, snapshot: true, taken_at: new Date().toISOString(),
        reason: 'состояние архивной статьи до правки по ревизии',
      },
    })
  } catch (e: any) {
    return { outcome: 'failed', result: { error: `снимок статьи: ${e?.message ?? e}` } }
  }

  /* ── 4. Правка и проверка — тем же путём, что у новых статей ────────────── */

  const ключи = subjectKeysFor(`${заголовок} ${slug}`)
  const гейтДо = await factGate(seo, текущий, ключи)

  const цели = await loadSiteTargets(seo)
    .catch(() => ({ knownBlogSlugs: new Set<string>(), knownPagePaths: new Set<string>() }))
  const стандартДо = checkBlogStandard({
    body: текущий, title: заголовок, excerpt: '', slug, category: '',
    knownBlogSlugs: цели.knownBlogSlugs, knownPagePaths: цели.knownPagePaths,
  }).filter((c: any) => !c.ok && c.level === 'B')

  const ctx = await buildContext(seo, {
    id: null, title: заголовок, primary_keyword: slug, cluster: null,
  }, { id: job.id, article_id: articleId })
  const всеБлоки = блоки(текущий)
  if (!всеБлоки.length) {
    return {
      outcome: 'failed',
      result: { error: `не разобрать ${slug} на блоки — править вслепую нельзя`, page_id: pageId, article_id: articleId },
    }
  }

  // Блокирующие находки гейта идут в ту же правку. Это и есть требование этапа:
  // архив проходит те же ворота, что новая статья, а не свои собственные. Часть
  // из них совпадёт с находками ревизии — совпавшие отсеются сами, потому что
  // фраза у них та же.
  const отГейта: Находка[] = гейтДо.blocking
    .map((b) => ({
      claimId: b.claimId ?? 0,
      kind: `гейт:${b.kind}`,
      risk: 'критично' as RiskLevel,
      statement: b.quote ?? b.statement,
      why: b.why,
      action: 'убрать утверждение целиком',
    }))
    .filter((г) => встречается(текущий, г.statement)
      && !живые.some((ж) => проза(ж.statement) === проза(г.statement)))

  const кЧинке = [...живые, ...отГейта]

  // Находка привязывается к блоку, в котором стоит её фраза. Находка, чей блок
  // не нашёлся, в правку не идёт: править её можно только по всей статье, а это
  // ровно то, чего мы избегаем.
  const поБлокам = new Map<number, Находка[]>()
  const безБлока: Находка[] = []
  for (const ф of кЧинке) {
    const { блок: i, цитата } = блокНаходки(всеБлоки, ф.statement)
    if (i < 0) { безБлока.push(ф); continue }
    поБлокам.set(i, [...(поБлокам.get(i) ?? []), { ...ф, statement: цитата }])
  }

  const замены: { блок: Блок; на: string }[] = []
  const круги: { блок: number; находок: number; закрыто: number; было: number; стало: number }[] = []

  for (const [i, находкиБлока] of поБлокам) {
    const блок = всеБлоки[i]
    let правленый = блок.html
    let осталосьВБлоке = находкиБлока

    for (let круг = 1; круг <= КРУГОВ && осталосьВБлоке.length; круг++) {
      const замечания = осталосьВБлоке.map((ф) => ({
        // Писателю нужны три вещи: что именно стоит в тексте, почему это риск и
        // что с этим делать. Без цитаты он правит по памяти, без «почему» —
        // спорит, без «что делать» — придумывает третий вариант.
        detail: `«${ф.statement}» — ${ф.why || 'утверждение не подтверждено источником'}. ${ф.action || 'убрать утверждение'}`,
      }))
      const ответ = (await reviseFragment(ctx, правленый, замечания)).trim()

      // Пустой ответ — законный исход: от абзаца с одной непроверяемой цифрой
      // после удаления может не остаться содержания. Блок уходит целиком.
      правленый = ответ
      if (!правленый) { осталосьВБлоке = []; break }
      осталосьВБлоке = осталосьВБлоке.filter((ф) => встречается(правленый, ф.statement))
    }

    // Блок, который вырос, — признак того, что писатель дописывал, а не убирал.
    // Такой блок не берём вовсе: он не был сломан, его просто трогать не стоило.
    const вырос = правленый.length > блок.html.length * ПРЕДЕЛ_РОСТА
    if (вырос) {
      круги.push({ блок: i, находок: находкиБлока.length, закрыто: 0, было: блок.html.length, стало: правленый.length })
      continue
    }

    замены.push({ блок, на: правленый })
    круги.push({
      блок: i, находок: находкиБлока.length,
      закрыто: находкиБлока.length - осталосьВБлоке.length,
      было: блок.html.length, стало: правленый.length,
    })
  }

  const текст = заменить(текущий, замены)
  const осталось = живые.filter((ф) => встречается(текст, ф.statement))

  const гейтПосле = await factGate(seo, текст, ключи)
  const стандартПосле = checkBlogStandard({
    body: текст, title: заголовок, excerpt: '', slug, category: '',
    knownBlogSlugs: цели.knownBlogSlugs, knownPagePaths: цели.knownPagePaths,
  }).filter((c: any) => !c.ok && c.level === 'B')

  // Правка не имеет права ухудшать. Если после неё блокирующих находок гейта
  // стало больше или сломался стандарт — предлагать такой текст человеку нельзя:
  // он чинил одно и сломал другое, и заметит это не он, а читатель.
  const ухудшение: string[] = []
  if (гейтПосле.blocking.length > гейтДо.blocking.length) {
    ухудшение.push(`блокирующих фактов было ${гейтДо.blocking.length}, стало ${гейтПосле.blocking.length}`)
  }
  if (стандартПосле.length > стандартДо.length) {
    ухудшение.push(`нарушений стандарта было ${стандартДо.length}, стало ${стандартПосле.length}`)
  }
  // Правка убирает непроверяемое — значит статья должна укоротиться. Рост
  // означает, что её переписали, а не починили: первый живой прогон вернул текст
  // на 18% длиннее с двумя новыми разделами, которых никто не просил.
  if (текст.length > текущий.length * ПРЕДЕЛ_РОСТА) {
    ухудшение.push(`статья выросла с ${текущий.length} до ${текст.length} символов — это не правка, а переписывание`)
  }

  const критОсталось = осталось.filter((f) => f.risk === 'критично')

  if (ухудшение.length) {
    return {
      outcome: 'awaiting_human',
      result: {
        page_id: pageId, slug, article_id: articleId, snapshot_id: снимок.id,
        ухудшение, блоки: круги, закрыто: живые.length - осталось.length, осталось: осталось.length,
        без_блока: безБлока.length, от_гейта: отГейта.length,
        note: 'правка ухудшила проверки — версия не заведена, смотреть человеку',
        cost: 0,
      },
    }
  }

  /* ── 5. Предложение, а не публикация ───────────────────────────────────── */

  let версия: { id: number } | null = null
  try {
    версия = await insertVersion(seo, articleId, {
      origin: 'qa_fixed', title: заголовок, body: текст,
      meta: {
        slug,
        // По этой пометке экран понимает: это правка живой статьи, а не выпуск
        // новой, и публикация пойдёт обновлением по прежнему адресу.
        update_of: slug,
        updated_from: снимок.id,
        brief: { category: '', h1: заголовок },
        legacy_fix: {
          claims: живые.map((f) => f.claimId),
          закрыто: живые.filter((f) => !осталось.includes(f)).map((f) => f.claimId),
          осталось: осталось.map((f) => f.claimId),
        },
        reason: 'правка по ревизии архива',
      },
    })
  } catch (e: any) {
    return { outcome: 'failed', result: { error: `версия с правками: ${e?.message ?? e}`, snapshot_id: снимок.id } }
  }

  await seo.from('articles')
    .update({ current_version_id: версия?.id, status: 'ready_for_review' }).eq('id', articleId).throwOnError()

  await seo.from('change_sets').insert({
    article_id: articleId, page_id: pageId, kind: 'legacy_fix',
    from_version: снимок.id, to_version: версия?.id,
    diff: {
      was_chars: текущий.length, now_chars: текст.length,
      находок: живые.length, закрыто: живые.length - осталось.length,
      критичных_осталось: критОсталось.length, устаревших_находок: устаревшие,
    },
    reason: `правка ${slug} по ревизии архива: закрыто ${живые.length - осталось.length} из ${живые.length}`
      + (критОсталось.length ? `, критичных осталось ${критОсталось.length}` : '')
      + '. Утверждения остаются unverified, пока правка не вышла на сайт.',
    idempotency_key: `legacy:${slug}:${снимок.id}`,
    status: 'proposed', proposed_by: 'system',
  }).throwOnError()

  return {
    // Критичная находка, пережившая два круга, — повод позвать человека, а не
    // отчитаться об успехе: именно она стоит читателю денег или отказа.
    outcome: критОсталось.length ? 'awaiting_human' : 'done',
    result: {
      page_id: pageId, slug, article_id: articleId,
      snapshot_id: снимок.id, version_id: версия?.id,
      находок: живые.length, закрыто: живые.length - осталось.length,
      осталось: осталось.length, критичных_осталось: критОсталось.length,
      устаревших_находок: устаревшие, без_блока: безБлока.length, от_гейта: отГейта.length,
      блоков_правлено: замены.length, блоки: круги,
      символов_до: текущий.length, символов_после: текст.length,
      факты_до: гейтДо.blocking.length, факты_после: гейтПосле.blocking.length,
      cost: 0,
    },
  }
})
