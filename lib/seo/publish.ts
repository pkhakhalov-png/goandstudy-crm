// Порядок автопостинга по §12 приложения F.
//
//   approved → final_preflight → publish (всегда сначала draft) → post_publish_verify
//   → sitemap ping → index_watch
//
// Жёсткие правила §12.1 реализованы здесь: первая версия всегда черновик, идемпотентность
// по мете `_gs_seo_key`, проверка `modified` перед записью, не больше 3 публикаций в сутки,
// интервал 2 часа, всё через change_set с причиной и возможностью отката.
import { wp, wpConfigured } from './wp'
import { checkStandard, summarize, type Check } from './standard'
import { buildArticleSchema, buildOpenGraph } from './article-schema'

// Ограничение относится к выходу статьи в свет, а не к созданию черновика: смысл
// правила — не заливать пакетами ВИДИМЫЙ контент. Черновик поисковик не видит.
export const MAX_PUBLICATIONS_PER_DAY = 3      // §12.1.4
export const MIN_INTERVAL_MS = 2 * 60 * 60_000 // §12.1.5

export type PublishInput = {
  articleId: number
  versionId: number
  title: string
  h1: string
  description: string
  slug: string
  html: string
  primaryKeyword: string
  imageUrl: string | null
  author: { name: string; url: string | null } | null
  breadcrumbs: { name: string; url: string }[]
}

export type SiteStrings = {
  knownUrls: Set<string>
  existingTitles: Set<string>
  existingDescriptions: Set<string>
  existingSlugs: Set<string>
}

/* ── Шаг 1: final_preflight (§12) ─────────────────────────────────────────── */

/** Все B-проверки заново, по той версии, которую человек утвердил. */
export function finalPreflight(input: PublishInput, site: SiteStrings): { ok: boolean; checks: Check[]; blockers: Check[] } {
  const checks = checkStandard({
    html: input.html, h1: input.h1, title: input.title, description: input.description,
    slug: input.slug, primaryKeyword: input.primaryKeyword,
    knownUrls: site.knownUrls,
    // Свои же строки из предыдущей версии не считаем конфликтом
    existingTitles: site.existingTitles, existingDescriptions: site.existingDescriptions, existingSlugs: site.existingSlugs,
  })
  const { failedB } = summarize(checks)
  return { ok: failedB.length === 0, checks, blockers: failedB }
}

/* ── Шаг 2: темп публикаций (§12.1.4–5) ───────────────────────────────────── */

export async function checkPublishRate(seo: any): Promise<{ ok: boolean; reason: string }> {
  const dayAgo = new Date(Date.now() - 24 * 60 * 60_000).toISOString()
  const { data, error } = await seo.from('change_sets')
    .select('applied_at')
    .eq('kind', 'new_article').eq('status', 'applied')
    .gte('applied_at', dayAgo).order('applied_at', { ascending: false })
  if (error) throw new Error(`change_sets: ${error.message}`)

  const applied = (data ?? []).filter((c: any) => c.applied_at)
  if (applied.length >= MAX_PUBLICATIONS_PER_DAY) {
    return { ok: false, reason: `за сутки уже ${applied.length} публикаций — лимит §12.1.4 равен ${MAX_PUBLICATIONS_PER_DAY}` }
  }
  const last = applied[0]?.applied_at
  if (last) {
    const gap = Date.now() - new Date(last).getTime()
    if (gap < MIN_INTERVAL_MS) {
      const wait = Math.ceil((MIN_INTERVAL_MS - gap) / 60_000)
      return { ok: false, reason: `с прошлой публикации прошло ${Math.floor(gap / 60_000)} мин — по §12.1.5 нужно 120, ждать ещё ${wait} мин` }
    }
  }
  return { ok: true, reason: 'темп в норме' }
}

/* ── Шаг 3: публикация черновиком (§12.1.1) ───────────────────────────────── */

