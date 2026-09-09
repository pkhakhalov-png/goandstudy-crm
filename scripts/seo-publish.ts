// Публикация готовой статьи в WordPress — отдельная операция от генерации (§12.1.1).
//
//   npx tsx scripts/seo-publish.ts 1            # сухой прогон: что уйдёт на сайт
//   npx tsx scripts/seo-publish.ts 1 --apply    # создать черновик в WordPress
//   npx tsx scripts/seo-publish.ts 1 --promote  # перевести черновик в публикацию
//
// Флаги адреса:
//   --slug <slug>   опубликовать по другому адресу (по умолчанию — из брифа)
//   --type page     страницей, а не записью: нужно для корневых адресов вне /blog/
//   --reclaim       занять адрес, который сейчас 301-редиректит (см. ниже)
//
// Черновик и публикация разделены намеренно: должен остаться момент, когда неверную
// статью можно перехватить. Перевод в публикацию сам проверит страницу глазами бота
// и вернёт в черновик, если что-то сломалось.
import { config } from 'dotenv'; import path from 'path'
import { createClient } from '@supabase/supabase-js'
import { getAuthor } from '../lib/seo/authors'
config({ path: path.resolve(process.cwd(), '.env.local') })
import { finalPreflight, checkPublishRate, publishDraft, promoteToPublish, type PublishInput } from '../lib/seo/publish'

const seo = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } }).schema('seo')
const APPLY = process.argv.includes('--apply')
const PROMOTE = process.argv.includes('--promote')
const arg = (n: string) => { const i = process.argv.indexOf(n); return i > -1 ? process.argv[i + 1] : undefined }
const SLUG_OVERRIDE = arg('--slug')
const POST_TYPE = (arg('--type') === 'page' ? 'page' : 'post') as 'post' | 'page'
const RECLAIM = process.argv.includes('--reclaim')

