import { createAdminClient } from '@/lib/supabase/server'
import { StartInventoryButton } from '../StartInventoryButton'

async function load() {
  try {
    const admin = await createAdminClient()
    const seo = admin.schema('seo')
    const [{ data: pages, error }, { data: jobs }] = await Promise.all([
      seo.from('pages').select('id, normalized_url, platform, page_type, http_status, indexable, title, word_count')
        .order('normalized_url').limit(1000),
      seo.from('jobs').select('status').in('step', ['inventory_sitemap', 'crawl_page']),
    ])
    if (error) return { ok: false as const, error: error.message }
    const byStatus: Record<string, number> = {}
    for (const j of (jobs ?? []) as any[]) byStatus[j.status] = (byStatus[j.status] || 0) + 1
    const running = (byStatus['pending'] || 0) + (byStatus['running'] || 0) + (byStatus['waiting'] || 0) > 0
    return { ok: true as const, pages: (pages ?? []) as any[], byStatus, running }
  } catch (e: any) {
    return { ok: false as const, error: e?.message ?? 'seo недоступна' }
  }
}

const plat: Record<string, string> = { wordpress: 'WP', tilda: 'Tilda', next: 'Next', other: '—' }

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
                    <th style={{ padding: '8px 10px' }}>Платф.</th>
                    <th style={{ padding: '8px 10px' }}>Тип</th>
                    <th style={{ padding: '8px 10px' }}>HTTP</th>
                    <th style={{ padding: '8px 10px' }}>Индекс.</th>
                    <th style={{ padding: '8px 10px' }}>Слов</th>
                    <th style={{ padding: '8px 10px' }}>Title</th>
                  </tr>
                </thead>
                <tbody>
                  {s.pages.map((p) => (
                    <tr key={p.id} style={{ borderTop: '1px solid var(--bor)' }}>
                      <td style={{ padding: '7px 10px', maxWidth: 340, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.normalized_url.replace('https://goandstudy.com', '')}</td>
                      <td style={{ padding: '7px 10px' }}>{plat[p.platform] || p.platform}</td>
                      <td style={{ padding: '7px 10px' }}>{p.page_type}</td>
                      <td style={{ padding: '7px 10px', color: p.http_status === 200 ? 'var(--muted)' : 'var(--red)' }}>{p.http_status ?? '—'}</td>
                      <td style={{ padding: '7px 10px' }}>{p.indexable ? '✓' : '—'}</td>
                      <td style={{ padding: '7px 10px' }}>{p.word_count ?? '—'}</td>
                      <td style={{ padding: '7px 10px', maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--muted)' }}>{p.title || '—'}</td>
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