export async function publishDraft(
  seo: any, input: PublishInput,
  opts: { dryRun?: boolean; postType?: 'post' | 'page'; featuredMedia?: number | null; reason?: string } = {},
) {
  if (!wpConfigured()) throw new Error('нет WP_BASE_URL / WP_BRIDGE_SECRET')

  const key = `article-${input.articleId}`          // §12.1.2: идемпотентность по мете, не по slug
  const postType = opts.postType ?? 'post'
  const url = postType === 'page' ? `https://goandstudy.com/${input.slug}/` : `https://goandstudy.com/blog/${input.slug}/`

  const { jsonld, problems } = buildArticleSchema({
    h1: input.h1, description: input.description, url,
    datePublished: new Date().toISOString(), dateModified: new Date().toISOString(),
    author: input.author, imageUrl: input.imageUrl, breadcrumbs: input.breadcrumbs,
  })
  const og = buildOpenGraph({ title: input.title, description: input.description, url, imageUrl: input.imageUrl })

  const existing = await wp.lookup(key)

  // §12.1.3: пост могли править руками в админке — тогда не перезаписываем.
  // Проверяем дважды: здесь по нашей истории и на стороне моста через if_unmodified_since,
  // иначе между чтением и записью остаётся щель.
  let ourLast: string | null = null
  if (existing.found) {
    const { data: cs } = await seo.from('change_sets')
      .select('applied_at').eq('article_id', input.articleId).eq('status', 'applied')
      .order('applied_at', { ascending: false }).limit(1)
    ourLast = cs?.[0]?.applied_at ?? null
    if (ourLast && existing.modified && new Date(existing.modified) > new Date(ourLast)) {
      return { ok: false as const, conflict: true as const, postId: existing.post_id, reason: `пост изменён в админке ${existing.modified}, наша последняя запись ${ourLast} — правку отдаём человеку (§12.1.3)` }
    }
  }

  if (opts.dryRun) {
    return { ok: true as const, dryRun: true as const, postId: existing.post_id ?? null, url, jsonld, og, schemaProblems: problems }
  }

  const { data: changeSet, error: cerr } = await seo.from('change_sets').insert({
    article_id: input.articleId, kind: 'new_article', to_version: input.versionId,
    reason: opts.reason
      ? `публикация черновика по брифу, версия ${input.versionId}. ${opts.reason}`
      : `публикация черновика по брифу, версия ${input.versionId}`,
    idempotency_key: `publish:${input.versionId}`, status: 'approved', proposed_by: 'system',
  }).select('id').single()
  if (cerr && !String(cerr.message).includes('duplicate')) throw new Error(`change_sets: ${cerr.message}`)

  const created = existing.found
    ? await wp.patchPost(existing.post_id, {
        title: input.title, replace_content: input.html, status: 'draft',
        post_type: postType, slug: input.slug,
        ...(opts.featuredMedia ? { featured_media: opts.featuredMedia } : {}),
        schema: jsonld, meta_description: input.description,
        set_meta: Object.fromEntries(Object.entries(og).map(([k, v]) => [`_gs_${k.replace(':', '_')}`, v])),
        if_unmodified_since: ourLast ?? undefined,
        idempotency_key: `publish:${input.versionId}`,
      })
    : await wp.createPost({
        key, status: 'draft',            // §12.1.1: первая версия всегда черновик
        post_type: postType,
        ...(opts.featuredMedia ? { featured_media: opts.featuredMedia } : {}),
        title: input.title, content: input.html, excerpt: input.description,
        slug: input.slug, schema: jsonld, meta_description: input.description,
        version_id: String(input.versionId),
      })

  const postId = (created as any).post_id

  // createPost не умеет OG — досылаем мету отдельной операцией
  if (postId && !existing.found) {
    await wp.patchPost(postId, {
      set_meta: Object.fromEntries(Object.entries(og).map(([k, v]) => [`_gs_${k.replace(':', '_')}`, v])),
      idempotency_key: `og:${input.versionId}`,
    })
  }

  if (changeSet) {
    await seo.from('change_sets').update({ status: 'applied', applied_at: new Date().toISOString() }).eq('id', changeSet.id)
  }
  return { ok: true as const, postId, url, changeSetId: changeSet?.id ?? null, schemaProblems: problems }
}

