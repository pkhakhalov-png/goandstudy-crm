/**
 * Заголовок поверх фотографии — обложка в духе инстаграм-сетки goandstudy.
 *
 * Почему текст рисуем мы, а не модель. Nano Banana по-русски ошибается, а
 * починить нельзя: картинка приходит целиком, и каждая попытка платная. Здесь
 * опечаток не бывает по построению — буквы берутся из фирменного шрифта, а
 * фразу можно поменять, не перерисовывая фотографию.
 *
 * Почему контуры, а не шрифт в системе. sharp рисует SVG-текст системными
 * шрифтами, и «положить файл в репозиторий» не помогает: на macOS libvips
 * ходит в CoreText мимо fontconfig, на Vercel системных шрифтов нет вовсе.
 * Проверено: строка, набранная несуществующим шрифтом, молча рисуется
 * Helvetica — то есть поломка выглядит как успех. Поэтому буквы превращаются
 * в кривые здесь, и результат одинаков на маке, на воркере и на сервере темы.
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import sharp from 'sharp'
import opentype, { type Font } from 'opentype.js'
import { BRAND } from './cover'

/** Фирменный шрифт сайта. Берём тот же файл, что отдаёт тема, — он там публичный. */
const FONT_URL = 'https://goandstudy.com/wp-content/themes/goandstudy/assets/fonts/ArtegraSans-Bold.woff2'

/**
 * Куда класть распакованный шрифт.
 *
 * Обложки рисует воркер на Vercel, а там файловая система только для чтения,
 * кроме /tmp: путь внутри проекта развалил бы ночной прогон, хотя на маке
 * выглядел бы исправным. На своей машине держим файл в temp/ — он в .gitignore,
 * и шрифт (коммерческий) в репозиторий не попадает.
 */
function fontDir(): string {
  const local = path.resolve(process.cwd(), 'temp/fonts')
  if (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME) return path.join(os.tmpdir(), 'gs-fonts')
  try {
    fs.mkdirSync(local, { recursive: true })
    fs.accessSync(local, fs.constants.W_OK)
    return local
  } catch {
    return path.join(os.tmpdir(), 'gs-fonts')
  }
}

let cached: Font | null = null

/** Шрифт в память: скачиваем и распаковываем один раз, дальше из файла. */
export async function brandFont(): Promise<Font> {
  if (cached) return cached
  const file = path.join(fontDir(), 'ArtegraSans-Bold.ttf')
  let ttf: Buffer
  if (fs.existsSync(file)) {
    ttf = fs.readFileSync(file)
  } else {
    const res = await fetch(FONT_URL, { signal: AbortSignal.timeout(30000) })
    if (!res.ok) throw new Error(`шрифт не скачался: ${res.status}`)
    const { decompress } = await import('wawoff2')
    ttf = Buffer.from(await decompress(Buffer.from(await res.arrayBuffer())))
    // Кэш — ускорение, а не условие работы: если записать некуда, рисуем всё равно
    try { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, ttf) } catch { /* обойдёмся */ }
  }
  cached = opentype.parse(ttf.buffer.slice(ttf.byteOffset, ttf.byteOffset + ttf.byteLength) as ArrayBuffer)
  return cached
}

export type Hook = {
  /** Фраза в 3–7 слов. Не заголовок: он уже стоит подписью под карточкой. */
  text: string
  /** Слова под фиолетовой плашкой — одно-два, иначе подсветка перестаёт выделять. */
  accent?: string[]
}

type Word = { text: string; x: number; width: number; hot: boolean }
type Line = { words: Word[]; width: number }

