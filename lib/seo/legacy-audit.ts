/**
 * Ревизия опубликованного архива (E3).
 *
 * Восемьдесят с лишним статей вышли до того, как появился гейт достоверности.
 * Риск лежит не в том, что конвейер напишет завтра — завтрашнее проходит ворота,
 * — а в том, что уже проиндексировано и читается прямо сейчас. Что там
 * утверждается, не знает никто.
 *
 * Здесь собраны вместе два готовых поиска и добавлен третий, которого не хватало:
 *   · числа с деньгами, процентами и баллами — findUnbackedNumbers;
 *   · формулировки без чисел — findSemanticClaims;
 *   · даты подачи — их числовой поиск не видел: «до 15 января» это не «15 лет».
 *
 * Ничего не правим и не переписываем: это ревизия. На выходе — список утверждений
 * с дословной цитатой, местом в тексте и оценкой риска по PRD, чтобы человек мог
 * решить, что из этого надо чинить сегодня, а что подождёт.
 */
import { parse } from 'node-html-parser'
import { findUnbackedNumbers } from './claims'
import { findSemanticClaims, toPlain } from './semantic-claims'

/** Риск ровно по PRD: что стоит читателю денег и года, а что просто неточно. */
export type RiskLevel = 'критично' | 'средне' | 'низко'

export type LegacyFinding = {
  /** Вид утверждения из словаря claim_policy — им же размечается seo.claims. */
  kind: string
  risk: RiskLevel
  /** Чем нашли: число, дата подачи или формулировка без цифр. */
  source: 'число' | 'дата' | 'формулировка'
  /** Дословная цитата из текста статьи. */
  statement: string
  /** Что именно сработало — число, дата, оборот. */
  trigger: string
  /** Смещение в теле статьи (в том HTML, который просматривали). */
  offset: number
  /** Раздел статьи, в котором стоит находка: ближайший заголовок выше. */
  section: string
  why: string
  /** Что с этим делать. Решает человек, но предложение должно быть конкретным. */
  action: string
}

/**
 * Тело статьи из страницы блога.
 *
 * Берём контейнер содержимого, а не весь документ: в шапке и подвале лежат
 * телефоны, цены услуг и «работаем с 2015 года», и ревизия захлебнулась бы в
 * находках, одинаковых для всех восьмидесяти страниц.
 */
export function extractArticleBody(html: string): string {
  const root = parse(html)
  for (const sel of ['.entry-content', 'main', 'article']) {
    const el = root.querySelector(sel)
    if (el && el.innerHTML.length > 500) return el.innerHTML
  }
  // Не нашли контейнер — отдаём документ без служебных блоков, но это хуже:
  // в находки полезет навигация, и это будет видно по одинаковым цитатам
  for (const el of root.querySelectorAll('nav, header, footer, script, style, form')) el.remove()
  return root.innerHTML
}

/**
 * Заголовки статьи с их местом в теле.
 *
 * Нужны, чтобы понимать, о чём число. Первый прогон по архиву классифицировал
 * суммы по словам в шестидесяти знаках вокруг — и это оказалось гаданием: цена
 * Гарварда попала в «стоимость жизни», потому что рядом не случилось слова
 * «обучение», а сбор за оценку диплома в 400 $ попал в «плату за обучение»,
 * потому что через строку стояло слово «бакалавриат».
 *
 * Раздел — честный признак: человек читает цену именно под тем заголовком, под
 * которым она напечатана.
 */
