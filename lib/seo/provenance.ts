/**
 * Откуда известно каждое утверждение.
 *
 * Правило одно и оно жёсткое: подтверждением считается дословная выдержка из
 * текста источника, а не наличие ссылки рядом. Ссылка говорит «мы где-то это
 * взяли»; выдержка говорит «вот это место». Разница видна в тот день, когда
 * страница меняется: по выдержке понятно, что именно пропало, по ссылке — нет.
 *
 * Поэтому здесь нет функции «привязать утверждение к источнику». Есть функция
 * «проверить утверждение по тексту», и связь появляется только если проверка
 * сошлась.
 */
import { safeFetch } from './safe-fetch'
import { cachedVerify, CODE_CHECKER } from './verify-cache'
import crypto from 'node:crypto'

/** Снимок страницы: что прочитали, когда и в каком виде. */
export type Snapshot = {
  id: number
  sourceId: number
  finalUrl: string | null
  httpStatus: number | null
  text: string
  contentHash: string | null
  error: string | null
}

/** Найденное подтверждение: где именно в тексте и каким способом сошлось. */
export type Evidence = {
  quote: string
  locator: string
  method: 'exact_number' | 'exact_phrase'
}

const sha = (s: string) => crypto.createHash('sha256').update(s).digest('hex')

/**
 * Текст из HTML.
 *
 * Скрипты и стили вырезаются целиком вместе с содержимым: иначе в «тексте»
 * окажется JavaScript, и число из кода сойдёт за число со страницы.
 */
export function extractText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<\/(p|div|tr|li|h[1-6]|table|section)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))
    .replace(/[ \t ]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n')
    .trim()
}

/**
 * Текст снимка по версии источника.
 *
 * Текст хранится только у той строки, где он впервые отличился от предыдущего:
 * неизменившиеся копии одной страницы занимали бы место и ничего не добавляли.
 * Поэтому ищем по хешу первую строку, у которой текст есть.
 */
export async function snapshotText(seo: any, sourceId: number, contentHash: string): Promise<string | null> {
  const { data } = await seo.from('source_snapshots')
    .select('raw_text').eq('source_id', sourceId).eq('content_hash', contentHash)
    .not('raw_text', 'is', null).order('fetched_at', { ascending: true }).limit(1)
  return data?.[0]?.raw_text ?? null
}

/**
 * Снять снимок источника и записать его.
 *
 * Строка создаётся и при неудаче: недоступность источника — это наблюдение,
 * а не отсутствие наблюдения. PRD отдельно требует различать «источник не
 * изменился» и «источник не проверялся», и хранить только первое нельзя.
 */
export async function snapshotSource(
  seo: any,
  sourceId: number,
  opts: { maxAgeMin?: number } = {},
): Promise<Snapshot> {
  const { data: src, error } = await seo.from('sources').select('id, url, source_type').eq('id', sourceId).single()
  if (error || !src) throw new Error(`источник #${sourceId} не найден: ${error?.message}`)
  if (src.source_type !== 'web' || !src.url) throw new Error(`источник #${sourceId} не веб-страница — снимок не снять`)

  const { data: prev } = await seo.from('source_snapshots')
    .select('id, content_hash, fetched_at, http_status, final_url').eq('source_id', sourceId)
    .order('fetched_at', { ascending: false }).limit(1)
  const previousId = prev?.[0]?.id ?? null
  const previousHash = prev?.[0]?.content_hash ?? null

  // Свежий снимок уже есть — не ходим на сайт заново.
  //
  // Проверка одной статьи трогает десятки утверждений с общими источниками;
  // без этого мы бы качали страницу вуза по разу на каждое. Новую строку при
  // этом не пишем: снимок — это наблюдение, а второго наблюдения не было.
  if (opts.maxAgeMin && previousHash && prev?.[0]?.fetched_at) {
    const ageMin = (Date.now() - new Date(prev[0].fetched_at).getTime()) / 60_000
    if (ageMin <= opts.maxAgeMin) {
      const text = await snapshotText(seo, sourceId, previousHash)
      if (text != null) {
        return {
          id: previousId, sourceId, finalUrl: prev[0].final_url ?? null,
          httpStatus: prev[0].http_status ?? null, text, contentHash: previousHash, error: null,
        }
      }
    }
  }

  const res = await safeFetch(src.url, process.env.SEO_CRAWL_USER_AGENT || 'goandstudy-seo-bot')

  if (!res.ok) {
    const { data: row } = await seo.from('source_snapshots').insert({
      source_id: sourceId, http_status: res.status ?? null, fetch_error: res.reason,
      previous_snapshot_id: previousId, changed: null,
    }).select('id').single()
    return { id: row?.id, sourceId, finalUrl: null, httpStatus: res.status ?? null, text: '', contentHash: null, error: res.reason }
  }

  const raw = res.body.toString('utf8')
  const text = extractText(raw)
  const hash = sha(text)
  const changed = previousHash == null ? null : previousHash !== hash

  const { data: row, error: insErr } = await seo.from('source_snapshots').insert({
    source_id: sourceId,
    http_status: res.status,
    final_url: res.finalUrl,
    content_type: res.contentType,
    bytes: res.body.length,
    content_hash: hash,
    changed,
    previous_snapshot_id: previousId,
    // Текст храним только когда он отличается от предыдущего: одинаковые копии
    // одной страницы занимают место и ничего не добавляют.
    raw_text: changed === false ? null : text,
  }).select('id').single()
  if (insErr) throw new Error(`снимок не записался: ${insErr.message}`)

  return { id: row.id, sourceId, finalUrl: res.finalUrl, httpStatus: res.status, text, contentHash: hash, error: null }
}

