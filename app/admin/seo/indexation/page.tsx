import { createAdminClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { CheckSiteButton } from './CheckSiteButton'
import { trafficByPage } from '@/lib/seo/gsc-agg'

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
  lastImpression: string | null
  firstSeen: string | null
  firstIndexed: string | null
}

/** Человеческое имя состояния. Google отдаёт их на языке запроса, но не всегда. */
function label(verdict: string | null, coverage: string | null): { text: string; color: string } {
  if (!verdict) return { text: 'не проверяли', color: 'var(--muted)' }
  if (verdict === 'PASS') return { text: 'в индексе', color: 'var(--green)' }
  if (verdict === 'FAIL') return { text: 'ошибка на странице', color: 'var(--red)' }
  if (coverage && /переадресац|redirect/i.test(coverage)) return { text: 'переадресация', color: 'var(--muted)' }
  if (coverage && /неизвестен|not found|URL is unknown/i.test(coverage)) return { text: 'Google не видел адрес', color: 'var(--red)' }
  if (coverage && /Обнаружен|Discovered|Просканирован|Crawled/i.test(coverage)) return { text: 'знает, но не взял', color: 'var(--purple)' }
  return { text: 'не в индексе', color: 'var(--purple)' }
}

export default async function IndexationPage({ searchParams }: { searchParams: Promise<{ dni?: string }> }) {
  const days = Math.min(365, Math.max(7, Number((await searchParams).dni ?? 30)))
  const sb = await createAdminClient()
  const seo = sb.schema('seo')

  const { data: pagesRaw } = await seo.from('pages')
    .select('id, normalized_url, page_type, first_seen_at')
    .is('removed_at', null).eq('indexable', true).eq('http_status', 200)
  // Только сам сайт: адреса CRM и поддоменов здесь не при чём
  const pages = (pagesRaw ?? []).filter((p: any) => p.normalized_url.startsWith('https://goandstudy.com'))

  const { data: statuses } = await seo.from('index_status').select('*')

  // Яндекс — половина рынка в СНГ, и до сих пор её тут не было вовсе
  const { data: ya } = await seo.from('settings').select('value').eq('key', 'yandex_snapshot').maybeSingle()
  const yandex: any = ya?.value ?? null
  const yandexByUrl = new Map<string, any>(
    (yandex?.articles ?? []).map((a: any) => [String(a.url).replace(/\/$/, ''), a]),
  )
  const byPage = new Map<number, any>((statuses ?? []).map((s: any) => [s.page_id, s]))
  const DAY = 864e5

  // Наши статьи — то, ради чего этот экран и нужен. У них известна настоящая
  // дата выхода, а не дата, когда их впервые увидел обход.
  const { data: articles } = await seo.from('articles')
    .select('id, published_at, indexed_at, primary_keyword, current_version_id')
    .eq('status', 'published').order('published_at', { ascending: false })

  const ourArticles: {
    id: number; keyword: string; url: string; publishedAt: string | null
    verdict: string | null; coverage: string | null; firstIndexed: string | null; days: number | null
  }[] = []

  for (const a of articles ?? []) {
    const { data: v } = await seo.from('article_versions').select('meta').eq('id', a.current_version_id).maybeSingle()
    const m: any = v?.meta ?? {}
    const slug = m.publish?.slug ?? m.slug
    if (!slug) continue
    const url = `https://goandstudy.com/blog/${slug}`
    const page = (pagesRaw ?? []).find((p: any) => p.normalized_url === url)
    const st = page ? byPage.get(page.id) : null
    const firstIndexed = st?.first_indexed_at ?? a.indexed_at ?? null
    ourArticles.push({
      id: a.id, keyword: a.primary_keyword, url, publishedAt: a.published_at,
      verdict: st?.verdict ?? (m.index_check?.verdict ?? null),
      coverage: st?.coverage_state ?? (m.index_check?.coverage ?? null),
      firstIndexed,
      days: a.published_at
        ? Math.max(0, Math.round(((firstIndexed ? Date.parse(firstIndexed) : Date.now()) - Date.parse(a.published_at)) / DAY))
        : null,
    })
  }
  // Показы за 28 дней — чтобы сортировать не по алфавиту, а по важности.
  // Читаем страницами: обычный select обрезал бы данные на тысяче строк.
  const since = new Date(Date.now() - 28 * 864e5).toISOString().slice(0, 10)
  const traffic = await trafficByPage(seo, { since })

  const rows: Row[] = (pages ?? []).map((p: any) => {
    const st = byPage.get(p.id)
    const t = traffic.get(p.normalized_url) ?? { clicks: 0, impressions: 0, lastImpression: null, position: 0 }
    return {
      page_id: p.id, url: p.normalized_url,
      verdict: st?.verdict ?? null, coverage: st?.coverage_state ?? null,
      lastCrawl: st?.last_crawl ?? null, checkedAt: st?.checked_at ?? null,
      impressions: t.impressions, clicks: t.clicks, lastImpression: t.lastImpression,
      firstSeen: p.first_seen_at ?? null, firstIndexed: st?.first_indexed_at ?? null,
    }
  })

  const isRedirect = (r: Row) => !!r.coverage && /переадресац|redirect/i.test(r.coverage)

  const inIndex = rows.filter((r) => r.verdict === 'PASS')
  // Переадресация — не беда, а решение: страница намеренно ведёт на другую.
  // В общей куче «не в индексе» она выглядела бы потерей, которой нет.
  const redirects = rows.filter((r) => r.verdict && r.verdict !== 'PASS' && isRedirect(r))
  const outIndex = rows.filter((r) => r.verdict && r.verdict !== 'PASS' && !isRedirect(r))
  const unchecked = rows.filter((r) => !r.verdict)
  const share = inIndex.length + outIndex.length > 0
    ? Math.round((inIndex.length / (inIndex.length + outIndex.length)) * 100) : 0

  // Больно там, где страница не в индексе, но её ищут
  const painful = outIndex.filter((r) => r.impressions > 0).sort((a, b) => b.impressions - a.impressions)
  const quiet = outIndex.filter((r) => r.impressions === 0).sort((a, b) => a.url.localeCompare(b.url))

  const lastCheck = (statuses ?? []).map((s: any) => s.checked_at).filter(Boolean).sort().pop()

  // Что появилось за выбранный период и попало ли в индекс.
  // Для наших статей дата выхода известна точно, для остальных — когда мы её
  // впервые увидели на обходе; это близко, но не одно и то же.
  const cutoff = new Date(Date.now() - days * 864e5).toISOString()
  const publishedAt = new Map<string, string>()
  for (const a of articles ?? []) if (a.published_at) publishedAt.set(String(a.id), a.published_at)

  const fresh = rows
    .filter((r) => r.firstSeen && r.firstSeen >= cutoff)
    .sort((a, b) => (b.firstSeen ?? '').localeCompare(a.firstSeen ?? ''))

  const freshIn = fresh.filter((r) => r.verdict === 'PASS')
  const waits = freshIn
    .map((r) => (r.firstSeen && r.firstIndexed
      ? Math.round((Date.parse(r.firstIndexed) - Date.parse(r.firstSeen)) / 864e5) : null))
    .filter((n): n is number => n !== null && n >= 0)
    .sort((a, b) => a - b)
  const medianWait = waits.length ? waits[Math.floor(waits.length / 2)] : null

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
        <Card label="Переадресация" value={redirects.length} sub={redirects.length ? 'так и задумано' : '—'} />
        <Card label="Не проверяли" value={unchecked.length} sub={unchecked.length ? 'дойдёт очередь' : 'все проверены'} />
        <Card label="Всего страниц" value={rows.length} sub="индексируемых" />
      </div>

      {ourArticles.length > 0 && (
        <div style={{ border: '1px solid var(--bor)', borderRadius: 12, overflow: 'hidden', marginBottom: 16 }}>
          <div style={{ padding: '10px 14px', background: 'var(--surf2)' }}>
            <div style={{ fontSize: 13, fontWeight: 700 }}>Наши статьи · {ourArticles.length}</div>
            <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 3, lineHeight: 1.5 }}>
              Написанные конвейером. Здесь известна настоящая дата выхода, поэтому «дней до индекса» —
              честный срок, а не разница с датой обхода.
              {' '}Google приходит по sitemap и заявок на индексацию не принимает — для свежей статьи
              одна-две недели ожидания норма. Яндекс заявки принимает, и после публикации мы его просим:
              поэтому там статьи появляются быстрее.
              {yandex?.computedAt && ` Данные Яндекса от ${new Date(yandex.computedAt).toLocaleString('ru')}.`}
            </div>
          </div>
          <div style={{ padding: '0 6px 6px' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ color: 'var(--muted)', textAlign: 'left' }}>
                  <th style={th}>Статья</th>
                  <th style={th}>Вышла</th>
                  <th style={th}>Google</th>
                  <th style={th}>Яндекс</th>
                  <th style={th}>В индексе с</th>
                  <th style={{ ...th, textAlign: 'right' }}>Дней</th>
                </tr>
              </thead>
              <tbody>
                {ourArticles.map((a) => {
                  const l = label(a.verdict, a.coverage)
                  return (
                    <tr key={a.id} style={{ borderTop: '1px solid var(--bor)' }}>
                      <td style={td}>
                        <Link href={`/admin/seo/articles/${a.id}`} style={{ color: 'var(--purple)', textDecoration: 'none', fontWeight: 600 }}>
                          {a.keyword}
                        </Link>
                        <div style={{ fontSize: 11, color: 'var(--muted)' }}>
                          <a href={`${a.url}/`} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--muted)', textDecoration: 'none' }}>
                            {a.url.replace('https://goandstudy.com', '')}
                          </a>
                        </div>
                      </td>
                      <td style={{ ...td, whiteSpace: 'nowrap', color: 'var(--muted)' }}>
                        {a.publishedAt ? new Date(a.publishedAt).toLocaleDateString('ru') : '—'}
                      </td>
                      <td style={{ ...td, color: l.color, fontWeight: 600, whiteSpace: 'nowrap' }}>{l.text}</td>
                      <td style={{ ...td, whiteSpace: 'nowrap' }}>
                        {(() => {
                          const y = yandexByUrl.get(a.url.replace(/\/$/, ''))
                          if (!yandex) return <span style={{ color: 'var(--muted)' }}>нет доступа</span>
                          if (!y) return <span style={{ color: 'var(--muted)' }}>—</span>
                          return y.inSearch
                            ? <span style={{ color: 'var(--green)', fontWeight: 600 }}>в поиске</span>
                            : <span style={{ color: 'var(--muted)' }} title={y.note}>не нашли</span>
                        })()}
                      </td>
                      <td style={{ ...td, whiteSpace: 'nowrap', color: 'var(--muted)' }}>
                        {a.firstIndexed ? new Date(a.firstIndexed).toLocaleDateString('ru') : '—'}
                      </td>
                      <td style={{ ...td, textAlign: 'right', color: a.firstIndexed ? 'var(--muted)' : 'var(--purple)' }}>
                        {a.days === null ? '—' : a.firstIndexed ? a.days : `ждёт ${a.days}`}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div style={{ border: '1px solid var(--bor)', borderRadius: 12, overflow: 'hidden', marginBottom: 16 }}>
        <div style={{ padding: '10px 14px', background: 'var(--surf2)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700 }}>Страницы, впервые замеченные обходом · {fresh.length}</div>
            <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 3, lineHeight: 1.5, maxWidth: 700 }}>
              {fresh.length === 0
                ? 'За период обход не нашёл ничего нового.'
                : <>В индексе {freshIn.length} из {fresh.length}.
                    Это дата, когда страницу впервые увидел <b>наш обход</b>, а не дата публикации:
                    весь сайт попал в инвентарь 8 сентября, поэтому здесь он и числится «новым».
                    Настоящие сроки — в таблице наших статей выше.</>}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            {[30, 90, 180].map((d) => (
              <Link key={d} href={`/admin/seo/indexation?dni=${d}`}
                style={{ fontSize: 12, padding: '3px 9px', borderRadius: 6, textDecoration: 'none',
                  border: '1px solid var(--bor2)',
                  color: d === days ? 'var(--purple)' : 'var(--muted)',
                  fontWeight: d === days ? 700 : 400 }}>
                {d} дн
              </Link>
            ))}
          </div>
        </div>
        {fresh.length > 0 && (
          <div style={{ padding: '0 6px 6px' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ color: 'var(--muted)', textAlign: 'left' }}>
                  <th style={th}>Адрес</th>
                  <th style={th}>Появилась</th>
                  <th style={th}>Состояние</th>
                  <th style={th}>В индексе с</th>
                  <th style={{ ...th, textAlign: 'right' }}>Ждёт, дней</th>
                </tr>
              </thead>
              <tbody>
                {fresh.map((r) => {
                  const l = label(r.verdict, r.coverage)
                  const waiting = r.firstSeen
                    ? Math.round((Date.parse(r.firstIndexed ?? new Date().toISOString()) - Date.parse(r.firstSeen)) / 864e5)
                    : null
                  return (
                    <tr key={r.page_id} style={{ borderTop: '1px solid var(--bor)' }}>
                      <td style={td}>
                        <a href={r.url} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--text)', textDecoration: 'none' }}>
                          {r.url.replace('https://goandstudy.com', '') || '/'}
                        </a>
                      </td>
                      <td style={{ ...td, color: 'var(--muted)', whiteSpace: 'nowrap' }}>
                        {r.firstSeen ? new Date(r.firstSeen).toLocaleDateString('ru') : '—'}
                      </td>
                      <td style={{ ...td, color: l.color, fontWeight: 600, whiteSpace: 'nowrap' }}>{l.text}</td>
                      <td style={{ ...td, color: 'var(--muted)', whiteSpace: 'nowrap' }}>
                        {r.firstIndexed ? new Date(r.firstIndexed).toLocaleDateString('ru') : '—'}
                      </td>
                      <td style={{ ...td, textAlign: 'right', color: r.verdict === 'PASS' ? 'var(--muted)' : 'var(--purple)' }}>
                        {waiting === null ? '—' : waiting}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {painful.length > 0 && (
        <Table
          title="Выпали из индекса"
          hint="Эти страницы приносили показы, а сейчас Google их не держит. Колонка «Показы до» говорит, когда трафик оборвался — если у многих совпадает дата, причина общая."
          rows={painful} showTraffic
        />
      )}

      {quiet.length > 0 && (
        <Table
          title="Не в индексе, показов не было"
          hint="Google до них не дошёл или счёл неинтересными. Для только что вышедших статей это нормально в первые недели."
          rows={quiet}
        />
      )}

      {redirects.length > 0 && (
        <Table
          title="Ведут на другие страницы"
          hint="Эти адреса переадресуют на другие страницы — в индексе им и не место. Показы засчитываются старому адресу, пока Google не переучится."
          rows={redirects} showTraffic collapsed
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
          {showTraffic && <th style={th}>Показы до</th>}
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
              {showTraffic && (
                <td style={{ ...td, color: 'var(--muted)', whiteSpace: 'nowrap' }}>
                  {r.lastImpression ? new Date(r.lastImpression).toLocaleDateString('ru') : '—'}
                </td>
              )}
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

function plural(n: number): string {
  const d = n % 10, dd = n % 100
  if (d === 1 && dd !== 11) return 'день'
  if (d >= 2 && d <= 4 && (dd < 12 || dd > 14)) return 'дня'
  return 'дней'
}

const th: React.CSSProperties = { padding: '8px 8px', fontWeight: 500, fontSize: 11 }
const td: React.CSSProperties = { padding: '7px 8px' }