export function extractHeadings(html: string): { offset: number; text: string }[] {
  const out: { offset: number; text: string }[] = []
  for (const m of html.matchAll(/<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/gi)) {
    const text = m[1].replace(/<[^>]+>/g, ' ').replace(/&[a-z#0-9]+;/gi, ' ').replace(/\s+/g, ' ').trim()
    if (text) out.push({ offset: m.index ?? 0, text })
  }
  return out
}

/** Раздел, в котором стоит находка: ближайший заголовок выше по тексту. */
function sectionFor(headings: { offset: number; text: string }[], offset: number): string {
  let cur = ''
  for (const h of headings) {
    if (h.offset > offset) break
    cur = h.text
  }
  return cur
}

/* ── Даты подачи ──────────────────────────────────────────────────────────── */

const MONTHS = 'январ|феврал|март|апрел|ма[йя]|июн|июл|август|сентябр|октябр|ноябр|декабр'

/**
 * Срок подачи словами: «до 15 января», «дедлайн — 1 декабря», «приём до марта».
 *
 * Числовой поиск такие места пропускает: он ищет число рядом с единицей измерения,
 * а в «до 15 января» единица — само название месяца. Между тем устаревший срок
 * подачи — причина, по которой читатель опоздает на год.
 */
const DATE_PATTERNS: RegExp[] = [
  new RegExp(`(?<![\\p{L}\\d])(?:до|по|с|не\\s+позднее|крайний\\s+срок|дедлайн[^.]{0,20}?)\\s+\\d{1,2}\\s+(?:${MONTHS})[\\p{L}]*`, 'giu'),
  new RegExp(`(?<![\\p{L}\\d])\\d{1,2}\\s+(?:${MONTHS})[\\p{L}]*\\s+\\d{4}`, 'giu'),
  new RegExp(`(?<![\\p{L}\\d])(?:дедлайн|срок\\s+подачи|приём\\s+(?:заявок|документов)|подача\\s+документов)[^.]{0,40}?(?:${MONTHS})[\\p{L}]*`, 'giu'),
]

/* ── Деньги словами ───────────────────────────────────────────────────────── */

/**
 * Суммы, которые числовой поиск не видит.
 *
 * `findUnbackedNumbers` ищет знак валюты или короткую единицу: ₽, €, %, «балл».
 * В статьях блога цена чаще написана словом — «2500 евро в год», «от 15 тысяч
 * долларов», «800 злотых». Для ревизии это главный пропуск: стоимость обучения
 * в PRD стоит в критичных, а в поиске её половина не видна.
 *
 * Правило поиска живёт здесь, а не в claims.ts, намеренно. Там оно попало бы на
 * ворота новых статей и поменяло бы работу конвейера — а конвейер сейчас
 * настроен и работает. Ревизия архива менять его поведение не должна.
 */
const MONEY_WORDS = 'евро|доллар[\\p{L}]*|рубл[\\p{L}]*|руб\\.|злот[\\p{L}]*|крон[\\p{L}]*|юан[\\p{L}]*|фунт[\\p{L}]*|форинт[\\p{L}]*|дирхам[\\p{L}]*|вон[\\p{L}]*|бат[\\p{L}]*'

const MONEY_PATTERNS: RegExp[] = [
  // «2500 евро», «15 тысяч долларов», «от 800 злотых в год»
  new RegExp(`(?<![\\p{L}\\d])\\d[\\d\\s ]{1,9}(?:тыс[\\p{L}.]*\\s+)?(?:${MONEY_WORDS})`, 'giu'),
  // «€2 500», «$1200»
  /[€$₽¥£]\s?\d[\d\s ]{2,}/gu,
]

/* ── Разметка риска ───────────────────────────────────────────────────────── */

/**
 * Риск по PRD: критично — виза, право на работу, гарантия поступления, стоимость
 * обучения; средне — сроки и состав программы; низко — общие описания.
 *
 * Шкала не про то, насколько мы уверены в находке, а про то, чем ошибка обойдётся
 * читателю. Выдуманная цена и выдуманный визовый режим стоят разного: первое —
 * денег, второе — года и запрета на въезд.
 */
const CATEGORY_RISK: Record<string, { risk: RiskLevel; why: string; action: string }> = {
  visa: {
    risk: 'критично',
    why: 'визовый режим: ошибка стоит читателю отказа на границе или запрета на въезд',
    action: 'Сверить с консульством или официальным источником страны; не подтверждается — убрать утверждение',
  },
  work_rights: {
    risk: 'критично',
    why: 'право на работу: нарушение режима стоит студенту статуса и визы',
    action: 'Сверить с правилами страны на текущий год; указать ограничение по часам явно',
  },
  guarantee: {
    risk: 'критично',
    why: 'обещание результата: поступление и визу решаем не мы',
    action: 'Убрать обещание — оно не только неверно, но и нарушает закон о рекламе',
  },
  recognition: {
    risk: 'средне',
    why: 'признание документов: процедура зависит от страны и вуза, а читатель узнает об отказе после переезда',
    action: 'Сверить с правилами признания в стране; добавить оговорку про зависимость от вуза',
  },
  about_us: {
    risk: 'низко',
    why: 'утверждение о нашем опыте: проверить его может только компания',
    action: 'Подтвердить внутренними данными или переписать без ссылки на опыт',
  },
}

/**
 * Деньги деньгам рознь.
 *
 * PRD относит к критичному стоимость обучения, а не любую сумму в тексте. Первый
 * прогон по архиву это доказал: из 400 «критичных» находок больше трёхсот
 * оказались ценами на общежитие, проездной и продукты. Отчёт, где критично всё,
 * не говорит ничего — по нему нельзя решить, бросать ли дела.
 *
 * Поэтому смотрим, о чём идёт речь в предложении: плата за учёбу — критично,
 * стипендия и стоимость жизни — средне.
 */
function moneyRisk(section: string, context: string): { kind: string; risk: RiskLevel; why: string; action: string } {
  // Раздел решает: под заголовком «Стоимость жизни» любая сумма — про жизнь,
  // даже если в соседнем предложении встретилось слово «обучение»
  const living = /жиль|жизн|расход|питани|транспорт|аренд|общежит|проживан|страхов/i
  const study = /стоимость\s+обучени|плата\s+за\s+обучени|цены|tuition|сколько\s+стоит\s+(?:учёб|учеб|обучени)/i
  const grants = /стипенди|грант|финансиров|scholarship/i

  if (section && living.test(section) && !study.test(section)) {
    return {
      kind: 'system_basics', risk: 'средне',
      why: `стоимость жизни без подтверждения (раздел «${section}»): цифра устаревает молча, а читатель считает по ней бюджет переезда`,
      action: 'Обновить при плановой правке или заменить на диапазон с датой проверки',
    }
  }
  if (section && grants.test(section) && !study.test(section)) {
    return {
      kind: 'scholarship', risk: 'средне',
      why: `размер стипендии или гранта без подтверждения (раздел «${section}»): суммы пересматриваются от набора к набору`,
      action: 'Сверить с условиями программы на текущий год',
    }
  }
  if ((section && study.test(section)) || /обучени|учёб|учеб|семестр|tuition|плата\s+за|стоимость\s+программ/i.test(context)) {
    return {
      kind: 'tuition_fee',
      risk: 'критично',
      why: 'плата за обучение без подтверждения: цены пересматриваются каждый год, а читатель планирует по ним бюджет на годы вперёд',
      action: 'Сверить с сайтом вуза; изменилась — заменить и указать дату проверки',
    }
  }
  if (/стипенди|грант|scholarship|выплат/i.test(context)) {
    return {
      kind: 'scholarship',
      risk: 'средне',
      why: 'размер стипендии или гранта без подтверждения: суммы пересматриваются от набора к набору',
      action: 'Сверить с условиями программы на текущий год',
    }
  }
  // Ни раздел, ни предложение не говорят, о чём сумма. Гадать не будем:
  // в критичное идёт только то, про что известно, что это плата за учёбу
  return {
    kind: 'system_basics',
    risk: 'средне',
    why: 'стоимость жизни без подтверждения: цифра устаревает молча, а читатель считает по ней бюджет переезда',
    action: 'Обновить при плановой правке или заменить на диапазон с датой проверки',
  }
}

/** Что за число нашли и чем это грозит. */
function riskForNumber(value: string, section: string, context: string): { kind: string; risk: RiskLevel; why: string; action: string } {
  const money = /₽|руб|€|\$|¥/i.test(value)
  const score = /балл|%/i.test(value)
  const period = /лет|год|дней|месяц/i.test(value)
  const nearDeadline = /дедлайн|срок|подач|заявк|до\s+\d|не\s+позднее/i.test(context)

  if (money) return moneyRisk(section, context)
  if (score) {
    return {
      kind: 'language_req',
      risk: 'средне',
      why: 'проходной балл или доля без подтверждения: требования меняются от набора к набору',
      action: 'Сверить с требованиями программы на текущий год',
    }
  }
  if (period && nearDeadline) {
    return {
      kind: 'deadline',
      risk: 'средне',
      why: 'срок подачи или ожидания без подтверждения: устаревший срок стоит читателю года',
      action: 'Сверить с приёмной кампанией текущего года',
    }
  }
  return {
    kind: 'system_basics',
    risk: 'низко',
    why: 'число в общем описании: ошибка неприятна, но решения читателя не меняет',
    action: 'Проверить при следующей плановой правке статьи',
  }
}

/* ── Ревизия одной статьи ─────────────────────────────────────────────────── */

/**
 * Найти в теле статьи всё, что утверждается без подтверждения.
 *
 * Смещения настоящие: текст очищается от разметки вместе с картой позиций, и
 * каждое смещение указывает ровно на найденную фразу в переданном HTML. Проверить
 * это можно срезом — так делает и прогон, и отчёт.
 */
export function auditArticle(bodyHtml: string): LegacyFinding[] {
  const { text, map } = toPlain(bodyHtml)
  const headings = extractHeadings(bodyHtml)
  const out: LegacyFinding[] = []
  const at = (plainOffset: number) => map[plainOffset] ?? 0

  // Разделы, в которых статья разбирает чужие заблуждения. Утверждение там
  // приведено как ошибка читателя, а не как наше слово: «Частые ошибки при
  // оформлении визы · Думать, что зачисление гарантирует визу». Найдено на живом
  // архиве — без этого ревизия выдавала такие разделы за обещания статьи.
  const MYTH_SECTION = /ошибк|миф|заблужден|не\s+стоит|чего\s+избегать|красн[\p{L}]*\s+флаг/iu

  // 1. Формулировки без чисел — те же правила, что стоят на воротах у новых статей
  for (const f of findSemanticClaims(bodyHtml)) {
    if (MYTH_SECTION.test(sectionFor(headings, f.offset))) continue
    const r = CATEGORY_RISK[f.category] ?? { risk: 'низко' as RiskLevel, why: f.why, action: 'Проверить при плановой правке' }
    out.push({
      kind: f.kind, risk: r.risk, source: 'формулировка',
      statement: f.quote, trigger: f.trigger, offset: f.offset,
      section: sectionFor(headings, f.offset), why: r.why, action: r.action,
    })
  }

  // 2. Числа. Реестр фактов сюда не передаём намеренно: в архиве нечего сверять,
  // эти статьи писались до реестра, и любое число в них — утверждение без опоры.
  for (const n of findUnbackedNumbers(text, [])) {
    const section = sectionFor(headings, at(n.offset))
    const r = riskForNumber(n.value, section, n.context)
    out.push({
      kind: r.kind, risk: r.risk, source: 'число', section,
      // trigger — ровно то, что стоит в тексте: по собранному «350 €» место в
      // теле не найти, там между числом и знаком валюты может стоять разметка
      statement: sentenceAround(text, n.offset, n.raw.length), trigger: n.raw.trim(), offset: map[n.offset] ?? 0,
      why: r.why, action: r.action,
    })
  }

  // 3. Суммы, написанные словом
  const seenMoney = new Set<string>()
  for (const re of MONEY_PATTERNS) {
    for (const m of text.matchAll(re)) {
      const at = m.index ?? 0
      const trigger = m[0].trim()
      const key = trigger.toLowerCase().replace(/\s+/g, '')
      if (seenMoney.has(key)) continue
      seenMoney.add(key)
      // Числовой поиск мог найти то же место по знаку валюты — не показываем дважды
      if (out.some((f) => f.source === 'число' && Math.abs((map[at] ?? 0) - f.offset) < 40)) continue
      const section = sectionFor(headings, map[at] ?? 0)
      const r = moneyRisk(section, sentenceAround(text, at, trigger.length))
      out.push({
        kind: r.kind, risk: r.risk, source: 'число', section,
        statement: sentenceAround(text, at, trigger.length), trigger, offset: map[at] ?? 0,
        why: r.why, action: r.action,
      })
    }
  }

  // 4. Даты подачи
  const seenDates = new Set<string>()
  for (const re of DATE_PATTERNS) {
    for (const m of text.matchAll(re)) {
      const at = m.index ?? 0
      const trigger = m[0].trim()
      if (seenDates.has(trigger.toLowerCase())) continue
      seenDates.add(trigger.toLowerCase())
      // Один и тот же срок ловится двумя шаблонами: «До 8 января» и «8 января
      // 2026». Это одно место в тексте, и в отчёте оно должно быть одной строкой
      const here = map[at] ?? 0
      if (out.some((f) => f.source === 'дата' && Math.abs(f.offset - here) < 30)) continue
      out.push({
        kind: 'deadline', risk: 'средне', source: 'дата',
        section: sectionFor(headings, map[at] ?? 0),
        statement: sentenceAround(text, at, trigger.length), trigger, offset: map[at] ?? 0,
        why: 'срок подачи без подтверждения: приёмная кампания сдвигается каждый год, а опоздание стоит года',
        action: 'Сверить с календарём приёма текущего года; если срок прошёл — обновить или убрать',
      })
    }
  }

  return out.sort((a, b) => a.offset - b.offset)
}

/**
 * Предложение вокруг находки.
 *
 * Главное требование: найденная фраза обязана быть внутри цитаты. На первом
 * прогоне по архиву это нарушалось — в статьях много таблиц и списков без точек,
 * граница предложения уезжала на сотни знаков назад, обрезка по длине рубила
 * цитату до самого числа, и человек читал строку, в которой находки нет.
 * Поэтому длинный кусок режется не с начала, а вокруг места.
 */
function sentenceAround(text: string, at: number, len = 0): string {
  const from = Math.max(0, lastBoundary(text, at))
  const to = nextBoundary(text, at + len)
  const piece = text.slice(from, to).trim()
  if (piece.length <= 300) return piece

  const start = Math.max(from, at - 140)
  const end = Math.min(to, at + len + 140)
  return `${start > from ? '…' : ''}${text.slice(start, end).trim()}${end < to ? '…' : ''}`
}

function lastBoundary(text: string, at: number): number {
  for (let i = at; i > 0 && at - i < 400; i--) {
    if (/[.!?…\n]/.test(text[i - 1]) && /\s/.test(text[i] ?? ' ')) return i
  }
  return Math.max(0, at - 200)
}

function nextBoundary(text: string, at: number): number {
  for (let i = at; i < text.length && i - at < 400; i++) {
    if (/[.!?…\n]/.test(text[i])) return i + 1
  }
  return Math.min(text.length, at + 200)
}

/**
 * Проверить, что смещения указывают на настоящие места.
 *
 * Две проверки, потому что они ловят разное. В очищенном тексте фраза обязана
 * совпасть дословно — это проверка самой находки. В теле статьи сверяем первый
 * символ: если внутри фразы стояла разметка («1 200</strong> €»), срез по длине
 * совпасть и не может, а начало — обязано.
 */
export function verifyOffsets(bodyHtml: string, findings: LegacyFinding[]): string[] {
  const { text, map } = toPlain(bodyHtml)
  const problems: string[] = []
  for (const f of findings) {
    const inPlain = map.indexOf(f.offset)
    if (inPlain < 0) { problems.push(`${f.trigger}: смещение ${f.offset} не найдено в карте позиций`); continue }
    const plainPiece = text.slice(inPlain, inPlain + f.trigger.length)
    if (plainPiece !== f.trigger) problems.push(`${f.trigger}: в тексте по этому месту «${plainPiece}»`)
    else if (bodyHtml[f.offset] !== f.trigger[0]) problems.push(`${f.trigger}: в теле по смещению «${bodyHtml[f.offset]}»`)
  }
  return problems
}

/** Порядок для отчёта: сначала то, из-за чего стоит бросить дела. */
export const RISK_ORDER: RiskLevel[] = ['критично', 'средне', 'низко']
