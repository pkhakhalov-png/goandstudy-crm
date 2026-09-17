/**
 * Связь «страница сайта → обращение».
 *
 * Что здесь честно, а что нет. Честно: человек пришёл на страницу, оттуда
 * попал на запись и оставил заявку — это мы видим целиком, потому что и
 * страница, и форма наши. Нечестно было бы считать заявкой переход в
 * мессенджер: мы видим клик, а что было дальше — нет.
 *
 * Поэтому переходы в мессенджеры считаются отдельно и заявками не зовутся.
 */

/**
 * День, с которого мы вообще научились связывать страницу и заявку.
 *
 * Всё, что раньше, источника не имеет и иметь не может — восстановить его
 * неоткуда. Касание с более ранней датой считаем ошибкой заливки, а не
 * органикой: лучше не показать, чем показать неправду.
 */
export const TRACKING_SINCE = '2026-09-11'

/** Учитывается ли касание в отчётах. */
export function countable(leadAt: string | null | undefined): boolean {
  return !!leadAt && String(leadAt).slice(0, 10) >= TRACKING_SINCE
}

/**
 * Найти страницу реестра по пути.
 *
 * Тонкость, на которой уже споткнулись: главная лежит как
 * `https://goandstudy.com/` — со слэшем, потому что нормализатор не может
 * ужать путь «/» до пустой строки. У всех остальных страниц слэша нет.
 * Поиск, который срезает слэш всегда, главную не находит никогда.
 *
 * Поэтому пробуем обе формы. Дешевле, чем помнить про исключение в каждом
 * месте, где ищут страницу.
 */
export async function pageIdForPath(seo: any, path: string): Promise<number | null> {
  const base = 'https://goandstudy.com'
  const forms = path === '/' || path === ''
    ? [`${base}/`, base]
    : [`${base}${path}`, `${base}${path}/`]

  const { data } = await seo.from('pages').select('id, normalized_url').in('normalized_url', forms).limit(1)
  return data?.[0]?.id ?? null
}

/** Одна попытка: наша ли это страница и какая именно. */
function ownPagePath(raw: string | undefined | null): string | null {
  if (!raw) return null
  try {
    const u = new URL(raw)
    if (!/(^|\.)goandstudy\.com$/i.test(u.hostname)) return null   // чужой сайт — не наша посадочная
    if (u.hostname.startsWith('crm.')) return null                 // сама форма записи посадочной не является
    const p = u.pathname.replace(/\/+$/, '')
    // Форма записи отдаётся с основного домена, поэтому отсекаем её ещё и по
    // пути: иначе посадочной страницей у всех заявок станет сама форма.
    if (p === '/book' || p.startsWith('/book/')) return null
    return p || '/'
  } catch { return null }
}

/**
 * Из адреса, с которого пришли, вытаскиваем страницу нашего сайта.
 *
 * Порядок попыток важнее, чем кажется, и прежняя версия на нём и споткнулась.
 * Было: `utm.landing_url || utm.referrer`. Оператор берёт первое непустое —
 * а `landing_url` заполняется всегда, это адрес страницы, где стоит форма.
 * Форма живёт на `/book`, `/book` отсекается как посадочная, и функция
 * возвращала null, ни разу не заглянув в `referrer`, где и лежала статья.
 *
 * Итог: одиннадцать заявок в базе, у всех одиннадцати посадочная пустая.
 * Атрибуция не работала ни дня, при том что тест на неё был зелёный: он
 * проверял каждое поле по отдельности и ни разу — вместе.
 *
 * Стало: пробуем по очереди и берём первое, что оказалось нашей страницей.
 */
export function landingPathOf(utm: Record<string, string>): string | null {
  for (const raw of [utm.landing_url, utm.referrer]) {
    const p = ownPagePath(raw)
    if (p) return p
  }
  return null
}

/**
 * Записать касание. Вызывается при создании записи на консультацию: именно
 * тогда известно и то, откуда пришли, и то, чем это кончилось.
 *
 * Ошибка здесь не должна ломать запись клиента — заявка важнее статистики.
 */
