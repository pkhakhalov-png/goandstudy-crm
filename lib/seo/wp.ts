// M4: клиент WordPress Bridge (mu-plugin goandstudy-seo-bridge).
// HMAC-подпись тела (WP_BRIDGE_SECRET) + X-GS-Timestamp. Инертен без env.
import { createHmac } from 'node:crypto'

export function wpConfigured(): boolean {
  return !!(process.env.WP_BASE_URL && process.env.WP_BRIDGE_SECRET)
}

async function call(method: string, path: string, body?: any): Promise<any> {
  const base = process.env.WP_BASE_URL!.replace(/\/$/, '')
  const secret = process.env.WP_BRIDGE_SECRET!
  const ts = String(Math.floor(Date.now() / 1000))
  const payload = body ? JSON.stringify(body) : ''
  const sig = createHmac('sha256', secret).update(`${ts}.${payload}`).digest('hex')
  const res = await fetch(`${base}/wp-json/goandstudy-seo/v1${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', 'X-GS-Timestamp': ts, 'X-GS-Signature': sig },
    body: body ? payload : undefined,
    signal: AbortSignal.timeout(30000),
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`WP Bridge ${res.status}: ${text.slice(0, 300)}`)
  try { return JSON.parse(text) } catch { return text }
}

export type WpResolved = {
  found: boolean; post_id?: number; type?: string; status?: string; title?: string; link?: string
  has_schema?: boolean; has_meta_description?: boolean; seo_key?: string
}

export const wp = {
  lookup: (key: string) => call('GET', `/lookup?key=${encodeURIComponent(key)}`),
  // публичный URL → ID поста/страницы: нужно для правок существующих страниц,
  // у которых нет нашей меты _gs_seo_key
  resolve: (url: string): Promise<WpResolved> => call('GET', `/resolve?url=${encodeURIComponent(url)}`),
  createPost: (p: { key: string; title: string; content: string; excerpt?: string; slug?: string; status?: string; schema?: any; meta_description?: string; version_id?: string; post_type?: 'post' | 'page'; featured_media?: number }) =>
    call('POST', '/posts', p),
  /** Загрузка картинки в медиатеку: файл идёт base64 в теле, подпись HMAC покрывает и его. */
  media: (p: { filename: string; data: string; alt: string }): Promise<{ media_id: number; url: string; mime: string }> =>
    call('POST', '/media', p),
  patchPost: (id: number, ops: Record<string, any>) => call('PATCH', `/posts/${id}`, ops),
  redirect: (from_path: string, to_url: string) => call('POST', '/redirects', { from_path, to_url }),
  rendered: (id: number) => call('GET', `/posts/${id}/rendered`),
  /** Исходный контент записи: для точечных правок вроде вставки ссылки. */
  post: (id: number): Promise<{ post_id: number; type: string; status: string; title: string; content: string; slug: string; link: string; modified: string | null }> =>
    call('GET', `/posts/${id}`),
  export: (page = 1, per_page = 50, since?: string, postType?: 'post' | 'page' | 'any') =>
    call('GET', `/export?page=${page}&per_page=${per_page}${since ? `&since=${encodeURIComponent(since)}` : ''}${postType ? `&post_type=${postType}` : ''}`),
}