/** Все написания числа, которые могут встретиться на странице. */
function numberForms(n: number): string[] {
  const plain = String(n)
  const forms = new Set<string>([plain])
  // Разделители разрядов: 76000 → «76,000», «76 000», «76.000»
  const grouped = plain.replace(/\B(?=(\d{3})+(?!\d))/g, '')
  for (const sep of [',', ' ', ' ', '.', "'"]) {
    forms.add(grouped.replace(/\B(?=(\d{3})+(?!\d))/g, sep))
  }
  forms.add(plain.replace(/\B(?=(\d{3})+(?!\d))/g, ','))
  forms.add(plain.replace(/\B(?=(\d{3})+(?!\d))/g, ' '))
  return [...forms]
}

/**
 * Как единица измерения выглядит в живом тексте.
 *
 * Нужна не для красоты. Число без единицы — не доказательство: «2 500» есть на
 * любой странице с ценами, и совпасть может что угодно с чем угодно.
 */
const UNIT_TOKENS: Record<string, string[]> = {
  cny: ['¥', 'cny', 'rmb', 'yuan', 'юан'],
  thb: ['฿', 'thb', 'baht', 'бат'],
  usd: ['$', 'usd', 'dollar', 'доллар'],
  eur: ['€', 'eur', 'euro', 'евро'],
  gbp: ['£', 'gbp', 'pound', 'фунт'],
  years: ['year', 'лет', 'года', 'год', 'age', 'возраст'],
  days: ['day', 'дн', 'сут'],
  months: ['month', 'месяц'],
  ielts_band: ['ielts', 'band'],
}

/** Окно вокруг числа, в котором ищем единицу. Таблицы подписывают колонку заголовком. */
const UNIT_WINDOW = 150

function unitNearby(text: string, at: number, unit: string | null | undefined): boolean {
  if (!unit) return true                      // единицы нет — проверять нечего
  const tokens = UNIT_TOKENS[unit.toLowerCase()]
  if (!tokens) return true                    // единицу не знаем — не выдумываем запрет
  const from = Math.max(0, at - UNIT_WINDOW)
  const window = text.slice(from, at + UNIT_WINDOW).toLowerCase()
  return tokens.some((t) => window.includes(t))
}

/**
 * Есть ли в тексте подтверждение утверждения.
 *
 * Сначала ищем число — оно самое проверяемое. Если у утверждения числа нет,
 * ищем дословную формулировку. Чего НЕ делаем: не считаем подтверждением
 * пересказ и не ищем «похожее». Похожее — это мнение, а нам нужно место в
 * тексте, которое можно показать.
 *
 * Про единицу отдельно. Первая версия искала только число — и на живых данных
 * подтвердила китайскую стипендию в 2 500 юаней страницей тайского
 * университета, где «2,500» стоит в долларах за направление Arts. Число без
 * единицы доказательством не является.
 *
 * Это всё равно эвристика, и обмануть её можно: цифра с нужной валютой рядом
 * может относиться к другой строке таблицы. Поэтому кодовая проверка — только
 * одна нога. Вторая, по PRD, — два независимых ревьюера поверх неё.
 */
export function findEvidence(
  text: string,
  claim: { value_num?: number | string | null; value?: string | null; statement: string; unit?: string | null },
): Evidence | null {
  const hay = text
  const lower = hay.toLowerCase()

  // 1. Число вместе с его единицей
  if (claim.value_num != null) {
    const n = Number(claim.value_num)
    if (Number.isFinite(n)) {
      for (const form of numberForms(n)) {
        // Границы обязательны: «25» не должно совпадать внутри «256» или «1925»
        let from = 0
        for (;;) {
          const at = findWithBoundaries(hay.slice(from), form)
          if (at < 0) break
          const abs = from + at
          if (unitNearby(hay, abs, claim.unit)) {
            return { quote: excerptAround(hay, abs, form.length), locator: `offset:${abs}`, method: 'exact_number' }
          }
          from = abs + 1
        }
      }
    }
  }

  // 2. Дословная формулировка из поля value
  if (claim.value && claim.value.length >= 4) {
    const at = lower.indexOf(claim.value.toLowerCase())
    if (at >= 0) {
      return { quote: excerptAround(hay, at, claim.value.length), locator: `offset:${at}`, method: 'exact_phrase' }
    }
  }

  return null
}

