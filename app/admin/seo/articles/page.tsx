import { createAdminClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { LaunchArticle } from './LaunchArticle'
import { JobQueue } from './JobQueue'

async function load() {
  try {
    const admin = await createAdminClient()
    const seo = admin.schema('seo')
    const { data: articles } = await seo.from('articles')
      .select('id, topic_id, status, current_version_id, primary_keyword, published_at, created_at')
      .order('created_at', { ascending: false })

    const ids = (articles ?? []).map((a: any) => a.current_version_id).filter(Boolean)
    const { data: versions } = ids.length
      ? await seo.from('article_versions').select('id, article_id, version_no, title, origin, qa_report, meta').in('id', ids)
      : { data: [] as any[] }
    const byId = new Map((versions ?? []).map((v: any) => [v.id, v]))

    // Считаем версии по id статей на экране, а не вытягиваем таблицу целиком
    const articleIds = (articles ?? []).map((a: any) => a.id)
    const { data: counts } = articleIds.length
      ? await seo.from('article_versions').select('article_id').in('article_id', articleIds)
      : { data: [] as any[] }
    const versionCount = new Map<number, number>()
    for (const c of counts ?? []) versionCount.set(c.article_id, (versionCount.get(c.article_id) || 0) + 1)

    const rows = (articles ?? []).map((a: any) => {
      const v: any = byId.get(a.current_version_id)
      const report = v?.qa_report ?? {}
      const checks: any[] = report.checks ?? []
      const failedB = checks.filter((c) => c.level === 'B' && !c.ok).length
      const issues: any[] = report.issues ?? []
      return {
        ...a,
        // Пока черновик пишется, версии ещё нет — показываем запрос, а не «(без заголовка)»
        title: v?.title ?? (a.primary_keyword ? `пишется: ${a.primary_keyword}` : 'пишется…'),
        versions: versionCount.get(a.id) ?? 0,
        verdict: report.verdict ?? '—',
        failedB,
        issues: issues.length,
        hasCover: Boolean(v?.meta?.images?.cover?.url),
        figures: (v?.meta?.images?.figures ?? []).length,
      }
    })
    // Очередь: что сейчас делает конвейер
    const { data: jobs } = await seo.from('jobs')
      .select('id, step, status, article_id, topic_id, attempts, last_error, result, created_at')
      .like('step', 'article_%').order('id', { ascending: false }).limit(40)

    // Подсказки тем берём из seo.topics — их считает шаг topics_from_gsc.
    // Раньше здесь на каждой отрисовке вытягивалось 152 тысячи строк GSC (153 запроса
    // к базе), из-за чего экран открывался несколько секунд.
    const { data: topics } = await seo.from('topics')
      .select('id, title, primary_keyword, search_volume, priority, status')
      .eq('status', 'new').eq('origin', 'gsc_gap')
      .order('priority', { ascending: false, nullsFirst: false }).limit(10)

    const suggestions = (topics ?? []).map((t: any) => ({
      topicId: t.id,
      query: t.primary_keyword ?? t.title,
      impressions: t.search_volume ?? 0,
    }))

    return { ok: true as const, rows, jobs: jobs ?? [], suggestions }
  } catch (e: any) {
    return { ok: false as const, error: e?.message ?? 'seo недоступна' }
  }
}

const STATUS_RU: Record<string, string> = {
  draft: 'черновик', in_production: 'в работе', ready_for_review: 'на вычитку',
  in_review: 'читают', approved: 'утверждена', published: 'опубликована', rejected: 'отклонена',
}

export default async function SeoArticles() {
  const s = await load()

  return (
    <div>
      <div style={{ marginBottom: 14 }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 4px' }}>Статьи</h2>
        <p style={{ color: 'var(--muted)', fontSize: 13, margin: 0 }}>
          Машина пишет и проверяет сама. Человек читает и решает, выпускать ли — это уровень A0 приложения F.
        </p>
      </div>

      {!s.ok ? (
        <div style={{ padding: 14, border: '1px solid var(--bor2)', borderRadius: 10, background: 'rgba(201,125,0,.06)', fontSize: 13 }}>
          Схема seo недоступна: {s.error}
        </div>
      ) : (
        <>
          <LaunchArticle suggestions={s.suggestions} />
          <JobQueue jobs={s.jobs} />
          {s.rows.length === 0 ? (
        <div style={{ padding: 20, border: '1px dashed var(--bor2)', borderRadius: 10, textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>
          Статей пока нет. Введи запрос выше и нажми «В очередь».
        </div>
      ) : (
        <div style={{ border: '1px solid var(--bor)', borderRadius: 10, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ background: 'var(--surf2)', textAlign: 'left' }}>
                <th style={{ padding: '8px 10px' }}>Заголовок</th>
                <th style={{ padding: '8px 10px' }}>Запрос</th>
                <th style={{ padding: '8px 10px' }}>Статус</th>
                <th style={{ padding: '8px 10px', textAlign: 'center' }}>Версий</th>
                <th style={{ padding: '8px 10px', textAlign: 'center' }}>Блокеры</th>
                <th style={{ padding: '8px 10px', textAlign: 'center' }}>Замечания</th>
                <th style={{ padding: '8px 10px', textAlign: 'center' }}>Картинки</th>
              </tr>
            </thead>
            <tbody>
              {s.rows.map((a) => (
                <tr key={a.id} style={{ borderTop: '1px solid var(--bor)' }}>
                  <td style={{ padding: '7px 10px' }}>
                    <Link href={`/admin/seo/articles/${a.id}`} style={{ color: 'var(--purple)', textDecoration: 'none', fontWeight: 600 }}>
                      {a.title}
                    </Link>
                  </td>
                  <td style={{ padding: '7px 10px', color: 'var(--muted)' }}>{a.primary_keyword || '—'}</td>
                  <td style={{ padding: '7px 10px' }}>
                    <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 6, border: '1px solid var(--bor2)', color: a.status === 'published' ? 'var(--green)' : 'var(--text)' }}>
                      {STATUS_RU[a.status] ?? a.status}
                    </span>
                  </td>
                  <td style={{ padding: '7px 10px', textAlign: 'center', color: 'var(--muted)' }}>{a.versions}</td>
                  <td style={{ padding: '7px 10px', textAlign: 'center', color: a.failedB ? 'var(--red)' : 'var(--green)', fontWeight: 700 }}>
                    {a.failedB || '✓'}
                  </td>
                  <td style={{ padding: '7px 10px', textAlign: 'center', color: a.issues ? 'var(--purple)' : 'var(--muted)' }}>{a.issues || '—'}</td>
                  <td style={{ padding: '7px 10px', textAlign: 'center', color: 'var(--muted)' }}>
                    {a.hasCover ? `обложка + ${a.figures}` : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
          )}
        </>
      )}
    </div>
  )
}
