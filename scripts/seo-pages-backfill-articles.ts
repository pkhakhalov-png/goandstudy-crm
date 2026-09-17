// Дозаполнить инвентарь страницами наших статей и перепроверить их индексацию.
//
// Зачем: до сентября строки в `seo.pages` заводил только ручной обход сайта, и
// статьи конвейера в инвентарь не попадали. Ответ Google о них было некуда
// записать: `index_status` привязан к странице. Поэтому у уже вышедших статей
// нет ни истории проверок, ни даты попадания в индекс, и сводка по сайту их не
// видит. Публикация теперь заводит страницу сама — этот скрипт закрывает долг
// по тем, что вышли раньше.
//
// Проверка идёт в обход суточного интервала: сроки на старых записях сдвинуты,
// и без принуждения скрипт ничего бы не спросил.
//
// Запуск: npx tsx scripts/seo-pages-backfill-articles.ts [--dry]
import { config } from 'dotenv'; import path from 'path'
config({ path: path.resolve(process.cwd(), '.env.local') })
import { createClient } from '@supabase/supabase-js'
import { ensureArticlePage } from '../lib/seo/crawl'
import { inspectPage, saveIndexStatus } from '../lib/seo/index-status'
import { warnOnError } from '../lib/supabase/write-guard'

async function main() {
  const dry = process.argv.includes('--dry')
  const seo = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
    .schema('seo')

  const { data: articles, error } = await seo.from('articles')
    .select('id, primary_keyword, published_at, indexed_at, current_version_id')
    .eq('status', 'published').order('published_at', { ascending: false })
  if (error) { console.error('✗', error.message); process.exit(1) }
  if (!articles?.length) { console.log('опубликованных статей нет'); return }

  console.log(`статей: ${articles.length}${dry ? ' · вхолостую, без записи' : ''}\n`)
  let made = 0, checked = 0, indexed = 0

  for (const a of articles) {
    const { data: v } = await seo.from('article_versions').select('id, meta').eq('id', a.current_version_id).single()
    const meta: any = v?.meta ?? {}
    const slug = meta.publish?.slug ?? meta.slug
    if (!slug) { console.log(`#${a.id} «${a.primary_keyword}» — нет адреса, пропуск`); continue }

    const url = `https://goandstudy.com/blog/${slug}/`
    const normalized = url.replace(/\/$/, '')

    let { data: page } = await seo.from('pages').select('id').eq('normalized_url', normalized).maybeSingle()
    const had = Boolean(page?.id)
    if (!had && !dry) {
      const r = await ensureArticlePage(seo, slug)
      if (!r.pageId) { console.log(`#${a.id} ${slug} — страницу завести не вышло: ${r.reason ?? 'неизвестно'}`); continue }
      page = { id: r.pageId }
      made++
    }

    const res = await inspectPage(url)
    if (!res.checked) { console.error(`✗ проверка оборвалась: ${res.note}`); break }
    checked++

    const line = `#${a.id} ${slug}\n   ${had ? 'страница была' : dry ? 'страницы нет' : `страница заведена (id ${page?.id})`}`
      + ` · ${res.note}${res.lastCrawl ? `, обход ${String(res.lastCrawl).slice(0, 16).replace('T', ' ')}` : ''}`
    console.log(line)
    if (dry) continue

    if (page?.id) await saveIndexStatus(seo, page.id, res, { retryDays: 1 })

    await seo.from('article_versions').update({
      meta: { ...meta, index_check: { at: new Date().toISOString(), verdict: res.verdict, coverage: res.coverageState, note: res.note, last_crawl: res.lastCrawl } },
    }).eq('id', v!.id).then(warnOnError('article_versions · scripts/seo-pages-backfill-articles.ts'))

    // Дата попадания в индекс — дата обхода Google, а не минута, когда узнали мы
    if (res.verdict === 'PASS' && !a.indexed_at) {
      indexed++
      await seo.from('articles').update({ indexed_at: res.lastCrawl ?? new Date().toISOString() })
        .eq('id', a.id).then(warnOnError('articles · scripts/seo-pages-backfill-articles.ts'))
    }
  }

  console.log(`\nитог: заведено страниц ${made}, проверено ${checked}, впервые подтверждён индекс у ${indexed}`)
}
main().catch((e) => { console.error('✗', e.message); process.exit(1) })
