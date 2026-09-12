import { createAdminClient } from '@/lib/supabase/server'
import Link from 'next/link'
import type { Movement, PositionsSnapshot } from '@/lib/seo/positions'

export const dynamic = 'force-dynamic'

export default async function PositionsPage({ searchParams }: { searchParams: Promise<{ poisk?: string }> }) {
  const poisk = (await searchParams).poisk === 'yandex' ? 'yandex' : 'google'
  const seo = (await createAdminClient()).schema('seo')

  if (poisk === 'yandex') {
    const [{ data: cur }, { data: old }] = await Promise.all([
      seo.from('settings').select('value').eq('key', 'yandex_snapshot').maybeSingle(),
      seo.from('settings').select('value').eq('key', 'yandex_snapshot_prev').maybeSingle(),
    ])
    return (
      <div>
        <Tabs active="yandex" />
        <YandexPositions now={cur?.value as any} before={old?.value as any} />
      </div>
    )
  }

  const { data } = await seo.from('settings').select('value').eq('key', 'positions_snapshot').maybeSingle()
  const snap = data?.value as PositionsSnapshot | undefined

  if (!snap) {
    return (
      <div>
        <Tabs active="google" />
        <Title />
        <div style={{ fontSize: 13, color: 'var(--muted)' }}>
          Снимок ещё не посчитан — подождите ночной проход воркера.
        </div>
      </div>
    )
  }

  const s = snap.summary

  return (
    <div>
      <Tabs active="google" />
      <Title window={`${fmt(snap.windowFrom)} — ${fmt(snap.windowTo)}`} prev={fmt(snap.prevFrom)} at={snap.computedAt} />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 18 }}>
        <Card label="Запросов в работе" value={s.tracked} sub={`${s.top10} в первой десятке`} />
        <Card label="Выросли" value={s.up} color="var(--green)" sub="на позицию и выше" />
        <Card label="Упали" value={s.down} color={s.down ? 'var(--red)' : undefined} sub="на позицию и ниже" />
        <Card label="Без движения" value={s.flat} sub={`из ${s.withHistory} с историей`} />
      </div>

      <Panel
        title={`Наши статьи · ${snap.ours.length}`}
        hint="Запросы, по которым показываются статьи, написанные конвейером. Пусто — значит статистики по ним ещё нет: Search Console отстаёт на два-три дня, а после выхода статьи нужно время, чтобы она начала показываться."
      >
        {snap.ours.length ? <Table rows={snap.ours} /> : <Empty>Данных пока нет.</Empty>}
      </Panel>

      <Panel
        title={`Поднялись · ${snap.up.length}`}
        hint="Сравниваются две недели подряд. Позиция взвешена по показам: запрос, который показался один раз, не двигает среднее."
        collapsed={snap.up.length > 12}
      >
        <Table rows={snap.up} />
      </Panel>

      <Panel
        title={`Опустились · ${snap.down.length}`}
        hint="Падение на три-четыре позиции внутри первой двадцатки обычно шум. Тревожно, когда страница уходит из первой десятки: там теряются клики, а не показы."
        collapsed={snap.down.length > 12}
      >
        <Table rows={snap.down} />
      </Panel>

      <Panel
        title={`На подступах · ${snap.striking.length}`}
        hint="Восьмое–двадцать пятое место, показы есть, кликов нет. Самое дешёвое место для работы: страница уже показывается, её нужно дотянуть, а не создавать заново."
      >
        <Table rows={snap.striking} />
      </Panel>

      <div style={{ fontSize: 11, color: 'var(--muted)', lineHeight: 1.6, maxWidth: 760, marginTop: 16 }}>
        <b style={{ color: 'var(--text)' }}>Чего эти цифры не показывают.</b> Позиция здесь — средняя
        по состоявшимся показам, а не место в выдаче прямо сейчас: Google считает её по тому, что
        видели люди. Запросы, по которым нас не показывали ни разу, сюда не попадают вовсе — и это
        отсутствие данных, а не нулевая позиция. Чтобы следить за позициями по произвольному списку
        запросов, включая те, где нас нет, нужен отдельный платный сервис.
      </div>
    </div>
  )
}

