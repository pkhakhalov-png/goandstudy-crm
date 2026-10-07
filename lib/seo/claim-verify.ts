/**
 * Самостоятельный сбор подтверждений: система сама идёт в сеть за источником.
 *
 * Зачем это здесь, а не остаётся скриптом. Реестр фактов заполнял человек, и
 * пока он этого не сделал, ворота выпуска держали готовые статьи: десять
 * утверждений про стипендии CSC пролежали непроверенными две недели только
 * потому, что источник по Китаю никто не завёл. Ритм «статья в день» не может
 * зависеть от того, дошли ли у кого-то руки до блокнота.
 *
 * Роли разделены намеренно и менять это разделение нельзя:
 *
 *   модель  — ходит в сеть и предлагает, ГДЕ смотреть;
 *   код     — скачивает страницу и решает, подтверждено ли.
 *
 * Утверждение засчитывается, только если число и единица действительно найдены
 * в тексте страницы (findEvidence). Модель не может объявить факт
 * подтверждённым: ошибка в адресе стоит лишнего запроса, ошибка в
 * подтверждении стоила бы читателю неверной цифры.
 */
import { getAnthropic } from '@/lib/ai'
import { snapshotSource, findEvidence, verifyClaimAgainst } from './provenance'

export type VerifyClaim = {
  id: number
  subject_key: string
  kind: string
  statement: string
  value: string | null
  value_num: number | null
  unit: string | null
}

export type VerifyReport = {
  confirmed: number
  notFound: number
  sourcesAdded: number
  /** Поимённо — чтобы в результате задачи было видно, что именно подтвердилось. */
  confirmedIds: number[]
  notes: string[]
}

const FIND_TOOL = {
  name: 'predlozhit_istochniki',
  description: 'Вернуть официальные страницы, на которых эти утверждения можно проверить.',
  input_schema: {
    type: 'object',
    properties: {
      sources: {
        type: 'array',
        description: 'От одной до пяти страниц, по убыванию авторитетности.',
        items: {
          type: 'object',
          properties: {
            url: { type: 'string', description: 'Прямая ссылка на страницу с фактами, не главная сайта и не оглавление.' },
            owner: { type: 'string', description: 'Кто издаёт страницу: ведомство, оператор программы, университет.' },
            kind: {
              type: 'string',
              enum: ['official_gov', 'official_org', 'university_program', 'other'],
              description: 'official_gov — государственный орган; official_org — оператор программы; university_program — страница вуза.',
            },
            why: { type: 'string', description: 'Какие из перечисленных утверждений там должны быть.' },
          },
          required: ['url', 'owner', 'kind', 'why'],
        },
      },
    },
    required: ['sources'],
  },
}

type Proposed = { url: string; owner: string; kind: string; why: string }

function domainOf(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, '') } catch { return '' }
}

/**
 * Модель для поиска источников.
 *
 * Названа явно, а не взята из роли `fact_reviewer`: та стоит на Opus, потому
 * что решает, верен ли факт. Здесь задача другая — найти, ГДЕ смотреть, и
 * решение всё равно принимает код по тексту страницы. Платить за поиск по
 * тарифу самой дорогой модели незачем.
 *
 * Прежнее значение `claude-sonnet-4-6` в seo.model_pricing отсутствует — то
 * есть каждый такой вызов стоил «ноль» и в отчёте его не было видно вовсе.
 */
const ПОИСКОВАЯ_МОДЕЛЬ = 'claude-sonnet-5'

/**
 * Сколько поисков в сети разрешаем на один вызов.
 *
 * Было восемь. При десяти предметах в пачке и часовом ритме это до 1900
 * поисков в сутки — больше, чем весь остальной конвейер вместе взятый, и всё
 * это мимо учёта. Четыре хватает: страницу всё равно скачивает и проверяет код,
 * а модель здесь только предлагает адреса.
 */
const ПОИСКОВ_НА_ВЫЗОВ = 4

