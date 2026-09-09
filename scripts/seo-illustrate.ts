// Иллюстрирование статьи (§9 приложения F): обложка + схемы из её содержания.
//
//   npx tsx scripts/seo-illustrate.ts 1          # сухой прогон: что нарисуем
//   npx tsx scripts/seo-illustrate.ts 1 --apply  # нарисовать, залить в медиатеку, вставить
//
// Картинки делаем сами: §9.7 предпочитает собственные материалы стокам, и это снимает
// вопросы лицензий. Схемы строятся только из того, что уже написано в тексте.
import { config } from 'dotenv'; import path from 'path'; import fs from 'fs'
import { createClient } from '@supabase/supabase-js'
config({ path: path.resolve(process.cwd(), '.env.local') })
import { renderCover, coverFilename } from '../lib/seo/cover'
import { proposeDiagrams, renderDiagram, insertFigures } from '../lib/seo/diagrams'
import { wp, wpConfigured } from '../lib/seo/wp'

const seo = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } }).schema('seo')
const APPLY = process.argv.includes('--apply')

async function main() {
  const articleId = Number(process.argv[2])
  if (!articleId) { console.error('Укажи id статьи'); process.exit(1) }
  if (APPLY && !wpConfigured()) { console.error('✗ нет WP_BASE_URL / WP_BRIDGE_SECRET'); process.exit(1) }

  const { data: article, error } = await seo.from('articles').select('id,current_version_id,topic_id').eq('id', articleId).single()
  if (error || !article) throw new Error(`статья ${articleId}: ${error?.message ?? 'не найдена'}`)
  const { data: version, error: verr } = await seo.from('article_versions')
    .select('id,version_no,title,body,meta,qa_report').eq('id', article.current_version_id).single()
  if (verr || !version) throw new Error(`версия: ${verr?.message ?? 'не найдена'}`)

  const meta: any = version.meta ?? {}
  const brief: any = meta.brief ?? {}
  const slug: string = meta.slug ?? `article-${articleId}`
  const html = String(version.body ?? '')

  // 1) Обложка
  const cover = await renderCover({ title: brief.h1 ?? version.title ?? '', kicker: brief.secondary_keywords?.[0] ?? null })
  console.log(`Обложка: ${cover.width}×${cover.height}, ${(cover.bytes / 1024).toFixed(1)} КБ`)
  console.log(`  alt: ${cover.alt}`)

  // 2) Схемы
  console.log('\nСмотрю, какие схемы соберутся из текста…')
  const plans = await proposeDiagrams(html, String(version.title ?? ''))
  const diagrams = []
  for (const p of plans) {
    const d = await renderDiagram(p.spec)
    diagrams.push({ plan: p, d })
    console.log(`  [${p.spec.type}] «${p.spec.title}» → после «${p.afterHeading}» (${d.width}×${d.height}, ${(d.buffer.length / 1024).toFixed(1)} КБ)`)
  }

  const dir = path.resolve(process.cwd(), 'out/seo'); fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, coverFilename(slug)), cover.buffer)
  diagrams.forEach((x, i) => fs.writeFileSync(path.join(dir, `${slug}-${i + 1}-${x.plan.spec.type}.webp`), x.d.buffer))
  console.log(`\nФайлы сохранены локально: ${dir}/`)

  if (!APPLY) { console.log('\nСухой прогон. Заливать в WordPress: --apply'); return }

  // 3) Заливка в медиатеку
  console.log('\nЗаливаю в медиатеку…')
  const coverUp = await wp.media({ filename: coverFilename(slug), data: cover.buffer.toString('base64'), alt: cover.alt })
  console.log(`  обложка → ${coverUp.url}`)

  const figures = []
  for (const [i, x] of diagrams.entries()) {
    const up = await wp.media({
      filename: `${slug}-${i + 1}-${x.plan.spec.type}.webp`,
      data: x.d.buffer.toString('base64'), alt: x.d.alt,
    })
    figures.push({ plan: x.plan, url: up.url, width: x.d.width, height: x.d.height, alt: x.d.alt, mediaId: up.media_id })
    console.log(`  схема ${i + 1} → ${up.url}`)
  }

  // 4) Вставка в текст
  const illustrated = insertFigures(html, figures)
  const inserted = (illustrated.match(/<figure>/g) ?? []).length
  console.log(`\nВставлено в текст: ${inserted} из ${figures.length}`)

  // 5) Новая версия
  const nextNo = (version.version_no ?? 1) + 1
  const { data: nv, error: nerr } = await seo.from('article_versions').insert({
    article_id: articleId, version_no: nextNo, origin: 'qa_fixed',
    title: version.title, body: illustrated,
    meta: {
      ...meta,
      images: {
        cover: { url: coverUp.url, media_id: coverUp.media_id, alt: cover.alt },
        figures: figures.map((f) => ({ url: f.url, media_id: f.mediaId, alt: f.alt, type: f.plan.spec.type })),
      },
    },
    prompt_version: meta.prompt_version ?? 'v1', model: 'claude-opus-5', qa_version: 'v1', qa_report: version.qa_report,
  }).select('id').single()
  if (nerr) throw new Error(`article_versions: ${nerr.message}`)
  await seo.from('articles').update({ current_version_id: nv.id }).eq('id', articleId)

  fs.writeFileSync(path.join(dir, `${slug}.illustrated.html`), `<h1>${brief.h1 ?? ''}</h1>\n${illustrated}\n`)
  console.log(`\n✓ версия ${nextNo} сохранена (id=${nv.id}), обложка media_id=${coverUp.media_id}`)
  console.log(`Читать: ${path.join(dir, `${slug}.illustrated.html`)}`)
}

main().catch((e) => { console.error('✗', e.message || e); process.exit(1) })
