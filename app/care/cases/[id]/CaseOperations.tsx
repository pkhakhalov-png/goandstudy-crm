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
  изменитьОжидание,
  подтвердитьФакт,
  исправитьФакт,
  собратьПодборкуДела,
  написатьСтратегиюДела,
  опубликоватьПодборку,
  отозватьСсылку,
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

/** Подписи ожидания в одном месте: и в выпадающем списке, и на кнопке. */
const ОЖИДАНИЯ: { значение: string; подпись: string }[] = [
  { значение: 'none', подпись: 'никого не ждём' },
  { значение: 'client', подпись: 'ждём клиента' },
  { значение: 'university', подпись: 'ждём вуз' },
  { значение: 'specialist', подпись: 'ждём специалиста' },
  { значение: 'review', подпись: 'ждём проверку' },
]

/**
 * Кого ждём по задаче — и до какого числа.
 *
 * Стоит рядом с кнопками статуса, а не в отдельном экране, потому что это то
 * же самое движение руки: посмотрел задачу — отметил, что ждёшь документ.
 * Отметка «ждём клиента» со сроком — единственное, по чему помощник узнаёт,
 * что тут может понадобиться напоминание.
 *
 * Срок в той же форме: правило без срока напоминание не создаёт, и просить
 * заполнить его отдельно значит получить половину заполненных.
 */
