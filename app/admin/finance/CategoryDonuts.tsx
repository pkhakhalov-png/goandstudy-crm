'use client'

import { useState } from 'react'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts'
import type { CategoryBreakdown, CategorySlice } from '@/lib/finance/service'

/**
 * Из чего складываются поступления и траты за период.
 *
 * Две диаграммы, а не одна. Доля в круге отвечает на вопрос «из чего состоит
 * это целое», а поступления и траты — два разных целых: в общем круге
 * «Зарплаты» заняли бы долю от суммы всех денег, которая не значит ничего.
 *
 * Цвет держится за категорию, а не за её место в рейтинге. Порядок цветов
 * задаётся оборотом за всё время и от выбранного периода не зависит — иначе
 * смена месяца перекрашивала бы категории, которые никуда не делись, и
 * сравнить два месяца глазами стало бы нельзя.
 *
 * Рядом с кругом всегда стоит список с суммами. Это не украшение: три цвета
 * палитры контрастируют с белым фоном слабее, чем требует проверка, и правило
 * на этот случай обязывает дать видимые подписи или таблицу. Заодно список
 * отвечает на вопрос «сколько именно», на который круг отвечать не умеет.
 */

/** Восемь слотов в documented-порядке. Девятая категория не получает свой цвет,
 *  а сворачивается в «Остальные»: придуманный на ходу оттенок сломал бы проверку
 *  на различимость, ради которой порядок и зафиксирован. */
const СЛОТЫ = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#4a3aa7', '#e34948']
const ОСТАЛЬНЫЕ = '#9ba098'

/** Строка раскрытия: одна живая операция периода в одной валюте. */
export type ОперацияКатегории = {
  id: string
  categoryId: string | null
  categoryName: string | null
  day: string
  title: string
  note: string | null
  amount: number
  currency: 'RUB' | 'USD'
}

const подсказка = {
  fontSize: 12, borderRadius: 10, border: '1px solid rgba(0,0,0,.12)',
  background: '#fff', padding: '8px 10px',
}

export function CategoryDonuts({ разрез, валюта, операции }: {
  разрез: CategoryBreakdown; валюта: 'RUB' | 'USD'; операции: ОперацияКатегории[]
}) {
  const цвет = новыйЦвет(разрез.порядок)
  const есть = разрез.income.length > 0 || разрез.expense.length > 0
  if (!есть) return null

  return (
    <div className="kc" style={{ marginBottom: 18, padding: 16 }}>
      <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 2 }}>По категориям</div>
      <div style={{ fontSize: 11.5, color: 'var(--muted)' }}>
        поступления и траты показаны отдельно — это два разных целых
      </div>
      <div style={{
        display: 'grid', gap: 18, marginTop: 14,
        gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
      }}>
        <CategoryRing заголовок="Поступления" доли={разрез.income} цвет={цвет} валюта={валюта}
              операции={операции.filter((o) => o.amount > 0)} />
        <CategoryRing заголовок="Траты" доли={разрез.expense} цвет={цвет} валюта={валюта}
              операции={операции.filter((o) => o.amount < 0)} />
      </div>
    </div>
  )
}

