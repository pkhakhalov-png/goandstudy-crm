import { createAdminClient } from '@/lib/supabase/server'
import { buildResultReport, type Metric, type ResultRow } from '@/lib/seo/result-report'

export const dynamic = 'force-dynamic'

/**
 * Отчёт «Результат».
 *
 * Отвечает на один вопрос: что принесли переходы. И на три вопроса отвечать
 * отказывается, когда нечем, — это здесь важнее полноты таблицы.
 */
export default async function ResultPage({
  searchParams,
}: { searchParams: Promise<{ days?: string }> }) {
  const sp = await searchParams
  const days = Math.min(365, Math.max(1, Number(sp.days) || 14))

  const sb = await createAdminClient()
  const to = new Date().toISOString()
  const from = new Date(Date.now() - days * 864e5).toISOString()

  let report
  try {
    report = await buildResultReport(sb.schema('seo'), sb, from, to)
  } catch (e: any) {
    return <div className="card" style={{ padding: 16, color: 'var(--red)' }}>Отчёт не собрался: {String(e?.message ?? e)}</div>
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div>
        <h2 style={{ margin: '0 0 4px' }}>Результат</h2>
        <div style={{ fontSize: 12, color: 'var(--muted)' }}>
          {from.slice(0, 10)} — {to.slice(0, 10)} · снято {new Date(report.takenAt).toLocaleTimeString('ru')}
        </div>
        <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
          {[7, 14, 30, 90].map((d) => (
            <a key={d} href={`?days=${d}`}
               style={{
                 fontSize: 12, padding: '3px 10px', borderRadius: 6, textDecoration: 'none',
                 border: '1px solid var(--bor2)',
                 background: d === days ? 'var(--purple)' : 'transparent',
                 color: d === days ? '#fff' : 'var(--muted)',
               }}>{d} дн</a>
          ))}
        </div>
      </div>

      <Table title="ПО КАНАЛАМ" rows={report.byChannel} />
      <Table title="ПО СТРАНИЦАМ" rows={report.byPage.slice(0, 25)} />

      {/* Почему колонки нельзя складывать — объясняем прямо под таблицей, а не в
          документации: складывать их захочется именно здесь и именно сейчас. */}
      <div style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.6, maxWidth: 760 }}>
        <strong style={{ color: 'var(--text)' }}>Первое и последнее касание не складываются.</strong>{' '}
        Одна заявка — это одно первое касание и одно последнее, а не две заявки. Первое отвечает,
        что привело интерес; последнее — что привело к действию. Сумма колонок смысла не имеет.
      </div>

      {report.gaps.length > 0 && (
        <section>
          <h3 style={{ fontSize: 13, margin: '0 0 8px', color: 'var(--muted)' }}>ЧЕГО ОТЧЁТ НЕ ИЗМЕРЯЕТ</h3>
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: 'var(--muted)', lineHeight: 1.7 }}>
            {report.gaps.map((g) => <li key={g}>{g}</li>)}
          </ul>
        </section>
      )}
    </div>
  )
}

/** Неизмеримое показывается прочерком с подсказкой, а не нулём. */
function Cell({ m }: { m: Metric }) {
  if (m.kind === 'unavailable') {
    return <span title={m.why} style={{ color: 'var(--muted2)', cursor: 'help' }}>н/д</span>
  }
  return <span style={{ color: m.value === 0 ? 'var(--muted2)' : undefined }}>{m.value}</span>
}

function Table({ title, rows }: { title: string; rows: ResultRow[] }) {
  return (
    <section>
      <h3 style={{ fontSize: 13, margin: '0 0 8px', color: 'var(--muted)' }}>{title}</h3>
      {rows.length === 0 ? (
        <div style={{ fontSize: 13, color: 'var(--muted)' }}>За период данных нет.</div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ textAlign: 'left', color: 'var(--muted)', fontSize: 11 }}>
                <th style={{ padding: '6px 10px' }}></th>
                <th style={{ padding: '6px 10px', textAlign: 'right' }}>Переходы</th>
                <th style={{ padding: '6px 10px', textAlign: 'right' }}>Заявки · первое</th>
                <th style={{ padding: '6px 10px', textAlign: 'right' }}>Заявки · последнее</th>
                <th style={{ padding: '6px 10px', textAlign: 'right' }}>Консультации</th>
                <th style={{ padding: '6px 10px', textAlign: 'right' }}>Сделки</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.key} style={{ borderTop: '1px solid var(--bor)' }}>
                  <td style={{ padding: '8px 10px' }}>{r.label}</td>
                  <td style={{ padding: '8px 10px', textAlign: 'right' }}><Cell m={r.views} /></td>
                  <td style={{ padding: '8px 10px', textAlign: 'right' }}><Cell m={r.leadsFirst} /></td>
                  <td style={{ padding: '8px 10px', textAlign: 'right' }}><Cell m={r.leadsLast} /></td>
                  <td style={{ padding: '8px 10px', textAlign: 'right' }}><Cell m={r.consultations} /></td>
                  <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 600 }}><Cell m={r.deals} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