export async function recordBookingTouch(
  seo: any,
  input: { bookingId: string | number; utm: Record<string, string>; anonId?: string | null },
): Promise<{ ok: boolean; page?: string | null; why?: string }> {
  try {
    const path = landingPathOf(input.utm)
    let pageId: number | null = null

    if (path) pageId = await pageIdForPath(seo, path)

    const leadAt = new Date().toISOString()

    // Цепочка просмотров, если человека узнали по куке. Она точнее одиночного
    // адреса из формы: форма знает только последний шаг, а цепочка — весь путь.
    const touches = await resolveTouches(seo, input.anonId, leadAt).catch(() => null)

    const row: Record<string, any> = {
      lead_source: 'book',
      external_lead_id: String(input.bookingId),
      lead_at: leadAt,
      anon_id: input.anonId ?? null,
      // Без цепочки остаётся прежнее поведение: обе страницы — та, что в форме.
      first_touch_page: touches?.firstPage ?? pageId,
      last_touch_page: touches?.lastPage ?? pageId,
    }
    if (touches) {
      row.first_touch_at = touches.firstAt
      row.first_touch_utm = touches.firstUtm
      row.first_touch_referrer = touches.firstReferrer
      row.last_touch_at = touches.lastAt
      row.last_touch_utm = touches.lastUtm
      row.last_touch_referrer = touches.lastReferrer
      row.touches_count = touches.count
    }

    const { error } = await seo.from('lead_identities').upsert(row, { onConflict: 'external_lead_id' })

    if (error) return { ok: false, why: error.message }
    return { ok: true, page: path }
  } catch (e: any) {
    return { ok: false, why: String(e?.message ?? e) }
  }
}

/**
 * Сшивка с продажами. У записи на консультацию есть сделка (deals.booking_id),
 * но появляется она не в тот же миг, поэтому связываем отдельным проходом.
 */
/**
 * Цепочка касаний одного посетителя.
 *
 * Первое касание отвечает на вопрос «что привело интерес», последнее — «что
 * привело к действию». Это разные заслуги, и PRD требует хранить обе, а в
 * отчёте показывать раздельно и НЕ складывать: одна заявка — одно первое
 * касание и одно последнее, а не две заявки.
 *
 * Берём по анонимному идентификатору, а не по сессии: человек может прочитать
 * статью сегодня, а прийти через неделю — и это одна цепочка, хотя сессии две.
 */
export type Touches = {
  firstAt: string | null
  firstPage: number | null
  firstUtm: Record<string, string> | null
  firstReferrer: string | null
  lastAt: string | null
  lastPage: number | null
  lastUtm: Record<string, string> | null
  lastReferrer: string | null
  count: number
}

export async function resolveTouches(
  seo: any,
  anonId: string | null | undefined,
  before?: string,
): Promise<Touches | null> {
  if (!anonId) return null

  // До момента заявки, а не вообще: просмотры ПОСЛЕ заявки к ней не привели.
  let q = seo.from('attribution_events')
    .select('created_at, page_id, utm, referrer')
    .eq('anon_id', anonId)
    .order('created_at', { ascending: true })
    .limit(500)
  if (before) q = q.lte('created_at', before)

  const { data, error } = await q
  if (error || !data?.length) return null

  const first = data[0]
  const last = data[data.length - 1]
  return {
    firstAt: first.created_at, firstPage: first.page_id ?? null,
    firstUtm: first.utm ?? null, firstReferrer: first.referrer ?? null,
    lastAt: last.created_at, lastPage: last.page_id ?? null,
    lastUtm: last.utm ?? null, lastReferrer: last.referrer ?? null,
    count: data.length,
  }
}

export async function stitchDeals(seo: any, sb: any): Promise<{ matched: number; pending: number }> {
  const { data: unmatched } = await seo.from('lead_identities')
    .select('id, external_lead_id').is('deal_id', null).eq('lead_source', 'book').limit(500)

  if (!unmatched?.length) return { matched: 0, pending: 0 }

  const ids = unmatched.map((l: any) => l.external_lead_id)
  const { data: deals, error: dealsError } = await sb.from('deals')
    .select('id, booking_id, client_id').in('booking_id', ids)
  if (dealsError) throw new Error(`сделки для сшивки: ${dealsError.message}`)
  const byBooking = new Map((deals ?? []).map((d: any) => [String(d.booking_id), d]))

  const pairs = unmatched
    .map((lead: any) => ({ lead, deal: byBooking.get(String(lead.external_lead_id)) as any }))
    .filter((p: any) => p.deal)

  // Обновления идут пачками, а не по одному подряд: при полусотне совпадений
  // последовательные запросы складывались в несколько секунд ожидания.
  const at = new Date().toISOString()
  let matched = 0
  for (let i = 0; i < pairs.length; i += 10) {
    await Promise.all(pairs.slice(i, i + 10).map(async ({ lead, deal }: any) => {
      const { error } = await seo.from('lead_identities').update({
        deal_id: deal.id, client_id: deal.client_id ?? null,
        matched_by: 'bookings.id', matched_at: at,
      }).eq('id', lead.id)
      // Молча пропущенная ошибка означала бы, что заявка навсегда останется
      // непривязанной, а отчёт покажет её как привязанную
      if (error) throw new Error(`привязка заявки ${lead.id}: ${error.message}`)
      matched++
    }))
  }

  return { matched, pending: unmatched.length - matched }
}
