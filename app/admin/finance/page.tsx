import Link from 'next/link'
import { viewer } from '@/lib/auth/viewer'
import { formatMinor, formatMinorPlain, toRubEquivalent, type Currency } from '@/lib/finance/money'
import {
  balances, currentRate, financeAccess, listAccounts, listCategories,
  listCounterparties, listTransactions, periodTotals, KIND_NAMES, type TxRow,
} from '@/lib/finance/service'
import { AddOperation } from './AddOperation'
import { ReverseForm } from './ReverseForm'

export const dynamic = 'force-dynamic'

/**
 * Обзор финансов: где сколько денег, что было за месяц, лента операций.
 *
 * Экран отвечает на три вопроса в порядке их важности: сколько есть сейчас,
 * сколько пришло и ушло за месяц, и что именно двигалось. Остатки берутся из
 * журнала движений, а не из отдельного хранимого числа.
 */
export default async function FinancePage() {
  const { user, profile } = await viewer()
  const level = await financeAccess(user?.id)
  const accounts = await listAccounts()

  // Учёт ещё не начат. Пускать сюда может только администратор CRM — и только
  // пока доступов не выдано никому: дальше право раздаётся изнутри модуля.
  if (!accounts.length) {
    const canStart = level === 'owner' || profile?.role === 'admin'
    return (
      <div className="main">
        <div className="topbar"><div className="pt">Финансы</div></div>
        <div className="cnt">
          <Empty
            title="Учёт ещё не начат"
            text="Нужно завести счета и указать остатки на момент старта. Всё, что было раньше этого момента, считается уже вошедшим в начальный остаток и заново не вносится."
            action={canStart ? { href: '/admin/finance/setup', label: 'Начать учёт' } : undefined}
            note={canStart ? undefined : 'Доступа к финансам у вас нет — его выдаёт владелец модуля.'}
          />
        </div>
      </div>
    )
  }

  if (!level) {
    return (
      <div className="main">
        <div className="topbar"><div className="pt">Финансы</div></div>
        <div className="cnt">
          <Empty
            title="Нет доступа к финансам"
            text="Доступ к CRM сам по себе прав на деньги не даёт. Попросите владельца модуля выдать доступ."
          />
        </div>
      </div>
    )
  }

  const monthStart = new Date()
  monthStart.setDate(1)
  monthStart.setHours(0, 0, 0, 0)

  const [bal, totals, rate, txs, categories, counterparties] = await Promise.all([
    balances(),
    periodTotals(monthStart.toISOString(), new Date().toISOString()),
    currentRate(),
    listTransactions({ from: monthStart.toISOString(), limit: 200 }),
    listCategories(),
    listCounterparties(),
  ])

  const hasUsd = bal.some((b) => b.currency === 'USD' && b.balance_minor !== 0)
  const rubTotal = bal.reduce((sum, b) => {
    const eq = toRubEquivalent(b.balance_minor, b.currency, rate?.rub_per_usd ?? null)
    return eq === null ? sum : sum + eq
  }, 0)
  // Без курса рублёвый итог неполон — так и пишем. Считать неизвестный курс
  // нулём значит показать, что денег меньше, чем есть.
  const totalIncomplete = hasUsd && !rate

  const byDay = groupByDay(txs)

  return (
    <div className="main">
      <div className="topbar">
        <div className="pt">Финансы</div>
        <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
          <span style={{ fontSize: 12, color: 'var(--muted)' }}>
            {/* Это оценка, а не деньги: от движения курса на счетах ничего не
                прибавляется и не убывает. Поэтому «≈» и видимая дата курса. */}
            {totalIncomplete
              ? 'общий итог неполон: курс неизвестен'
              : hasUsd && rate
                ? `≈ ${formatMinor(rubTotal, 'RUB')} · курс ${rate.rub_per_usd} от ${new Date(rate.rate_date).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}`
                : `всего ${formatMinor(rubTotal, 'RUB')}`}
          </span>
          <Link href="/admin/finance/setup" className="btn-s" style={{ padding: '7px 12px', fontSize: 12 }}>
            Настройки
          </Link>
        </div>
      </div>

      <div className="cnt">
        {/* Кошельки */}
        <div className="kg" style={{ gridTemplateColumns: `repeat(auto-fit, minmax(200px, 1fr))` }}>
          {bal.map((b) => (
            <div key={b.id} className="kc">
              <div className="kl">{b.name}</div>
              <div className={`kv ${b.balance_minor < 0 ? 'r' : ''}`} style={{ fontSize: 24 }}>
                {formatMinor(b.balance_minor, b.currency)}
              </div>
              <div className="ks" style={{ marginTop: 6 }}>
                {b.movements === 0
                  ? 'операций ещё не было'
                  : `${b.movements} ${plural(b.movements, 'движение', 'движения', 'движений')} с начала учёта`}
              </div>
            </div>
          ))}
        </div>

        {/* Месяц */}
        <div className="kg" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}>
          {(['RUB', 'USD'] as Currency[])
            .filter((c) => totals[c].income || totals[c].expense || bal.some((b) => b.currency === c))
            .map((c) => (
              <div key={c} className="kc">
                <div className="kl">{monthName()} · {c === 'RUB' ? 'рубли' : 'доллары'}</div>
                <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginTop: 4 }}>
                  <Figure label="поступило" value={formatMinorPlain(totals[c].income)} tone="g" />
                  <Figure label="потрачено" value={formatMinorPlain(totals[c].expense)} tone="r" />
                  <Figure label="итого" value={formatMinorPlain(totals[c].net)} tone={totals[c].net < 0 ? 'r' : ''} />
                </div>
                <div className="ks" style={{ marginTop: 8 }}>
                  переводы между своими счетами в эти цифры не входят
                </div>
              </div>
            ))}
        </div>

        <div style={{ margin: '4px 0 14px' }}>
          <AddOperation
            accounts={bal.map((b) => ({ id: b.id, name: `${b.name} · ${b.currency}` }))}
            categories={categories.map((c: any) => ({ id: c.id, name: c.name }))}
            counterparties={counterparties.map((c: any) => ({ id: c.id, name: c.name }))}
          />
        </div>

        {/* Лента */}
        {!txs.length ? (
          <Empty
            title="В этом месяце операций ещё нет"
            text="Внесите первую — кнопкой выше или сообщением боту, когда он будет подключён."
          />
        ) : (
          byDay.map(([day, rows]) => (
            <div key={day} style={{ marginBottom: 18 }}>
              <div style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
                padding: '0 2px 8px', borderBottom: '1px solid var(--bor)', marginBottom: 8,
              }}>
                <span style={{ fontWeight: 700, fontSize: 13 }}>{dayLabel(day)}</span>
                <span style={{ fontSize: 12, color: 'var(--muted)' }}>{dayTotals(rows)}</span>
              </div>
              {rows.map((t) => <Row key={t.id} tx={t} />)}
            </div>
          ))
        )}
      </div>
    </div>
  )
}