async function proposeSources(seo: any, subject: string, claims: VerifyClaim[]): Promise<Proposed[]> {
  const list = claims
    .map((c) => `- [${c.kind}] ${c.statement}${c.value ? ` (значение: ${c.value}${c.unit ? ' ' + c.unit : ''})` : ''}`)
    .join('\n')

  const запрос = () => getAnthropic().messages.create({
    model: ПОИСКОВАЯ_МОДЕЛЬ,
    max_tokens: 4096,
    tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: ПОИСКОВ_НА_ВЫЗОВ }, FIND_TOOL] as any,
    messages: [{
      role: 'user',
      content: `Найди официальные страницы, на которых можно проверить эти утверждения (предмет: ${subject}).

${list}

Требования к ссылкам:
— первоисточник, а не пересказ: сайт ведомства, оператора программы или самого вуза;
— страница с самими цифрами, а не оглавление и не новость о них;
— агрегаторы, блоги агентств и посредники не годятся;
— если для разных утверждений нужны разные страницы — верни несколько.

Проверь ссылки поиском, прежде чем возвращать. Вызови predlozhit_istochniki ровно один раз.`,
    }],
  })

  // Учёт. До сих пор этот вызов шёл мимо него: в seo.runs его не было, в
  // отчёте не было, и предел в двадцать пять долларов в сутки на него не
  // распространялся — при том, что по деньгам он обгонял производство статей.
  const { withSpend } = await import('./spend')
  const { currentSpendContext } = await import('./spend-context')
  const spend = currentSpendContext()

  const res = spend
    ? await withSpend(
      {
        ...spend, seo: spend.seo ?? seo, role: 'fact_reviewer',
        provider: 'anthropic', model: ПОИСКОВАЯ_МОДЕЛЬ, estimate: 0.10,
      },
      async () => {
        const r = await запрос()
        return {
          value: r,
          usage: {
            input_tokens: (r as any).usage?.input_tokens ?? 0,
            output_tokens: (r as any).usage?.output_tokens ?? 0,
            cache_creation_input_tokens: (r as any).usage?.cache_creation_input_tokens ?? 0,
            cache_read_input_tokens: (r as any).usage?.cache_read_input_tokens ?? 0,
          },
        }
      },
    )
    : await запрос()   // вне задачи (скрипт, ручной прогон) относить расход не к чему

  const use = (res.content as any[]).find((b) => b.type === 'tool_use' && b.name === 'predlozhit_istochniki')
  return (use?.input?.sources ?? []) as Proposed[]
}

/** Источник заводим один раз; повторный прогон переиспользует строку. */
async function ensureSource(seo: any, s: Proposed, subject: string): Promise<number | null> {
  const { data: exist } = await seo.from('sources').select('id').eq('url', s.url).maybeSingle()
  if (exist) return exist.id
  const { data, error } = await seo.from('sources').insert({
    source_type: 'web', url: s.url, domain: domainOf(s.url),
    kind: ['official_gov', 'official_org', 'university_program'].includes(s.kind) ? s.kind : 'other',
    lang: 'en', active: true, added_by: 'autoverify', subject_key: subject,
    owner: s.owner, critical: false, recheck_hours: 24,
  }).select('id').single()
  if (error) return null
  return data.id
}


/* ── Отступ по предметам ──────────────────────────────────────────────────── */

/**
 * Почему без отступа это вечный цикл.
 *
 * Пачка бралась как `verified_at is null order by id limit 20` — то есть КАЖДЫЙ
 * час одни и те же первые двадцать утверждений. Если источник для них не
 * находится (а он не находился: за пять дней заведено 166 источников и
 * подтверждено 32 утверждения из 743), то следующий час повторяет ровно ту же
 * работу. До остальных шестисот девяноста одного дело не доходит никогда.
 *
 * Отступ хранится в настройках, а не колонкой в claims: колонка — это миграция,
 * а настройка есть уже сейчас, и этого достаточно, чтобы остановить перебор.
 */
const КЛЮЧ_ОТСТУПА = 'claims_autoverify_backoff'

/** Через сколько часов пробовать предмет снова после неудачи. Дальше — не пробуем. */
const ОТСТУП_ЧАСОВ = [6, 24, 72, 168]

