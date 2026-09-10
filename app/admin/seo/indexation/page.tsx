import { createAdminClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { CheckSiteButton } from './CheckSiteButton'

export const dynamic = 'force-dynamic'

type Row = {
  page_id: number
  url: string
  verdict: string | null
  coverage: string | null
  lastCrawl: string | null
  checkedAt: string | null
  impressions: number
  clicks: number
}

/** Человеческое имя состояния. Google отдаёт их на языке запроса, но не всегда. */
function label(verdict: string | null, coverage: string | null): { text: string; color: string } {
  if (!verdict) return { text: 'не проверяли', color: 'var(--muted)' }
  if (verdict === 'PASS') return { text: 'в индексе', color: 'var(--green)' }
  if (verdict === 'FAIL') return { text: 'ошибка на странице', color: 'var(--red)' }
  if (coverage && /неизвестен|not found|URL is unknown/i.test(coverage)) return { text: 'Google не видел адрес', color: 'var(--red)' }
  if (coverage && /Обнаружен|Discovered|Просканирован|Crawled/i.test(coverage)) return { text: 'знает, но не взял', color: 'var(--purple)' }
  return { text: 'не в индексе', color: 'var(--purple)' }
}

export default async function IndexationPage() {
  const sb = await createAdminClient()
  const seo = sb.schema('seo')

  const { data: pages } = await seo.from('pages')
    .select('id, normalized_url, page_type')
    .is('removed_at', null).eq('indexable', true).eq('http_status', 200)

  const { data: statuses } = await seo.from('index_status').select('*')
  const byPage = new Map<number, any>((statuses ?? []).map((s: any) => [s.page_id, s]))

  // Показы за 28 дней — чтобы сортировать не по алфавиту, а по важности
  const since = new Date(Date.now() - 28 * 864e5).toISOString().slice(0, 10)
  const { data: gsc } = await seo.from('gsc_page_daily')
    .select('normalized_url, clicks, impressions').gte('date', since)
  const traffic = new Map<string, { clicks: number; impressions: number }>()
  for (const g of gsc ?? []) {
    const t = traffic.get(g.normalized_url) ?? { clicks: 0, impressions: 0 }
    t.clicks += g.clicks; t.impressions += g.impressions
    traffic.set(g.normalized_url, t)
  }

  const rows: Row[] = (pages ?? []).map((p: any) => {
    const st = byPage.get(p.id)
    const t = traffic.get(p.normalized_url) ?? { clicks: 0, impressions: 0 }
    return {
      page_id: p.id, url: p.normalized_url,
      verdict: st?.verdict ?? null, coverage: st?.coverage_state ?? null,
      lastCrawl: st?.last_crawl ?? null, checkedAt: st?.checked_at ?? null,
      impressions: t.impressions, clicks: t.clicks,
    }
  })

  const inIndex = rows.filter((r) => r.verdict === 'PASS')
  const outIndex = rows.filter((r) => r.verdict && r.verdict !== 'PASS')
  const unchecked = rows.filter((r) => !r.verdict)
  const share = inIndex.length + outIndex.length > 0
    ? Math.round((inIndex.length / (inIndex.length + outIndex.length)) * 100) : 0

  // Больно там, где страница не в индексе, но её ищут
  const painful = outIndex.filter((r) => r.impressions > 0).sort((a, b) => b.impressions - a.impressions)
  const quiet = outIndex.filter((r) => r.impressions === 0).sort((a, b) => a.url.localeCompare(b.url))

  const lastCheck = (statuses ?? []).map((s: any) => s.checked_at).filter(Boolean).sort().pop()

  return (
    <div>
      <div style={{ marginBottom: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16 }}>
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 4px' }}>Индексация</h2>
          <p style={{ color: 'var(--muted)', fontSize: 13, margin: 0, maxWidth: 720 }}>
            Ответы Search Console по каждой странице — то же, что показывает «Проверка URL» в их
            интерфейсе. Проверка идёт сама раз в сутки: пока страница не в индексе — каждые два дня,
            после попадания — раз в две недели.
            {lastCheck && <> Последняя проверка {new Date(lastCheck).toLocaleString('ru')}.</>}
          </p>
        </div>
        <CheckSiteButton />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 18 }}>
        <Card label="В индексе" value={inIndex.length} color="var(--green)" sub={`${share}% из проверенных`} />
        <Card label="Не в индексе" value={outIndex.length} color={outIndex.length ? 'var(--red)' : undefined}
          sub={painful.length ? `${painful.length} из них ищут` : 'без показов'} />
        <Card label="Не проверяли" value={unchecked.length} sub={unchecked.length ? 'дойдёт очередь' : 'все проверены'} />
        <Card label="Всего страниц" value={rows.length} sub="индексируемых" />
      </div>

      {painful.length > 0 && (
        <Table
          title="Не в индексе, но их ищут"
          hint="Здесь теряется трафик: люди видят страницу в выдаче по показам, а Google её не держит. Разбирать в первую очередь."
          rows={painful} showTraffic
        />
      )}

      {quiet.length > 0 && (
        <Table
          title="Не в индексе, показов нет"
          hint="Либо страница новая и Google до неё не дошёл, либо она ему не интересна. Для свежих статей это нормально в первые недели."
          rows={quiet}
        />
      )}

      {inIndex.length > 0 && (
        <Table
          title="В индексе"
          hint=""
          rows={inIndex.sort((a, b) => b.impressions - a.impressions)} showTraffic collapsed
        />
      )}

      {rows.length === 0 && (
        <div style={{ fontSize: 13, color: 'var(--muted)' }}>
          Инвентарь пуст — сначала обход сайта на вкладке <Link href="/admin/seo/pages" style={{ color: 'var(--purple)' }}>Страницы</Link>.
        </div>
      )}
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

function Table({ title, hint, rows, showTraffic, collapsed }: {
  title: string; hint: string; rows: Row[]; showTraffic?: boolean; collapsed?: boolean
}) {
  const body = (
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
      <thead>
        <tr style={{ color: 'var(--muted)', textAlign: 'left' }}>
          <th style={th}>Адрес</th>
          <th style={th}>Состояние</th>
          <th style={th}>Ответ Google</th>
          {showTraffic && <th style={{ ...th, textAlign: 'right' }}>Показы</th>}
          {showTraffic && <th style={{ ...th, textAlign: 'right' }}>Клики</th>}
          <th style={th}>Обход</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => {
          const l = label(r.verdict, r.coverage)
          return (
            <tr key={r.page_id} style={{ borderTop: '1px solid var(--bor)' }}>
              <td style={td}>
                <a href={r.url} target="_blank" rel="noopener noreferrer"
                  style={{ color: 'var(--text)', textDecoration: 'none' }}>
                  {r.url.replace('https://goandstudy.com', '') || '/'}
                </a>
              </td>
              <td style={{ ...td, color: l.color, fontWeight: 600, whiteSpace: 'nowrap' }}>{l.text}</td>
              <td style={{ ...td, color: 'var(--muted)' }}>{r.coverage ?? '—'}</td>
              {showTraffic && <td style={{ ...td, textAlign: 'right' }}>{r.impressions.toLocaleString('ru')}</td>}
              {showTraffic && <td style={{ ...td, textAlign: 'right' }}>{r.clicks}</td>}
              <td style={{ ...td, color: 'var(--muted)', whiteSpace: 'nowrap' }}>
                {r.lastCrawl ? new Date(r.lastCrawl).toLocaleDateString('ru') : '—'}
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )

  return (
    <div style={{ border: '1px solid var(--bor)', borderRadius: 12, overflow: 'hidden', marginBottom: 16 }}>
      <div style={{ padding: '10px 14px', background: 'var(--surf2)' }}>
        <div style={{ fontSize: 13, fontWeight: 700 }}>{title} · {rows.length}</div>
        {hint && <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 3 }}>{hint}</div>}
      </div>
      {collapsed ? (
        <details>
          <summary style={{ padding: '8px 14px', fontSize: 12, color: 'var(--purple)', cursor: 'pointer' }}>показать список</summary>
          <div style={{ padding: '0 6px 6px' }}>{body}</div>
        </details>
      ) : <div style={{ padding: '0 6px 6px' }}>{body}</div>}
    </div>
  )
}

const th: React.CSSProperties = { padding: '8px 8px', fontWeight: 500, fontSize: 11 }
const td: React.CSSProperties = { padding: '7px 8px' }
