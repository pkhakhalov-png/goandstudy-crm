import { createAdminClient } from '@/lib/supabase/server'
import { loadPageDays } from '@/lib/seo/gsc-agg'
import { StartInventoryButton } from '../StartInventoryButton'

async function fetchAll(seo: any, table: string, cols: string, apply?: (q: any) => any): Promise<any[]> {
  const out: any[] = []
  for (let from = 0; ; from += 1000) {
    let q = seo.from(table).select(cols).range(from, from + 999)
    if (apply) q = apply(q)
    const { data } = await q
    out.push(...(data ?? []))
    if (!data || data.length < 1000) break
  }
  return out
}

async function load() {
  try {
    const admin = await createAdminClient()
    const seo = admin.schema('seo')
    const [pages, jobsRaw, gpd, findings] = await Promise.all([
      fetchAll(seo, 'pages', 'id, normalized_url, page_type, http_status, indexable, title, word_count, cluster', (q) => q.is('removed_at', null)),
      seo.from('jobs').select('status').in('step', ['inventory_sitemap', 'crawl_page']),
      // Пачками параллельно — та же причина, что и на «Обзоре»
      loadPageDays(seo),
      fetchAll(seo, 'findings', 'page_ids', (q) => q.eq('status', 'open')),
    ])
    const byStatus: Record<string, number> = {}
    for (const j of (jobsRaw.data ?? []) as any[]) byStatus[j.status] = (byStatus[j.status] || 0) + 1
    const running = (byStatus['pending'] || 0) + (byStatus['running'] || 0) + (byStatus['waiting'] || 0) > 0

    // агрегируем GSC по URL
    const gsc = new Map<string, { c: number; i: number; pw: number }>()
    for (const r of gpd) { const a = gsc.get(r.normalized_url) ?? { c: 0, i: 0, pw: 0 }; a.c += r.clicks; a.i += r.impressions; a.pw += (r.position || 0) * (r.impressions || 0); gsc.set(r.normalized_url, a) }
    const findCount = new Map<number, number>()
    for (const f of findings) for (const id of f.page_ids ?? []) findCount.set(id, (findCount.get(id) || 0) + 1)

    const rows = pages.map((p: any) => {
      const g = gsc.get(p.normalized_url)
      return { ...p, clicks: g?.c ?? 0, impressions: g?.i ?? 0, position: g && g.i ? Math.round((g.pw / g.i) * 10) / 10 : null, findings: findCount.get(p.id) || 0 }
    }).sort((a: any, b: any) => b.clicks - a.clicks || b.impressions - a.impressions)

    return { ok: true as const, pages: rows, byStatus, running }
  } catch (e: any) {
    return { ok: false as const, error: e?.message ?? 'seo недоступна' }
  }
}

export default async function SeoPages() {
  const s = await load()

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 14, flexWrap: 'wrap' }}>
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 4px' }}>Страницы</h2>
          <p style={{ color: 'var(--muted)', fontSize: 13, margin: 0 }}>
            Инвентарь сайта: обход по sitemap (goandstudy.com). WP REST закрыт — идём краулером.
          </p>
        </div>
        {s.ok && <StartInventoryButton running={s.running} />}
      </div>

      {!s.ok ? (
        <div style={{ padding: 14, border: '1px solid var(--bor2)', borderRadius: 10, background: 'rgba(201,125,0,.06)', fontSize: 13 }}>
          Схема seo недоступна: {s.error}
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', gap: 16, marginBottom: 14, fontSize: 13, color: 'var(--muted)' }}>
            <span><b style={{ color: 'var(--text)' }}>{s.pages.length}</b> страниц в инвентаре</span>
            <span>индексируемых: <b style={{ color: 'var(--green)' }}>{s.pages.filter(p => p.indexable).length}</b></span>
            <span>задачи обхода: {Object.entries(s.byStatus).map(([k, v]) => `${k} ${v}`).join(' · ') || '—'}</span>
          </div>

          {s.pages.length === 0 ? (
            <div style={{ padding: 20, border: '1px dashed var(--bor2)', borderRadius: 10, textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>
              Пусто. Нажми «Запустить инвентарь» — воркер обойдёт sitemap (~159 URL) и заполнит таблицу.
            </div>
          ) : (
            <div style={{ border: '1px solid var(--bor)', borderRadius: 10, overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ background: 'var(--surf2)', textAlign: 'left' }}>
                    <th style={{ padding: '8px 10px' }}>URL</th>
                    <th style={{ padding: '8px 10px' }}>Тип</th>
                    <th style={{ padding: '8px 10px', textAlign: 'right' }}>Клики</th>
                    <th style={{ padding: '8px 10px', textAlign: 'right' }}>Показы</th>
                    <th style={{ padding: '8px 10px', textAlign: 'right' }}>Поз.</th>
                    <th style={{ padding: '8px 10px' }}>Кластер</th>
                    <th style={{ padding: '8px 10px', textAlign: 'center' }}>Наход.</th>
                    <th style={{ padding: '8px 10px' }}>Инд.</th>
                  </tr>
                </thead>
                <tbody>
                  {s.pages.map((p) => (
                    <tr key={p.id} style={{ borderTop: '1px solid var(--bor)' }}>
                      <td style={{ padding: '7px 10px', maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={p.title || ''}>{p.normalized_url.replace('https://goandstudy.com', '')}</td>
                      <td style={{ padding: '7px 10px', color: 'var(--muted)' }}>{p.page_type}</td>
                      <td style={{ padding: '7px 10px', textAlign: 'right', fontWeight: p.clicks ? 700 : 400, color: p.clicks ? 'var(--green)' : 'var(--muted)' }}>{p.clicks || '—'}</td>
                      <td style={{ padding: '7px 10px', textAlign: 'right', color: 'var(--muted)' }}>{p.impressions ? p.impressions.toLocaleString('ru') : '—'}</td>
                      <td style={{ padding: '7px 10px', textAlign: 'right', color: 'var(--muted)' }}>{p.position ?? '—'}</td>
                      <td style={{ padding: '7px 10px', maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--muted)' }}>{p.cluster || '—'}</td>
                      <td style={{ padding: '7px 10px', textAlign: 'center', color: p.findings ? 'var(--purple)' : 'var(--muted)' }}>{p.findings || '—'}</td>
                      <td style={{ padding: '7px 10px', color: p.http_status && p.http_status !== 200 ? 'var(--red)' : undefined }}>{p.http_status && p.http_status !== 200 ? p.http_status : p.indexable ? '✓' : '—'}</td>
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
