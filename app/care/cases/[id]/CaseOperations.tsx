'use client'

/**
 * Органы управления карточки дела.
 *
 * Клиентские, потому что каждому нужно показать результат: получилось или
 * нет и почему. Серверное действие возвращает `{ ok, ошибка }`, а не бросает
 * наружу — форма обязана объяснить отказ, а не оставить белый экран.
 *
 * Общее правило оформления: кнопка, которая что-то меняет, на время работы
 * выключается. Иначе второе нажатие по привычке создаёт вторую задачу — и
 * это не гипотеза, а то, что при медленной сети происходит всегда.
 *
 * Имена компонентов и хуков латиницей — как во всём репозитории и как
 * требует правило `react-hooks/rules-of-hooks`: оно опознаёт хук по префиксу
 * `use`, а компонент по заглавной латинской букве. Тексты и пояснения
 * остаются русскими.
 */
import { useState, useTransition } from 'react'
import {
  создатьЗадачу,
  изменитьСтатусЗадачи,
  подтвердитьФакт,
  отклонитьФакт,
  передатьДело,
} from './actions'

type Итог = { ok: true } | { ok: false; ошибка: string }

function ErrorLine({ текст }: { текст: string | null }) {
  if (!текст) return null
  return <p style={{ color: 'var(--ds-error-ink)', fontSize: 12, marginTop: 6 }}>{текст}</p>
}

/** Общий приём: выполнить действие, показать отказ, не дать нажать дважды. */
function useAction() {
  const [идёт, начать] = useTransition()
  const [ошибка, установитьОшибку] = useState<string | null>(null)

  const выполнить = (что: () => Promise<Итог>) => {
    установитьОшибку(null)
    начать(async () => {
      const итог = await что()
      if (!итог.ok) установитьОшибку(итог.ошибка)
    })
  }

  return { идёт, ошибка, выполнить }
}

export function NewTask({ caseId }: { caseId: string }) {
  const { идёт, ошибка, выполнить } = useAction()
  const [открыта, открыть] = useState(false)

  if (!открыта) {
    return (
      <button className="ds-btn ds-btn-secondary ds-btn-sm" onClick={() => открыть(true)}>
        + Задача
      </button>
    )
  }

  return (
    <form
      action={(данные: FormData) => выполнить(() => создатьЗадачу(caseId, данные))}
      style={{ marginTop: 12, display: 'grid', gap: 8 }}
    >
      <input className="ds-input" name="title" placeholder="Что нужно сделать" required autoFocus />
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <input className="ds-input" name="due_on" type="date" style={{ flex: '0 0 160px' }} />
        <select className="ds-input" name="waiting_on" defaultValue="none" style={{ flex: '1 1 160px' }}>
          <option value="none">никого не ждём</option>
          <option value="client">ждём клиента</option>
          <option value="university">ждём вуз</option>
          <option value="specialist">ждём специалиста</option>
          <option value="review">ждём проверку</option>
        </select>
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button className="ds-btn ds-btn-primary ds-btn-sm" type="submit" disabled={идёт}>
          {идёт ? 'Создаю…' : 'Создать'}
        </button>
        <button
          className="ds-btn ds-btn-ghost ds-btn-sm"
          type="button"
          onClick={() => открыть(false)}
          disabled={идёт}
        >
          Отмена
        </button>
      </div>
      <ErrorLine текст={ошибка} />
    </form>
  )
}

export function TaskActions({
  caseId,
  taskId,
  статус,
}: {
  caseId: string
  taskId: string
  статус: string
}) {
  const { идёт, ошибка, выполнить } = useAction()
  const закрыта = статус === 'done' || статус === 'failed'

  return (
    <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 4, flexWrap: 'wrap' }}>
      {!закрыта ? (
        <>
          <button
            className="ds-btn ds-btn-ghost ds-btn-sm"
            disabled={идёт}
            onClick={() => выполнить(() => изменитьСтатусЗадачи(caseId, taskId, 'in_progress'))}
          >
            В работу
          </button>
          <button
            className="ds-btn ds-btn-secondary ds-btn-sm"
            disabled={идёт}
            onClick={() => выполнить(() => изменитьСтатусЗадачи(caseId, taskId, 'done'))}
          >
            Готово
          </button>
        </>
      ) : (
        <button
          className="ds-btn ds-btn-ghost ds-btn-sm"
          disabled={идёт}
          onClick={() => выполнить(() => изменитьСтатусЗадачи(caseId, taskId, 'todo'))}
        >
          Вернуть в работу
        </button>
      )}
      <ErrorLine текст={ошибка} />
    </div>
  )
}

