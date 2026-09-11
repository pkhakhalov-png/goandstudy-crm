/**
 * Картинки к статьям через модель OpenAI.
 *
 * Почему не текст на картинке: модели делают в русском тексте ошибки, а
 * исправить их нельзя — картинка приходит целиком. Поэтому все подписи живут
 * в разметке рядом, а на изображении только сцена.
 *
 * Размер один и тот же по всему блогу — 3:2. Обложка 480×320, как остальные 77;
 * картинка внутри статьи крупнее, 960×640, но той же пропорции.
 */
import sharp from 'sharp'

const API = 'https://api.openai.com/v1/images/generations'
const MODEL = process.env.OPENAI_IMAGE_MODEL || 'gpt-image-1'

export function imagesConfigured(): boolean {
  return !!process.env.OPENAI_API_KEY
}

export type GeneratedImage = {
  buffer: Buffer
  width: number
  height: number
  bytes: number
  prompt: string
}

/** Один запрос к модели. Возвращает исходник 1536×1024, без обрезки. */
async function generateRaw(prompt: string, quality: 'low' | 'medium' | 'high' = 'medium'): Promise<Buffer> {
  const key = process.env.OPENAI_API_KEY
  if (!key) throw new Error('нет OPENAI_API_KEY')

  const res = await fetch(API, {
    method: 'POST',
    headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
    body: JSON.stringify({ model: MODEL, prompt, size: '1536x1024', quality, n: 1 }),
    signal: AbortSignal.timeout(180000),
  })

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`OpenAI ${res.status}: ${body.slice(0, 300)}`)
  }

  const data: any = await res.json()
  const b64 = data?.data?.[0]?.b64_json
  if (!b64) throw new Error('модель не вернула изображение')
  return Buffer.from(b64, 'base64')
}

/** Привести к нужному размеру и весу: страница не должна тяжелеть из-за картинки. */
async function fit(raw: Buffer, width: number, height: number): Promise<GeneratedImage & { prompt: string }> {
  const buffer = await sharp(raw)
    .resize(width, height, { fit: 'cover', position: 'attention' })
    .jpeg({ quality: 82, progressive: true, mozjpeg: true })
    .toBuffer()
  return { buffer, width, height, bytes: buffer.length, prompt: '' }
}

export async function generateCover(prompt: string, quality?: 'low' | 'medium' | 'high'): Promise<GeneratedImage> {
  const raw = await generateRaw(prompt, quality)
  return { ...(await fit(raw, 480, 320)), prompt }
}

export async function generateInline(prompt: string, quality?: 'low' | 'medium' | 'high'): Promise<GeneratedImage> {
  const raw = await generateRaw(prompt, quality)
  return { ...(await fit(raw, 960, 640)), prompt }
}

/** То же изображение в двух размерах — за один запрос к модели, а не за два. */
export async function generateBoth(prompt: string, quality?: 'low' | 'medium' | 'high'):
  Promise<{ cover: GeneratedImage; inline: GeneratedImage }> {
  const raw = await generateRaw(prompt, quality)
  return {
    cover: { ...(await fit(raw, 480, 320)), prompt },
    inline: { ...(await fit(raw, 960, 640)), prompt },
  }
}

/* ── Сцены ────────────────────────────────────────────────────────────────── */

/**
 * Общая часть запроса к модели — «дом» блога. Держим её в одном месте: если
 * стиль когда-нибудь поменяется, поменяется он сразу для всех статей, а не
 * расползётся по десяткам разных формулировок.
 *
 * Требование «без текста» жёсткое: модели ошибаются в русских надписях, а
 * исправить картинку нельзя — она приходит целиком.
 */
export const STYLE = [
  'Photorealistic editorial photograph, natural daylight, soft shadows.',
  'One clear subject, uncluttered composition, shallow depth of field.',
  'Muted natural colours, no oversaturation, no HDR look.',
  'Absolutely no text, no lettering, no signage with readable words, no logos, no watermarks.',
  'No collage, no montage, no picture-in-picture, no borders or frames.',
  'Documentary feel, not stock-photo staging. No posed smiling models looking at camera.',
].join(' ')

export function coverPrompt(scene: string): string {
  return `${scene}\n\n${STYLE} Horizontal 3:2 framing, subject placed slightly off-centre so the image reads well when cropped.`
}

export function inlinePrompt(scene: string): string {
  return `${scene}\n\n${STYLE} Horizontal 3:2 framing, calmer and more specific than a title image — a detail rather than a panorama.`
}

/** Разметка Гутенберга под картинку внутри статьи. */
export function figureBlock(src: string, alt: string): string {
  const safeAlt = alt.replace(/"/g, '&quot;')
  return `<!-- wp:image -->\n<figure class="wp-block-image size-large"><img src="${src}" alt="${safeAlt}" loading="lazy" width="960" height="640" /></figure>\n<!-- /wp:image -->`
}
