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

/** Из адреса, с которого пришли, вытаскиваем страницу нашего сайта. */
export function landingPathOf(utm: Record<string, string>): string | null {
  const raw = utm.landing_url || utm.referrer || ''
  if (!raw) return null
  try {
    const u = new URL(raw)
    if (!/(^|\.)goandstudy\.com$/i.test(u.hostname)) return null   // чужой сайт — не наша посадочная
    if (u.hostname.startsWith('crm.')) return null                 // сама форма записи посадочной не является
    const p = u.pathname.replace(/\/+$/, '')
    // Форма записи теперь отдаётся с основного домена, поэтому отсекаем её ещё
    // и по пути: иначе посадочной страницей у всех заявок станет сама форма.
    if (p === '/book' || p.startsWith('/book/')) return null
    return p || '/'
  } catch { return null }
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

    if (path) {
      const url = `https://goandstudy.com${path === '/' ? '/' : path}`
      const { data: page } = await seo.from('pages').select('id')
        .eq('normalized_url', url.replace(/\/$/, '') || 'https://goandstudy.com')
        .maybeSingle()
      pageId = page?.id ?? null
    }

    const { error } = await seo.from('lead_identities').upsert({
      lead_source: 'book',
      external_lead_id: String(input.bookingId),
      lead_at: new Date().toISOString(),
      anon_id: input.anonId ?? null,
      first_touch_page: pageId,
      last_touch_page: pageId,
    }, { onConflict: 'external_lead_id' })

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