async function main() {
  const articleId = Number(process.argv[2])
  if (!articleId) { console.error('Укажи id статьи: npx tsx scripts/seo-publish.ts 1'); process.exit(1) }

  const { data: article, error } = await seo.from('articles')
    .select('id,status,current_version_id,primary_keyword,page_id').eq('id', articleId).single()
  if (error || !article) throw new Error(`статья ${articleId}: ${error?.message ?? 'не найдена'}`)

  const { data: version, error: verr } = await seo.from('article_versions')
    .select('id,title,body,meta,qa_report').eq('id', article.current_version_id).single()
  if (verr || !version) throw new Error(`версия: ${verr?.message ?? 'не найдена'}`)

  const meta: any = version.meta ?? {}
  const brief: any = meta.brief ?? {}
  const slug: string = SLUG_OVERRIDE ?? meta.slug ?? ''
  // Записи живут под /blog/, страницы — в корне. От этого зависит и canonical, и крошки.
  const url = POST_TYPE === 'page' ? `https://goandstudy.com/${slug}/` : `https://goandstudy.com/blog/${slug}/`

  const payload: PublishInput = {
    articleId: article.id, versionId: version.id,
    title: version.title ?? '', h1: brief.h1 ?? version.title ?? '',
    description: meta.description ?? '', slug,
    html: version.body ?? '', primaryKeyword: article.primary_keyword ?? '',
    imageUrl: meta.images?.cover?.url ?? null, author: getAuthor(),
    breadcrumbs: POST_TYPE === 'page'
      ? [{ name: 'Главная', url: 'https://goandstudy.com/' }, { name: brief.h1 ?? version.title ?? '', url }]
      : [{ name: 'Главная', url: 'https://goandstudy.com/' }, { name: 'Блог', url: 'https://goandstudy.com/blog/' }, { name: brief.h1 ?? version.title ?? '', url }],
  }

  console.log(`Статья ${article.id}, версия ${version.id}, статус «${article.status}»`)
  console.log(`Адрес после публикации: ${url}\n`)

  // 1) preflight — все B-проверки заново по той версии, что утверждена
  const site = await loadSiteStrings()
  const pre = finalPreflight(payload, site)
  let reclaimNote = ''
  let blockers = pre.blockers

  // Занятие редиректящего адреса — законное исключение из §7.8, но только явное.
  // «Уникальность slug» защищает от случайных дублей; здесь же мы намеренно возвращаем
  // к жизни URL, который сейчас 301-редиректит и при этом продолжает ранжироваться.
  // Смена URL по §13.4 — решение человека, поэтому нужен флаг, а не автоматика.
  const collision = blockers.find((c) => c.id.startsWith('7.8'))
  if (collision) {
    const { data: existing } = await seo.from('pages')
      .select('id,normalized_url,url,http_status').ilike('normalized_url', `%/${slug}`).maybeSingle()
    const redirects = existing && String(existing.url).replace(/\/$/, '') !== String(existing.normalized_url).replace(/\/$/, '')
    if (redirects && RECLAIM) {
      reclaimNote = `адрес /${slug} сейчас 301-редиректит на ${existing!.url} — занимаем его намеренно (§13.4, решение человека)`
      console.log(`⚠ ${reclaimNote}`)
      blockers = blockers.filter((c) => !c.id.startsWith('7.8'))
    } else if (redirects) {
      console.log(`✗ адрес /${slug} занят редиректом на ${existing!.url}.`)
      console.log('  Если занимаем его намеренно — добавь --reclaim, и причина попадёт в change_set.')
      process.exit(1)
    }
  }

  if (blockers.length) {
    console.log('✗ final_preflight не пройден, публикация запрещена (§12.2):')
    for (const c of blockers) console.log(`   ${c.id}: ${c.detail}`)
    process.exit(1)
  }
  console.log('✓ final_preflight пройден')

  // 2) требования, которые машина проверить не может, но публиковать без них нельзя
  const warnings: string[] = []
  if (!payload.imageUrl) warnings.push('§9.1: нет обложки 1200×630 — обязательна (сделай npx tsx scripts/seo-illustrate.ts <id> --apply)')
  if (!payload.author) warnings.push('§10.2.3: автор не указан')
  else if (!payload.author.url) warnings.push(`§10.2.3: у автора «${payload.author.name}» нет страницы автора — нужен пользователь в WordPress, тогда появится /author/<логин>/`)
  const { count: incoming } = await seo.from('link_suggestions')
    .select('id', { count: 'exact', head: true })
    .eq('to_topic_id', (await seo.from('articles').select('topic_id').eq('id', articleId).single()).data?.topic_id)
    .eq('status', 'proposed')
  if ((incoming ?? 0) < 2) warnings.push(`§8.9: входящих ссылок запланировано ${incoming ?? 0} из 2 — статья выйдет сиротой`)
  for (const w of warnings) console.log(`⚠ ${w}`)

  // 3) темп — только для выхода в свет. Черновик Google не видит, ограничивать его
  //    нечем: §12.1.4–5 защищают от пакетной заливки ВИДИМЫХ статей.
  if (PROMOTE) {
    const rate = await checkPublishRate(seo)
    console.log(`${rate.ok ? '✓' : '✗'} темп публикаций: ${rate.reason}`)
    if (!rate.ok) process.exit(1)
  }

  if (PROMOTE) {
    const { data: cs } = await seo.from('change_sets').select('id').eq('article_id', articleId).eq('kind', 'new_article').limit(1)
    if (!cs?.length) { console.error('✗ статья ещё не создавалась в WordPress — сначала --apply'); process.exit(1) }
    if (warnings.length) {
      console.error('\n✗ Перевод в публикацию заблокирован: сначала закрой требования выше.')
      process.exit(1)
    }
    const { data: page } = await seo.from('pages').select('wp_post_id').eq('id', article.page_id).maybeSingle()
    const postId = page?.wp_post_id
    if (!postId) { console.error('✗ не знаю post_id — он сохраняется при --apply'); process.exit(1) }
    console.log('\nПеревожу в публикацию и через 60 секунд проверяю глазами бота…')
    const res = await promoteToPublish(seo, articleId, postId, payload)
    console.log(res.ok ? '✓ опубликовано и проверено' : `✗ ${res.reason}`)
    return
  }

  if (!APPLY) {
    console.log(`\nСухой прогон. Уйдёт на сайт: title «${payload.title}», ${payload.html.length} символов HTML, slug «${slug}».`)
    console.log('Создать черновик в WordPress: добавь --apply')
    return
  }

  const res = await publishDraft(seo, payload, {
    postType: POST_TYPE,
    featuredMedia: meta.images?.cover?.media_id ?? null,
    reason: reclaimNote || undefined,
  })
  if (!res.ok) { console.log(`✗ ${res.reason}`); process.exit(1) }
  console.log(`\n✓ черновик создан: post_id=${res.postId}`)
  for (const p of res.schemaProblems ?? []) console.log(`⚠ разметка: ${p}`)
  console.log('\nСтатья лежит черновиком. В индекс не попадёт, публичного адреса пока нет.')
  console.log('Смотреть: wp-admin → Записи → Черновики')
}

async function loadSiteStrings() {
  const knownUrls = new Set<string>(); const existingTitles = new Set<string>()
  const existingDescriptions = new Set<string>(); const existingSlugs = new Set<string>()
  const norm = (v: string) => v.toLowerCase().replace(/\s+/g, ' ').replace(/[«»"'’]/g, '').trim()
  for (let from = 0; ; from += 1000) {
    const { data } = await seo.from('pages').select('url,normalized_url,title,meta_desc').is('removed_at', null).range(from, from + 999)
    for (const p of data ?? []) {
      knownUrls.add(String(p.url).replace(/\/$/, '')); knownUrls.add(String(p.normalized_url).replace(/\/$/, ''))
      if (p.title) existingTitles.add(norm(String(p.title)))
      if (p.meta_desc) existingDescriptions.add(norm(String(p.meta_desc)))
      const seg = String(p.normalized_url).replace(/\/$/, '').split('/').pop(); if (seg) existingSlugs.add(seg)
    }
    if (!data || data.length < 1000) break
  }
  return { knownUrls, existingTitles, existingDescriptions, existingSlugs }
}

main().catch((e) => { console.error('✗', e.message || e); process.exit(1) })
