import { createAdminClient } from '@/lib/supabase/server'
import { computeOpportunities } from '@/lib/seo/opportunities'

const DEC_COLOR: Record<string, string> = {
  FIX: 'var(--red)', 'MERGE/REPOSITION': 'var(--red)', REVIEW: 'var(--muted)',
  UPDATE: 'var(--green)', EXPAND: 'var(--purple)', SCHEMA: 'var(--purple)',
  LINK_ONLY: 'var(--muted)', CREATE: 'var(--purple)',
}
const RISK_RU: Record<string, string> = { low: 'низкий', medium: 'средний', high: 'высокий' }

async function load() {
  try {
    const seo = (await createAdminClient()).schema('seo')
    const { data, error } = await seo.from('findings').select('id, kind, confidence, page_ids, evidence, status').eq('status', 'open').limit(3000)
    if (error) return { ok: false as const, error: error.message }
    return { ok: true as const, opps: computeOpportunities((data ?? []) as any[]) }
  } catch (e: any) { return { ok: false as const, error: e?.message ?? 'seo недоступна' } }
}

export default async function SeoOpportunities() {
  const s = await load()
  const opps = s.ok ? s.opps : []
  const byDecision: Record<string, number> = {}
  for (const o of opps) byDecision[o.decision] = (byDecision[o.decision] || 0) + 1

  return (
    <div>
      <div style={{ marginBottom: 14 }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 4px' }}>Возможности</h2>
        <p style={{ color: 'var(--muted)', fontSize: 13, margin: 0 }}>
          Единый приоритизированный план: находки сведены по URL/запросу с решением, риском и прогнозом.
          Это вычисляемое представление (read-model); полноценный Decision Engine с таблицей и калибровкой — этап 2 PRD.
        </p>
      </div>

      {!s.ok ? (
        <div style={{ padding: 14, border: '1px solid var(--bor2)', borderRadius: 10, fontSize: 13 }}>seo недоступна: {s.error}</div>
      ) : opps.length === 0 ? (
        <div style={{ padding: 20, border: '1px dashed var(--bor2)', borderRadius: 10, textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>
          Возможностей нет — сначала посчитай находки.
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14, fontSize: 12, color: 'var(--muted)' }}>
            <span style={{ padding: '4px 10px', border: '1px solid var(--bor2)', borderRadius: 999 }}>всего: {opps.length}</span>
            {Object.entries(byDecision).sort((a, b) => b[1] - a[1]).map(([d, n]) => (
              <span key={d} style={{ padding: '4px 10px', border: '1px solid var(--bor2)', borderRadius: 999, color: DEC_COLOR[d] || 'var(--text)' }}>{d}: {n}</span>
            ))}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {opps.slice(0, 150).map((o, i) => (
              <div key={o.key} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', border: '1px solid var(--bor)', borderRadius: 8, fontSize: 12, flexWrap: 'wrap' }}>
                <span style={{ color: 'var(--muted)', width: 26, textAlign: 'right' }}>{i + 1}</span>
                <span style={{ fontWeight: 700, color: DEC_COLOR[o.decision] || 'var(--text)', minWidth: 130 }}>{o.decision}</span>
                <span style={{ flex: 1, minWidth: 200, color: 'var(--text)', wordBreak: 'break-all' }}>
                  {o.url ? o.url.replace('https://goandstudy.com', '') : o.scope === 'query' ? `запрос: «${o.evidence?.query}»` : o.kinds.join(', ')}
                  <span style={{ color: 'var(--muted)' }}> — {o.decision_reason}</span>
                </span>
                {o.forecast && <span style={{ color: 'var(--green)', whiteSpace: 'nowrap' }}>+{o.forecast.conservative}/{o.forecast.base}/{o.forecast.optimistic} кл/28д</span>}
                <span style={{ padding: '1px 7px', borderRadius: 999, border: '1px solid var(--bor2)', fontSize: 10, whiteSpace: 'nowrap', color: o.risk === 'high' ? 'var(--red)' : o.risk === 'medium' ? 'var(--text)' : 'var(--muted)' }}>риск: {RISK_RU[o.risk]}</span>
                {o.cluster && <span style={{ padding: '1px 7px', borderRadius: 999, border: '1px solid var(--bor2)', fontSize: 10, color: 'var(--muted)', whiteSpace: 'nowrap' }}>◆ {o.cluster}</span>}
                <span style={{ color: 'var(--muted)', width: 54, textAlign: 'right' }}>{Math.round(o.priority)}</span>
              </div>
            ))}
            {opps.length > 150 && <div style={{ color: 'var(--muted)', fontSize: 12, padding: 6 }}>…ещё {opps.length - 150}</div>}
          </div>
        </>
      )}
    </div>
  )
}
