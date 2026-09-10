import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { normalizeBody } from '@/lib/seo/blog-style'

// Выдача задания агенту публикации, который живёт на сервере сайта.
//
// Зачем так: статья блога — это файлы в теме, тема принадлежит root, и писать в неё
// может только процесс на сервере. Ставить туда ключи от базы CRM нельзя — сервер
// уже ломали. Поэтому агент знает один узкий токен и не имеет доступа ни к чему,
// кроме очереди публикаций.
export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  const token = process.env.SEO_PUBLISH_TOKEN
  if (!token || req.headers.get('x-publish-token') !== token) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const sb = await createAdminClient()
  const seo = sb.schema('seo')

  const { data: jobs } = await seo.from('jobs')
    .select('id, article_id, payload')
    .eq('step', 'article_publish_blog').eq('status', 'pending')
    .order('id').limit(1)

  const job = jobs?.[0]
  if (!job) return NextResponse.json({ job: null })

  const { data: article } = await seo.from('articles')
    .select('id, status, current_version_id').eq('id', job.article_id).single()
  const { data: version } = await seo.from('article_versions')
    .select('id, title, body, meta').eq('id', article?.current_version_id).single()

  const meta: any = version?.meta ?? {}
  const brief: any = meta.brief ?? {}
  if (!meta.cover?.base64) {
    await seo.from('jobs').update({ status: 'failed', last_error: 'нет обложки карточки' }).eq('id', job.id)
    return NextResponse.json({ job: null, note: 'задание отклонено: нет обложки' })
  }

  // Помечаем взятым, чтобы второй агент не сделал ту же работу
  await seo.from('jobs').update({ status: 'running', locked_at: new Date().toISOString(), locked_by: 'publish-agent' }).eq('id', job.id)

  const today = new Date().toISOString().slice(0, 10)
  return NextResponse.json({
    job: {
      id: job.id,
      article_id: job.article_id,
      dry_run: job.payload?.dry_run !== false,
      slug: meta.slug,
      body: normalizeBody(String(version?.body ?? '')).trimEnd() + '\n',
      cover_base64: meta.cover.base64,
      registry: {
        slug: meta.slug,
        title: String(version?.title ?? ''),
        excerpt: String(meta.description ?? ''),
        cat: String(brief.category ?? ''),
        published: today,
        updated: today,
      },
    },
  })
}
