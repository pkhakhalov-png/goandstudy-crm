import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { verifyPublished } from '@/lib/seo/theme-publish'

// Отчёт агента публикации: что он сделал на сервере. CRM обновляет статусы сама —
// агенту для этого доступ к базе не нужен.
export const runtime = 'nodejs'
export const maxDuration = 60

export async function POST(req: NextRequest) {
  const token = process.env.SEO_PUBLISH_TOKEN
  if (!token || req.headers.get('x-publish-token') !== token) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const body = await req.json().catch(() => null)
  if (!body?.job_id) return NextResponse.json({ error: 'нет job_id' }, { status: 400 })

  const sb = await createAdminClient()
  const seo = sb.schema('seo')
  const { job_id, article_id, ok, dry_run, steps, seed_from, seed_to, slug, error } = body

  if (!ok) {
    await seo.from('jobs').update({ status: 'failed', last_error: String(error ?? 'агент не справился').slice(0, 500) }).eq('id', job_id)
    return NextResponse.json({ ok: true })
  }

  await seo.from('jobs').update({ status: 'done', result: { dry_run, steps, seed_from, seed_to } }).eq('id', job_id)

  // Вставка ссылки в файл темы: отмечаем предложение применённым и выходим
  if (body.kind === 'link_insert') {
    if (body.suggestion_id) await seo.from('link_suggestions').update({ status: 'applied' }).eq('id', body.suggestion_id)
    return NextResponse.json({ ok: true })
  }

  if (dry_run) return NextResponse.json({ ok: true })

  const { data: article } = await seo.from('articles').select('current_version_id, topic_id').eq('id', article_id).single()
  const { data: version } = await seo.from('article_versions').select('id, meta').eq('id', article?.current_version_id).single()
  const meta: any = version?.meta ?? {}

  await seo.from('articles').update({ status: 'published', published_at: new Date().toISOString() }).eq('id', article_id)
  await seo.from('article_versions')
    .update({ meta: { ...meta, publish: { path: `/blog/${slug}/`, seed: seed_to, at: new Date().toISOString() } } })
    .eq('id', version?.id)
  await seo.from('change_sets').insert({
    article_id, kind: 'new_article',
    reason: `публикация в блог: тело, обложка, реестр, сид-флаг ${seed_from} → ${seed_to}`,
    idempotency_key: `blogpublish:${version?.id}`, status: 'applied', proposed_by: 'human',
    applied_at: new Date().toISOString(),
  })
  if (article?.topic_id) {
    await seo.from('link_suggestions').update({ status: 'proposed' })
      .eq('to_topic_id', article.topic_id).eq('status', 'waiting_target')
  }

  // Проверяем страницу отсюда: агенту для этого ходить наружу незачем
  // Уведомление поисковиков — часть выпуска, а не отдельная кнопка. Человек
  // решает, публиковать ли; сказать об этом Яндексу и остальным решать нечего.
  // Google так уведомить нельзя — он придёт по sitemap сам.
  try {
    const { submitToIndexNow } = await import('@/lib/seo/indexnow')
    const res = await submitToIndexNow([`https://goandstudy.com/blog/${slug}/`])
    // Перечитываем мету: выше её уже дополнили отметкой о публикации, и писать
    // поверх старой копии значило бы эту отметку потерять
    const { data: fresh } = await seo.from('article_versions').select('meta').eq('id', version?.id).single()
    await seo.from('article_versions').update({
      meta: { ...(fresh?.meta ?? meta), indexnow: { at: new Date().toISOString(), status: res.status, note: res.note, auto: true } },
    }).eq('id', version?.id)
  } catch { /* уведомление не критично: статья уже вышла */ }

  // Яндекс, в отличие от Google, принимает заявку на переобход. Квота 700 в
  // сутки, поэтому тратить её на одну статью не жалко: это разница в дни.
  try {
    const { yandexConfigured, requestRecrawl } = await import('@/lib/seo/yandex')
    if (yandexConfigured()) {
      const r = await requestRecrawl(`https://goandstudy.com/blog/${slug}/`)
      const { data: fresh2 } = await seo.from('article_versions').select('meta').eq('id', version?.id).single()
      await seo.from('article_versions').update({
        meta: {
          ...(fresh2?.meta ?? {}),
          yandex_recrawl: { at: new Date().toISOString(), taskId: r.taskId ?? null, error: r.error ?? null },
        },
      }).eq('id', version?.id)
    }
  } catch { /* переобход не критичен: статья уже вышла */ }

  // И проверку индекса — но не сейчас, а через сутки: раньше Google всё равно
  // ответит «URL неизвестен», и это не будет значить ничего
  await seo.from('jobs').insert({
    step: 'article_index_check', lane: 'findings', priority: 20, payload: {},
    next_run_at: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
  })

  const verify = await verifyPublished(slug)
  await seo.from('jobs').update({ result: { dry_run, steps, seed_from, seed_to, verify_ok: verify.ok, checks: verify.results } }).eq('id', job_id)

  return NextResponse.json({ ok: true, verify })
}
