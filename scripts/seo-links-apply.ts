// Применение плана входящих ссылок к страницам-донорам (§8.9).
//
//   npx tsx scripts/seo-links-apply.ts 1           # показать, куда встанут ссылки
//   npx tsx scripts/seo-links-apply.ts 1 --apply   # вставить
//
// Правим живые страницы, поэтому по умолчанию только показываем. §13.1: одно
// изменение за раз; §13.5: страницы из топ-10 — только через человека.
import { config } from 'dotenv'; import path from 'path'
import { createClient } from '@supabase/supabase-js'
config({ path: path.resolve(process.cwd(), '.env.local') })
import { planInsertion, applyInsertion } from '../lib/seo/linkinsert'

const seo = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } }).schema('seo')
const APPLY = process.argv.includes('--apply')

async function main() {
  const articleId = Number(process.argv[2])
  if (!articleId) { console.error('Укажи id статьи'); process.exit(1) }

  const { data: article } = await seo.from('articles').select('id, topic_id, status, current_version_id').eq('id', articleId).single()
  if (!article) throw new Error('статья не найдена')
  const { data: version } = await seo.from('article_versions').select('meta').eq('id', article.current_version_id).single()
  const meta: any = version?.meta ?? {}
  const slug = meta.publish?.slug ?? meta.slug
  const targetUrl = meta.publish?.post_type === 'page'
    ? `https://goandstudy.com/${slug}/`
    : `https://goandstudy.com/blog/${slug}/`

  if (article.status !== 'published') {
    console.log(`⚠ статья в статусе «${article.status}»: ссылки на неё поставят читателя на несуществующую страницу.`)
    console.log('  Показываю план, но вставлять стоит после публикации.\n')
  }

  const { data: links } = await seo.from('link_suggestions')
    // waiting_target — план построен, но цели ещё нет в индексе; после публикации
    // такие записи становятся proposed. Для показа плана годятся оба состояния.
    .select('id, from_page_id, anchor, status').eq('to_topic_id', article.topic_id)
    .in('status', ['proposed', 'waiting_target'])
  if (!links?.length) { console.log('План ссылок пуст. Сначала шаг article_linkplan.'); return }

  const { data: pages } = await seo.from('pages').select('id, url').in('id', links.map((l: any) => l.from_page_id))
  const byId = new Map((pages ?? []).map((p: any) => [p.id, p.url]))

  let done = 0, skipped = 0
  for (const l of links) {
    const donorUrl = byId.get(l.from_page_id)
    if (!donorUrl) { skipped++; continue }
    const res: any = await planInsertion(donorUrl, l.anchor, targetUrl)
    if (!res.ok) {
      console.log(`~ ${donorUrl.replace('https://goandstudy.com', '')} — ${res.reason}`)
      skipped++
      continue
    }
    console.log(`✓ ${donorUrl.replace('https://goandstudy.com', '')} — анкор «${l.anchor}»`)
    console.log(`    …${res.plan.before.slice(-70)}[${l.anchor}]${res.plan.after.slice(0, 70)}…`)

    if (APPLY) {
      await applyInsertion(seo, res.plan, res.newHtml, articleId)
      await seo.from('link_suggestions').update({ status: 'applied' }).eq('id', l.id)
      done++
    }
  }

  console.log(`\n${APPLY ? `Вставлено: ${done}` : 'Сухой прогон'} · пропущено: ${skipped}`)
  if (!APPLY && done === 0) console.log('Вставить: добавь --apply')
}

main().catch((e) => { console.error('✗', e.message || e); process.exit(1) })