type Отступ = { fails: number; nextAt: string }

async function загрузитьОтступы(seo: any): Promise<Record<string, Отступ>> {
  const { data } = await seo.from('settings').select('value').eq('key', КЛЮЧ_ОТСТУПА).maybeSingle()
  const v = data?.value
  return v && typeof v === 'object' ? (v as Record<string, Отступ>) : {}
}

async function сохранитьОтступы(seo: any, м: Record<string, Отступ>): Promise<void> {
  // Ошибку глотаем: отступ — это экономия, а не условие работы. Уронить из-за
  // него разбор подтверждений значило бы поменять лишний запрос на ни одного.
  try {
    await seo.from('settings').upsert({ key: КЛЮЧ_ОТСТУПА, value: м }, { onConflict: 'key' }).throwOnError()
  } catch (e: any) {
    console.error(`[claims] отступ не записался: ${String(e?.message ?? e).slice(0, 160)}`)
  }
}

/** Предмет ждёт своего часа — или уже исчерпал попытки. */
function ждёт(о: Отступ | undefined): boolean {
  if (!о) return false
  if (о.fails >= ОТСТУП_ЧАСОВ.length) return true   // больше не пробуем вовсе
  return Date.parse(о.nextAt) > Date.now()
}

function следующий(о: Отступ | undefined): Отступ {
  const fails = (о?.fails ?? 0) + 1
  const часов = ОТСТУП_ЧАСОВ[Math.min(fails, ОТСТУП_ЧАСОВ.length) - 1]
  return { fails, nextAt: new Date(Date.now() + часов * 3600 * 1000).toISOString() }
}

/**
 * Разобрать пачку неподтверждённых утверждений.
 *
 * Отбор идёт по `verified_at`, а не по `status`: подтверждённое утверждение
 * получает status 'active', и фильтр по слову «verified» брал бы уже
 * проверенные заново.
 */
