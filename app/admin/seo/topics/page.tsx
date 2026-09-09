import { createAdminClient } from '@/lib/supabase/server'
import { NewTopicForm } from './NewTopicForm'

const STATUS_RU: Record<string, string> = {
  new: 'новая', approved: 'одобрена', queued: 'в очереди', in_production: 'в работе',
  produced: 'готова', rejected: 'отклонена', rejected_duplicate: 'дубликат',
}

async function load() {
  try {
    const seo = (await createAdminClient()).schema('seo')
    const { data, error } = await seo.from('topics')
      .select('id, title, primary_keyword, cluster, intent, status, origin, created_at')
      .order('created_at', { ascending: false }).limit(500)
    if (error) return { ok: false as const, error: error.message }
    return { ok: true as const, topics: (data ?? []) as any[] }
  } catch (e: any) { return { ok: false as const, error: e?.message ?? 'seo недоступна' } }
}

export default async function SeoTopics() {
  const s = await load()
  const groups: Record<string, any[]> = {}
  if (s.ok) for (const t of s.topics) (groups[t.cluster || '— без кластера'] ??= []).push(t)
  const ordered = Object.entries(groups).sort((a, b) => b[1].length - a[1].length)

  return (
    <div>
      <div style={{ marginBottom: 14 }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 4px' }}>Статьи · темы</h2>
        <p style={{ color: 'var(--muted)', fontSize: 13, margin: 0 }}>
          Каждая новая тема относится к кластеру по смыслу, проверяется на дубли (каннибализацию)
          и получает кандидатов внутренней перелинковки из своего кластера.
        </p>
      </div>

      {s.ok && <NewTopicForm />}

      {!s.ok ? (
        <div style={{ padding: 14, border: '1px solid var(--bor2)', borderRadius: 10, fontSize: 13 }}>seo недоступна: {s.error}</div>
      ) : s.topics.length === 0 ? (
        <div style={{ padding: 20, border: '1px dashed var(--bor2)', borderRadius: 10, textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>
          Тем пока нет. Создай первую выше — она сразу попадёт в нужный кластер.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {ordered.map(([cluster, items]) => (
            <div key={cluster} style={{ border: '1px solid var(--bor)', borderRadius: 10, overflow: 'hidden' }}>
              <div style={{ padding: '10px 14px', background: 'var(--surf2)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <b style={{ fontSize: 13 }}>{cluster}</b>
                <span style={{ fontSize: 12, color: 'var(--muted)' }}>{items.length}</span>
              </div>
              <div style={{ padding: '8px 14px', fontSize: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
                {items.map((t) => (
                  <div key={t.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, color: 'var(--muted)' }}>
                    <span style={{ color: 'var(--text)' }}>{t.title}</span>
                    <span style={{ whiteSpace: 'nowrap' }}>
                      {t.intent ? `${t.intent} · ` : ''}
                      <span style={{ color: t.status === 'rejected_duplicate' ? 'var(--red)' : 'var(--muted)' }}>{STATUS_RU[t.status] || t.status}</span>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
