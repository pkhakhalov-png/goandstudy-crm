import { createAdminClient } from '@/lib/supabase/server'
import { loadPageDays } from '@/lib/seo/gsc-agg'
import Link from 'next/link'

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
    const seo = (await createAdminClient()).schema('seo')

    const [pd, pages, findings, opps, exps, schema] = await Promise.all([
      // Читаем пачками параллельно: последовательно те же строки занимали
      // три секунды, и всё это время экран стоял пустой
      loadPageDays(seo),
      seo.from('pages').select('id', { count: 'exact', head: true }).is('removed_at', null),
      fetchAll(seo, 'findings', 'kind', (q) => q.eq('status', 'open')),
      fetchAll(seo, 'opportunities', 'decision, risk, priority, forecast, evidence, status'),
      seo.from('experiments').select('id', { count: 'exact', head: true }),
      seo.from('page_schema').select('id', { count: 'exact', head: true }).eq('status', 'proposed'),
    ])

    // трафик: последние 28 дней vs предыдущие 28 (якорь — макс. дата данных)
    let maxDate = ''
    for (const r of pd) if (r.date > maxDate) maxDate = r.date
    const dayMs = 86400000
    const anchor = maxDate ? Date.parse(maxDate) : 0
    const cur = { clicks: 0, impr: 0 }, prev = { clicks: 0, impr: 0 }
    let totalClicks = 0, totalImpr = 0
    for (const r of pd) {
      totalClicks += r.clicks; totalImpr += r.impressions
      const age = (anchor - Date.parse(r.date)) / dayMs
      if (age < 28) { cur.clicks += r.clicks; cur.impr += r.impressions }
      else if (age < 56) { prev.clicks += r.clicks; prev.impr += r.impressions }
    }

    const findingsByKind: Record<string, number> = {}
    for (const f of findings) findingsByKind[f.kind] = (findingsByKind[f.kind] || 0) + 1
    const oppByDecision: Record<string, number> = {}
    for (const o of opps) if (!['dismissed', 'done', 'expired'].includes(o.status)) oppByDecision[o.decision] = (oppByDecision[o.decision] || 0) + 1
    const topOpps = opps.filter((o: any) => !['dismissed', 'done', 'expired'].includes(o.status)).sort((a: any, b: any) => b.priority - a.priority).slice(0, 6)
    const inProd = opps.filter((o: any) => o.status === 'in_production').length

    return {
      ok: true as const, maxDate,
      traffic: { totalClicks, totalImpr, cur, prev },
      pagesCount: pages.count ?? 0, findingsCount: findings.length, findingsByKind,
      oppCount: opps.filter((o: any) => !['dismissed', 'done', 'expired'].includes(o.status)).length, oppByDecision, topOpps,
      expCount: exps.count ?? 0, inProd, schemaCount: schema.count ?? 0,
    }
  } catch (e: any) { return { ok: false as const, error: e?.message ?? 'seo недоступна' } }
}

const short = (u: string) => (u || '').replace('https://goandstudy.com', '') || '/'
const pct = (a: number, b: number) => (b > 0 ? Math.round(((a - b) / b) * 100) : 0)

function Card({ label, value, sub, color }: { label: string; value: React.ReactNode; sub?: React.ReactNode; color?: string }) {
  return (
    <div style={{ padding: 16, border: '1px solid var(--bor)', borderRadius: 12, background: 'var(--surf)' }}>
      <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase' }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 700, color: color || 'var(--text)' }}>{value}</div>
      {sub != null && <div style={{ fontSize: 12, color: 'var(--muted)' }}>{sub}</div>}
    </div>
  )
}

