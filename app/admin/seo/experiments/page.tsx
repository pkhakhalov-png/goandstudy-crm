import { createAdminClient } from '@/lib/supabase/server'

const OUTCOME_RU: Record<string, string> = { improved: 'улучшение', neutral: 'нейтрально', degraded: 'ухудшение', inconclusive: 'неясно' }

async function load() {
  try {
    const seo = (await createAdminClient()).schema('seo')
    const { data, error } = await seo.from('experiments')
      .select('id, page_id, hypothesis, change_type, primary_metric, baseline, started_at, outcome, decision')
      .order('started_at', { ascending: false }).limit(200)
    if (error) return { ok: false as const, error: error.message }
    return { ok: true as const, exps: (data ?? []) as any[] }
  } catch (e: any) { return { ok: false as const, error: e?.message ?? 'seo недоступна' } }
}

export default async function SeoExperiments() {
  const s = await load()
  return (
    <div>
      <div style={{ marginBottom: 14 }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 4px' }}>Эксперименты</h2>
        <p style={{ color: 'var(--muted)', fontSize: 13, margin: 0 }}>
          Каждое изменение страницы — эксперимент с зафиксированным baseline из Search Console (§16).
          Запускаются из вкладки «Возможности» кнопкой «▶ эксп.». Правило одного изменения: одна переменная за раз.
        </p>
      </div>

      {!s.ok ? (
        <div style={{ padding: 14, border: '1px solid var(--bor2)', borderRadius: 10, fontSize: 13 }}>seo недоступна: {s.error}</div>
      ) : s.exps.length === 0 ? (
        <div style={{ padding: 20, border: '1px dashed var(--bor2)', borderRadius: 10, textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>
          Экспериментов пока нет. Запусти первый во вкладке «Возможности».
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {s.exps.map((e) => {
            const b = e.baseline || {}
            return (
              <div key={e.id} style={{ border: '1px solid var(--bor)', borderRadius: 10, padding: '10px 14px', fontSize: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                  <b style={{ fontSize: 13 }}>{e.hypothesis}</b>
                  <span style={{ color: 'var(--muted)' }}>{e.change_type} · метрика: {e.primary_metric}{e.outcome ? ` · ${OUTCOME_RU[e.outcome] || e.outcome}` : ' · наблюдается'}</span>
                </div>
                <div style={{ color: 'var(--muted)', marginTop: 6 }}>
                  baseline (28/56/90 дн): {' '}
                  {['d28', 'd56', 'd90'].map((k) => b[k] ? `${b[k].clicks}кл/${b[k].impressions}пок/поз ${b[k].position ?? '—'}` : '—').join('  ·  ')}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
