'use client'

/**
 * Очередь напоминаний: одно за раз, «1 из N». Раздел 8 дизайн-документа.
 *
 * ПОЧЕМУ ПО ОДНОМУ, А НЕ СПИСКОМ. Куратор проверяет десятки однородных
 * текстов. Список провоцирует пролистать и нажать «отправить всем» — а
 * смысл проверки в том, чтобы каждое напоминание увидел человек. Одно за раз
 * делает невнимательность заметной самому проверяющему.
 *
 * Что показывается вместе с текстом: имя клиента, документ, срок и откуда
 * взято. Без этого проверять нечего — текст-то всегда выглядит прилично.
 */
import { useState, useTransition } from 'react'
import Link from 'next/link'
import { отправитьНапоминание, пропуститьНапоминание, ответилСам } from './actions'

export type Напоминание = {
  id: string
  caseId: string
  клиент: string
  документ: string
  срок: string | null
  просрочено: boolean
  текст: string
  подготовлено: string
}

export function ReminderQueue({ очередь, отправкиВключены }: { очередь: Напоминание[]; отправкиВключены: boolean }) {
  const [номер, установитьНомер] = useState(0)
  const [причина, установитьПричину] = useState('')
  const [пропускаем, пропускать] = useState(false)
  const [сообщение, установитьСообщение] = useState<string | null>(null)
  const [ошибка, установитьОшибку] = useState<string | null>(null)
  const [идёт, начать] = useTransition()

  const текущее = очередь[номер]

  const дальше = () => {
    установитьПричину('')
    пропускать(false)
    установитьНомер((н) => н + 1)
  }

  const выполнить = (что: () => Promise<Awaited<ReturnType<typeof отправитьНапоминание>>>) => {
    установитьОшибку(null)
    установитьСообщение(null)
    начать(async () => {
      const итог = await что()
      if (!итог.ok) {
        установитьОшибку(итог.ошибка)
        return
      }
      if (итог.вОчереди) {
        установитьСообщение('Поставлено в очередь отправки.')
      } else {
        установитьСообщение(итог.объяснение)
      }
      дальше()
    })
  }

  if (!текущее) {
    return (
      <div className="ds-empty">
        <div className="ds-empty-title">
          {очередь.length === 0 ? 'Напоминаний нет' : 'Очередь разобрана'}
        </div>
        <p style={{ fontSize: 14, color: 'var(--ds-muted)', maxWidth: 480, margin: '8px auto 0' }}>
          {очередь.length === 0
            ? 'Напоминания появляются, когда клиент тянет с документом, а срок близко. Готовятся только по делам, переведённым на новый кабинет.'
            : `Разобрано ${очередь.length}. Новые появятся, когда подойдут следующие сроки.`}
        </p>
        {сообщение && (
          <p style={{ marginTop: 12, fontSize: 13, color: 'var(--ds-ink-dim)' }}>{сообщение}</p>
        )}
        <p style={{ marginTop: 12 }}>
          <Link href="/care" className="ds-link">
            На главную
          </Link>
        </p>
      </div>
    )
  }

  return (
    <>
      {!отправкиВключены && (
        <div
          className="ds-card"
          style={{ borderLeft: '3px solid var(--ds-amber)', marginBottom: 16, padding: 16 }}
        >
          <strong style={{ fontSize: 14 }}>Отправки наружу выключены</strong>
          <p style={{ fontSize: 13, color: 'var(--ds-muted)', margin: '6px 0 0', lineHeight: 1.6 }}>
            Кнопка «Отправить» сейчас запишет отказ с причиной, а сообщение не уйдёт. Это
            не поломка: рубильник живёт в базе и меняется миграцией. Проверять тексты
            можно и так.
          </p>
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 12 }}>
        <span className="ds-label" style={{ margin: 0 }}>
          {номер + 1} из {очередь.length}
        </span>
        <span style={{ fontSize: 12, color: 'var(--ds-muted)' }}>
          подготовлено {new Date(текущее.подготовлено).toLocaleString('ru-RU')}
        </span>
      </div>

      <div className="ds-card">
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
          <Link href={`/care/cases/${текущее.caseId}`} className="ds-link" style={{ fontWeight: 700, fontSize: 17 }}>
            {текущее.клиент}
          </Link>
          {текущее.просрочено ? (
            <span className="ds-chip ds-chip-error">срок прошёл</span>
          ) : (
            <span className="ds-chip ds-chip-warning">срок близко</span>
          )}
        </div>

        <div style={{ fontSize: 13, color: 'var(--ds-muted)', marginBottom: 14 }}>
          {текущее.документ}
          {текущее.срок && ` · срок ${new Date(текущее.срок).toLocaleDateString('ru-RU')}`}
        </div>

        {/* Текст показывается как уйдёт — ни форматирования, ни сокращений. */}
        <div
          style={{
            background: 'var(--ds-bg-alt)',
            borderLeft: '2px solid var(--ds-ai)',
            borderRadius: 8,
            padding: '12px 14px',
            fontSize: 15,
            lineHeight: 1.65,
            whiteSpace: 'pre-line',
          }}
        >
          {текущее.текст}
        </div>

        <p style={{ fontSize: 12, color: 'var(--ds-muted)', marginTop: 8 }}>
          Собрано по шаблону из настроек. Подставлены имя, документ и дата — больше ничего.
        </p>

        {!пропускаем ? (
          <div style={{ display: 'flex', gap: 8, marginTop: 16, flexWrap: 'wrap' }}>
            <button
              className="ds-btn ds-btn-primary ds-btn-sm"
              disabled={идёт}
              onClick={() => выполнить(() => отправитьНапоминание(текущее.id))}
            >
              {идёт ? 'Отправляю…' : 'Отправить и дальше'}
            </button>
            <button className="ds-btn ds-btn-ghost ds-btn-sm" disabled={идёт} onClick={() => пропускать(true)}>
              Пропустить
            </button>
            <button
              className="ds-btn ds-btn-ghost ds-btn-sm"
              disabled={идёт}
              onClick={() => выполнить(() => ответилСам(текущее.id))}
              title="Ставит паузу автонапоминаниям по этому делу"
            >
              Я написал сам
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', gap: 8, marginTop: 16, flexWrap: 'wrap' }}>
            <input
              className="ds-input"
              placeholder="Почему не отправляем"
              value={причина}
              onChange={(e) => установитьПричину(e.target.value)}
              style={{ flex: '1 1 240px' }}
              autoFocus
            />
            <button
              className="ds-btn ds-btn-primary ds-btn-sm"
              disabled={идёт || !причина.trim()}
              onClick={() => выполнить(() => пропуститьНапоминание(текущее.id, причина))}
            >
              Пропустить
            </button>
            <button className="ds-btn ds-btn-ghost ds-btn-sm" disabled={идёт} onClick={() => пропускать(false)}>
              Отмена
            </button>
          </div>
        )}

        {сообщение && (
          <p style={{ fontSize: 13, color: 'var(--ds-ink-dim)', marginTop: 12 }}>{сообщение}</p>
        )}
        {ошибка && (
          <p style={{ fontSize: 13, color: 'var(--ds-error-ink)', marginTop: 12 }}>{ошибка}</p>
        )}
      </div>
    </>
  )
}