function Tabs({ active }: { active: 'google' | 'yandex' }) {
  return (
    <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
      {([['google', 'Google'], ['yandex', 'Яндекс']] as const).map(([key, label]) => (
        <Link key={key} href={`/admin/seo/positions?poisk=${key}`}
          style={{
            padding: '6px 16px', borderRadius: 8, fontSize: 13, textDecoration: 'none',
            border: `1px solid ${active === key ? 'var(--purple)' : 'var(--bor2)'}`,
            background: active === key ? 'rgba(177,94,204,.10)' : 'var(--surf2)',
            color: active === key ? 'var(--purple)' : 'var(--text)',
            fontWeight: active === key ? 700 : 400,
          }}>
          {label}
        </Link>
      ))}
    </div>
  )
}

type YaQuery = { query: string; impressions: number; clicks: number; position: number | null }

/**
 * Позиции в Яндексе.
 *
 * Движение считается не так, как у Google, и делать вид, что так же, нельзя.
 * Яндекс отдаёт только текущую неделю — истории у него не спросишь. Поэтому
 * сравниваем свой прошлый снимок с нынешним, и пока снимков меньше двух,
 * честно говорим, что сравнивать не с чем.
 */
function YandexPositions({ now, before }: { now: any; before: any }) {
  if (!now) {
    return <div style={{ fontSize: 13, color: 'var(--muted)' }}>
      Снимок ещё не собран — либо нет доступа к Вебмастеру, либо воркер не приходил.
    </div>
  }

  const queries: YaQuery[] = now.queries ?? []
  const prevByQuery = new Map<string, YaQuery>((before?.queries ?? []).map((q: YaQuery) => [q.query, q]))
  const hasHistory = prevByQuery.size > 0

  const withDelta = queries.map((q) => {
    const p = prevByQuery.get(q.query)
    const delta = p?.position != null && q.position != null ? p.position - q.position : null
    return { ...q, before: p?.position ?? null, delta }
  })

  const up = withDelta.filter((q) => (q.delta ?? 0) >= 1).sort((a, b) => (b.delta ?? 0) - (a.delta ?? 0))
  const down = withDelta.filter((q) => (q.delta ?? 0) <= -1).sort((a, b) => (a.delta ?? 0) - (b.delta ?? 0))
  const striking = withDelta
    .filter((q) => q.position != null && q.position >= 8 && q.position <= 25 && q.clicks === 0 && q.impressions >= 20)
    .sort((a, b) => b.impressions - a.impressions)
  const top10 = withDelta.filter((q) => q.position != null && q.position <= 10)

  return (
    <div>
      <div style={{ marginBottom: 14 }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 4px' }}>Позиции в Яндексе</h2>
        <p style={{ color: 'var(--muted)', fontSize: 13, margin: 0, maxWidth: 760, lineHeight: 1.55 }}>
          Данные Вебмастера за последнюю неделю.
          {now.computedAt && ` Снимок от ${new Date(now.computedAt).toLocaleString('ru')}.`}
          {hasHistory
            ? ` Сравнение со снимком от ${new Date(before.computedAt).toLocaleDateString('ru')}.`
            : ' Сравнивать пока не с чем: это первый снимок, движение появится через неделю.'}
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 18 }}>
        <Card label="Запросов" value={queries.length} sub={`${top10.length} в первой десятке`} />
        <Card label="Показов за неделю" value={now.totals?.impressions ?? 0} />
        <Card label="Кликов" value={now.totals?.clicks ?? 0}
          sub={now.totals?.impressions ? `CTR ${((now.totals.clicks / now.totals.impressions) * 100).toFixed(2)}%` : undefined} />
        <Card label="На подступах" value={striking.length} color={striking.length ? 'var(--purple)' : undefined}
          sub="8–25 место, кликов нет" />
      </div>

      {hasHistory && up.length > 0 && (
        <Panel title={`Поднялись · ${up.length}`} hint="Неделя против предыдущего снимка." collapsed={up.length > 12}>
          <YaTable rows={up} />
        </Panel>
      )}

      {hasHistory && down.length > 0 && (
        <Panel title={`Опустились · ${down.length}`} hint="Тревожно, когда запрос уходит из первой десятки: там теряются клики, а не показы." collapsed={down.length > 12}>
          <YaTable rows={down} />
        </Panel>
      )}

      <Panel
        title={`На подступах · ${striking.length}`}
        hint="Восьмое–двадцать пятое место, показы есть, кликов нет. Дотянуть дешевле, чем писать новое."
      >
        {striking.length ? <YaTable rows={striking} /> : <Empty>Таких запросов нет.</Empty>}
      </Panel>

      <Panel title={`Все запросы · ${queries.length}`} hint="" collapsed>
        <YaTable rows={withDelta.sort((a, b) => b.impressions - a.impressions)} />
      </Panel>

      <div style={{ fontSize: 11, color: 'var(--muted)', lineHeight: 1.6, maxWidth: 760, marginTop: 16 }}>
        <b style={{ color: 'var(--text)' }}>Чем это отличается от вкладки Google.</b> Там позиция
        считается по показам за выбранные дни, и история берётся из Search Console. Здесь истории нет:
        Яндекс отдаёт только последнюю неделю, поэтому движение мы считаем по собственным снимкам —
        первый появится через неделю после подключения. Запросы, по которым нас не показывали, сюда
        не попадают, как и у Google.
      </div>
    </div>
  )
}

