'use client'

/**
 * Разбор разговора в карточке сделки.
 *
 * Стоит первым на вкладке «Основное» — выше реквизитов. Причина простая:
 * открывая карточку, человек хочет понять, о чём был разговор, а не сверить
 * бюджет с этапом. Раньше для этого приходилось перечитывать переписку
 * целиком, и поэтому никто её не перечитывал.
 *
 * Что показываем без раскрытия: резюме, тип клиента, есть ли следующий шаг,
 * неотработанные возражения с цитатами. Всё остальное — под «подробнее»:
 * карточка не должна превращаться в отчёт.
 *
 * Разбор устаревает. Если после него пришли новые сообщения, это видно
 * прямо в шапке блока — иначе через неделю резюме будет описывать позавчерашний
 * разговор, а выглядеть как сегодняшний.
 */

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { analyzeDealConversation } from '../actions'

type Props = {
  dealId: string
  analysis: any | null
  /** Время последнего сообщения в сделке — по нему видно, устарел ли разбор. */
  lastMessageAt: string | null
}

const ЦВЕТ_ТИПА: Record<string, string> = {
  'горячий': '#d9480f',
  'тёплый': '#c97d00',
  'холодный': '#4c6ef5',
  'нецелевой': '#868e96',
}

export function DealAnalysis({ dealId, analysis, lastMessageAt }: Props) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [занят, setЗанят] = useState(false)
  const [ошибка, setОшибка] = useState<string | null>(null)
  const [подробнее, setПодробнее] = useState(false)

  async function разобрать() {
    setЗанят(true)
    setОшибка(null)
    const fd = new FormData()
    fd.append('deal_id', dealId)
    const res = await analyzeDealConversation(fd)
    setЗанят(false)
    if (res?.error) { setОшибка(res.error); return }
    startTransition(() => router.refresh())
  }

  const карточка: React.CSSProperties = {
    background: 'var(--surf)', border: '1px solid var(--bor)', borderRadius: 14,
    padding: '16px 20px', boxShadow: 'var(--sh)', marginBottom: 16,
  }
  const заголовок: React.CSSProperties = {
    fontSize: 10, fontWeight: 700, color: 'var(--muted)',
    textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12,
  }

  const кнопка = (
    <button onClick={разобрать} disabled={занят}
      style={{
        padding: '7px 14px', fontSize: 12, fontWeight: 600, borderRadius: 9,
        border: '1px solid var(--purple)', background: 'transparent',
        color: 'var(--purple)', cursor: занят ? 'default' : 'pointer',
        fontFamily: 'inherit', opacity: занят ? 0.5 : 1, whiteSpace: 'nowrap',
      }}>
      {занят ? 'Читаю переписку…' : analysis ? 'Разобрать заново' : 'Разобрать разговор'}
    </button>
  )

  // ── Разбора ещё не было ───────────────────────────────────────────────────
  if (!analysis) {
    return (
      <>
        <div style={заголовок}>Разбор разговора</div>
        <div style={{ ...карточка, display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ flex: 1, fontSize: 12, color: 'var(--muted)' }}>
            Переписка не разобрана. ИИ прочитает её целиком и покажет, чего клиент хочет,
            что его держит и о чём договорились.
          </div>
          {кнопка}
        </div>
        {ошибка && <div style={{ fontSize: 12, color: 'var(--red)', marginTop: -8, marginBottom: 16 }}>{ошибка}</div>}
      </>
    )
  }

  const p = analysis.payload ?? {}
  const шаг = p['следующий_шаг'] ?? {}
  const возражения: any[] = Array.isArray(p['возражения']) ? p['возражения'] : []
  const неОтработано = возражения.filter(в => в?.['отработано'] === false)
  const риски: any[] = Array.isArray(p['риски']) ? p['риски'] : []
  const неВыяснено: string[] = Array.isArray(p['не_выяснено']) ? p['не_выяснено'] : []
  const запрос = p['запрос'] ?? {}

  const устарел = Boolean(
    lastMessageAt && analysis.covered_to &&
    new Date(lastMessageAt).getTime() > new Date(analysis.covered_to).getTime(),
  )

  return (
    <>
      <div style={{ ...заголовок, display: 'flex', alignItems: 'center', gap: 8 }}>
        <span>Разбор разговора</span>
        <span style={{ textTransform: 'none', letterSpacing: 0, fontWeight: 500 }}>
          {new Date(analysis.created_at).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
          {analysis.items_count ? ` · ${analysis.items_count} реплик` : ''}
        </span>
        {устарел && (
          <span style={{ padding: '2px 8px', borderRadius: 8, fontSize: 10, fontWeight: 700, background: 'rgba(201,125,0,.14)', color: 'var(--gold)', textTransform: 'none', letterSpacing: 0 }}>
            устарел — после него были сообщения
          </span>
        )}
      </div>

      <div style={карточка}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 12 }}>
          <span style={{ padding: '3px 10px', borderRadius: 9, fontSize: 11, fontWeight: 700, color: '#fff', background: ЦВЕТ_ТИПА[p['тип_клиента']] ?? '#868e96', flexShrink: 0 }}>
            {p['тип_клиента']}
          </span>
          <div style={{ flex: 1, fontSize: 13, lineHeight: 1.55 }}>{p['резюме']}</div>
          {кнопка}
        </div>

        {ошибка && <div style={{ fontSize: 12, color: 'var(--red)', marginBottom: 10 }}>{ошибка}</div>}

        {/* Следующий шаг — главное, ради чего это всё. */}
        <div style={{
          padding: '9px 13px', borderRadius: 10, fontSize: 12, fontWeight: 600, marginBottom: 12,
          background: шаг['есть'] ? 'rgba(22,163,97,.09)' : 'rgba(201,42,42,.08)',
          color: шаг['есть'] ? 'var(--green)' : 'var(--red)',
        }}>
          {шаг['есть']
            ? `✓ Следующий шаг: ${шаг['что']}${шаг['когда'] ? ` · ${шаг['когда']}` : ''}`
            : '✕ Следующий шаг не зафиксирован'}
        </div>

        {/* Что мешает */}
        {неОтработано.length > 0 && (
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--red)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>
              Возражения без ответа
            </div>
            {неОтработано.map((в, i) => (
              <div key={i} style={{ paddingLeft: 11, borderLeft: '3px solid var(--red)', marginBottom: 8 }}>
                <div style={{ fontSize: 12, fontWeight: 600 }}>{в['что']}</div>
                {в['цитата'] && (
                  <div style={{ fontSize: 12, fontStyle: 'italic', color: 'var(--muted)', marginTop: 2 }}>«{в['цитата']}»</div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Запрос клиента — одной строкой */}
        <div style={{ fontSize: 12, color: 'var(--muted)' }}>
          {запрос['страна']} · {запрос['уровень']} · {запрос['сроки']} · бюджет: {запрос['бюджет']}
        </div>

        <button onClick={() => setПодробнее(!подробнее)}
          style={{ marginTop: 10, background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: 'inherit', fontSize: 11, fontWeight: 600, color: 'var(--purple)' }}>
          {подробнее ? 'свернуть' : 'подробнее'}
        </button>

        {подробнее && (
          <div style={{ marginTop: 12, fontSize: 12, lineHeight: 1.55 }}>
            <div style={{ color: 'var(--muted)', marginBottom: 10 }}>
              Почему {p['тип_клиента']}: {p['почему_такой_тип']}
            </div>

            {возражения.length > неОтработано.length && (
              <>
                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 6 }}>Отработанные возражения</div>
                {возражения.filter(в => в?.['отработано']).map((в, i) => (
                  <div key={i} style={{ paddingLeft: 11, borderLeft: '3px solid var(--green)', marginBottom: 8 }}>
                    <div style={{ fontWeight: 600 }}>{в['что']}</div>
                    <div style={{ color: 'var(--muted)', marginTop: 2 }}>{в['как']}</div>
                  </div>
                ))}
              </>
            )}

            {неВыяснено.length > 0 && (
              <>
                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', margin: '12px 0 6px' }}>Не спросили</div>
                <ul style={{ margin: 0, paddingLeft: 18 }}>
                  {неВыяснено.map((н, i) => <li key={i} style={{ marginBottom: 3 }}>{н}</li>)}
                </ul>
              </>
            )}

            {риски.length > 0 && (
              <>
                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--gold)', textTransform: 'uppercase', margin: '12px 0 6px' }}>Риски</div>
                {риски.map((р, i) => (
                  <div key={i} style={{ paddingLeft: 11, borderLeft: '3px solid var(--gold)', marginBottom: 8 }}>
                    <div style={{ fontWeight: 600 }}>{р['что']}</div>
                    {р['цитата'] && <div style={{ fontStyle: 'italic', color: 'var(--muted)', marginTop: 2 }}>«{р['цитата']}»</div>}
                  </div>
                ))}
              </>
            )}

            <div style={{ marginTop: 12, fontSize: 10, color: 'var(--muted)' }}>
              По разговору это этап «{p['рекомендуемый_этап']}» · модель {analysis.model}
            </div>
          </div>
        )}
      </div>
    </>
  )
}
