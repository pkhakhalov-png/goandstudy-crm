// Обложка статьи по §9.1: 1200×630, WebP, до 200 КБ.
//
// Своя карточка, а не сток. §9.7 предпочитает собственные материалы, и это снимает
// сразу три вопроса: лицензии, релевантность и «типовая картинка из интернета».
// Рисуем SVG и переводим в WebP через sharp — он уже стоит в проекте.
import sharp from 'sharp'

export const COVER_W = 1200
export const COVER_H = 630

export const BRAND = {
  purple: '#B15ECC',
  bg: '#F4F3F8',
  text: '#14121E',
  muted: '#6B6B76',
}

export type CoverInput = {
  title: string
  /** Надзаголовок: страна, раздел, тема. Необязателен. */
  kicker?: string | null
}

/** Перенос по словам: у нас нет метрик шрифта, поэтому считаем по ширине символов. */
export function wrap(text: string, maxChars: number, maxLines: number): string[] {
  const words = text.split(/\s+/)
  const lines: string[] = []
  let line = ''
  for (const w of words) {
    const candidate = line ? `${line} ${w}` : w
    if (candidate.length > maxChars && line) { lines.push(line); line = w } else line = candidate
    if (lines.length === maxLines) break
  }
  if (line && lines.length < maxLines) lines.push(line)
  if (lines.length === maxLines) {
    const rest = words.join(' ').length
    const shown = lines.join(' ').length
    if (rest > shown) lines[maxLines - 1] = lines[maxLines - 1].replace(/[.,;:]?$/, '') + '…'
  }
  return lines
}

export function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

export function buildCoverSvg(input: CoverInput): string {
  // Длинный заголовок — мельче кегль, иначе не влезает и обрезается на полуслове
  const len = input.title.length
  const size = len <= 40 ? 66 : len <= 60 ? 58 : 50
  const maxChars = Math.round(1040 / (size * 0.5))
  const lines = wrap(input.title, maxChars, 4)
  const lineHeight = Math.round(size * 1.25)
  const blockH = lines.length * lineHeight
  const startY = Math.round((COVER_H - blockH) / 2) + size

  const titleTspans = lines
    .map((l, i) => `<tspan x="80" y="${startY + i * lineHeight}">${esc(l)}</tspan>`)
    .join('')

  const kicker = input.kicker
    ? `<text x="80" y="${startY - blockH / lines.length - 34}" font-family="Helvetica Neue, Helvetica, Arial, sans-serif"
         font-size="24" font-weight="600" letter-spacing="2" fill="${BRAND.purple}">${esc(input.kicker.toUpperCase())}</text>`
    : ''

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${COVER_W}" height="${COVER_H}" viewBox="0 0 ${COVER_W} ${COVER_H}">
  <rect width="${COVER_W}" height="${COVER_H}" fill="${BRAND.bg}"/>
  <rect x="0" y="0" width="14" height="${COVER_H}" fill="${BRAND.purple}"/>
  <circle cx="1090" cy="120" r="190" fill="${BRAND.purple}" opacity="0.10"/>
  <circle cx="1160" cy="560" r="120" fill="${BRAND.purple}" opacity="0.07"/>
  ${kicker}
  <text font-family="Georgia, Times New Roman, serif" font-size="${size}" font-weight="700" fill="${BRAND.text}">${titleTspans}</text>
  <text x="80" y="${COVER_H - 62}" font-family="Helvetica Neue, Helvetica, Arial, sans-serif"
        font-size="26" font-weight="700" fill="${BRAND.text}">goandstudy</text>
  <text x="80" y="${COVER_H - 36}" font-family="Helvetica Neue, Helvetica, Arial, sans-serif"
        font-size="17" fill="${BRAND.muted}">Поступление в зарубежные университеты</text>
</svg>`
}

export type Cover = { buffer: Buffer; width: number; height: number; bytes: number; alt: string }

/** Отрисовать обложку. Качество подбирается так, чтобы уложиться в лимит §9.1. */
export async function renderCover(input: CoverInput): Promise<Cover> {
  const svg = buildCoverSvg(input)
  let quality = 90
  let buffer = await sharp(Buffer.from(svg)).webp({ quality }).toBuffer()
  while (buffer.length > 200 * 1024 && quality > 50) {
    quality -= 10
    buffer = await sharp(Buffer.from(svg)).webp({ quality }).toBuffer()
  }
  const meta = await sharp(buffer).metadata()
  return {
    buffer,
    width: meta.width ?? COVER_W,
    height: meta.height ?? COVER_H,
    bytes: buffer.length,
    // §9.2: alt описывает изображение, а не повторяет ключ. Здесь изображение и есть текст.
    alt: `Обложка статьи «${input.title}» — goandstudy`,
  }
}

/** Имя файла в транслите (§9.4). */
export function coverFilename(slug: string): string {
  return `${slug.replace(/[^a-z0-9-]/g, '').slice(0, 60) || 'cover'}-cover.webp`
}
