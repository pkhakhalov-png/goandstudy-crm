'use client'

/**
 * Очередь подборок: одна на экране, решение и дальше.
 *
 * Та же форма, что у напоминаний. Список провоцирует пролистать и нажать
 * «принять всё» — а здесь каждая строка это обещание клиенту, и смотреть на
 * неё надо по одной.
 *
 * Порядок внутри карточки не случаен: сначала то, что не сходится с фактами
 * клиента, потом проверенное с цитатами, и только потом непроверенное. Если
 * программа не подходит по языку, остальное уже неважно.
 */
import { useState, useTransition } from 'react'
import Link from 'next/link'
import { принятьПодборку, доработатьПодборку } from './actions'

export type Подборка = {
  id: string
  caseId: string
  имяКлиента: string
  контекст: string
  is_synthetic: boolean
  version: number
  собрана: string
  строки: {
    id: string
    вуз: string
    программа: string
    город: string | null
    страна: string | null
    ссылка: string | null
    стоимость: string | null
    почему: string
    проверено: { вид: string; значение: string; цитата: string }[]
    сверка: { вид: string; вывод: string; объяснение: string }[]
    unresolved: string[]
  }[]
}

export function ShortlistQueue({ очередь }: { очередь: Подборка[] }) {
  const [номер, установитьНомер] = useState(0)
  const [замечание, установитьЗамечание] = useState('')
  const [дорабатываем, дорабатывать] = useState(false)
  const [сообщение, установитьСообщение] = useState<string | null>(null)
  const [ошибка, установитьОшибку] = useState<string | null>(null)
  const [идёт, начать] = useTransition()

  if (!очередь.length) {
    return (
      <div className="ds-empty">
        <div className="ds-empty-title">Подборок на проверке нет</div>
        <p style={{ fontSize: 14, color: 'var(--ds-muted)', maxWidth: 460, margin: '8px auto 0' }}>
          Новые появятся, когда помощник соберёт подборку по делу — из карточки клиента
          или по вашей просьбе в панели.
        </p>
      </div>
    )
  }

  const текущее = очередь[Math.min(номер, очередь.length - 1)]

  const дальше = () => {
    установитьЗамечание('')
    дорабатывать(false)
    установитьОшибку(null)
    // Последнюю не листаем вперёд: страница перерисуется сама, и очередь
    // приедет уже без неё.
    if (номер < очередь.length - 1) установитьНомер(номер + 1)
  }

  const решить = (что: () => Promise<{ ok: boolean; сообщение?: string; ошибка?: string }>) => {
    установитьОшибку(null)
    установитьСообщение(null)
    начать(async () => {
      const итог = await что()
      if (итог.ok) {
        установитьСообщение(итог.сообщение ?? 'Готово.')
        дальше()
      } else {
        установитьОшибку(итог.ошибка ?? 'не вышло')
      }
    })
  }

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 12 }}>
        <span className="ds-label" style={{ margin: 0 }}>
          {номер + 1} из {очередь.length}
        </span>
        <span style={{ fontSize: 12, color: 'var(--ds-muted)' }}>
          версия {текущее.version} · собрана {new Date(текущее.собрана).toLocaleDateString('ru-RU')}
        </span>
      </div>

      <div className="ds-card">
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap', marginBottom: 4 }}>
          <Link href={`/care/cases/${текущее.caseId}`} className="ds-link" style={{ fontWeight: 700, fontSize: 17 }}>
            {текущее.имяКлиента}
          </Link>
          {текущее.is_synthetic && <span className="ds-chip ds-chip-warning">тест</span>}
        </div>
        <div style={{ fontSize: 12, color: 'var(--ds-muted)', marginBottom: 14 }}>{текущее.контекст}</div>

        {текущее.строки.map((с) => (
          <div key={с.id} className="care-fact">
            <div style={{ fontSize: 15, fontWeight: 500 }}>
              {с.вуз} — {с.программа}
            </div>
            <div style={{ fontSize: 12, color: 'var(--ds-muted)', marginTop: 2 }}>
              {[с.город, с.страна, с.стоимость ?? 'стоимость не указана'].filter(Boolean).join(' · ')}
            </div>

            {/* Несходящееся первым: если программа не подходит по языку,
                остальное читать уже незачем. */}
            {с.сверка
              .filter((в) => в.вывод !== 'подходит')
              .map((в, i) => (
                <div
                  key={`в${i}`}
                  style={{
                    fontSize: 13,
                    marginTop: 6,
                    padding: '6px 9px',
                    borderRadius: 7,
                    background:
                      в.вывод === 'не подходит'
                        ? 'var(--ds-error-soft, var(--ds-bg-alt))'
                        : 'var(--ds-amber-soft, var(--ds-bg-alt))',
                    color: в.вывод === 'не подходит' ? 'var(--ds-error-ink)' : undefined,
                  }}
                >
                  {в.вывод === 'не подходит' ? 'Не подходит: ' : 'Неясно: '}
                  {в.объяснение}
                </div>
              ))}

            {с.почему && <div style={{ fontSize: 13, marginTop: 6, lineHeight: 1.5 }}>{с.почему}</div>}

            {с.проверено.map((т, i) => (
              <div key={`т${i}`} style={{ fontSize: 12, color: 'var(--ds-success-ink)', marginTop: 4 }}>
                ✓ {т.вид}: {т.значение}
              </div>
            ))}

            {с.ссылка && (
              <div style={{ marginTop: 6 }}>
                <a href={с.ссылка} target="_blank" rel="noopener noreferrer" className="ds-link" style={{ fontSize: 12 }}>
                  страница программы ↗
                </a>
              </div>
            )}

            {с.unresolved.length > 0 && (
              <div style={{ fontSize: 12, color: 'var(--ds-muted)', marginTop: 5 }}>
                Проверить: {с.unresolved.join(' · ')}
              </div>
            )}
          </div>
        ))}

        {!дорабатываем ? (
          <div style={{ display: 'flex', gap: 8, marginTop: 16, flexWrap: 'wrap' }}>
            <button
              className="ds-btn ds-btn-primary ds-btn-sm"
              disabled={идёт}
              onClick={() => решить(() => принятьПодборку(текущее.id))}
            >
              {идёт ? 'Собираю страницу…' : 'Принять и дальше'}
            </button>
            <button className="ds-btn ds-btn-secondary ds-btn-sm" onClick={() => дорабатывать(true)} disabled={идёт}>
              На доработку
            </button>
            {номер < очередь.length - 1 && (
              <button className="ds-btn ds-btn-ghost ds-btn-sm" onClick={дальше} disabled={идёт}>
                Пропустить
              </button>
            )}
          </div>
        ) : (
          <div style={{ marginTop: 16, display: 'grid', gap: 8 }}>
            {/* Замечание обязательно: «не то» без объяснения даст тот же
                список во второй раз, и это заметит только клиент. */}
            <input
              className="ds-input"
              placeholder="Что не так: «дешевле», «без Чехии», «только англоязычные»"
              value={замечание}
              onChange={(e) => установитьЗамечание(e.target.value)}
              autoFocus
            />
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                className="ds-btn ds-btn-primary ds-btn-sm"
                disabled={идёт || !замечание.trim()}
                onClick={() => решить(() => доработатьПодборку(текущее.id, замечание))}
              >
                {идёт ? 'Пересобираю…' : 'Пересобрать с замечанием'}
              </button>
              <button className="ds-btn ds-btn-ghost ds-btn-sm" onClick={() => дорабатывать(false)} disabled={идёт}>
                Отмена
              </button>
            </div>
            <p style={{ fontSize: 12, color: 'var(--ds-muted)', margin: 0 }}>
              Замечание уходит в поиск дословно. Пересборка идёт минуту-полторы.
            </p>
          </div>
        )}

        {сообщение && <p style={{ fontSize: 13, color: 'var(--ds-success-ink)', marginTop: 10 }}>{сообщение}</p>}
        {ошибка && <p style={{ fontSize: 13, color: 'var(--ds-error-ink)', marginTop: 10 }}>{ошибка}</p>}
      </div>
    </>
  )
}
