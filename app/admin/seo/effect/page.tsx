import { createAdminClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { loadPageDays, summarize, type Traffic } from '@/lib/seo/gsc-agg'

export const dynamic = 'force-dynamic'

const EMPTY: Traffic = { clicks: 0, impressions: 0, lastImpression: null, position: 0 }
const DAY = 864e5

type Ours = {
  id: number
  keyword: string
  url: string
  publishedAt: string | null
  firstIndexed: string | null
  daysToIndex: number | null
  window: Traffic       // первые 28 дней после выхода
  recent: Traffic       // последние 28 дней
  matured: boolean      // прошло ли 28 дней с выхода
}

export default async function EffectPage() {
  const seo = (await createAdminClient()).schema('seo')
  const today = new Date().toISOString().slice(0, 10)
  const since28 = new Date(Date.now() - 28 * DAY).toISOString().slice(0, 10)

  // Читаем статистику один раз, окна режем в памяти. Раньше на каждую статью
  // уходил отдельный полный проход — при тридцати статьях экран бы не открылся.
  const days = await loadPageDays(seo)
  const recent = summarize(days, { since: since28 })

  /* ── Блог целиком: с чем сравнивать ────────────────────────────────────── */
  const { data: pages } = await seo.from('pages')
    .select('id, normalized_url, title, first_seen_at')
    .is('removed_at', null).eq('indexable', true).like('normalized_url', '%/blog/%')

  const blog = (pages ?? []).map((p: any) => ({
    url: p.normalized_url as string,
    title: (p.title as string) ?? p.normalized_url,
    firstSeen: p.first_seen_at as string | null,
    t: recent.get(p.normalized_url) ?? EMPTY,
  })).sort((a, b) => b.t.clicks - a.t.clicks || b.t.impressions - a.t.impressions)

  const clicksSorted = blog.map((b) => b.t.clicks).sort((a, b) => a - b)
  const median = clicksSorted.length ? clicksSorted[Math.floor(clicksSorted.length / 2)] : 0
  const dead = blog.filter((b) => b.t.impressions === 0)
  const quiet = blog.filter((b) => b.t.impressions > 0 && b.t.clicks === 0)

  /* ── Наши статьи ───────────────────────────────────────────────────────── */
  const { data: articles } = await seo.from('articles')
    .select('id, primary_keyword, published_at, current_version_id').eq('status', 'published').order('published_at')

  const ours: Ours[] = []
  for (const a of articles ?? []) {
    const { data: v } = await seo.from('article_versions').select('meta').eq('id', a.current_version_id).single()
    const meta: any = v?.meta ?? {}
    const slug = meta.publish?.slug ?? meta.slug
    if (!slug) continue
    const url = `https://goandstudy.com/blog/${slug}`

    const { data: page } = await seo.from('pages').select('id').eq('normalized_url', url).maybeSingle()
    let firstIndexed: string | null = meta.index_check?.verdict === 'PASS' ? (meta.index_check.last_crawl ?? null) : null
    if (page?.id) {
      const { data: st } = await seo.from('index_status').select('first_indexed_at').eq('page_id', page.id).maybeSingle()
      firstIndexed = st?.first_indexed_at ?? firstIndexed
    }

    const pub = a.published_at as string | null
    const end = pub ? new Date(Date.parse(pub) + 28 * DAY).toISOString().slice(0, 10) : today
    const matured = !!pub && Date.parse(pub) + 28 * DAY <= Date.now()
    const window = pub
      ? summarize(days, { since: pub.slice(0, 10), until: end }).get(url) ?? EMPTY
      : EMPTY

    ours.push({
      id: a.id, keyword: a.primary_keyword, url,
      publishedAt: pub, firstIndexed,
      daysToIndex: pub && firstIndexed ? Math.max(0, Math.round((Date.parse(firstIndexed) - Date.parse(pub)) / DAY)) : null,
      window, recent: recent.get(url) ?? EMPTY, matured,
    })
  }

  return (
    <div>
      <div style={{ marginBottom: 14 }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 4px' }}>Эффект</h2>
        <p style={{ color: 'var(--muted)', fontSize: 13, margin: 0, maxWidth: 760 }}>
          Что статьи принесли на самом деле. Наши — в сравнении с блогом целиком: одна цифра
          кликов ничего не значит, пока не видно, сколько собирает обычная статья. Данные Search
          Console отстают на 2–3 дня.
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 18 }}>
        <Card label="Статей в блоге" value={blog.length} sub="индексируемых" />
        <Card label="Медиана кликов" value={median} sub="за 28 дней, на статью" />
        <Card label="Без единого клика" value={quiet.length} color={quiet.length ? 'var(--purple)' : undefined} sub="показы есть" />
        <Card label="Без показов" value={dead.length} color={dead.length ? 'var(--red)' : undefined} sub="их не находят" />
      </div>

      {/* Наши статьи */}
      <Panel title={`Наши статьи · ${ours.length}`}
        hint="«Первые 28 дней» — окно с даты выхода: по нему статьи сравнимы между собой независимо от того, когда вышли. Пока окно не закрылось, цифра неполная и помечена.">
        {ours.length === 0 ? (
          <Empty>Ещё ничего не опубликовано. <Link href="/admin/seo/articles" style={{ color: 'var(--purple)' }}>К статьям →</Link></Empty>
        ) : (
          <table style={table}>
            <thead>
              <tr style={hrow}>
                <th style={th}>Статья</th>
                <th style={th}>Вышла</th>
                <th style={{ ...th, textAlign: 'right' }}>Дней до индекса</th>
                <th style={{ ...th, textAlign: 'right' }}>Показы 28 дн</th>
                <th style={{ ...th, textAlign: 'right' }}>Клики 28 дн</th>
                <th style={{ ...th, textAlign: 'right' }}>Позиция</th>
                <th style={{ ...th, textAlign: 'right' }}>Сейчас, клики</th>
              </tr>
            </thead>
            <tbody>
              {ours.map((o) => (
                <tr key={o.id} style={row}>
                  <td style={td}>
                    <Link href={`/admin/seo/articles/${o.id}`} style={{ color: 'var(--purple)', textDecoration: 'none', fontWeight: 600 }}>
                      {o.keyword}
                    </Link>
                    <div style={{ fontSize: 11, color: 'var(--muted)' }}>{o.url.replace('https://goandstudy.com', '')}</div>
                  </td>
                  <td style={{ ...td, whiteSpace: 'nowrap', color: 'var(--muted)' }}>
                    {o.publishedAt ? new Date(o.publishedAt).toLocaleDateString('ru') : '—'}
                  </td>
                  <td style={{ ...td, textAlign: 'right' }}>
                    {o.daysToIndex === null
                      ? <span style={{ color: 'var(--purple)' }}>ждёт</span>
                      : o.daysToIndex}
                  </td>
                  <td style={{ ...td, textAlign: 'right' }}>{o.window.impressions.toLocaleString('ru')}{!o.matured && '*'}</td>
                  <td style={{ ...td, textAlign: 'right', fontWeight: 700, color: o.window.clicks >= median ? 'var(--green)' : 'var(--text)' }}>
                    {o.window.clicks}{!o.matured && '*'}
                  </td>
                  <td style={{ ...td, textAlign: 'right', color: 'var(--muted)' }}>
                    {o.window.position ? o.window.position.toFixed(1) : '—'}
                  </td>
                  <td style={{ ...td, textAlign: 'right', color: 'var(--muted)' }}>{o.recent.clicks}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {ours.some((o) => !o.matured) && (
          <div style={{ fontSize: 11, color: 'var(--muted)', padding: '4px 14px 10px' }}>
            * окно ещё не закрылось — 28 дней с выхода не прошло
          </div>
        )}
      </Panel>

      <Panel title={`Лучшие статьи блога · ${Math.min(15, blog.length)}`}
        hint="Планка, с которой имеет смысл сравнивать новые материалы.">
        <BlogTable rows={blog.slice(0, 15)} />
      </Panel>

      {quiet.length > 0 && (
        <Panel title={`Показы есть, кликов нет · ${quiet.length}`}
          hint="Статью находят, но не выбирают. Обычно дело в заголовке и описании в выдаче — переписать дешевле, чем писать новую."
          collapsed>
          <BlogTable rows={quiet.sort((a, b) => b.t.impressions - a.t.impressions)} />
        </Panel>
      )}

      {dead.length > 0 && (
        <Panel title={`Совсем без показов · ${dead.length}`}
          hint="Их не находят ни по одному запросу. Кандидаты на переработку или объединение."
          collapsed>
          <BlogTable rows={dead} />
        </Panel>
      )}
    </div>
  )
}

function BlogTable({ rows }: { rows: { url: string; title: string; t: Traffic; firstSeen: string | null }[] }) {
  return (
    <table style={table}>
      <thead>
        <tr style={hrow}>
          <th style={th}>Статья</th>
          <th style={{ ...th, textAlign: 'right' }}>Показы</th>
          <th style={{ ...th, textAlign: 'right' }}>Клики</th>
          <th style={{ ...th, textAlign: 'right' }}>Позиция</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((b) => (
          <tr key={b.url} style={row}>
            <td style={td}>
              <a href={`${b.url}/`} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--text)', textDecoration: 'none' }}>
                {b.title !== b.url ? b.title : b.url.replace('https://goandstudy.com', '')}
              </a>
              <div style={{ fontSize: 11, color: 'var(--muted)' }}>{b.url.replace('https://goandstudy.com/blog', '')}</div>
            </td>
            <td style={{ ...td, textAlign: 'right' }}>{b.t.impressions.toLocaleString('ru')}</td>
            <td style={{ ...td, textAlign: 'right', fontWeight: b.t.clicks ? 700 : 400 }}>{b.t.clicks}</td>
            <td style={{ ...td, textAlign: 'right', color: 'var(--muted)' }}>{b.t.position ? b.t.position.toFixed(1) : '—'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function Panel({ title, hint, children, collapsed }: {
  title: string; hint?: string; children: React.ReactNode; collapsed?: boolean
}) {
  return (
    <div style={{ border: '1px solid var(--bor)', borderRadius: 12, overflow: 'hidden', marginBottom: 16 }}>
      <div style={{ padding: '10px 14px', background: 'var(--surf2)' }}>
        <div style={{ fontSize: 13, fontWeight: 700 }}>{title}</div>
        {hint && <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 3 }}>{hint}</div>}
      </div>
      {collapsed
        ? <details><summary style={{ padding: '8px 14px', fontSize: 12, color: 'var(--purple)', cursor: 'pointer' }}>показать список</summary><div style={{ padding: '0 6px 6px' }}>{children}</div></details>
        : <div style={{ padding: '0 6px 6px' }}>{children}</div>}
    </div>
  )
}

function Card({ label, value, sub, color }: { label: string; value: number; sub?: string; color?: string }) {
  return (
    <div style={{ border: '1px solid var(--bor)', borderRadius: 12, padding: '12px 14px' }}>
      <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 700, color: color ?? 'var(--text)' }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>{sub}</div>}
    </div>
  )
}

const Empty = ({ children }: { children: React.ReactNode }) =>
  <div style={{ padding: '12px 14px', fontSize: 12, color: 'var(--muted)' }}>{children}</div>

const table: React.CSSProperties = { width: '100%', borderCollapse: 'collapse', fontSize: 12 }
const hrow: React.CSSProperties = { color: 'var(--muted)', textAlign: 'left' }
const row: React.CSSProperties = { borderTop: '1px solid var(--bor)' }
const th: React.CSSProperties = { padding: '8px 8px', fontWeight: 500, fontSize: 11 }
const td: React.CSSProperties = { padding: '7px 8px' }