/** Совпадение, не окружённое цифрами: иначе 25 найдётся внутри 1925. */
function findWithBoundaries(hay: string, needle: string): number {
  let from = 0
  for (;;) {
    const at = hay.indexOf(needle, from)
    if (at < 0) return -1
    const before = at > 0 ? hay[at - 1] : ''
    const after = hay[at + needle.length] ?? ''
    if (!/\d/.test(before) && !/\d/.test(after)) return at
    from = at + 1
  }
}

/** Выдержка вокруг найденного места — то, что человек увидит как доказательство. */
function excerptAround(text: string, at: number, len: number, pad = 90): string {
  const from = Math.max(0, at - pad)
  const to = Math.min(text.length, at + len + pad)
  return (from > 0 ? '…' : '') + text.slice(from, to).replace(/\s+/g, ' ').trim() + (to < text.length ? '…' : '')
}

/**
 * Проверить утверждение по снимку и записать связь, если сошлось.
 *
 * Возвращает найденное доказательство или null. Связь пишется ТОЛЬКО при
 * совпадении: запись «проверяли, не нашли» тоже нужна, но это не подтверждение
 * и в claim_sources ей не место.
 */
export async function verifyClaimAgainst(
  seo: any,
  claimId: number,
  snapshot: Snapshot,
): Promise<Evidence | null> {
  const { data: claim, error } = await seo.from('claims')
    .select('id, version, value, value_num, unit, statement, subject_key').eq('id', claimId).single()
  if (error || !claim) throw new Error(`утверждение #${claimId} не найдено: ${error?.message}`)

  // Предмет должен совпасть. Источник про Таиланд не подтверждает утверждение
  // про Китай, сколько бы совпадающих чисел в нём ни нашлось.
  //
  // Проверяется до кэша и намеренно: сравнение двух строк бесплатно, а класть
  // в кэш «не тот предмет» значило бы хранить ответ на вопрос, который не
  // задавали.
  const { data: src } = await seo.from('sources').select('subject_key').eq('id', snapshot.sourceId).single()
  if (!src?.subject_key || src.subject_key !== claim.subject_key) return null

  // Пара «версия утверждения × версия источника» проверяется один раз (E2.6).
  const res = await cachedVerify(seo, {
    claimId,
    claimVersion: claim.version ?? 1,
    sourceId: snapshot.sourceId,
    contentHash: snapshot.contentHash,
    snapshotId: snapshot.id,
    checker: CODE_CHECKER,
  }, async () => {
    const hit = findEvidence(snapshot.text, claim)
    return hit ? { outcome: 'supports' as const, evidence: hit } : { outcome: 'not_found' as const, evidence: null }
  })

  const found = res.evidence
  if (res.outcome !== 'supports' || !found) return null

  await seo.from('claim_sources').upsert({
    claim_id: claimId,
    snapshot_id: snapshot.id,
    claim_version: claim.version ?? 1,
    quote: found.quote,
    agreement: 'supports',
    locator: found.locator,
    method: found.method,
    checked_at: new Date().toISOString(),
  }, { onConflict: 'claim_id,snapshot_id' }).throwOnError()

  await seo.from('claims').update({
    status: 'active',
    verified_at: new Date().toISOString(),
  }).eq('id', claimId).throwOnError()

  return found
}

/**
 * Манифест доказательств: на чём именно была основана статья.
 *
 * Хеш считается по составу, поэтому одинаковый набор даёт один манифест.
 */
export async function buildEvidenceBundle(
  seo: any,
  claimIds: number[],
): Promise<{ id: number; hash: string; claims: number; sources: number }> {
  const { data: rows } = await seo.from('claim_sources')
    .select('claim_id, claim_version, snapshot_id').in('claim_id', claimIds)

  const claimRefs = [...(rows ?? [])]
    .map((r: any) => ({ claim_id: r.claim_id, version: r.claim_version }))
    .sort((a, b) => a.claim_id - b.claim_id || a.version - b.version)
  const snapshotIds: number[] = [...new Set<number>((rows ?? []).map((r: any) => Number(r.snapshot_id)))].sort((a, b) => a - b)

  const { data: snaps } = snapshotIds.length
    ? await seo.from('source_snapshots').select('id, source_id').in('id', snapshotIds)
    : { data: [] }
  const sourceRefs = (snaps ?? []).map((s: any) => ({ snapshot_id: s.id, source_id: s.source_id }))
    .sort((a: any, b: any) => a.snapshot_id - b.snapshot_id)

  const hash = sha(JSON.stringify({ claimRefs, sourceRefs }))

  const { data: existing } = await seo.from('evidence_bundles').select('id').eq('hash', hash).maybeSingle()
  if (existing) return { id: existing.id, hash, claims: claimRefs.length, sources: sourceRefs.length }

  const { data: row, error } = await seo.from('evidence_bundles')
    .insert({ hash, claim_refs: claimRefs, source_refs: sourceRefs }).select('id').single()
  if (error) throw new Error(`манифест не записался: ${error.message}`)
  return { id: row.id, hash, claims: claimRefs.length, sources: sourceRefs.length }
}
