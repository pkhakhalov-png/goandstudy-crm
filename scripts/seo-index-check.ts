// Проверка индексации опубликованных статей. Настоящий ответ Search Console.
// Запуск: npx tsx scripts/seo-index-check.ts
import { config } from 'dotenv'; import path from 'path'
config({ path: path.resolve(process.cwd(), '.env.local') })
import { createClient } from '@supabase/supabase-js'
import { inspectUrl, saveIndexStatus } from '../lib/seo/index-status'

async function main() {
  const seo = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
    .schema('seo')

  const { data: articles, error } = await seo.from('articles')
    .select('id, primary_keyword, current_version_id').eq('status', 'published').order('id')

  if (error) { console.error('✗', error.message); process.exit(1) }
  if (!articles?.length) { console.log('опубликованных статей нет'); return }

  for (const a of articles) {
    const { data: v } = await seo.from('article_versions').select('id, meta').eq('id', a.current_version_id).single()
    const meta: any = v?.meta ?? {}
    const slug = meta.publish?.slug ?? meta.slug
    if (!slug) { console.log(`#${a.id} — нет адреса, пропуск`); continue }
    const url = `https://goandstudy.com/blog/${slug}/`

    const res = await inspectUrl(url)
    console.log(`#${a.id} ${slug}\n   ${res.note}${res.lastCrawl ? `, обход ${String(res.lastCrawl).slice(0, 10)}` : ''}`)

    const { data: page } = await seo.from('pages').select('id').eq('normalized_url', url.replace(/\/$/, '')).maybeSingle()
    if (page?.id) await saveIndexStatus(seo, page.id, res)

    await seo.from('article_versions').update({
      meta: { ...meta, index_check: { at: new Date().toISOString(), verdict: res.verdict, coverage: res.coverageState, note: res.note, last_crawl: res.lastCrawl } },
    }).eq('id', v!.id)
  }
}
main().catch((e) => { console.error('✗', e.message); process.exit(1) })
