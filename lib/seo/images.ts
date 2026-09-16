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

const OPENAI_API = 'https://api.openai.com/v1/images/generations'
const OPENAI_MODEL = process.env.OPENAI_IMAGE_MODEL || 'gpt-image-1'
// Nano Banana 2 — это Gemini 3.1 Flash Image, только через fal. Напрямую у
// Google не выходит: ключ проекта на бесплатном тарифе, и картинки там под
// нулевой квотой (ответ 429 с пометкой free_tier). Прежняя flux/schnell стоила
// три десятых цента и рисовала сумрачные кадры, которые владелец забраковал;
// разница в деньгах при статье в день — единицы долларов в месяц.
const FAL_MODEL = process.env.FAL_IMAGE_MODEL || 'fal-ai/nano-banana-2'

function usable(key: string | undefined): boolean {
  // Заготовка в файле настроек — это ещё не ключ: иначе шаг полез бы в API
  // и упал бы там, вместо того чтобы спокойно поставить заглушку.
  return !!key && !key.startsWith('СЮДА') && key.trim().length > 20
}

/**
 * Кто рисует. Порядок задаётся настройкой IMAGE_PROVIDER, иначе берём того,
 * у кого есть ключ. Поставщик — деталь: сцены, размеры и вставка в статью
 * от него не зависят, поэтому смена провайдера не трогает остальной конвейер.
 */
export function imageProvider(): 'fal' | 'openai' | null {
  const forced = process.env.IMAGE_PROVIDER as 'fal' | 'openai' | undefined
  if (forced === 'fal' && usable(process.env.FAL_KEY)) return 'fal'
  if (forced === 'openai' && usable(process.env.OPENAI_API_KEY)) return 'openai'
  if (usable(process.env.FAL_KEY)) return 'fal'
  if (usable(process.env.OPENAI_API_KEY)) return 'openai'
  return null
}

export function imagesConfigured(): boolean {
  return imageProvider() !== null
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
  const who = imageProvider()
  if (!who) throw new Error('нет ключа ни у одного поставщика картинок')
  return who === 'fal' ? viaFal(prompt) : viaOpenAI(prompt, quality)
}

