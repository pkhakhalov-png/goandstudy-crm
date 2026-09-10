// Оповещение поисковиков о новой странице.
//
// IndexNow — единый протокол Яндекса, Bing, Seznam и Naver: один запрос уходит
// во все сразу. Ключ лежит текстовым файлом в корне сайта, им подтверждается,
// что URL наш.
//
// Google в IndexNow не участвует и в 2023 году отключил свой ping для sitemap.
// Его официальный Indexing API рассчитан на вакансии и трансляции, для статей
// он не предназначен — обещать через него индексацию нельзя. Что реально работает
// для Google: свежий sitemap (тема его отдаёт) и проверка через Search Console,
// которая у нас подключена. Поэтому здесь честно два разных пути.

export const INDEXNOW_HOST = 'goandstudy.com'

export type IndexNowResult = { ok: boolean; status: number; note: string }

/** Ключ IndexNow: 8–128 символов, только буквы и цифры. */
export function indexNowKey(): string | null {
  const k = process.env.INDEXNOW_KEY
  return k && /^[a-zA-Z0-9-]{8,128}$/.test(k) ? k : null
}

/** Проверить, что ключ доступен по своему адресу — без этого запросы отклоняются. */
export async function indexNowKeyPublished(key: string): Promise<boolean> {
  const res = await fetch(`https://${INDEXNOW_HOST}/${key}.txt`, { signal: AbortSignal.timeout(15000) }).catch(() => null)
  if (!res || !res.ok) return false
  return (await res.text()).trim() === key
}

/** Отправить список адресов. За один запрос до 10 000 штук. */
export async function submitToIndexNow(urls: string[]): Promise<IndexNowResult> {
  const key = indexNowKey()
  if (!key) return { ok: false, status: 0, note: 'нет INDEXNOW_KEY в окружении' }
  if (!urls.length) return { ok: false, status: 0, note: 'пустой список адресов' }

  const res = await fetch('https://api.indexnow.org/indexnow', {
    method: 'POST',
    headers: { 'content-type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ host: INDEXNOW_HOST, key, keyLocation: `https://${INDEXNOW_HOST}/${key}.txt`, urlList: urls }),
    signal: AbortSignal.timeout(20000),
  }).catch(() => null)

  if (!res) return { ok: false, status: 0, note: 'сеть недоступна' }
  // 200 — принято, 202 — принято и будет проверено позже
  const ok = res.status === 200 || res.status === 202
  const notes: Record<number, string> = {
    200: 'принято', 202: 'принято, ключ будет проверен',
    400: 'неверный формат запроса', 403: 'ключ не подтверждён на сайте',
    422: 'адреса не с этого домена', 429: 'слишком часто',
  }
  return { ok, status: res.status, note: notes[res.status] ?? `ответ ${res.status}` }
}

/**
 * Google. Отправить страницу «на индексацию» нельзя — можно только убедиться,
 * что она в sitemap, и посмотреть, что о ней думает Search Console.
 */
export async function googleStatus(url: string): Promise<{ inSitemap: boolean; note: string }> {
  const sm = await fetch(`https://${INDEXNOW_HOST}/sitemap.xml`, { signal: AbortSignal.timeout(20000) }).catch(() => null)
  const xml = sm && sm.ok ? await sm.text() : ''
  const path = url.replace(`https://${INDEXNOW_HOST}`, '')
  return {
    inSitemap: xml.includes(path),
    note: xml.includes(path)
      ? 'страница в sitemap — Google найдёт её при следующем обходе'
      : 'страницы нет в sitemap: проверить, что тема её отдаёт',
  }
}
