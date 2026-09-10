// Прямая публикация статьи в блог, минуя очередь.
//
//   npx tsx scripts/seo-blog-publish.ts 5           # план, ничего не пишет
//   npx tsx scripts/seo-blog-publish.ts 5 --apply   # выложить
//
// Нужен SSH к серверу: тема принадлежит root и для PHP закрыта.
import { config } from 'dotenv'; import path from 'path'; import fs from 'fs'; import os from 'os'
import { createClient } from '@supabase/supabase-js'
config({ path: path.resolve(process.cwd(), '.env.local') })
import { publishToTheme, verifyPublished } from '../lib/seo/theme-publish'
import { normalizeBody } from '../lib/seo/blog-style'

const seo = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } }).schema('seo')
const APPLY = process.argv.includes('--apply')

async function main() {
  const articleId = Number(process.argv[2])
  if (!articleId) { console.error('Укажи id статьи'); process.exit(1) }

  const { data: article } = await seo.from('articles').select('id, status, topic_id, current_version_id').eq('id', articleId).single()
  if (!article) throw new Error('статья не найдена')
  const { data: version } = await seo.from('article_versions').select('id, title, body, meta').eq('id', article.current_version_id).single()
  const meta: any = version!.meta ?? {}
  const brief: any = meta.brief ?? {}
  if (!meta.cover?.base64) throw new Error('нет обложки карточки')

  const today = new Date().toISOString().slice(0, 10)
  const entry = {
    slug: meta.slug,
    title: String(version!.title ?? ''),
    excerpt: String(meta.description ?? ''),
    cat: String(brief.category ?? ''),
    published: today, updated: today,
  }

  console.log(`Статья ${articleId}: «${entry.title}»`)
  console.log(`  адрес:     goandstudy.com/blog/${entry.slug}/`)
  console.log(`  категория: ${entry.cat}`)
  console.log(`  описание:  ${entry.excerpt.length} символов`)

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gs-blog-'))
  const bodyPath = path.join(tmp, `${entry.slug}.html`)
  const coverPath = path.join(tmp, `${entry.slug}.jpg`)
  fs.writeFileSync(bodyPath, normalizeBody(String(version!.body)).trimEnd() + '\n')
  fs.writeFileSync(coverPath, Buffer.from(meta.cover.base64, 'base64'))
  console.log(`  тело:      ${fs.statSync(bodyPath).size} байт`)
  console.log(`  обложка:   ${Math.round(fs.statSync(coverPath).size / 1024)} КБ\n`)

  try {
    const report = await publishToTheme(entry, { bodyPath, coverPath }, { dryRun: !APPLY })
    for (const s of report.steps) console.log(`  · ${s}`)
    console.log(`\n  сид-флаг: ${report.seedFrom} → ${report.seedTo}`)

    if (!APPLY) { console.log('\nСухой прогон. Выложить: --apply'); return }

    await seo.from('articles').update({ status: 'published', published_at: new Date().toISOString() }).eq('id', articleId)
    await seo.from('article_versions').update({ meta: { ...meta, publish: { path: `/blog/${entry.slug}/`, seed: report.seedTo, at: new Date().toISOString() } } }).eq('id', version!.id)
    await seo.from('change_sets').insert({
      article_id: articleId, kind: 'new_article',
      reason: `публикация в блог: тело, обложка, реестр, сид-флаг ${report.seedFrom} → ${report.seedTo}`,
      idempotency_key: `blogpublish:${version!.id}`, status: 'applied', proposed_by: 'human',
      applied_at: new Date().toISOString(),
    })
    if (article.topic_id) {
      await seo.from('link_suggestions').update({ status: 'proposed' }).eq('to_topic_id', article.topic_id).eq('status', 'waiting_target')
    }

    console.log('\nПроверяю страницу…')
    const v = await verifyPublished(entry.slug)
    for (const r of v.results) console.log(`  ${r}`)
    console.log(`\n${v.ok ? '✓' : '✗'} ${report.url}`)
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true })
  }
}
main().catch((e) => { console.error('✗', e.message || e); process.exit(1) })