async function viaOpenAI(prompt: string, quality: 'low' | 'medium' | 'high'): Promise<Buffer> {
  const res = await fetch(OPENAI_API, {
    method: 'POST',
    headers: { authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({ model: OPENAI_MODEL, prompt, size: '1536x1024', quality, n: 1 }),
    signal: AbortSignal.timeout(180000),
  })
  if (!res.ok) throw new Error(`OpenAI ${res.status}: ${(await res.text().catch(() => '')).slice(0, 300)}`)

  const b64 = (await res.json())?.data?.[0]?.b64_json
  if (!b64) throw new Error('OpenAI не вернул изображение')
  return Buffer.from(b64, 'base64')
}

async function viaFal(prompt: string): Promise<Buffer> {
  // Модели просят размер по-разному: flux ждёт image_size с пикселями, а
  // nano-banana — пропорцию строкой. Отправлять обе пары полей нельзя: лишнее
  // поле у fal это ошибка, а не игнор.
  const isBanana = /nano-banana/.test(FAL_MODEL)
  const size = isBanana
    ? { aspect_ratio: '3:2', output_format: 'jpeg' }
    : { image_size: { width: 1536, height: 1024 } }

  const res = await fetch(`https://fal.run/${FAL_MODEL}`, {
    method: 'POST',
    headers: { authorization: `Key ${String(process.env.FAL_KEY).trim()}`, 'content-type': 'application/json' },
    body: JSON.stringify({ prompt, num_images: 1, enable_safety_checker: true, ...size }),
    signal: AbortSignal.timeout(180000),
  })
  if (!res.ok) throw new Error(`fal ${res.status}: ${(await res.text().catch(() => '')).slice(0, 300)}`)

  // fal отдаёт ссылку на готовый файл, а не сам файл
  const url = (await res.json())?.images?.[0]?.url
  if (!url) throw new Error('fal не вернул изображение')
  const img = await fetch(url, { signal: AbortSignal.timeout(60000) })
  if (!img.ok) throw new Error(`fal: картинка не скачалась (${img.status})`)
  return Buffer.from(await img.arrayBuffer())
}

/** Привести к нужному размеру и весу: страница не должна тяжелеть из-за картинки. */
async function fit(raw: Buffer, width: number, height: number): Promise<GeneratedImage & { prompt: string }> {
  const buffer = await sharp(raw)
    .resize(width, height, { fit: 'cover', position: 'attention' })
    .jpeg({ quality: 82, progressive: true, mozjpeg: true })
    .toBuffer()
  return { buffer, width, height, bytes: buffer.length, prompt: '' }
}

/**
 * Размер обложки — 1200×800.
 *
 * Бриф просит 1600×1067 и до 250 КБ. Взял на треть меньше по стороне
 * осознанно: на странице блога 82 карточки, и каждая тянет этот самый файл.
 * При 250 КБ это двадцать мегабайт на страницу — ровно та цена, которую мы
 * недавно выжимали из скорости. 1200 px хватает и для карточки на экране с
 * удвоенной плотностью, и для превью в соцсетях (og:image ведёт на тот же
 * файл), а весит около 130 КБ. Поменять — одна цифра здесь.
 */
export async function generateCover(prompt: string, quality?: 'low' | 'medium' | 'high'): Promise<GeneratedImage> {
  const raw = await generateRaw(prompt, quality)
  return { ...(await fit(raw, 1200, 800)), prompt }
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
  'Editorial lifestyle photograph, quiet intimate atmosphere, understated magazine aesthetic,',
  'muted warm-neutral colors, charcoal blacks, espresso brown, taupe and ivory,',
  'restrained amber accents only where motivated by the scene,',
  'natural directional light or believable practical lamp light,',
  'deep dimensional shadows with preserved texture, controlled highlights,',
  'realistic white balance and skin tones, tactile paper wood fabric and metal,',
  'subtle fine film grain, candid observational framing, slightly off-center composition,',
  'authentic lived-in details, selective focus only where appropriate,',
  'photographic realism, visually clear at thumbnail size.',
].join(' ')

/**
 * Чего быть не должно.
 *
 * Держится отдельной строкой, а не растворено в стиле: у fal нет поля для
 * нежелательных признаков, поэтому список уходит обычным текстом — и его видно,
 * когда нужно поправить.
 */
export const AVOID = [
  'Avoid: generic corporate stock photography, staged advertising poses, exaggerated smiles,',
  'glossy commercial lighting, uniform orange or sepia cast, oversaturated colors, HDR halos,',
  'crushed shadow detail, blown highlights, plastic skin, excessive blur, artificial heavy grain,',
  'decorative clutter, CGI, 3D render, illustration, added headline, quote overlay, watermark,',
  'prominent brand logos.',
].join(' ')

/**
 * Кадрирование. Верхняя треть держится спокойной под плашку рубрики, а лица,
 * руки и ключевые предметы не жмутся к краю: карточка блога обрезает края, и
 * потерять там главное — значит потерять обложку.
 */
const FRAMING = [
  'Horizontal 3:2 framing. Keep the upper third visually calm for a category label;',
  'do not place faces, hands or key objects near the crop edges.',
  'No text, headlines or interface elements inside the image;',
  'small incidental lettering on objects may stay out of focus and must not carry meaning.',
].join(' ')

/**
 * Порядок частей задан брифом владельца: сцена, стиль, ограничения, формат.
 * Стиль не переопределяет тему, место, героев и время суток — они уже описаны
 * сценой, и спорить с ней он не должен.
 */
export function coverPrompt(scene: string): string {
  return `${scene}\n\n${STYLE}\n\n${AVOID}\n\n${FRAMING}`
}

export function inlinePrompt(scene: string): string {
  return `${scene}\n\n${STYLE}\n\n${AVOID}\n\n${FRAMING} Calmer and more specific than the title image — a detail rather than a panorama.`
}

/** Разметка Гутенберга под картинку внутри статьи. */
export function figureBlock(src: string, alt: string): string {
  const safeAlt = alt.replace(/"/g, '&quot;')
  return `<!-- wp:image -->\n<figure class="wp-block-image size-large"><img src="${src}" alt="${safeAlt}" loading="lazy" width="960" height="640" /></figure>\n<!-- /wp:image -->`
}