export async function autoverifyClaims(
  seo: any,
  opts: { subject?: string | null; limit?: number } = {},
): Promise<VerifyReport> {
  const report: VerifyReport = { confirmed: 0, notFound: 0, sourcesAdded: 0, confirmedIds: [], notes: [] }

  const отступы = opts.subject ? {} : await загрузитьОтступы(seo)

  // Отсеиваем ждущие предметы здесь, а не в запросе: условие «предмет не в
  // отступе» в базе не выразить, а limit там применяется раньше фильтра.
  //
  // Поэтому идём страницами, а не одной выборкой «первые четыреста по номеру».
  // Одной выборкой окно целиком заняли утверждения пятидесяти трёх предметов, у
  // которых счётчик неудач упёрся в потолок — то есть «больше не пробуем
  // вовсе». Шаг каждый час честно откладывал все четыреста и до свежих статей
  // не доходил никогда: их утверждения стоят в конце по номеру. Ворота фактов
  // не открывались, выпуск стоял, и в отчёте это выглядело как обычная работа.
  const ПАЧКА = 400
  const СТРАНИЦ = 6            // потолок обхода: при семистах утверждениях хватает двух
  const ПРЕДМЕТОВ_ЗА_ПРОГОН = 3

  const поля = 'id, subject_key, kind, statement, value, value_num, unit'
  const bySubject = new Map<string, VerifyClaim[]>()
  let отложено = 0

  // Первая выборка и постраничный обход пересекаются — считаем каждое
  // утверждение один раз, иначе и пачка, и счётчик отложенных задвоятся
  const виденные = new Set<number>()

  const разложить = (list: VerifyClaim[]) => {
    for (const c of list) {
      if (виденные.has(c.id)) continue
      виденные.add(c.id)
      if (ждёт(отступы[c.subject_key])) { отложено++; continue }
      const у = bySubject.get(c.subject_key) ?? []
      у.push(c)
      bySubject.set(c.subject_key, у)
    }
  }

  if (opts.subject) {
    const { data } = await seo.from('claims').select(поля)
      .is('verified_at', null).eq('subject_key', opts.subject).order('id').limit(opts.limit ?? 20)
    разложить((data ?? []) as VerifyClaim[])
  } else {
    // Сначала утверждения статей, которые ждут выпуска: именно их держат ворота
    // фактов. Порядок «по номеру» ставил их последними — статья, написанная
    // вчера, оказывалась в конце очереди за архивом годовой давности и ждала бы
    // своего часа неделями.
    const { data: готовые } = await seo.from('articles').select('id')
      .in('status', ['ready_for_review', 'approved', 'in_production'])
    const ids = (готовые ?? []).map((a: any) => a.id)
    if (ids.length) {
      const { data } = await seo.from('claims').select(поля)
        .is('verified_at', null).in('article_id', ids).order('id').limit(ПАЧКА)
      разложить((data ?? []) as VerifyClaim[])
    }

    for (let страница = 0; bySubject.size < ПРЕДМЕТОВ_ЗА_ПРОГОН && страница < СТРАНИЦ; страница++) {
      const от = страница * ПАЧКА
      const { data } = await seo.from('claims').select(поля)
        .is('verified_at', null).order('id').range(от, от + ПАЧКА - 1)
      разложить((data ?? []) as VerifyClaim[])
      // Набрали на прогон или страница неполная — дальше читать незачем
      if (bySubject.size >= ПРЕДМЕТОВ_ЗА_ПРОГОН || (data?.length ?? 0) < ПАЧКА) break
    }
  }

  if (отложено) report.notes.push(`отложено по отступу: ${отложено} утверждений`)
  if (!bySubject.size) return report

  // Предметов за прогон — не больше трёх. Каждый это вызов модели с поиском в
  // сети, а шаг поднимается раз в час: без предела один прогон разбирал десять
  // предметов, то есть до сорока поисков, и так круглые сутки.
  const предметы = [...bySubject.entries()].slice(0, ПРЕДМЕТОВ_ЗА_ПРОГОН)
  let разобрано = 0

  for (const [subject, list] of предметы) {
    if (разобрано >= (opts.limit ?? 20)) break
    разобрано += list.length

    // Считаем предмет неудачным заранее и снимаем отметку только при полном
    // успехе. Так учтутся и выходы через continue: их здесь три, и каждый —
    // потраченный вызов модели, после которого повторять через час незачем.
    отступы[subject] = следующий(отступы[subject])

    let proposed: Proposed[] = []
    try { proposed = await proposeSources(seo, subject, list) }
    catch (e: any) { report.notes.push(`${subject}: поиск источников не удался — ${e?.message ?? e}`); continue }
    if (!proposed.length) { report.notes.push(`${subject}: модель не нашла источников`); continue }

    const pending = new Set(list.map((c) => c.id))

    for (const p of proposed) {
      if (!pending.size) break
      const sourceId = await ensureSource(seo, p, subject)
      if (!sourceId) { report.notes.push(`${domainOf(p.url)}: источник не завёлся`); continue }
      report.sourcesAdded++

      let snap
      try { snap = await snapshotSource(seo, sourceId, { maxAgeMin: 10 }) }
      catch (e: any) { report.notes.push(`${domainOf(p.url)}: снимок не снялся — ${e?.message ?? e}`); continue }
      if (snap.error) { report.notes.push(`${domainOf(p.url)}: ${snap.error}`); continue }

      for (const claim of list) {
        if (!pending.has(claim.id)) continue
        const found = findEvidence(snap.text, claim as any)
        if (!found) continue
        const ev = await verifyClaimAgainst(seo, claim.id, snap)
        if (!ev) continue
        pending.delete(claim.id)
        report.confirmed++
        report.confirmedIds.push(claim.id)
      }
    }
    report.notFound += pending.size
    // Отступ снимаем при любом продвижении, а не только при полном разборе.
    // Подтвердить три утверждения из пяти — это работа, и наказывать за неё
    // задержкой нельзя. Останавливаем ровно тот случай, который и был бедой:
    // прогон, после которого не подтвердилось ни одного.
    if (pending.size < list.length) delete отступы[subject]
  }

  if (!opts.subject) await сохранитьОтступы(seo, отступы)

  return report
}
