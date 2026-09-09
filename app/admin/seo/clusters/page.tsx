import { createAdminClient } from '@/lib/supabase/server'
import { ClusterButton } from '../ClusterButton'

async function load() {
  try {
    const seo = (await createAdminClient()).schema('seo')
    const out: any[] = []
    for (let from = 0; ; from += 1000) {
      const { data, error } = await seo.from('pages')
        .select('id, normalized_url, title, page_type, cluster, indexable')
        .is('removed_at', null).range(from, from + 999)
      if (error) return { ok: false as const, error: error.message }
      out.push(...(data ?? []))
      if (!data || data.length < 1000) break
    }
    return { ok: true as const, pages: out }
  } catch (e: any) { return { ok: false as const, error: e?.message ?? 'seo недоступна' } }
}

const short = (u: string) => (u || '').replace('https://goandstudy.com', '') || '/'

export default async function SeoClusters() {
  const s = await load()
  const groups: Record<string, any[]> = {}
  let unclustered = 0
  if (s.ok) for (const p of s.pages) {
    if (!p.cluster) { unclustered++; continue }
    ;(groups[p.cluster] ??= []).push(p)
  }
  const ordered = Object.entries(groups).sort((a, b) => b[1].length - a[1].length)
  const total = s.ok ? s.pages.length : 0

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 14, flexWrap: 'wrap' }}>
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 4px' }}>Тематические кластеры</h2>
          <p style={{ color: 'var(--muted)', fontSize: 13, margin: 0 }}>
            Страницы сгруппированы по смыслу (эмбеддинги title+h1+meta, сферический k-means).
            Названия кластеров — самые характерные слова из заголовков. «k (авто)» — число кластеров подбирается по связности.
          </p>
        </div>
        {s.ok && <ClusterButton />}
      </div>

      {!s.ok ? (
        <div style={{ padding: 14, border: '1px solid var(--bor2)', borderRadius: 10, fontSize: 13 }}>seo недоступна: {s.error}</div>
      ) : ordered.length === 0 ? (
        <div style={{ padding: 20, border: '1px dashed var(--bor2)', borderRadius: 10, textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>
          Кластеров нет. Собери инвентарь и эмбеддинги, затем нажми «Пересчитать кластеры».
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14, fontSize: 12, color: 'var(--muted)' }}>
            <span style={{ padding: '4px 10px', border: '1px solid var(--bor2)', borderRadius: 999 }}>кластеров: {ordered.length}</span>
            <span style={{ padding: '4px 10px', border: '1px solid var(--bor2)', borderRadius: 999 }}>страниц: {total}</span>
            {unclustered > 0 && <span style={{ padding: '4px 10px', border: '1px solid var(--bor2)', borderRadius: 999 }}>без кластера: {unclustered}</span>}
          </div>

          {/* полоса распределения */}
          <div style={{ display: 'flex', height: 12, borderRadius: 6, overflow: 'hidden', marginBottom: 18, border: '1px solid var(--bor)' }}>
            {ordered.map(([name, items], i) => (
              <div key={name} title={`${name}: ${items.length}`}
                style={{ width: `${(items.length / (total - unclustered)) * 100}%`, background: `hsl(${(i * 47) % 360} 55% 60%)` }} />
            ))}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {ordered.map(([name, items], i) => {
              const svc = items.filter((p) => p.page_type === 'service').length
              const art = items.filter((p) => p.page_type === 'article').length
              return (
                <div key={name} style={{ border: '1px solid var(--bor)', borderRadius: 10, overflow: 'hidden' }}>
                  <div style={{ padding: '10px 14px', background: 'var(--surf2)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
                    <b style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ width: 10, height: 10, borderRadius: 3, background: `hsl(${(i * 47) % 360} 55% 60%)`, display: 'inline-block' }} />
                      {name}
                    </b>
                    <span style={{ fontSize: 12, color: 'var(--muted)' }}>
                      {items.length} · service {svc} / article {art}
                    </span>
                  </div>
                  <div style={{ padding: '8px 14px', fontSize: 12, display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 260, overflowY: 'auto' }}>
                    {items.slice(0, 50).map((p) => (
                      <div key={p.id} style={{ color: 'var(--muted)', wordBreak: 'break-all' }}>
                        <span style={{ color: 'var(--text)' }}>{short(p.normalized_url)}</span>
                        {p.title ? ` — ${p.title}` : ''}
                      </div>
                    ))}
                    {items.length > 50 && <div style={{ color: 'var(--muted)' }}>…ещё {items.length - 50}</div>}
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
