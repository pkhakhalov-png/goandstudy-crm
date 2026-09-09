import { createAdminClient } from '@/lib/supabase/server'
import { OpportunitiesClient } from './OpportunitiesClient'

async function load() {
  try {
    const seo = (await createAdminClient()).schema('seo')
    const { data, error } = await seo.from('opportunities')
      .select('id, kind, page_ids, decision, decision_reason, risk, priority, forecast, evidence, status')
      .order('priority', { ascending: false }).limit(1000)
    if (error) return { ok: false as const, error: error.message }
    return { ok: true as const, opps: (data ?? []) as any[] }
  } catch (e: any) { return { ok: false as const, error: e?.message ?? 'seo недоступна' } }
}

export default async function SeoOpportunities() {
  const s = await load()
  return (
    <div>
      <div style={{ marginBottom: 14 }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 4px' }}>Возможности</h2>
        <p style={{ color: 'var(--muted)', fontSize: 13, margin: 0 }}>
          Единый приоритизированный план: находки сведены по URL/запросу с решением, риском и прогнозом.
          «▶ эксп.» фиксирует baseline из Search Console и заводит эксперимент (§16). «✕» — отклонить.
          Полный Decision Engine с калибровкой business score — дальнейшие шаги этапа 2 PRD.
        </p>
      </div>

      {!s.ok ? (
        <div style={{ padding: 14, border: '1px solid var(--bor2)', borderRadius: 10, fontSize: 13 }}>seo недоступна: {s.error}</div>
      ) : (
        <OpportunitiesClient opps={s.opps} />
      )}
    </div>
  )
}