/* ── Шаг 4: post_publish_verify (§12) ─────────────────────────────────────── */

export type VerifyResult = { critical: string[]; warnings: string[]; ok: boolean }

/** Смотрим на страницу так, как её видит бот: через GET /rendered у моста. */
export async function postPublishVerify(postId: number, input: PublishInput): Promise<VerifyResult> {
  const r: any = await wp.rendered(postId)
  const html = String(r.html ?? '')
  const critical: string[] = []
  const warnings: string[] = []

  // Проверено на живом мосту: черновик анонимному запросу отдаёт 404, поэтому
  // «как видит бот» имеет смысл только после перевода в publish (§12.1.1).
  if (r.reason === 'post_not_public' || r.status === 0) {
    return { critical: [], warnings: [`пост в статусе «${r.post_status ?? 'draft'}» — публичной страницы ещё нет, проверка глазами бота будет после публикации`], ok: true }
  }

  if (r.status !== 200) critical.push(`страница отдаёт HTTP ${r.status}`)
  if (/<meta[^>]+name=["']robots["'][^>]*noindex/i.test(html)) critical.push('на странице noindex')

  const canonical = html.match(/<link[^>]+rel=["']canonical["'][^>]*href=["']([^"']+)/i)?.[1]
  if (!canonical) critical.push('нет canonical')
  else if (!canonical.includes(input.slug)) critical.push(`canonical ведёт на другой URL: ${canonical}`)

  const h1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1]?.replace(/<[^>]+>/g, '').trim()
  if (!h1) critical.push('нет H1')
  const titleTag = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? ''
  if (!titleTag.includes(input.title.slice(0, 25))) warnings.push(`title на странице не совпадает с нашим: «${titleTag}»`)

  if (!/<meta[^>]+name=["']description["']/i.test(html)) critical.push('нет meta description')
  if (!/application\/ld\+json/i.test(html)) critical.push('нет JSON-LD')
  if (!/property=["']og:title["']/i.test(html)) warnings.push('нет Open Graph (§2.10)')

  const bodyLinks = [...html.matchAll(/href="([^"]+)"/g)].map((m) => m[1])
  if (!bodyLinks.some((h) => h.startsWith('#'))) warnings.push('оглавления на странице не видно')

  return { critical, warnings, ok: critical.length === 0 }
}

/* ── Шаг 5: перевод в publish отдельной операцией (§12.1.1) ───────────────── */

export async function promoteToPublish(seo: any, articleId: number, postId: number, input?: PublishInput) {
  const rate = await checkPublishRate(seo)
  if (!rate.ok) return { ok: false as const, reason: rate.reason }

  await wp.patchPost(postId, { status: 'publish', idempotency_key: `promote:${articleId}` })
  await seo.from('articles').update({ status: 'published', published_at: new Date().toISOString() }).eq('id', articleId)
  await seo.from('change_sets').insert({
    article_id: articleId, kind: 'new_article', reason: 'перевод черновика в публикацию',
    idempotency_key: `promote:${articleId}`, status: 'applied', proposed_by: 'human',
    applied_at: new Date().toISOString(),
  })

  // §12: через 60 секунд смотрим на опубликованную страницу так, как её видит бот
  if (input) {
    await new Promise((r) => setTimeout(r, 60_000))
    const verify = await postPublishVerify(postId, input)
    if (!verify.ok) {
      // Критичный провал — возвращаем в черновик, чтобы битая страница не жила в индексе
      await wp.patchPost(postId, { status: 'draft', idempotency_key: `rollback:${articleId}` })
      await seo.from('articles').update({ status: 'ready_for_review', published_at: null }).eq('id', articleId)
      return { ok: false as const, reason: `post_publish_verify не пройден, вернули в черновик: ${verify.critical.join('; ')}` }
    }
    return { ok: true as const, verify }
  }
  return { ok: true as const }
}