/* ── Кусочки экрана ───────────────────────────────────────────────────────── */

function Figure({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div>
      <div className={`kv ${tone ?? ''}`} style={{ fontSize: 17 }}>{value}</div>
      <div className="ks">{label}</div>
    </div>
  )
}

function Row({ tx }: { tx: TxRow }) {
  const reversed = tx.status === 'reversed'
  const title = tx.counterparty?.name || tx.client?.name || tx.category?.name || KIND_NAMES[tx.kind]
  const subtitle = [
    tx.category?.name && tx.category.name !== title ? tx.category.name : null,
    tx.note,
    tx.origin === 'telegram' ? 'из телеграма' : null,
  ].filter(Boolean).join(' · ')

  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
      gap: 12, padding: '9px 2px', opacity: reversed ? 0.45 : 1,
    }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 600, textDecoration: reversed ? 'line-through' : 'none' }}>
          {title}
        </div>
        <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 2 }}>
          {subtitle || KIND_NAMES[tx.kind]}
          {reversed && ' · отменена'}
        </div>
      </div>

      <div style={{ textAlign: 'right', flexShrink: 0 }}>
        {tx.movements.map((m, i) => (
          <div key={i} style={{
            // Приход зелёным, расход красным — как в подтверждениях бота.
            // Одинаковый цвет у всех сумм заставлял вчитываться в подпись.
            fontSize: 14, fontWeight: 700,
            color: m.amount_minor > 0 ? 'var(--green)' : 'var(--red)',
          }}>
            {formatMinor(m.amount_minor, m.currency, { sign: m.amount_minor > 0 })}
          </div>
        ))}
        {/* Отмена — не удаление: создаются обратные движения, а исходная
            операция остаётся видимой. Поэтому спрашиваем причину. */}
        {!reversed && <ReverseForm transactionId={tx.id} />}
      </div>
    </div>
  )
}

function Empty({ title, text, action, note }: {
  title: string; text: string; action?: { href: string; label: string }; note?: string
}) {
  return (
    <div style={{
      border: '1px dashed var(--bor2)', borderRadius: 14, padding: '28px 24px',
      textAlign: 'center', color: 'var(--muted)',
    }}>
      <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)', marginBottom: 6 }}>{title}</div>
      <div style={{ fontSize: 13, lineHeight: 1.6, maxWidth: 520, margin: '0 auto' }}>{text}</div>
      {action && (
        <Link href={action.href} className="btn-p" style={{ display: 'inline-block', marginTop: 14, padding: '9px 18px', fontSize: 13 }}>
          {action.label}
        </Link>
      )}
      {note && <div style={{ fontSize: 12, marginTop: 10 }}>{note}</div>}
    </div>
  )
}

/* ── Мелочи ───────────────────────────────────────────────────────────────── */

function groupByDay(txs: TxRow[]): [string, TxRow[]][] {
  const map = new Map<string, TxRow[]>()
  for (const t of txs) {
    const day = t.occurred_at.slice(0, 10)
    const list = map.get(day) ?? []
    list.push(t)
    map.set(day, list)
  }
  return [...map.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1))
}

function dayLabel(day: string): string {
  const today = new Date().toISOString().slice(0, 10)
  const yesterday = new Date(Date.now() - 86400_000).toISOString().slice(0, 10)
  if (day === today) return 'Сегодня'
  if (day === yesterday) return 'Вчера'
  return new Date(`${day}T12:00:00Z`).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })
}

/** Итог дня по валютам: смешивать рубли с долларами в одно число нельзя. */
function dayTotals(rows: TxRow[]): string {
  const sums: Record<string, number> = {}
  for (const t of rows) {
    if (t.status === 'reversed' || t.kind === 'transfer') continue
    for (const m of t.movements) sums[m.currency] = (sums[m.currency] ?? 0) + m.amount_minor
  }
  const parts = Object.entries(sums)
    .filter(([, v]) => v !== 0)
    .map(([c, v]) => formatMinor(v, c as Currency, { sign: v > 0 }))
  return parts.join(' · ')
}

function monthName(): string {
  return new Date().toLocaleDateString('ru-RU', { month: 'long' })
}

function plural(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10
  const mod100 = n % 100
  if (mod10 === 1 && mod100 !== 11) return one
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return few
  return many
}
