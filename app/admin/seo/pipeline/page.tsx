import { createAdminClient } from '@/lib/supabase/server'
import { queueHealth, laneIsStale, laneNote, type LaneHealth } from '@/lib/seo/health'

export const dynamic = 'force-dynamic'

/**
 * Состояние конвейера.
 *
 * Экран отвечает на один вопрос: работает ли машина прямо сейчас и где она
 * встала. Главный показатель здесь — не глубина очереди, а возраст самой старой
 * ждущей задачи: десять задач, разобранных за минуту, и одна, висящая третьи
 * сутки, дают одинаковую глубину, но первое норма, а второе голодание.
 */
export default async function PipelinePage() {
  const seo = (await createAdminClient()).schema('seo')

  let health
  try {
    health = await queueHealth(seo)
  } catch (e: any) {
    return (
      <div className="card" style={{ padding: 16 }}>
        <div style={{ color: 'var(--red)' }}>Очередь не прочиталась: {String(e?.message ?? e)}</div>
      </div>
    )
  }

  const errRate = (l: LaneHealth) => {
    const total = l.done24h + l.failed24h
    return total === 0 ? null : Math.round((100 * l.failed24h) / total)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div>
        <h2 style={{ margin: '0 0 4px' }}>Конвейер</h2>
        <div style={{ fontSize: 12, color: 'var(--muted)' }}>
          Снято {new Date(health.takenAt).toLocaleTimeString('ru')}. Обновляется при открытии страницы.
        </div>
      </div>

      {/* ── Дорожки ─────────────────────────────────────────────────────── */}
      <section>
        <h3 style={{ fontSize: 13, margin: '0 0 8px', color: 'var(--muted)' }}>ДОРОЖКИ</h3>
        {health.lanes.length === 0 ? (
          <div style={{ fontSize: 13, color: 'var(--muted)' }}>Очередь пуста — ни одной живой задачи.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ textAlign: 'left', color: 'var(--muted)', fontSize: 11 }}>
                  <th style={{ padding: '6px 10px' }}>Дорожка</th>
                  <th style={{ padding: '6px 10px' }}>Ждут</th>
                  <th style={{ padding: '6px 10px' }}>В работе</th>
                  <th style={{ padding: '6px 10px' }}>Старейшая ждущая</th>
                  <th style={{ padding: '6px 10px' }}>Ошибок за сутки</th>
                  <th style={{ padding: '6px 10px' }}>Состояние</th>
                </tr>
              </thead>
              <tbody>
                {health.lanes.map((l) => {
                  const stale = laneIsStale(l)
                  const er = errRate(l)
                  return (
                    <tr key={l.lane} style={{ borderTop: '1px solid var(--bor)' }}>
                      <td style={{ padding: '8px 10px', fontWeight: 600 }}>{l.lane}</td>
                      <td style={{ padding: '8px 10px' }}>
                        {l.pending}
                        {l.pending > 0 && l.pendingDue < l.pending && (
                          <span style={{ color: 'var(--muted)' }}> · {l.pendingDue} по сроку</span>
                        )}
                      </td>
                      <td style={{ padding: '8px 10px' }}>{l.running}{l.waiting > 0 && <span style={{ color: 'var(--muted)' }}> · {l.waiting} ждут сборки</span>}</td>
                      <td style={{ padding: '8px 10px', color: stale ? 'var(--red)' : undefined, fontWeight: stale ? 700 : undefined }}>
                        {l.oldestPendingMin == null ? '—' : formatAge(l.oldestPendingMin)}
                      </td>
                      <td style={{ padding: '8px 10px', color: er != null && er > 20 ? 'var(--red)' : undefined }}>
                        {er == null ? '—' : `${er}%`}
                        {l.failed24h > 0 && <span style={{ color: 'var(--muted)' }}> ({l.failed24h} из {l.done24h + l.failed24h})</span>}
                      </td>
                      <td style={{ padding: '8px 10px', color: stale ? 'var(--red)' : 'var(--muted)' }}>{laneNote(l)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ── Исполнители ─────────────────────────────────────────────────── */}
      <section>
        <h3 style={{ fontSize: 13, margin: '0 0 8px', color: 'var(--muted)' }}>ИСПОЛНИТЕЛИ</h3>
        {health.workers.length === 0 ? (
          <div style={{ fontSize: 13, color: 'var(--muted)' }}>
            Сейчас никто не держит задач. Это норма, когда очередь пуста, и повод посмотреть,
            если выше кто-то ждёт дольше срока.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {health.workers.map((w) => (
              <div key={w.worker} style={{ fontSize: 13, display: 'flex', gap: 12 }}>
                <span style={{ fontWeight: 600, minWidth: 180 }}>{w.worker}</span>
                <span style={{ color: 'var(--muted)' }}>задач: {w.jobs}</span>
                <span style={{ color: 'var(--muted)' }}>взял {formatAge(w.lastSeenMin)} назад</span>
                <span style={{ color: w.heartbeatFreshMin == null ? 'var(--muted)' : w.heartbeatFreshMin > 5 ? 'var(--red)' : 'var(--green)' }}>
                  {w.heartbeatFreshMin == null ? 'сердцебиение неизвестно' : `сердце ${formatAge(w.heartbeatFreshMin)} назад`}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── Бюджет ──────────────────────────────────────────────────────── */}
      <section>
        <h3 style={{ fontSize: 13, margin: '0 0 8px', color: 'var(--muted)' }}>БЮДЖЕТ</h3>
        {health.budget == null ? (
          <div style={{ fontSize: 13, color: 'var(--muted)' }}>
            Учёт расходов ещё не включён — миграция не применена. Показывать ноль здесь было бы
            неправдой: это не «ничего не потрачено», а «не измеряется».
          </div>
        ) : (
          <div style={{ display: 'flex', gap: 24 }}>
            {health.budget.map((b) => (
              <div key={b.scope}>
                <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase' }}>
                  {b.scope.startsWith('day') ? 'Сутки' : 'Месяц'}
                </div>
                <div style={{ fontSize: 22, fontWeight: 700, color: b.left <= 0 ? 'var(--red)' : undefined }}>
                  ${b.left.toFixed(2)}
                </div>
                <div style={{ fontSize: 11, color: 'var(--muted)' }}>
                  осталось из ${b.limit.toFixed(2)}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── Чего не видно ───────────────────────────────────────────────── */}
      {health.gaps.length > 0 && (
        <section>
          <h3 style={{ fontSize: 13, margin: '0 0 8px', color: 'var(--muted)' }}>ЧЕГО ПОКА НЕ ВИДНО</h3>
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: 'var(--muted)' }}>
            {health.gaps.map((g) => <li key={g} style={{ marginBottom: 4 }}>{g}</li>)}
          </ul>
        </section>
      )}
    </div>
  )
}

function formatAge(min: number): string {
  if (min < 60) return `${min} мин`
  if (min < 24 * 60) return `${Math.floor(min / 60)} ч ${min % 60} мин`
  const d = Math.floor(min / (24 * 60))
  return `${d} сут ${Math.floor((min % (24 * 60)) / 60)} ч`
}