export default async function SeoOverview() {
  const s = await load()
  if (!s.ok) return <div style={{ padding: 16, border: '1px solid var(--bor2)', borderRadius: 12, fontSize: 13 }}>seo недоступна: {s.error}</div>

  const clicksTrend = pct(s.traffic.cur.clicks, s.traffic.prev.clicks)
  const imprTrend = pct(s.traffic.cur.impr, s.traffic.prev.impr)
  const avgCtr = s.traffic.totalImpr ? (s.traffic.totalClicks / s.traffic.totalImpr * 100).toFixed(2) : '0'
  const DEC_COLOR: Record<string, string> = { FIX: 'var(--red)', 'MERGE/REPOSITION': 'var(--red)', UPDATE: 'var(--green)', EXPAND: 'var(--purple)', SCHEMA: 'var(--purple)', CREATE: 'var(--purple)', REVIEW: 'var(--muted)', LINK_ONLY: 'var(--muted)' }

  return (
    <div>
      <div style={{ marginBottom: 14 }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 4px' }}>Обзор</h2>
        <p style={{ color: 'var(--muted)', fontSize: 13, margin: 0 }}>
          Поисковый трафик, план работ и эксперименты. Данные Search Console по {s.maxDate || '—'} (задержка GSC 2–3 дня).
          Трафик и число URL — промежуточные метрики, не конечные (PRD §17.3).
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 16 }}>
        <Card label="Клики / 28 дн" value={s.traffic.cur.clicks} color="var(--green)"
          sub={<span style={{ color: clicksTrend >= 0 ? 'var(--green)' : 'var(--red)' }}>{clicksTrend >= 0 ? '▲' : '▼'} {Math.abs(clicksTrend)}% к пред. 28 дн</span>} />
        <Card label="Показы / 28 дн" value={s.traffic.cur.impr.toLocaleString('ru')}
          sub={<span style={{ color: imprTrend >= 0 ? 'var(--green)' : 'var(--red)' }}>{imprTrend >= 0 ? '▲' : '▼'} {Math.abs(imprTrend)}%</span>} />
        <Card label="Средний CTR" value={`${avgCtr}%`} sub="весь период" />
        <Card label="Страниц" value={s.pagesCount} sub="в инвентаре" />
        <Card label="Возможности" value={s.oppCount} sub={<Link href="/admin/seo/opportunities" style={{ color: 'var(--purple)' }}>открыть план →</Link>} />
        <Card label="Эксперименты" value={s.expCount} sub={s.inProd ? `${s.inProd} возможн. в работе` : 'наблюдение'} color={s.inProd ? 'var(--purple)' : undefined} />
        <Card label="Находки" value={s.findingsCount} sub={<Link href="/admin/seo/findings" style={{ color: 'var(--purple)' }}>разбор →</Link>} />
        <Card label="Schema-предложения" value={s.schemaCount} sub={<Link href="/admin/seo/schema" style={{ color: 'var(--purple)' }}>JSON-LD →</Link>} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 16 }}>
        <div style={{ border: '1px solid var(--bor)', borderRadius: 12, overflow: 'hidden' }}>
          <div style={{ padding: '10px 14px', background: 'var(--surf2)', fontSize: 13, fontWeight: 700, display: 'flex', justifyContent: 'space-between' }}>
            <span>Ближайшие приоритеты</span>
            <Link href="/admin/seo/opportunities" style={{ fontSize: 12, color: 'var(--purple)', fontWeight: 400 }}>вся очередь →</Link>
          </div>
          <div style={{ padding: '8px 14px', display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12 }}>
            {s.topOpps.map((o: any, i: number) => (
              <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <span style={{ fontWeight: 700, color: DEC_COLOR[o.decision] || 'var(--text)', minWidth: 120 }}>{o.decision}</span>
                <span style={{ flex: 1, color: 'var(--text)', wordBreak: 'break-all' }}>{o.evidence?.url ? short(o.evidence.url) : o.evidence?.query ? `«${o.evidence.query}»` : o.kind}</span>
                {o.forecast && <span style={{ color: 'var(--green)', whiteSpace: 'nowrap' }}>+{o.forecast.base} кл/28д</span>}
                <span style={{ color: 'var(--muted)', width: 44, textAlign: 'right' }}>{Math.round(o.priority)}</span>
              </div>
            ))}
            {!s.topOpps.length && <span style={{ color: 'var(--muted)' }}>очередь пуста — пересчитай во вкладке «Возможности»</span>}
          </div>
        </div>

        <div style={{ border: '1px solid var(--bor)', borderRadius: 12, overflow: 'hidden' }}>
          <div style={{ padding: '10px 14px', background: 'var(--surf2)', fontSize: 13, fontWeight: 700 }}>Находки по видам</div>
          <div style={{ padding: '8px 14px', display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12 }}>
            {Object.entries(s.findingsByKind).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, v]) => (
              <div key={k} style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--muted)' }}>
                <span>{k}</span><b style={{ color: 'var(--text)' }}>{v}</b>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