function CategoryRing({ заголовок, доли, цвет, валюта, операции }: {
  заголовок: string
  доли: CategorySlice[]
  цвет: (id: string | null) => string
  валюта: 'RUB' | 'USD'
  операции: ОперацияКатегории[]
}) {
  // Какая категория раскрыта. Ключ — id доли; у «Без категории» id нет.
  const [открыта, открыть] = useState<string | null>(null)
  const сжатые = свернутьХвост(доли)
  // «Остальные» раскрываются всеми категориями, что в них свёрнуты.
  const хвост = new Set(доли.slice(7).map((d) => d.id ?? ''))
  const состав = (ключ: string) => операции
    .filter((o) => ключ === '__rest__' ? хвост.has(o.categoryId ?? '') : (o.categoryId ?? '') === ключ)
    .sort((a, b) => (a.day < b.day ? 1 : -1))
  const всего = сжатые.reduce((s, d) => s + d.amount, 0)

  if (!всего) {
    return (
      <div>
        <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 8 }}>{заголовок}</div>
        <div style={{ fontSize: 12, color: 'var(--muted)' }}>за период ничего не было</div>
      </div>
    )
  }

  const данные = сжатые.map((d) => ({ ...d, цвет: d.id === '__rest__' ? ОСТАЛЬНЫЕ : цвет(d.id) }))

  return (
    <div>
      <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 8 }}>
        {заголовок} · {сумма(всего, валюта)}
      </div>
      <div style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ width: 132, height: 132, flexShrink: 0 }}>
          <ResponsiveContainer>
            <PieChart>
              <Pie data={данные} dataKey="amount" nameKey="name"
                   innerRadius={38} outerRadius={64} startAngle={90} endAngle={-270}
                   /* 2px зазор поверхности между долями: иначе соседние заливки
                      сливаются в одно пятно и границу приходится угадывать */
                   paddingAngle={2} stroke="#fff" strokeWidth={2}>
                {данные.map((d, i) => <Cell key={i} fill={d.цвет} />)}
              </Pie>
              <Tooltip
                contentStyle={подсказка}
                formatter={(v: any, n: any) => [
                  `${сумма(Number(v), валюта)} · ${Math.round(Number(v) / всего * 100)}%`, n,
                ]}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Список с суммами — он же обязательная подпись при слабом контрасте */}
        <div style={{ flex: 1, minWidth: 150 }}>
          {данные.map((d) => {
            const ключ = d.id ?? ''
            const раскрыта = открыта === ключ
            return (
            <div key={d.id ?? 'нет'}>
            <button type="button" onClick={() => открыть(раскрыта ? null : ключ)}
              aria-expanded={раскрыта}
              title="Показать операции за период"
              style={{
              display: 'flex', alignItems: 'baseline', gap: 7, width: '100%',
              fontSize: 12, padding: '2.5px 0', background: 'none', border: 0,
              cursor: 'pointer', textAlign: 'left', color: 'inherit', font: 'inherit',
            }}>
              <span style={{
                width: 9, height: 9, borderRadius: 3, background: d.цвет,
                display: 'inline-block', flexShrink: 0, position: 'relative', top: 1,
              }} />
              <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {d.name}
              </span>
              <span style={{ color: 'var(--muted)', fontSize: 11 }}>
                {Math.round(d.amount / всего * 100)}%
              </span>
              <span style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>{сумма(d.amount, валюта)}</span>
              <span style={{ color: 'var(--muted)', fontSize: 10, width: 10 }}>{раскрыта ? '▾' : '▸'}</span>
            </button>
            {раскрыта && <Состав строки={состав(ключ)} валюта={валюта} />}
            </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

/** Операции раскрытой категории: дата, что это, сумма. */
function Состав({ строки, валюта }: { строки: ОперацияКатегории[]; валюта: 'RUB' | 'USD' }) {
  if (!строки.length) {
    return <div style={{ fontSize: 11.5, color: 'var(--muted)', padding: '4px 0 8px 16px' }}>операций не найдено</div>
  }
  return (
    <div style={{ padding: '2px 0 8px 16px', borderLeft: '2px solid var(--bor)', marginLeft: 3 }}>
      {строки.map((o) => (
        <div key={o.id} style={{ display: 'flex', gap: 8, fontSize: 11.5, padding: '2px 0' }}>
          <span style={{ color: 'var(--muted)', minWidth: 40 }}>{день(o.day)}</span>
          <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                title={o.note ? `${o.title} · ${o.note}` : o.title}>
            {o.title}
          </span>
          <span style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>{сумма(Math.abs(o.amount), валюта)}</span>
        </div>
      ))}
    </div>
  )
}

function день(d: string): string {
  const [, м, дн] = d.split('-')
  return `${Number(дн)}.${м}`
}

/** Цвет по месту категории в обороте за всё время. За пределами восьми — серый. */
function новыйЦвет(порядок: string[]) {
  const карта = new Map<string, string>()
  порядок.slice(0, СЛОТЫ.length).forEach((id, i) => карта.set(id, СЛОТЫ[i]))
  return (id: string | null) => карта.get(id ?? '') ?? ОСТАЛЬНЫЕ
}

/** Больше восьми долей круг не читает: хвост сворачиваем в «Остальные». */
function свернутьХвост(доли: CategorySlice[]): CategorySlice[] {
  if (доли.length <= 8) return доли
  const голова = доли.slice(0, 7)
  const хвост = доли.slice(7).reduce((s, d) => s + d.amount, 0)
  return [...голова, { id: '__rest__', name: `Остальные (${доли.length - 7})`, amount: хвост }]
}

function сумма(копейки: number, валюта: 'RUB' | 'USD'): string {
  const v = Math.round(копейки / 100)
  return `${v.toLocaleString('ru-RU')} ${валюта === 'RUB' ? '₽' : '$'}`
}