export function TaskWaiting({
  caseId,
  taskId,
  ждём,
  срок,
  закрыта,
}: {
  caseId: string
  taskId: string
  ждём: string
  срок: string | null
  закрыта: boolean
}) {
  const { идёт, ошибка, выполнить } = useAction()
  const [открыта, открыть] = useState(false)

  // У закрытой задачи ожидания нет по определению — прятать кнопку честнее,
  // чем показывать и отказывать.
  if (закрыта) return null

  if (!открыта) {
    return (
      <button className="ds-btn ds-btn-ghost ds-btn-sm" onClick={() => открыть(true)}>
        Кого ждём
      </button>
    )
  }

  return (
    <form
      action={(данные: FormData) =>
        выполнить(async () => {
          const итог = await изменитьОжидание(caseId, taskId, данные)
          if (итог.ok) открыть(false)
          return итог
        })
      }
      style={{ display: 'grid', gap: 6, marginTop: 6, flexBasis: '100%' }}
    >
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <select className="ds-input" name="waiting_on" defaultValue={ждём} style={{ flex: '1 1 160px' }}>
          {ОЖИДАНИЯ.map((о) => (
            <option key={о.значение} value={о.значение}>
              {о.подпись}
            </option>
          ))}
        </select>
        <input
          className="ds-input"
          name="due_on"
          type="date"
          defaultValue={срок ?? ''}
          style={{ flex: '0 0 160px' }}
        />
      </div>
      <div style={{ display: 'flex', gap: 6 }}>
        <button className="ds-btn ds-btn-primary ds-btn-sm" type="submit" disabled={идёт}>
          {идёт ? 'Сохраняю…' : 'Сохранить'}
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
  ждём,
  срок,
}: {
  caseId: string
  taskId: string
  статус: string
  ждём: string
  срок: string | null
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
          <TaskWaiting caseId={caseId} taskId={taskId} ждём={ждём} срок={срок} закрыта={false} />
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

/**
 * Что можно сделать с черновиком факта: принять, исправить, отклонить.
 *
 * ПОЧЕМУ ИСПРАВЛЕНИЕ РЯДОМ С ОТКЛОНЕНИЕМ, А НЕ ВМЕСТО НЕГО. Это два разных
 * ответа. «Исправить» — значение есть, модель его переврала. «Отклонить» —
 * значения нет вовсе: модель придумала поле, которого в разговоре не было.
 * Свести их в одно значит заставить человека врать в одну из сторон.
 *
 * Отклонение без своего варианта было тупиком: поле оставалось пустым, а
 * правильное значение у куратора уже было в голове. Теперь оно вписывается
 * прямо здесь, и оно же становится подтверждённым фактом.
 */
export function FactActions({
  caseId,
  factId,
  значение,
  валюта,
  деньги,
}: {
  caseId: string
  factId: string
  значение: string
  валюта: string | null
  деньги: boolean
}) {
  const { идёт, ошибка, выполнить } = useAction()
  const [причина, установитьПричину] = useState('')
  const [что, показать] = useState<'кнопки' | 'исправляем' | 'отклоняем'>('кнопки')

  return (
    <div style={{ marginTop: 4 }}>
      {что === 'кнопки' && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <button
            className="ds-btn ds-btn-secondary ds-btn-sm"
            disabled={идёт}
            onClick={() => выполнить(() => подтвердитьФакт(caseId, factId))}
          >
            Подтвердить
          </button>
          <button className="ds-btn ds-btn-secondary ds-btn-sm" onClick={() => показать('исправляем')} disabled={идёт}>
            Исправить
          </button>
          <button className="ds-btn ds-btn-ghost ds-btn-sm" onClick={() => показать('отклоняем')} disabled={идёт}>
            Отклонить
          </button>
        </div>
      )}

      {что === 'исправляем' && (
        <form
          action={(данные: FormData) =>
            выполнить(async () => {
              const итог = await исправитьФакт(caseId, factId, данные)
              if (итог.ok) показать('кнопки')
              return итог
            })
          }
          style={{ display: 'grid', gap: 6 }}
        >
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {/* Значение подставлено моделью — чаще всего править нужно одно
                слово или одну цифру, а не писать заново. */}
            <input
              className="ds-input"
              name="value"
              defaultValue={значение}
              placeholder="Как на самом деле"
              style={{ flex: '1 1 240px' }}
              autoFocus
              required
            />
            {деньги && (
              <input
                className="ds-input"
                name="currency"
                defaultValue={валюта ?? ''}
                placeholder="EUR"
                style={{ flex: '0 0 90px' }}
                maxLength={3}
                required
              />
            )}
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button className="ds-btn ds-btn-primary ds-btn-sm" type="submit" disabled={идёт}>
              {идёт ? 'Сохраняю…' : 'Это верно'}
            </button>
            <button
              className="ds-btn ds-btn-ghost ds-btn-sm"
              type="button"
              onClick={() => показать('кнопки')}
              disabled={идёт}
            >
              Отмена
            </button>
          </div>
        </form>
      )}

      {что === 'отклоняем' && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {/* Причина обязательна: отклонение без объяснения ничему не учит ни
              того, кто читает журнал, ни того, кто готовил факт. */}
          <input
            className="ds-input"
            placeholder="Почему этого факта нет"
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
          <button className="ds-btn ds-btn-ghost ds-btn-sm" onClick={() => показать('кнопки')} disabled={идёт}>
            Отмена
          </button>
        </div>
      )}
      <ErrorLine текст={ошибка} />
    </div>
  )
}

/**
 * Подбор и стратегия — две долгие операции карточки.
 *
 * Обе идут минуту и больше: подбор ходит по сайтам вузов, стратегия читает всё
 * дело. Поэтому кнопка не просто выключается, а говорит, что происходит, —
 * молчащая кнопка через сорок секунд читается как «сломалось», и человек
 * нажимает ещё раз.
 */
