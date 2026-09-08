import { createAdminClient } from '@/lib/supabase/server'

// Обзор M0: показывает, что схема seo применена и очередь читается.
type Status =
  | { ok: true; settingsCount: number; jobs: Record<string, number>; jobsTotal: number }
  | { ok: false; error: string }

async function loadStatus(): Promise<Status> {
  try {
    const admin = await createAdminClient()
    const seo = admin.schema('seo')
    const [{ data: settings, error: e1 }, { data: jobs }] = await Promise.all([
      seo.from('settings').select('key'),
      seo.from('jobs').select('status'),
    ])
    if (e1) return { ok: false, error: e1.message }
    const byStatus: Record<string, number> = {}
    for (const j of (jobs ?? []) as any[]) byStatus[j.status] = (byStatus[j.status] || 0) + 1
    return { ok: true, settingsCount: settings?.length ?? 0, jobs: byStatus, jobsTotal: jobs?.length ?? 0 }
  } catch (e: any) {
    return { ok: false, error: e?.message ?? 'schema seo недоступна' }
  }
}

export default async function SeoOverview() {
  const s = await loadStatus()
  return (
    <div style={{ maxWidth: 900 }}>
      <h2 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 6px' }}>Обзор</h2>
      <p style={{ color: 'var(--muted)', fontSize: 13, marginBottom: 20 }}>
        Модуль органического контента. Этап <b>M0 — фундамент</b>: схема, очередь, воркер, каркас панели.
      </p>

      {!s.ok ? (
        <div style={{ padding: 16, border: '1px solid var(--bor2)', borderRadius: 12, background: 'rgba(201,125,0,.06)' }}>
          <div style={{ fontWeight: 700, color: 'var(--gold)', marginBottom: 6 }}>Схема <code>seo</code> ещё не применена</div>
          <div style={{ fontSize: 13, color: 'var(--muted)' }}>
            Примени миграции <code>001–004</code> через Supabase CLI (см. инструкцию M0). Ошибка: {s.error}
          </div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
          <div style={{ padding: 16, border: '1px solid var(--bor)', borderRadius: 12, background: 'var(--surf)' }}>
            <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase' }}>Схема seo</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--green)' }}>применена ✓</div>
            <div style={{ fontSize: 12, color: 'var(--muted)' }}>{s.settingsCount} настроек</div>
          </div>
          <div style={{ padding: 16, border: '1px solid var(--bor)', borderRadius: 12, background: 'var(--surf)' }}>
            <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase' }}>Очередь задач</div>
            <div style={{ fontSize: 22, fontWeight: 700 }}>{s.jobsTotal}</div>
            <div style={{ fontSize: 12, color: 'var(--muted)' }}>
              {Object.entries(s.jobs).map(([k, v]) => `${k}: ${v}`).join(' · ') || 'пусто'}
            </div>
          </div>
          <div style={{ padding: 16, border: '1px solid var(--bor)', borderRadius: 12, background: 'var(--surf)' }}>
            <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase' }}>Планировщик</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--muted)' }}>вкл. вручную</div>
            <div style={{ fontSize: 12, color: 'var(--muted)' }}>select seo.schedule_all()</div>
          </div>
        </div>
      )}

      <div style={{ marginTop: 24, fontSize: 12, color: 'var(--muted)' }}>
        Следующие этапы: M1 Инвентарь · M2 GSC · M3 Атрибуция · M4 WordPress Bridge — подключаются по мере передачи доступов к сайту.
      </div>
    </div>
  )
}
