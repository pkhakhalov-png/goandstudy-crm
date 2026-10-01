'use client'

import { useState } from 'react'
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine,
} from 'recharts'
import type { DayFlow } from '@/lib/finance/service'

/**
 * Движение денег по дням.
 *
 * Почему два графика, а не один. Дневной оборот и накопленный итог живут в
 * разных масштабах: за две недели накопленное обгоняет дневное в разы, и дальше
 * разрыв только растёт. Свести их на одной картинке можно было бы двумя осями —
 * и это самая частая ошибка в графиках: читатель видит пересечение линий там,
 * где его нет, потому что шкалы разные. Поэтому два графика, у каждого своя
 * единственная ось, и общая ось дней внизу.
 *
 * Почему приход вверх, а расход вниз. Цвет здесь не единственный признак:
 * направление столбика говорит то же самое и читается без цвета вовсе. Это
 * нужно не для красоты — зелёный и красный неразличимы при самой
 * распространённой форме дальтонизма, и пара в проекте (#16a361 / #dc3545)
 * проверку на различимость не проходит: ΔE 4,4 при норме от 8. Здесь взяты
 * оттенки, которые проходят все шесть проверок (ΔE 9,6), оставаясь узнаваемыми
 * как «приход» и «расход».
 */

const ПРИХОД = '#0e8f6f'
const РАСХОД = '#e0552b'
const СЕТКА = 'rgba(0,0,0,.07)'
const ПОДПИСЬ = { fontSize: 11, fill: '#8a8796' }

const рубли = (копейки: number) => Math.round(копейки / 100)

function деньПодпись(d: string): string {
  const [, м, дн] = d.split('-')
  return `${Number(дн)}.${м}`
}

function кратко(v: number): string {
  const a = Math.abs(v)
  if (a >= 1_000_000) return `${(v / 1_000_000).toFixed(1).replace('.0', '')} млн`
  if (a >= 1000) return `${Math.round(v / 1000)} тыс`
  return String(v)
}

const подсказка = {
  fontSize: 12, borderRadius: 10, border: '1px solid rgba(0,0,0,.12)',
  background: '#fff', padding: '8px 10px',
}

export function FlowChart({ данные }: { данные: Record<'RUB' | 'USD', DayFlow[]> }) {
  const есть = (['RUB', 'USD'] as const).filter((c) => данные[c].length > 0)
  const [валюта, setВалюта] = useState<'RUB' | 'USD'>(есть[0] ?? 'RUB')

  if (!есть.length) return null

  const знак = валюта === 'RUB' ? '₽' : '$'
  const ряд = данные[валюта].map((d) => ({
    день: d.day,
    приход: рубли(d.income),
    расход: -рубли(d.expense),      // вниз от нуля: направление несёт тот же смысл, что цвет
    накоплено: рубли(d.cumulative),
  }))

  const сумма = (v: number) => `${кратко(Math.abs(v))} ${знак}`

  return (
    <div className="kc" style={{ marginBottom: 18, padding: 16 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ fontWeight: 700, fontSize: 14 }}>Движение по дням</div>
        <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
          {/* Легенда обязательна: рядов два, и опознавать их только по цвету нельзя */}
          <Метка цвет={ПРИХОД} текст="поступления" />
          <Метка цвет={РАСХОД} текст="траты" />
          {есть.length > 1 && (
            <div style={{ display: 'flex', gap: 4 }}>
              {есть.map((c) => (
                <button key={c} onClick={() => setВалюта(c)} className="btn-s"
                  style={{
                    padding: '4px 10px', fontSize: 11,
                    ...(валюта === c ? { background: 'var(--purple)', color: '#fff', borderColor: 'transparent' } : {}),
                  }}>
                  {c === 'RUB' ? '₽' : '$'}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div style={{ width: '100%', height: 190, marginTop: 10 }}>
        <ResponsiveContainer>
          <BarChart data={ряд} margin={{ top: 6, right: 6, left: 0, bottom: 0 }} barGap={2}>
            <CartesianGrid vertical={false} stroke={СЕТКА} />
            <XAxis dataKey="день" tickFormatter={деньПодпись} tick={ПОДПИСЬ} axisLine={false} tickLine={false} />
            <YAxis tickFormatter={кратко} tick={ПОДПИСЬ} axisLine={false} tickLine={false} width={56} />
            <ReferenceLine y={0} stroke="rgba(0,0,0,.18)" />
            <Tooltip
              cursor={{ fill: 'rgba(0,0,0,.035)' }}
              contentStyle={подсказка}
              labelFormatter={(d) => новаяДата(String(d))}
              formatter={(v: any, n: any) => [сумма(Number(v)), n === 'приход' ? 'поступления' : 'траты']}
            />
            {/* Скругление только у свободного конца: у нуля столбик примыкает к оси */}
            <Bar dataKey="приход" fill={ПРИХОД} radius={[4, 4, 0, 0]} maxBarSize={18} />
            <Bar dataKey="расход" fill={РАСХОД} radius={[0, 0, 4, 4]} maxBarSize={18} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div style={{ fontWeight: 700, fontSize: 13, marginTop: 14 }}>
        Накопленный итог за период
      </div>
      <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 2 }}>
        считается от нуля внутри периода — это не остаток на счетах
      </div>
      <div style={{ width: '100%', height: 130, marginTop: 8 }}>
        <ResponsiveContainer>
          <LineChart data={ряд} margin={{ top: 6, right: 6, left: 0, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke={СЕТКА} />
            <XAxis dataKey="день" tickFormatter={деньПодпись} tick={ПОДПИСЬ} axisLine={false} tickLine={false} />
            <YAxis tickFormatter={кратко} tick={ПОДПИСЬ} axisLine={false} tickLine={false} width={56} />
            <ReferenceLine y={0} stroke="rgba(0,0,0,.18)" />
            <Tooltip
              contentStyle={подсказка}
              labelFormatter={(d) => новаяДата(String(d))}
              formatter={(v: any) => [сумма(Number(v)), 'накоплено']}
            />
            <Line dataKey="накоплено" stroke="var(--purple)" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

function Метка({ цвет, текст }: { цвет: string; текст: string }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11.5, color: 'var(--muted)' }}>
      <span style={{ width: 9, height: 9, borderRadius: 3, background: цвет, display: 'inline-block' }} />
      {текст}
    </span>
  )
}

function новаяДата(d: string): string {
  const [г, м, дн] = d.split('-').map(Number)
  return new Date(г, м - 1, дн).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })
}