export function CaseAssistant({ caseId }: { caseId: string }) {
  const { идёт, ошибка, выполнить } = useAction()
  const [что, установитьЧто] = useState<null | 'подборка' | 'стратегия'>(null)

  const запустить = (вид: 'подборка' | 'стратегия') => {
    установитьЧто(вид)
    выполнить(async () => {
      const итог =
        вид === 'подборка' ? await собратьПодборкуДела(caseId) : await написатьСтратегиюДела(caseId)
      установитьЧто(null)
      return итог
    })
  }

  return (
    <div style={{ marginTop: 4 }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button
          className="ds-btn ds-btn-secondary ds-btn-sm"
          disabled={идёт}
          onClick={() => запустить('подборка')}
        >
          {идёт && что === 'подборка' ? 'Ищу программы…' : 'Собрать подборку'}
        </button>
        <button
          className="ds-btn ds-btn-secondary ds-btn-sm"
          disabled={идёт}
          onClick={() => запустить('стратегия')}
        >
          {идёт && что === 'стратегия' ? 'Пишу…' : 'Написать стратегию'}
        </button>
      </div>
      {идёт && (
        <p style={{ fontSize: 12, color: 'var(--ds-muted)', marginTop: 6 }}>
          {что === 'подборка'
            ? 'Помощник ищет программы на сайтах вузов. Это минута-полторы.'
            : 'Помощник читает дело целиком. Это около минуты.'}
        </p>
      )}
      <ErrorLine текст={ошибка} />
    </div>
  )
}

/**
 * Принять подборку и отдать её клиенту ссылкой.
 *
 * Ссылка показывается целиком и копируется одним нажатием: куратор отправит её
 * в Телеграм, а набирать руками секрет из тридцати знаков невозможно.
 */
export function PublishShortlist({
  caseId,
  shortlistId,
  токен,
  адресОснования,
}: {
  caseId: string
  shortlistId: string
  токен: string | null
  адресОснования: string
}) {
  const { идёт, ошибка, выполнить } = useAction()
  const [скопировано, установитьСкопировано] = useState(false)

  const ссылка = токен ? `${адресОснования}/api/care/share/${токен}` : null

  const копировать = async () => {
    if (!ссылка) return
    try {
      await navigator.clipboard.writeText(ссылка)
      установитьСкопировано(true)
      setTimeout(() => установитьСкопировано(false), 2000)
    } catch {
      // Буфер обмена может быть закрыт настройками браузера. Ссылка видна
      // целиком и выделяется мышью — кнопка тут удобство, а не единственный путь.
    }
  }

  return (
    <div style={{ marginTop: 12 }}>
      {!ссылка ? (
        <>
          <button
            className="ds-btn ds-btn-primary ds-btn-sm"
            disabled={идёт}
            onClick={() => выполнить(() => опубликоватьПодборку(caseId, shortlistId))}
          >
            {идёт ? 'Собираю страницу…' : 'Принять и собрать страницу клиенту'}
          </button>
          <p style={{ fontSize: 12, color: 'var(--ds-muted)', marginTop: 6 }}>
            Появится ссылка, которую можно переслать. На странице только список программ —
            ни имени, ни бюджета, ни переписки.
          </p>
        </>
      ) : (
        <div>
          <div style={{ fontSize: 12, color: 'var(--ds-muted)', marginBottom: 6 }}>
            Страница для клиента готова:
          </div>
          <div
            style={{
              fontSize: 12,
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
              background: 'var(--ds-bg-alt)',
              borderRadius: 8,
              padding: '8px 10px',
              wordBreak: 'break-all',
            }}
          >
            {ссылка}
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
            <button className="ds-btn ds-btn-secondary ds-btn-sm" onClick={копировать}>
              {скопировано ? 'Скопировано' : 'Скопировать ссылку'}
            </button>
            <a className="ds-btn ds-btn-ghost ds-btn-sm" href={ссылка} target="_blank" rel="noopener noreferrer">
              Открыть
            </a>
            <button
              className="ds-btn ds-btn-ghost ds-btn-sm"
              disabled={идёт}
              onClick={() => выполнить(() => отозватьСсылку(caseId, shortlistId))}
            >
              Отозвать
            </button>
          </div>
          <p style={{ fontSize: 12, color: 'var(--ds-muted)', marginTop: 8 }}>
            Кто знает ссылку — видит страницу. Отозвать можно в любой момент: старый адрес
            перестанет работать сразу.
          </p>
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
