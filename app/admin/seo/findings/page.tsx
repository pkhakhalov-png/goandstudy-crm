import { createAdminClient } from '@/lib/supabase/server'
import { RecomputeFindingsButton } from '../RecomputeFindingsButton'
import { TechnicalFindingsButton } from '../TechnicalFindingsButton'
import { GscFindingsButton } from '../GscFindingsButton'

const KIND_RU: Record<string, string> = {
  orphan: 'Сироты (нет входящих ссылок)',
  duplicate_title: 'Дубли title / контента',
  content_gap: 'Ссылки на несуществующие страницы',
  cannibalization: 'Каннибализация',
  striking_distance: 'На подходе к топ-10',
  broken_link: 'Битые ссылки',
  ctr_opportunity: 'CTR-возможности',
  stale_content: 'Устаревшее',
  // технический аудит (порт claude-seo)
  missing_title: 'Нет title',
  missing_h1: 'Нет H1',
  missing_meta_desc: 'Нет meta description',
  title_length: 'Длина title вне нормы',
  meta_desc_length: 'Длина meta description вне нормы',
  thin_content: 'Тонкий контент (< 300 слов)',
  missing_schema: 'Нет schema.org (JSON-LD)',
  llms_txt_missing: 'Нет /llms.txt (AI-видимость)',
  robots_sitemap: 'robots.txt без Sitemap',
}

async function load() {
  try {
    const seo = (await createAdminClient()).schema('seo')
    const { data, error } = await seo.from('findings').select('id, kind, confidence, page_ids, evidence, status')
      .eq('status', 'open').order('kind').limit(2000)
    if (error) return { ok: false as const, error: error.message }
    return { ok: true as const, findings: (data ?? []) as any[] }
  } catch (e: any) { return { ok: false as const, error: e?.message ?? 'seo недоступна' } }
}

export default async function SeoFindings() {
  const s = await load()
  const groups: Record<string, any[]> = {}
  if (s.ok) for (const f of s.findings) (groups[f.kind] ??= []).push(f)

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 14, flexWrap: 'wrap' }}>
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 4px' }}>Находки</h2>
          <p style={{ color: 'var(--muted)', fontSize: 13, margin: 0 }}>
            Инвентарь: сироты, дубли, битые ссылки, технический аудит. Search Console: striking-distance
            (позиции 11–20), CTR-возможности, реальная каннибализация. Каждая находка привязана к кластеру.
          </p>
        </div>
        {s.ok && <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}><GscFindingsButton /><TechnicalFindingsButton /><RecomputeFindingsButton /></div>}
      </div>

      {!s.ok ? (
        <div style={{ padding: 14, border: '1px solid var(--bor2)', borderRadius: 10, fontSize: 13 }}>seo недоступна: {s.error}</div>
      ) : s.findings.length === 0 ? (
        <div style={{ padding: 20, border: '1px dashed var(--bor2)', borderRadius: 10, textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>
          Находок нет. Сначала собери инвентарь (вкладка «Страницы»), затем нажми «Пересчитать находки».
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {Object.entries(groups).map(([kind, items]) => (
            <div key={kind} style={{ border: '1px solid var(--bor)', borderRadius: 10, overflow: 'hidden' }}>
              <div style={{ padding: '10px 14px', background: 'var(--surf2)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <b style={{ fontSize: 13 }}>{KIND_RU[kind] || kind}</b>
                <span style={{ fontSize: 12, color: 'var(--muted)' }}>{items.length}</span>
              </div>
              <div style={{ padding: '8px 14px', fontSize: 12, display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 320, overflowY: 'auto' }}>
                {items.slice(0, 60).map((f) => (
                  <div key={f.id} style={{ color: 'var(--muted)', wordBreak: 'break-all' }}>
                    {f.evidence?.url?.replace('https://goandstudy.com', '') ||
                     f.evidence?.missing_url?.replace('https://goandstudy.com', '') ||
                     (f.evidence?.urls ? `«${f.evidence.title || 'дубль'}»: ${f.evidence.urls.map((u: string) => u.replace('https://goandstudy.com', '')).join(', ')}` : JSON.stringify(f.evidence))}
                    {f.evidence?.query ? ` — «${f.evidence.query}»` : ''}
                    {f.evidence?.position != null ? ` поз.${f.evidence.position}` : ''}
                    {f.evidence?.impressions != null ? ` · ${f.evidence.impressions} показов${f.evidence.clicks != null && typeof f.evidence.clicks === 'number' ? `, ${f.evidence.clicks} кликов` : ''}` : ''}
                    {f.evidence?.linked_from_count ? ` — ссылок: ${f.evidence.linked_from_count}` : ''}
                    {f.evidence?.len != null ? ` — ${f.evidence.len} симв. (${f.evidence.issue === 'long' ? 'длинно' : 'коротко'}, надо ${f.evidence.want})` : ''}
                    {f.evidence?.words != null ? ` — ${f.evidence.words} слов` : ''}
                    {f.evidence?.note ? ` — ${f.evidence.note}` : ''}
                    {f.evidence?.cluster ? <span style={{ marginLeft: 6, padding: '1px 7px', borderRadius: 999, border: '1px solid var(--bor2)', fontSize: 10, color: 'var(--text)', whiteSpace: 'nowrap' }}>◆ {f.evidence.cluster}</span> : ''}
                  </div>
                ))}
                {items.length > 60 && <div style={{ color: 'var(--muted)' }}>…ещё {items.length - 60}</div>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
