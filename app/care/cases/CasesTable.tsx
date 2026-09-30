'use client'

/**
 * Список клиентов с поиском и фильтром.
 *
 * Клиентский — ради мгновенного поиска. Дел у куратора десятки, а не тысячи;
 * отправлять запрос на каждую букву значит ждать сеть там, где фильтрация
 * умещается в памяти.
 */
import { useMemo, useState } from 'react'
import Link from 'next/link'
import type { ДелоВСписке } from '@/lib/care/cases'
import { инициалы, склонение } from '@/lib/care/labels'

export function CasesTable({ дела }: { дела: ДелоВСписке[] }) {
  const [запрос, установитьЗапрос] = useState('')
  const [толькоВнимание, переключить] = useState(false)

  const требуютВнимания = useMemo(() => дела.filter((д) => д.требуетВнимания).length, [дела])

  const видимые = useMemo(() => {
    const искомое = запрос.trim().toLowerCase()
    return дела.filter((д) => {
      if (толькоВнимание && !д.требуетВнимания) return false
      if (!искомое) return true
      return (
        д.имяКлиента.toLowerCase().includes(искомое) ||
        (д.страна ?? '').toLowerCase().includes(искомое) ||
        (д.service_scope ?? '').toLowerCase().includes(искомое)
      )
    })
  }, [дела, запрос, толькоВнимание])

  return (
    <>
      <input
        className="ds-input"
        placeholder="Найти клиента"
        value={запрос}
        onChange={(e) => установитьЗапрос(e.target.value)}
        style={{ width: '100%', marginBottom: 14 }}
      />

      <div style={{ display: 'flex', gap: 8, marginBottom: 18 }}>
        <button
          className={`ds-btn ds-btn-sm ${толькоВнимание ? 'ds-btn-ghost' : 'ds-btn-primary'}`}
          onClick={() => переключить(false)}
        >
          Все
        </button>
        <button
          className={`ds-btn ds-btn-sm ${толькоВнимание ? 'ds-btn-primary' : 'ds-btn-ghost'}`}
          onClick={() => переключить(true)}
        >
          Требуют внимания {требуютВнимания > 0 && <span style={{ opacity: 0.7 }}>{требуютВнимания}</span>}
        </button>
      </div>

      {видимые.length === 0 ? (
        <div className="ds-empty">
          <div className="ds-empty-title">Ничего не найдено</div>
          <p style={{ marginTop: 10 }}>
            <button
              className="ds-btn ds-btn-ghost ds-btn-sm"
              onClick={() => {
                установитьЗапрос('')
                переключить(false)
              }}
            >
              Сбросить фильтр
            </button>
          </p>
        </div>
      ) : (
        <div className="ds-card" style={{ padding: 0, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--ds-border)' }}>
                <th style={{ textAlign: 'left', padding: '12px 18px', fontWeight: 500, color: 'var(--ds-muted)', fontSize: 12 }}>
                  Клиент
                </th>
                <th style={{ textAlign: 'left', padding: '12px 18px', fontWeight: 500, color: 'var(--ds-muted)', fontSize: 12 }}>
                  Сейчас
                </th>
                <th style={{ textAlign: 'left', padding: '12px 18px', fontWeight: 500, color: 'var(--ds-muted)', fontSize: 12 }}>
                  Следующий шаг
                </th>
                <th style={{ width: 40 }} />
              </tr>
            </thead>
            <tbody>
              {видимые.map((д) => (
                <tr key={д.id} style={{ borderBottom: '1px solid var(--ds-border-soft)' }}>
                  <td style={{ padding: '14px 18px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <span className="care-ava">{инициалы(д.имяКлиента)}</span>
                      <div style={{ minWidth: 0 }}>
                        <Link href={`/care/cases/${д.id}`} className="ds-link" style={{ fontWeight: 600 }}>
                          {д.имяКлиента}
                        </Link>
                        {д.is_synthetic && <span className="ds-chip ds-chip-warning">тест</span>}
                        <div style={{ fontSize: 12, color: 'var(--ds-muted)' }}>
                          {[д.страна, д.service_scope, `набор ${д.intake_year}`].filter(Boolean).join(' · ')}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td style={{ padding: '14px 18px' }}>{д.сейчас}</td>
                  <td style={{ padding: '14px 18px', color: 'var(--ds-ink-dim)' }}>{д.следующийШаг}</td>
                  <td style={{ padding: '14px 18px', textAlign: 'right' }}>
                    <Link href={`/care/cases/${д.id}`} className="ds-link" aria-label="Открыть дело">
                      →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p style={{ marginTop: 12, fontSize: 12, color: 'var(--ds-muted)' }}>
        Показано {видимые.length} из {дела.length}{' '}
        {склонение(дела.length, 'дела', 'дел', 'дел')}
      </p>
    </>
  )
}
