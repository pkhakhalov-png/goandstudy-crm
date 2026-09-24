'use client'

/**
 * Список дожима.
 *
 * Устроен как рабочая очередь, а не как отчёт: сверху тот, с кем надо
 * поговорить первым, и рядом написано, что именно сказать. Отчёт, из которого
 * непонятно, что делать в следующие пять минут, читают один раз.
 *
 * Поэтому у каждой строки три обязательные вещи: кто, что мешает (дословной
 * репликой клиента) и что сделать. Балл готовности показан, но он вторичен —
 * он объясняет порядок, а не заменяет объяснение.
 */

import { useState } from 'react'
import Link from 'next/link'

type Item = {
  dealId: string
  готовность: number
  тип: string
  резюме: string
  преграда: { что: string; цитата: string } | null
  действие: string
  запрос: { страна: string; уровень: string; бюджет: string; сроки: string }
  следующийШагЕсть: boolean
  рисков: number
  днейСРазбора: number
  причины: string[]
  title: string
  contactName: string
  contactPhone: string | null
  stageName: string
  salesperson: string
}

const ЦВЕТ_ТИПА: Record<string, string> = {
  'горячий': '#d9480f',
  'тёплый': '#c97d00',
  'холодный': '#4c6ef5',
}

export function HotDashboard({ items, разобрано }: { items: Item[]; разобрано: number }) {
  const [фильтр, setФильтр] = useState<'все' | 'горячий' | 'тёплый' | 'без_шага' | 'риски'>('все')
  const [раскрыт, setРаскрыт] = useState<string | null>(null)

  const card: React.CSSProperties = { background: 'var(--surf)', border: '1px solid var(--bor2)', borderRadius: 14, padding: '16px 20px', marginBottom: 12 }

  const видимые = items.filter(i => {
    if (фильтр === 'горячий') return i.тип === 'горячий'
    if (фильтр === 'тёплый') return i.тип === 'тёплый'
    if (фильтр === 'без_шага') return !i.следующийШагЕсть
    if (фильтр === 'риски') return i.рисков > 0
    return true
  })

  const горячих = items.filter(i => i.тип === 'горячий').length
  const безШага = items.filter(i => !i.следующийШагЕсть).length
  const сВозражением = items.filter(i => i.преграда).length
  const сРисками = items.filter(i => i.рисков > 0).length

  if (разобрано === 0) {
    return (
      <div style={card}>
        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 6 }}>Разборов пока нет</div>
        <div style={{ fontSize: 12, color: 'var(--muted)' }}>
          Список собирается из разборов разговоров. Запустите разбор новых заявок — и сюда попадут те,
          с кем разговор оборвался на полпути.
        </div>
      </div>
    )
  }

  const плитки = [
    { ключ: 'все' as const,      число: items.length,   ярлык: 'в работе',            подпись: 'разобрано и не куплено' },
    { ключ: 'горячий' as const,  число: горячих,        ярлык: 'горячих',             подпись: 'готовы обсуждать деньги' },
    { ключ: 'без_шага' as const, число: безШага,        ярлык: 'без следующего шага', подпись: 'разговор оборвался на нас' },
    { ключ: 'риски' as const,    число: сРисками,       ярлык: 'с рисками',           подпись: 'сказано лишнее — проверить' },
  ]

  return (
    <>
      <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
        {плитки.map(п => (
          <button key={п.ключ} onClick={() => setФильтр(фильтр === п.ключ ? 'все' : п.ключ)}
            style={{
              ...card, flex: 1, marginBottom: 0, textAlign: 'left', cursor: 'pointer',
              fontFamily: 'inherit',
              outline: фильтр === п.ключ ? '2px solid var(--purple)' : 'none',
            }}>
            <div style={{ fontSize: 26, fontWeight: 800, lineHeight: 1.1 }}>{п.число}</div>
            <div style={{ fontSize: 12, fontWeight: 700, marginTop: 4 }}>{п.ярлык}</div>
            <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 2 }}>{п.подпись}</div>
          </button>
        ))}
      </div>

      <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 12 }}>
        Порядок — по готовности к разговору: насколько человек тёплый, оборвался ли разговор на нас,
        знаем ли мы, что ему мешает, назвал ли он деньги. Старые разговоры опускаются ниже:
        им нужен не дожим, а возврат. У {сВозражением} из {items.length} есть прямое возражение без ответа —
        это те, где известно, что сказать.
      </div>

      {видимые.length === 0 && (
        <div style={{ ...card, fontSize: 13, color: 'var(--muted)' }}>По этому фильтру пусто.</div>
      )}

      {видимые.map(i => {
        const открыт = раскрыт === i.dealId
        return (
          <div key={i.dealId} style={card}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
              <div style={{
                width: 44, textAlign: 'center', flexShrink: 0,
                fontSize: 20, fontWeight: 800,
                color: i.готовность >= 70 ? 'var(--red)' : i.готовность >= 45 ? 'var(--gold)' : 'var(--muted)',
              }}>
                {i.готовность}
              </div>

              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <Link href={`/rop/funnel/${i.dealId}`} style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', textDecoration: 'none' }}>
                    {i.contactName || i.title}
                  </Link>
                  <span style={{ padding: '2px 8px', borderRadius: 9, fontSize: 10, fontWeight: 700, color: '#fff', background: ЦВЕТ_ТИПА[i.тип] ?? '#868e96' }}>
                    {i.тип}
                  </span>
                  {!i.следующийШагЕсть && (
                    <span style={{ padding: '2px 8px', borderRadius: 9, fontSize: 10, fontWeight: 700, background: 'rgba(201,42,42,.1)', color: 'var(--red)' }}>
                      нет следующего шага
                    </span>
                  )}
                  {i.рисков > 0 && (
                    <span style={{ padding: '2px 8px', borderRadius: 9, fontSize: 10, fontWeight: 700, background: 'rgba(201,125,0,.12)', color: 'var(--gold)' }}>
                      рисков: {i.рисков}
                    </span>
                  )}
                </div>

                <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 3 }}>
                  {i.stageName} · {i.salesperson} · {i.запрос.страна}, {i.запрос.уровень} · бюджет: {i.запрос.бюджет} · разбор {i.днейСРазбора} дн. назад
                </div>

                {i.преграда && (
                  <div style={{ marginTop: 10, paddingLeft: 12, borderLeft: '3px solid var(--red)' }}>
                    <div style={{ fontSize: 12, fontWeight: 600 }}>Мешает: {i.преграда.что}</div>
                    {i.преграда.цитата && (
                      <div style={{ fontSize: 12, fontStyle: 'italic', color: 'var(--muted)', marginTop: 3 }}>
                        «{i.преграда.цитата}»
                      </div>
                    )}
                  </div>
                )}

                <div style={{ marginTop: 10, padding: '8px 12px', borderRadius: 9, background: 'rgba(22,163,97,.08)', fontSize: 12, fontWeight: 600, color: 'var(--green)' }}>
                  → {i.действие}
                </div>

                <button onClick={() => setРаскрыт(открыт ? null : i.dealId)}
                  style={{ marginTop: 8, background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: 'inherit', fontSize: 11, fontWeight: 600, color: 'var(--purple)' }}>
                  {открыт ? 'свернуть' : 'что было в разговоре'}
                </button>

                {открыт && (
                  <div style={{ marginTop: 8, fontSize: 12, lineHeight: 1.55 }}>
                    <div>{i.резюме}</div>
                    <div style={{ marginTop: 8, fontSize: 11, color: 'var(--muted)' }}>
                      Почему в этом месте списка: {i.причины.join(' · ')}
                    </div>
                    {i.contactPhone && (
                      <div style={{ marginTop: 6, fontSize: 11, color: 'var(--muted)' }}>{i.contactPhone}</div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        )
      })}
    </>
  )
}
