import { createAdminClient } from '@/lib/supabase/server'
import { GenerateSchemaButton } from './GenerateSchemaButton'

const short = (u: string) => (u || '').replace('https://goandstudy.com', '') || '/'

async function load() {
  try {
    const seo = (await createAdminClient()).schema('seo')
    const { data, error } = await seo.from('page_schema')
      .select('id, page_id, schema_type, jsonld, status').eq('status', 'proposed').limit(500)
    if (error) return { ok: false as const, error: error.message }
    const ids = [...new Set((data ?? []).map((r: any) => r.page_id))]
    const urls = new Map<number, string>()
    for (let i = 0; i < ids.length; i += 300) {
      const { data: ps } = await seo.from('pages').select('id, normalized_url').in('id', ids.slice(i, i + 300))
      for (const p of ps ?? []) urls.set(p.id, p.normalized_url)
    }
    return { ok: true as const, rows: (data ?? []) as any[], urls }
  } catch (e: any) { return { ok: false as const, error: e?.message ?? 'seo недоступна' } }
}

export default async function SeoSchema() {
  const s = await load()
  const rows = s.ok ? s.rows : []
  const byType: Record<string, number> = {}
  for (const r of rows) byType[r.schema_type] = (byType[r.schema_type] || 0) + 1

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 14, flexWrap: 'wrap' }}>
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 4px' }}>Schema.org — предложения</h2>
          <p style={{ color: 'var(--muted)', fontSize: 13, margin: 0, maxWidth: 720 }}>
            Готовый JSON-LD для страниц без разметки. Только проверяемые поля (§12.3): без выдуманных
            рейтингов, отзывов, цен, дат и авторов. Применение на сайт — через WordPress Bridge (этап 5)
            или вручную. До применения это предложения (status=proposed).
          </p>
        </div>
        {s.ok && <GenerateSchemaButton />}
      </div>

      {!s.ok ? (
        <div style={{ padding: 14, border: '1px solid var(--bor2)', borderRadius: 10, fontSize: 13 }}>seo недоступна: {s.error}</div>
      ) : rows.length === 0 ? (
        <div style={{ padding: 20, border: '1px dashed var(--bor2)', borderRadius: 10, textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>
          Предложений нет. Нажми «Сгенерировать schema» — соберётся для страниц без JSON-LD.
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12, fontSize: 12, color: 'var(--muted)' }}>
            <span style={{ padding: '4px 10px', border: '1px solid var(--bor2)', borderRadius: 999 }}>всего: {rows.length}</span>
            {Object.entries(byType).map(([t, n]) => <span key={t} style={{ padding: '4px 10px', border: '1px solid var(--bor2)', borderRadius: 999 }}>{t}: {n}</span>)}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {rows.map((r) => (
              <details key={r.id} style={{ border: '1px solid var(--bor)', borderRadius: 8, padding: '8px 12px', fontSize: 12 }}>
                <summary style={{ cursor: 'pointer', display: 'flex', gap: 10, alignItems: 'center' }}>
                  <span style={{ fontWeight: 700, color: 'var(--purple)' }}>{r.schema_type}</span>
                  <span style={{ color: 'var(--text)', wordBreak: 'break-all' }}>{short(s.urls.get(r.page_id) || '')}</span>
                </summary>
                <pre style={{ margin: '8px 0 0', padding: 10, background: 'var(--surf2)', borderRadius: 6, overflowX: 'auto', fontSize: 11, lineHeight: 1.4 }}>
{JSON.stringify(r.jsonld, null, 2)}
                </pre>
              </details>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
