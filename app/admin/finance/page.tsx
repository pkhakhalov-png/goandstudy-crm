import Link from 'next/link'
import { viewer } from '@/lib/auth/viewer'
import { formatMinor, formatMinorPlain, toRubEquivalent, type Currency } from '@/lib/finance/money'
import {
  balances, currentRate, dailyFlow, financeAccess, listAccounts, listCategories,
  listCounterparties, listTransactions, periodTotals, KIND_NAMES, type TxRow,
} from '@/lib/finance/service'
import { AddOperation } from './AddOperation'
import { ReverseForm } from './ReverseForm'
import { CategoryPicker } from './CategoryPicker'
import { FlowChart } from './FlowChart'

export const dynamic = 'force-dynamic'

/**
 * Обзор финансов: где сколько денег, что было за месяц, лента операций.
 *
 * Экран отвечает на три вопроса в порядке их важности: сколько есть сейчас,
 * сколько пришло и ушло за месяц, и что именно двигалось. Остатки берутся из
 * журнала движений, а не из отдельного хранимого числа.
 */
export default async function FinancePage(
  { searchParams }: { searchParams: Promise<{ period?: string }> },
) {
  const { period } = await searchParams
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

  // Экран показывал только текущий месяц и грузил ленту от его первого числа.
  // Первого октября это значило один день: все 98 сентябрьских операций были на
  // месте, но увидеть их на экране было нельзя. Период теперь выбирается, а не
  // подразумевается.
  const окно = разобратьПериод(period)

  const [bal, totals, rate, txs, categories, counterparties, поток] = await Promise.all([
    balances(),
    periodTotals(окно.от.toISOString(), окно.до.toISOString()),
    currentRate(),
    // Лента за всё время длиннее месячной — предел поднят соответственно.
    listTransactions({ from: окно.от.toISOString(), to: окно.до.toISOString(), limit: окно.всёВремя ? 1000 : 300 }),
    listCategories(),
    listCounterparties(),
    dailyFlow(окно.от.toISOString(), окно.до.toISOString()),
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
                <div className="kl">{окно.название} · {c === 'RUB' ? 'рубли' : 'доллары'}</div>
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

        <Период окно={окно} />

        <FlowChart данные={поток} />

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
            title={окно.всёВремя ? 'Операций ещё нет' : `За ${окно.название} операций нет`}
            text={окно.всёВремя
              ? 'Внесите первую — кнопкой выше или сообщением боту.'
              : 'Выберите другой период выше — возможно, операции были раньше.'}
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
              {rows.map((t) => <Row key={t.id} tx={t} categories={categories} />)}
            </div>
          ))
        )}
      </div>
    </div>
  )
}


/* ── Период ───────────────────────────────────────────────────────────────── */

const МЕСЯЦЫ = ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь',
                'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь']

type Окно = { от: Date; до: Date; название: string; ключ: string; всёВремя: boolean }

/**
 * Какой период показываем.
 *
 * `period` в адресе: `YYYY-MM` для месяца, `all` для всего времени. Пусто —
 * текущий месяц, как было раньше.
 *
 * Нижняя граница «всего времени» взята заведомо раньше начала учёта, а не
 * вычисляется из данных: лишний запрос ради даты, которая всё равно статична,
 * того не стоит.
 */
function разобратьПериод(period?: string): Окно {
  if (period === 'all') {
    return {
      от: new Date('2020-01-01T00:00:00Z'),
      до: конецДня(new Date()),
      название: 'всё время', ключ: 'all', всёВремя: true,
    }
  }
  const m = /^(\d{4})-(\d{2})$/.exec(period ?? '')
  const сейчас = new Date()
  const год = m ? Number(m[1]) : сейчас.getFullYear()
  const месяц = m ? Number(m[2]) - 1 : сейчас.getMonth()
  const от = new Date(год, месяц, 1, 0, 0, 0, 0)
  const до = new Date(год, месяц + 1, 0, 23, 59, 59, 999)
  return {
    от, до,
    название: `${МЕСЯЦЫ[месяц]}${год === сейчас.getFullYear() ? '' : ` ${год}`}`,
    ключ: `${год}-${String(месяц + 1).padStart(2, '0')}`,
    всёВремя: false,
  }
}

function конецДня(d: Date): Date {
  const x = new Date(d); x.setHours(23, 59, 59, 999); return x
}

function сдвинутьМесяц(ключ: string, шаг: number): string {
  const [г, м] = ключ.split('-').map(Number)
  const d = new Date(г, м - 1 + шаг, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

/** Переключатель периода: предыдущий месяц, текущий выбор, следующий, всё время. */
function Период({ окно }: { окно: Окно }) {
  const сейчас = new Date()
  const текущий = `${сейчас.getFullYear()}-${String(сейчас.getMonth() + 1).padStart(2, '0')}`
  // Вперёд дальше текущего месяца не пускаем: операций из будущего не бывает,
  // а пустой экран с кнопкой «дальше» читается как поломка.
  const след = окно.всёВремя ? null : сдвинутьМесяц(окно.ключ, 1)
  const можноВперёд = след !== null && след <= текущий

  const кнопка = (href: string, текст: string, активна: boolean) => (
    <Link href={href} className="btn-s" style={{
      padding: '7px 12px', fontSize: 12, textDecoration: 'none',
      ...(активна ? { background: 'var(--purple)', color: '#fff', borderColor: 'transparent' } : {}),
    }}>{текст}</Link>
  )

  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', margin: '0 0 14px' }}>
      {окно.всёВремя
        ? кнопка(`/admin/finance?period=${текущий}`, '← к месяцам', false)
        : кнопка(`/admin/finance?period=${сдвинутьМесяц(окно.ключ, -1)}`, '←', false)}
      <span style={{ fontWeight: 700, fontSize: 13, minWidth: 92, textAlign: 'center' }}>
        {окно.название}
      </span>
      {окно.всёВремя
        ? <span style={{ width: 34 }} />
        : можноВперёд
          ? кнопка(`/admin/finance?period=${след}`, '→', false)
          : <span style={{ width: 34 }} />}
      <span style={{ flex: 1 }} />
      {кнопка('/admin/finance?period=all', 'Всё время', окно.всёВремя)}
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

function Row({ tx, categories }: { tx: TxRow; categories: { id: string; name: string }[] }) {
  const reversed = tx.status === 'reversed'
  const title = tx.counterparty?.name || tx.client?.name || tx.category?.name || KIND_NAMES[tx.kind]
  // Категорию из подписи убрали: теперь она стоит отдельным выбором ниже, и
  // дублировать её текстом значит показать одно и то же дважды.
  const subtitle = [
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
        {!reversed && (
          <div style={{ marginTop: 5 }}>
            <CategoryPicker txId={tx.id} current={tx.category_id ?? null} categories={categories} />
          </div>
        )}
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

function plural(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10
  const mod100 = n % 100
  if (mod10 === 1 && mod100 !== 11) return one
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return few
  return many
}
