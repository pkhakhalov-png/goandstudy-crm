import { ru } from '@/lib/content/overview'

/**
 * Мелочи, которые повторяются на каждом экране раздела.
 *
 * Главная из них — `Пусто`. Экран, показывающий ноль там, где на самом деле
 * «нечего показывать, потому что не подключено», врёт аккуратными цифрами:
 * ноль читается как результат работы, а это отсутствие работы.
 */
export function Пусто({ что, почему }: { что: string; почему: string }) {
  return (
    <div style={{
      padding: '18px 20px', border: '1px dashed var(--bor2)', borderRadius: 10,
      background: 'var(--surf2)', fontSize: 13,
    }}>
      <div style={{ fontWeight: 600, marginBottom: 4 }}>{что}</div>
      <div style={{ color: 'var(--muted)', lineHeight: 1.5 }}>{почему}</div>
    </div>
  )
}

export function Число({ label, value, note, tone }: {
  label: string; value: string | number; note?: string | null; tone?: 'обычный' | 'важный' | 'тревожный'
}) {
  const color = tone === 'тревожный' ? 'var(--red)' : tone === 'важный' ? 'var(--purple)' : 'var(--text)'
  return (
    <div style={{ padding: '12px 14px', border: '1px solid var(--bor2)', borderRadius: 10, background: 'var(--surf2)', minWidth: 150 }}>
      <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 600, color, lineHeight: 1.3 }}>{value}</div>
      {note ? <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>{note}</div> : null}
    </div>
  )
}

export function Статусы({ counts }: { counts: Record<string, number> }) {
  const entries = Object.entries(counts)
  if (!entries.length) return <span style={{ fontSize: 12, color: 'var(--muted)' }}>—</span>
  return (
    <span style={{ display: 'inline-flex', gap: 6, flexWrap: 'wrap' }}>
      {entries.map(([k, n]) => (
        <span key={k} style={{
          fontSize: 11, padding: '2px 8px', borderRadius: 6,
          border: '1px solid var(--bor2)', background: 'var(--surf)', color: 'var(--muted)',
        }}>
          {ru(k)} · {n}
        </span>
      ))}
    </span>
  )
}

export function Пробелы({ items }: { items: string[] }) {
  if (!items.length) return null
  return (
    <section>
      <h3 style={{ fontSize: 13, margin: '0 0 8px', color: 'var(--muted)' }}>ЧЕГО НЕ ХВАТАЕТ</h3>
      <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, lineHeight: 1.7, color: 'var(--muted)' }}>
        {items.map((g, i) => <li key={i}>{g}</li>)}
      </ul>
    </section>
  )
}

/** Таблица с заголовками и строками — чтобы не переписывать разметку на каждом экране. */
export function Таблица({ columns, rows }: { columns: string[]; rows: React.ReactNode[][] }) {
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr style={{ textAlign: 'left', color: 'var(--muted)', fontSize: 11 }}>
            {columns.map((c) => <th key={c} style={{ padding: '6px 10px', whiteSpace: 'nowrap' }}>{c}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} style={{ borderTop: '1px solid var(--bor)' }}>
              {r.map((cell, j) => <td key={j} style={{ padding: '8px 10px', verticalAlign: 'top' }}>{cell}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