export function FactActions({ caseId, factId }: { caseId: string; factId: string }) {
  const { идёт, ошибка, выполнить } = useAction()
  const [причина, установитьПричину] = useState('')
  const [отклоняем, отклонять] = useState(false)

  return (
    <div style={{ marginTop: 4 }}>
      {!отклоняем ? (
        <div style={{ display: 'flex', gap: 6 }}>
          <button
            className="ds-btn ds-btn-secondary ds-btn-sm"
            disabled={идёт}
            onClick={() => выполнить(() => подтвердитьФакт(caseId, factId))}
          >
            Подтвердить
          </button>
          <button className="ds-btn ds-btn-ghost ds-btn-sm" onClick={() => отклонять(true)} disabled={идёт}>
            Отклонить
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {/* Причина обязательна: отклонение без объяснения ничему не учит ни
              того, кто читает журнал, ни того, кто готовил факт. */}
          <input
            className="ds-input"
            placeholder="Почему отклоняем"
            value={причина}
            onChange={(e) => установитьПричину(e.target.value)}
            style={{ flex: '1 1 200px' }}
            autoFocus
          />
          <button
            className="ds-btn ds-btn-primary ds-btn-sm"
            disabled={идёт || !причина.trim()}
            onClick={() => выполнить(() => отклонитьФакт(caseId, factId, причина))}
          >
            Отклонить
          </button>
          <button className="ds-btn ds-btn-ghost ds-btn-sm" onClick={() => отклонять(false)} disabled={идёт}>
            Отмена
          </button>
        </div>
      )}
      <ErrorLine текст={ошибка} />
    </div>
  )
}

export function TransferCase({
  caseId,
  кандидаты,
}: {
  caseId: string
  кандидаты: { id: string; имя: string }[]
}) {
  const { идёт, ошибка, выполнить } = useAction()
  const [открыта, открыть] = useState(false)
  const [кому, установитьКому] = useState('')
  const [причина, установитьПричину] = useState('')

  if (!кандидаты.length) return null

  if (!открыта) {
    return (
      <button className="ds-btn ds-btn-ghost ds-btn-sm" onClick={() => открыть(true)}>
        Передать дело
      </button>
    )
  }

  return (
    <div style={{ display: 'grid', gap: 8, marginTop: 8 }}>
      <select className="ds-input" value={кому} onChange={(e) => установитьКому(e.target.value)}>
        <option value="">Кому передать</option>
        {кандидаты.map((к) => (
          <option key={к.id} value={к.id}>
            {к.имя}
          </option>
        ))}
      </select>
      <input
        className="ds-input"
        placeholder="Почему передаём"
        value={причина}
        onChange={(e) => установитьПричину(e.target.value)}
      />
      <p style={{ fontSize: 12, color: 'var(--ds-muted)' }}>
        Вместе с делом закроются приглашения помощников: позванный прошлому куратору не
        остаётся при новом. Нужен — позовите заново.
      </p>
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          className="ds-btn ds-btn-primary ds-btn-sm"
          disabled={идёт || !кому}
          onClick={() => выполнить(() => передатьДело(caseId, кому, причина))}
        >
          {идёт ? 'Передаю…' : 'Передать'}
        </button>
        <button className="ds-btn ds-btn-ghost ds-btn-sm" onClick={() => открыть(false)} disabled={идёт}>
          Отмена
        </button>
      </div>
      <ErrorLine текст={ошибка} />
    </div>
  )
}
