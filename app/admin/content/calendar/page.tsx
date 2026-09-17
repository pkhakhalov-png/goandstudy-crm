import { createAdminClient } from '@/lib/supabase/server'
import { ru } from '@/lib/content/overview'
import { Пусто } from '../Bits'

export const dynamic = 'force-dynamic'

/**
 * Календарь: две недели вперёд и неделя назад.
 *
 * Пустой день здесь — не ошибка. «Нет качественного материала — слот
 * пропускается», и пустая клетка честнее, чем клетка, заполненная вчерашним.
 */
export default async function CalendarPage() {
  const content = (await createAdminClient()).schema('content' as any)

  const from = new Date(Date.now() - 7 * 86400_000)
  const to = new Date(Date.now() + 14 * 86400_000)

  const { data: pubs, error } = await content
    .from('publications')
    .select('id, channel_id, slot_day, scheduled_at, status')
    .gte('scheduled_at', from.toISOString()).lte('scheduled_at', to.toISOString())
    .order('scheduled_at')

  if (error) return <Пусто что="Календарь не прочитался" почему={error.message} />

  const { data: chans } = await content.from('channels').select('id, title, account_external_id, platform, mode')

  if (!chans?.length) {
    return (
      <>
        <h2 style={{ margin: '0 0 12px' }}>Календарь</h2>
        <Пусто что="Календарь пуст, потому что нет каналов"
          почему="Слот принадлежит каналу: без канала нет ни слотов, ни темпа, ни зоны, в которой считается день." />
      </>
    )
  }

  const days: string[] = []
  for (let d = new Date(from); d <= to; d = new Date(d.getTime() + 86400_000)) {
    days.push(d.toISOString().slice(0, 10))
  }
  const сегодня = new Date().toISOString().slice(0, 10)

  return (
    <>
      <h2 style={{ margin: '0 0 4px' }}>Календарь</h2>
      <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 12 }}>
        Неделя назад и две вперёд. Пустая клетка — это пропущенный слот, а не потерянный:
        заполнять план устаревшим материалом запрещено.
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr>
              <th style={{ padding: '6px 10px', textAlign: 'left', color: 'var(--muted)', fontSize: 11 }}>Канал</th>
              {days.map((d) => (
                <th key={d} style={{
                  padding: '6px 6px', color: d === сегодня ? 'var(--purple)' : 'var(--muted)',
                  fontSize: 10, fontWeight: d === сегодня ? 700 : 400, whiteSpace: 'nowrap',
                }}>
                  {d.slice(8)}.{d.slice(5, 7)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(chans as any[]).map((c) => (
              <tr key={c.id} style={{ borderTop: '1px solid var(--bor)' }}>
                <td style={{ padding: '8px 10px', whiteSpace: 'nowrap' }}>
                  {c.title ?? c.account_external_id}
                  <div style={{ fontSize: 10, color: 'var(--muted)' }}>{c.platform} · {ru(c.mode)}</div>
                </td>
                {days.map((d) => {
                  const cell = (pubs ?? []).filter((p: any) => p.channel_id === c.id && p.slot_day === d)
                  return (
                    <td key={d} style={{ padding: 3, textAlign: 'center' }}>
                      {cell.length === 0 ? (
                        <span style={{ color: 'var(--bor2)' }}>·</span>
                      ) : cell.map((p: any) => (
                        <div key={p.id} title={`#${p.id} ${ru(p.status)}`} style={{
                          width: 18, height: 18, borderRadius: 5, margin: '0 auto',
                          background: p.status === 'published' ? 'var(--green)'
                            : p.status === 'failed' ? 'var(--red)'
                            : p.status === 'superseded' || p.status === 'cancelled' ? 'var(--bor2)'
                            : 'var(--purple)',
                          opacity: p.status === 'scheduled' ? 0.55 : 1,
                        }} />
                      ))}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={{ display: 'flex', gap: 14, fontSize: 11, color: 'var(--muted)', marginTop: 12, flexWrap: 'wrap' }}>
        <span><b style={{ color: 'var(--purple)' }}>■</b> запланирован</span>
        <span><b style={{ color: 'var(--green)' }}>■</b> вышел</span>
        <span><b style={{ color: 'var(--red)' }}>■</b> не ушёл</span>
        <span><b style={{ color: 'var(--bor2)' }}>■</b> снят</span>
        <span><b style={{ color: 'var(--bor2)' }}>·</b> слот пуст</span>
      </div>
    </>
  )
}
