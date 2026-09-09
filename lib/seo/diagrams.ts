// Иллюстрации внутри статьи — схемы из её же содержания.
//
// Разделение ответственности: модель решает, ЧТО показать (какие шаги, что с чем
// сравнить), код решает, КАК это выглядит. Поэтому картинка не может «поехать»
// стилистически и не выглядит сгенерированной.
//
// §9.7 приложения F прямо предпочитает собственные материалы стокам, §9.1 задаёт
// формат, §9.2–9.3 — alt, §9.6 — обязательные width/height.
import sharp from 'sharp'
import { BRAND, esc, wrap } from './cover'

export type DiagramSpec =
  | { type: 'steps'; title: string; steps: { label: string; detail: string }[] }
  | { type: 'comparison'; title: string; columns: string[]; rows: { label: string; values: string[] }[] }
  | { type: 'timeline'; title: string; points: { when: string; what: string }[] }
  | { type: 'checklist'; title: string; items: string[] }

export type Diagram = { buffer: Buffer; width: number; height: number; alt: string; spec: DiagramSpec }

const W = 1200
const PAD = 64

/* ── Отрисовка ────────────────────────────────────────────────────────────── */

function frame(height: number, title: string, body: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${height}" viewBox="0 0 ${W} ${height}">
  <rect width="${W}" height="${height}" fill="#FFFFFF"/>
  <rect x="0" y="0" width="${W}" height="${height}" fill="none" stroke="#E6E6EC" stroke-width="2"/>
  <rect x="0" y="0" width="8" height="${height}" fill="${BRAND.purple}"/>
  <text x="${PAD}" y="72" font-family="Georgia, Times New Roman, serif" font-size="34" font-weight="700" fill="${BRAND.text}">${esc(title)}</text>
  ${body}
</svg>`
}

function renderSteps(s: Extract<DiagramSpec, { type: 'steps' }>): { svg: string; height: number } {
  const rowH = 96
  const height = 130 + s.steps.length * rowH + 40
  const body = s.steps.map((st, i) => {
    const y = 130 + i * rowH
    const detail = wrap(st.detail, 84, 2)
    return `
    <circle cx="${PAD + 22}" cy="${y + 22}" r="22" fill="${BRAND.purple}"/>
    <text x="${PAD + 22}" y="${y + 30}" text-anchor="middle" font-family="Helvetica Neue, Helvetica, Arial, sans-serif" font-size="20" font-weight="700" fill="#FFFFFF">${i + 1}</text>
    ${i < s.steps.length - 1 ? `<line x1="${PAD + 22}" y1="${y + 48}" x2="${PAD + 22}" y2="${y + rowH - 4}" stroke="#E6E6EC" stroke-width="2"/>` : ''}
    <text x="${PAD + 68}" y="${y + 20}" font-family="Helvetica Neue, Helvetica, Arial, sans-serif" font-size="22" font-weight="700" fill="${BRAND.text}">${esc(st.label)}</text>
    ${detail.map((l, j) => `<text x="${PAD + 68}" y="${y + 48 + j * 24}" font-family="Helvetica Neue, Helvetica, Arial, sans-serif" font-size="18" fill="${BRAND.muted}">${esc(l)}</text>`).join('')}`
  }).join('')
  return { svg: frame(height, s.title, body), height }
}

function renderComparison(s: Extract<DiagramSpec, { type: 'comparison' }>): { svg: string; height: number } {
  const cols = s.columns.length
  const labelW = 300
  const colW = Math.floor((W - PAD * 2 - labelW) / cols)
  const rowH = 76
  const height = 130 + 48 + s.rows.length * rowH + 50
  const headY = 130

  const heads = s.columns.map((c, i) =>
    `<text x="${PAD + labelW + i * colW + colW / 2}" y="${headY + 26}" text-anchor="middle" font-family="Helvetica Neue, Helvetica, Arial, sans-serif" font-size="20" font-weight="700" fill="${BRAND.purple}">${esc(c)}</text>`).join('')

  const rows = s.rows.map((r, i) => {
    const y = headY + 48 + i * rowH
    const label = wrap(r.label, 30, 2)
    const cells = r.values.map((v, j) => {
      const lines = wrap(v, Math.floor(colW / 9.5), 2)
      return lines.map((l, k) =>
        `<text x="${PAD + labelW + j * colW + colW / 2}" y="${y + 32 + k * 22}" text-anchor="middle" font-family="Helvetica Neue, Helvetica, Arial, sans-serif" font-size="17" fill="${BRAND.text}">${esc(l)}</text>`).join('')
    }).join('')
    return `
    ${i % 2 === 0 ? `<rect x="${PAD}" y="${y}" width="${W - PAD * 2}" height="${rowH}" fill="#F4F3F8"/>` : ''}
    ${label.map((l, k) => `<text x="${PAD + 16}" y="${y + 32 + k * 22}" font-family="Helvetica Neue, Helvetica, Arial, sans-serif" font-size="18" font-weight="600" fill="${BRAND.text}">${esc(l)}</text>`).join('')}
    ${cells}`
  }).join('')

  return { svg: frame(height, s.title, heads + rows), height }
}

function renderTimeline(s: Extract<DiagramSpec, { type: 'timeline' }>): { svg: string; height: number } {
  const rowH = 88
  const height = 130 + s.points.length * rowH + 40
  const body = s.points.map((p, i) => {
    const y = 130 + i * rowH
    const what = wrap(p.what, 76, 2)
    return `
    ${i < s.points.length - 1 ? `<line x1="${PAD + 8}" y1="${y + 16}" x2="${PAD + 8}" y2="${y + rowH}" stroke="#E6E6EC" stroke-width="2"/>` : ''}
    <circle cx="${PAD + 8}" cy="${y + 14}" r="8" fill="${BRAND.purple}"/>
    <text x="${PAD + 40}" y="${y + 20}" font-family="Helvetica Neue, Helvetica, Arial, sans-serif" font-size="21" font-weight="700" fill="${BRAND.purple}">${esc(p.when)}</text>
    ${what.map((l, j) => `<text x="${PAD + 40}" y="${y + 48 + j * 24}" font-family="Helvetica Neue, Helvetica, Arial, sans-serif" font-size="18" fill="${BRAND.text}">${esc(l)}</text>`).join('')}`
  }).join('')
  return { svg: frame(height, s.title, body), height }
}

function renderChecklist(s: Extract<DiagramSpec, { type: 'checklist' }>): { svg: string; height: number } {
  const rowH = 62
  const height = 130 + s.items.length * rowH + 40
  const body = s.items.map((it, i) => {
    const y = 130 + i * rowH
    const lines = wrap(it, 88, 2)
    return `
    <rect x="${PAD}" y="${y}" width="26" height="26" rx="6" fill="none" stroke="${BRAND.purple}" stroke-width="2.5"/>
    <path d="M ${PAD + 6} ${y + 13} l 6 7 l 10 -12" fill="none" stroke="${BRAND.purple}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
    ${lines.map((l, j) => `<text x="${PAD + 44}" y="${y + 20 + j * 24}" font-family="Helvetica Neue, Helvetica, Arial, sans-serif" font-size="19" fill="${BRAND.text}">${esc(l)}</text>`).join('')}`
  }).join('')
  return { svg: frame(height, s.title, body), height }
}

export function buildDiagramSvg(spec: DiagramSpec): { svg: string; height: number } {
  switch (spec.type) {
    case 'steps': return renderSteps(spec)
    case 'comparison': return renderComparison(spec)
    case 'timeline': return renderTimeline(spec)
    case 'checklist': return renderChecklist(spec)
  }
}

/** §9.2–9.3: alt описывает изображение, 30–125 символов, не повторяет ключ. */
export function diagramAlt(spec: DiagramSpec): string {
  const kind = spec.type === 'steps' ? 'Схема шагов' : spec.type === 'comparison' ? 'Таблица сравнения'
    : spec.type === 'timeline' ? 'Календарь' : 'Чек-лист'
  const alt = `${kind}: ${spec.title}`
  return alt.length > 125 ? alt.slice(0, 122).trimEnd() + '…' : alt.length < 30 ? `${alt} — goandstudy` : alt
}

export async function renderDiagram(spec: DiagramSpec): Promise<Diagram> {
  const { svg, height } = buildDiagramSvg(spec)
  let quality = 90
  let buffer = await sharp(Buffer.from(svg)).webp({ quality }).toBuffer()
  while (buffer.length > 200 * 1024 && quality > 50) {
    quality -= 10
    buffer = await sharp(Buffer.from(svg)).webp({ quality }).toBuffer()
  }
  return { buffer, width: W, height, alt: diagramAlt(spec), spec }
}

/* ── Что именно рисовать: решает модель по тексту статьи ──────────────────── */

const DIAGRAM_SCHEMA = {
  type: 'object',
  properties: {
    diagrams: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          type: { type: 'string', enum: ['steps', 'comparison', 'timeline', 'checklist'] },
          title: { type: 'string' },
          after_heading: { type: 'string' },
          steps: { type: 'array', items: { type: 'object', properties: { label: { type: 'string' }, detail: { type: 'string' } }, required: ['label', 'detail'], additionalProperties: false } },
          columns: { type: 'array', items: { type: 'string' } },
          rows: { type: 'array', items: { type: 'object', properties: { label: { type: 'string' }, values: { type: 'array', items: { type: 'string' } } }, required: ['label', 'values'], additionalProperties: false } },
          points: { type: 'array', items: { type: 'object', properties: { when: { type: 'string' }, what: { type: 'string' } }, required: ['when', 'what'], additionalProperties: false } },
          items: { type: 'array', items: { type: 'string' } },
        },
        required: ['type', 'title', 'after_heading', 'steps', 'columns', 'rows', 'points', 'items'],
        additionalProperties: false,
      },
    },
  },
  required: ['diagrams'],
  additionalProperties: false,
} as const

export type DiagramPlan = { spec: DiagramSpec; afterHeading: string }

/**
 * Схемы строятся ТОЛЬКО из того, что уже написано в статье. Новые факты, цифры и
 * сроки в картинках запрещены: их никто не проверит — QA читает текст, а не SVG.
 */
export async function proposeDiagrams(html: string, articleTitle: string): Promise<DiagramPlan[]> {
  const { getAnthropic } = await import('../ai')
  const client = getAnthropic()
  const res = await client.messages.create({
    model: 'claude-opus-5',
    max_tokens: 8000,
    output_config: { effort: 'high', format: { type: 'json_schema', schema: DIAGRAM_SCHEMA as any } },
    system: `Ты выбираешь, какие схемы нарисовать к статье. Рисует их код, ты только решаешь содержание.

Жёсткое правило: в схему попадает ТОЛЬКО то, что уже написано в тексте статьи.
Никаких новых цифр, сроков, названий вузов и требований — их некому проверить,
проверки читают текст, а не картинку. Если для схемы не хватает данных из статьи,
эту схему просто не предлагай.

Бери 2–3 схемы, не больше. Хорошие кандидаты:
- steps — последовательность действий, которая в тексте описана словами;
- comparison — сравнение двух-трёх вариантов по 3–6 признакам;
- timeline — последовательность по времени, если в статье есть периоды;
- checklist — перечень документов или условий.

Не дублируй HTML-таблицу картинкой один в один: таблица остаётся в тексте, схема
нужна там, где она собирает разрозненное по разделам в одну картинку.

after_heading — точный текст заголовка H2 или H3 из статьи, ПОСЛЕ которого встанет схема.

Незадействованные для выбранного типа поля возвращай пустыми массивами.`,
    messages: [{ role: 'user', content: `Статья «${articleTitle}»\n\n${html}` }],
  })
  const text = res.content.filter((b) => b.type === 'text').map((b: any) => b.text).join('').trim()
  const parsed = JSON.parse(text.replace(/^```(?:json)?\s*|\s*```$/g, '')) as { diagrams: any[] }

  const out: DiagramPlan[] = []
  for (const d of parsed.diagrams ?? []) {
    let spec: DiagramSpec | null = null
    if (d.type === 'steps' && d.steps?.length >= 2) spec = { type: 'steps', title: d.title, steps: d.steps.slice(0, 7) }
    else if (d.type === 'comparison' && d.columns?.length >= 2 && d.rows?.length >= 2) spec = { type: 'comparison', title: d.title, columns: d.columns.slice(0, 3), rows: d.rows.slice(0, 7) }
    else if (d.type === 'timeline' && d.points?.length >= 2) spec = { type: 'timeline', title: d.title, points: d.points.slice(0, 7) }
    else if (d.type === 'checklist' && d.items?.length >= 3) spec = { type: 'checklist', title: d.title, items: d.items.slice(0, 8) }
    if (spec) out.push({ spec, afterHeading: String(d.after_heading ?? '') })
  }
  return out.slice(0, 3)
}

/** Вставить <figure> после нужного заголовка. §9.5–9.6: lazy и размеры обязательны. */
export function insertFigures(
  html: string,
  figures: { plan: DiagramPlan; url: string; width: number; height: number; alt: string }[],
): string {
  let out = html
  figures.forEach((f, idx) => {
    const fig = `\n<figure>\n  <img src="${f.url}" alt="${f.alt.replace(/"/g, '&quot;')}" width="${f.width}" height="${f.height}"${idx === 0 ? '' : ' loading="lazy"'} />\n  <figcaption>${f.plan.spec.title}</figcaption>\n</figure>\n`
    const heading = f.plan.afterHeading.trim()
    if (!heading) { out += fig; return }
    // Ищем заголовок дословно и вставляем после его абзаца-соседа
    const re = new RegExp(`(<h[23][^>]*>\\s*${heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*</h[23]>)`, 'i')
    if (re.test(out)) {
      out = out.replace(re, `$1${fig}`)
    } else {
      out += fig
    }
  })
  return out
}