const norm = (s: string) => s.toLowerCase().replace(/[«»",.!?:;()]/g, '')

/** Разложить фразу по строкам настоящими метриками шрифта, а не по числу букв. */
function greedy(font: Font, hook: Hook, size: number, maxWidth: number): Line[] {
  const accents = new Set((hook.accent ?? []).flatMap((a) => a.split(/\s+/)).map(norm))
  const space = font.getAdvanceWidth(' ', size)
  const lines: Line[] = []
  let cur: Word[] = []
  let x = 0

  for (const raw of hook.text.split(/\s+/).filter(Boolean)) {
    const w = font.getAdvanceWidth(raw, size)
    if (cur.length && x + space + w > maxWidth) {
      lines.push({ words: cur, width: x })
      cur = []; x = 0
    }
    if (cur.length) x += space
    cur.push({ text: raw, x, width: w, hot: accents.has(norm(raw)) })
    x += w
  }
  if (cur.length) lines.push({ words: cur, width: x })
  return lines
}

/** Идущие подряд подсвеченные слова — одним куском. */
function runs(words: Word[]): Word[][] {
  const out: Word[][] = []
  for (const w of words) {
    if (!w.hot) { out.push([]); continue }
    const tail = out[out.length - 1]
    if (tail && tail.length) tail.push(w)
    else out.push([w])
  }
  return out.filter((r) => r.length)
}

/**
 * Строки ровнее. Жадный перенос оставляет висячий хвост: «Сколько стоит и где /
 * сдать» — и подсветка рвётся пополам, хотя «где сдать» одна мысль. Сжимаем
 * колонку, пока число строк не выросло: получается та же разбивка, но без
 * одинокого слова внизу.
 */
function layout(font: Font, hook: Hook, size: number, maxWidth: number): Line[] {
  let best = greedy(font, hook, size, maxWidth)
  if (best.length < 2) return best
  const target = best.length
  let lo = Math.round(maxWidth * 0.5)
  let hi = maxWidth
  while (hi - lo > 8) {
    const mid = Math.round((lo + hi) / 2)
    const tried = greedy(font, hook, size, mid)
    if (tried.length <= target) { best = tried; hi = mid } else lo = mid
  }
  return best
}

export type HookCoverOptions = {
  /** Сколько строк допускаем. Больше трёх на карточке 480 px уже не читается. */
  maxLines?: number
  /** Доля высоты, которую занимает затемнение снизу. */
  scrim?: number
}

/**
 * Собрать обложку: фотография, затемнение снизу, фраза поверх.
 *
 * Кегль подбираем под самую длинную строку, а не берём фиксированный: фразы
 * разной длины иначе выглядят как разные макеты.
 */
export async function renderHookCover(
  photo: Buffer,
  hook: Hook,
  options: HookCoverOptions = {},
): Promise<{ buffer: Buffer; width: number; height: number; bytes: number }> {
  const font = await brandFont()
  const meta = await sharp(photo).metadata()
  const W = meta.width ?? 1200
  const H = meta.height ?? 800

  const maxLines = options.maxLines ?? 3
  const pad = Math.round(W * 0.06)
  const maxWidth = W - pad * 2

  // Кегль: от крупного вниз, пока фраза не уложится в отведённые строки
  let size = Math.round(W * 0.078)
  let lines = layout(font, hook, size, maxWidth)
  while (lines.length > maxLines && size > Math.round(W * 0.042)) {
    size -= 2
    lines = layout(font, hook, size, maxWidth)
  }

  const lineHeight = Math.round(size * 1.18)
  const blockH = lines.length * lineHeight
  const baseY = H - pad - blockH + Math.round(size * 0.88)

  const scrimTop = Math.round(H * (1 - (options.scrim ?? 0.62)))

  // Затемнение по яркости кадра, а не одно на всех: на тёмной аудитории
  // сильный градиент съедает фотографию, на светлой улице слабый не спасает
  // белые буквы. Меряем ту полосу, на которой и будет лежать текст.
  const strip = await sharp(photo)
    .extract({ left: 0, top: scrimTop, width: W, height: H - scrimTop })
    .greyscale().stats()
  const light = (strip.channels[0].mean ?? 90) / 255
  const bottom = Math.min(0.92, Math.max(0.62, 0.55 + light * 0.55))

  const parts: string[] = []
  parts.push(`<defs><linearGradient id="scrim" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0%" stop-color="#0A0810" stop-opacity="0"/>
    <stop offset="55%" stop-color="#0A0810" stop-opacity="${(bottom * 0.62).toFixed(2)}"/>
    <stop offset="100%" stop-color="#0A0810" stop-opacity="${bottom.toFixed(2)}"/>
  </linearGradient></defs>`)
  parts.push(`<rect x="0" y="${scrimTop}" width="${W}" height="${H - scrimTop}" fill="url(#scrim)"/>`)

  lines.forEach((line, i) => {
    const y = baseY + i * lineHeight
    // Плашки — отдельным слоем под всеми буквами строки: иначе следующее слово
    // ложится поверх соседней плашки и подсветка выглядит рваной. Идущие
    // подряд слова накрываем одной плашкой, а не двумя с щелью посередине:
    // «первого раза» — одна мысль и должна читаться одним пятном.
    for (const runWords of runs(line.words)) {
      const first = runWords[0]
      const last = runWords[runWords.length - 1]
      const bx = pad + first.x - Math.round(size * 0.14)
      const by = y - Math.round(size * 0.82)
      const bw = (last.x + last.width - first.x) + Math.round(size * 0.28)
      const bh = Math.round(size * 1.12)
      parts.push(`<rect x="${bx}" y="${by}" width="${bw}" height="${bh}" rx="${Math.round(size * 0.14)}" fill="${BRAND.purple}"/>`)
    }
    for (const w of line.words) {
      const p = font.getPath(w.text, pad + w.x, y, size).toPathData(2)
      // Тень отдельным контуром, а не фильтром: фильтры SVG рисуются не везде
      // одинаково, а смещённая копия — везде.
      if (!w.hot) parts.push(`<path d="${p}" fill="#000000" fill-opacity="0.35" transform="translate(0,3)"/>`)
      parts.push(`<path d="${p}" fill="#FFFFFF"/>`)
    }
  })

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">${parts.join('')}</svg>`
  const buffer = await sharp(photo)
    .composite([{ input: Buffer.from(svg), top: 0, left: 0 }])
    .jpeg({ quality: 82, progressive: true, mozjpeg: true })
    .toBuffer()

  return { buffer, width: W, height: H, bytes: buffer.length }
}