function YaTable({ rows }: { rows: (YaQuery & { before?: number | null; delta?: number | null })[] }) {
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
      <thead>
        <tr style={{ color: 'var(--muted)', textAlign: 'left' }}>
          <th style={th}>Запрос</th>
          <th style={{ ...th, textAlign: 'right' }}>Позиция</th>
          <th style={{ ...th, textAlign: 'right' }}>Было</th>
          <th style={{ ...th, textAlign: 'right' }}>Движение</th>
          <th style={{ ...th, textAlign: 'right' }}>Показы</th>
          <th style={{ ...th, textAlign: 'right' }}>Клики</th>
        </tr>
      </thead>
      <tbody>
        {rows.slice(0, 120).map((q, i) => (
          <tr key={i} style={{ borderTop: '1px solid var(--bor)' }}>
            <td style={td}>{q.query}</td>
            <td style={{ ...td, textAlign: 'right', fontWeight: 700, color: (q.position ?? 99) <= 10 ? 'var(--green)' : 'var(--text)' }}>
              {q.position?.toFixed(1) ?? '—'}
            </td>
            <td style={{ ...td, textAlign: 'right', color: 'var(--muted)' }}>{q.before?.toFixed(1) ?? '—'}</td>
            <td style={{ ...td, textAlign: 'right', fontWeight: 600, color: q.delta == null ? 'var(--muted)' : q.delta > 0 ? 'var(--green)' : 'var(--red)' }}>
              {q.delta == null ? '—' : `${q.delta > 0 ? '↑' : '↓'} ${Math.abs(q.delta).toFixed(1)}`}
            </td>
            <td style={{ ...td, textAlign: 'right' }}>{q.impressions}</td>
            <td style={{ ...td, textAlign: 'right', fontWeight: q.clicks ? 700 : 400 }}>{q.clicks}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function Title({ window, prev, at }: { window?: string; prev?: string; at?: string }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <h2 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 4px' }}>Позиции</h2>
      <p style={{ color: 'var(--muted)', fontSize: 13, margin: 0, maxWidth: 760 }}>
        Куда движутся запросы: неделя {window ?? '—'} против предыдущей, с {prev ?? '—'}.
        {at && ` Посчитано ${new Date(at).toLocaleString('ru')}.`}
      </p>
    </div>
  )
}

function Table({ rows }: { rows: Movement[] }) {
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
      <thead>
        <tr style={{ color: 'var(--muted)', textAlign: 'left' }}>
          <th style={th}>Запрос</th>
          <th style={th}>Страница</th>
          <th style={{ ...th, textAlign: 'right' }}>Позиция</th>
          <th style={{ ...th, textAlign: 'right' }}>Было</th>
          <th style={{ ...th, textAlign: 'right' }}>Движение</th>
          <th style={{ ...th, textAlign: 'right' }}>Показы</th>
          <th style={{ ...th, textAlign: 'right' }}>Клики</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((m, i) => (
          <tr key={i} style={{ borderTop: '1px solid var(--bor)' }}>
            <td style={td}>{m.query}</td>
            <td style={{ ...td, color: 'var(--muted)' }}>
              <a href={`${m.url}/`} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--muted)', textDecoration: 'none' }}>
                {m.url.replace('https://goandstudy.com', '')}
              </a>
            </td>
            <td style={{ ...td, textAlign: 'right', fontWeight: 700, color: m.now <= 10 ? 'var(--green)' : 'var(--text)' }}>
              {m.now.toFixed(1)}
            </td>
            <td style={{ ...td, textAlign: 'right', color: 'var(--muted)' }}>
              {m.before === null ? '—' : m.before.toFixed(1)}
            </td>
            <td style={{ ...td, textAlign: 'right', fontWeight: 600, color: m.delta === null ? 'var(--muted)' : m.delta > 0 ? 'var(--green)' : m.delta < 0 ? 'var(--red)' : 'var(--muted)' }}>
              {m.delta === null ? 'новый' : `${m.delta > 0 ? '↑' : '↓'} ${Math.abs(m.delta).toFixed(1)}`}
            </td>
            <td style={{ ...td, textAlign: 'right' }}>
              {m.impressions}
              {m.impressionsBefore > 0 && (
                <span style={{ color: 'var(--muted)', fontSize: 11 }}> ← {m.impressionsBefore}</span>
              )}
            </td>
            <td style={{ ...td, textAlign: 'right', fontWeight: m.clicks ? 700 : 400 }}>{m.clicks}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function Panel({ title, hint, children, collapsed }: {
  title: string; hint?: string; children: React.ReactNode; collapsed?: boolean
}) {
  return (
    <div style={{ border: '1px solid var(--bor)', borderRadius: 12, overflow: 'hidden', marginBottom: 16 }}>
      <div style={{ padding: '10px 14px', background: 'var(--surf2)' }}>
        <div style={{ fontSize: 13, fontWeight: 700 }}>{title}</div>
        {hint && <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 3, lineHeight: 1.5, maxWidth: 760 }}>{hint}</div>}
      </div>
      {collapsed
        ? <details><summary style={{ padding: '8px 14px', fontSize: 12, color: 'var(--purple)', cursor: 'pointer' }}>показать список</summary><div style={{ padding: '0 6px 6px' }}>{children}</div></details>
        : <div style={{ padding: '0 6px 6px' }}>{children}</div>}
    </div>
  )
}

function Card({ label, value, sub, color }: { label: string; value: number; sub?: string; color?: string }) {
  return (
    <div style={{ border: '1px solid var(--bor)', borderRadius: 12, padding: '12px 14px' }}>
      <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 700, color: color ?? 'var(--text)' }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>{sub}</div>}
    </div>
  )
}

const Empty = ({ children }: { children: React.ReactNode }) =>
  <div style={{ padding: '12px 14px', fontSize: 12, color: 'var(--muted)' }}>{children}</div>

const fmt = (d: string) => d ? new Date(d).toLocaleDateString('ru', { day: 'numeric', month: 'short' }) : '—'
const th: React.CSSProperties = { padding: '8px 8px', fontWeight: 500, fontSize: 11 }
const td: React.CSSProperties = { padding: '7px 8px' }
