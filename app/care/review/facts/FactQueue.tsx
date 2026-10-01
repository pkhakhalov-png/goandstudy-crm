'use client'

/**
 * Очередь расхождений: одно на экране, решение и дальше.
 *
 * ЧТО ТУТ РЕШАЕТСЯ. Клиент сказал одно, потом другое, и оба раза при
 * свидетелях. Куратор выбирает, какое из двух считать правдой, — и это
 * переписывает то, что он сам однажды подтвердил. Поэтому на экране всё, что
 * нужно для решения, и ничего сверх: прежнее значение, новое, точные слова и
 * кто их сказал.
 *
 * ПОЧЕМУ ПО ОДНОМУ. Список провоцирует пролистать и нажать «принять всё». Здесь
 * каждое нажатие меняет то, на чём стоят подборка, сроки и разговор с клиентом.
 *
 * ПОЧЕМУ «ПРИНЯТЬ» НЕ ПЕРЕСОБИРАЕТ ПОДБОРКУ. Приняв новый бюджет, куратор ещё
 * не решил, что делать со списком, который он выверил руками. Он увидит в
 * карточке полосу «основание изменилось» и нажмёт «Найти замену», когда будет
 * готов.
 */
import { useState, useTransition } from 'react'
import Link from 'next/link'
import { принятьНовое, отклонитьНовое, уточнитьУКлиента } from './actions'

export type Расхождение = {
  proposalId: string
  caseId: string
  имяКлиента: string
  контекст: string
  is_synthetic: boolean
  поле: string
  подписьПоля: string
  было: string
  стало: string
  цитата: string | null
  ктоСказал: string | null
  этоНамерение: boolean
  когда: string
}

const КТО: Record<string, string> = {
  student: 'студент',
  parent: 'родитель',
  curator: 'куратор',
  other: 'кто-то из переписки',
}

export function FactQueue({ очередь }: { очередь: Расхождение[] }) {
  const [номер, установитьНомер] = useState(0)
  const [причина, установитьПричину] = useState('')
  const [отклоняем, отклонять] = useState(false)
  const [сообщение, установитьСообщение] = useState<string | null>(null)
  const [ошибка, установитьОшибку] = useState<string | null>(null)
  const [идёт, начать] = useTransition()

  if (!очередь.length) {
    return (
      <div className="ds-empty">
        <div className="ds-empty-title">Расхождений нет</div>
        <p style={{ fontSize: 14, color: 'var(--ds-muted)', maxWidth: 480, margin: '8px auto 0' }}>
          Они появятся, когда клиент скажет про бюджет, страну или сроки не то, что
          записано в карточке. Пока всё сходится.
        </p>
      </div>
    )
  }

  const текущее = очередь[Math.min(номер, очередь.length - 1)]
  const последнее = номер >= очередь.length - 1

  const дальше = () => {
    установитьПричину('')
    отклонять(false)
    if (!последнее) установитьНомер((н) => н + 1)
  }

  const решить = (что: () => Promise<{ ok: boolean } & Record<string, unknown>>) =>
    начать(async () => {
      установитьОшибку(null)
      const о = await что()
      if (о.ok) {
        установитьСообщение(String(о.текст ?? 'Готово'))
        дальше()
      } else {
        установитьОшибку(String(о.ошибка ?? 'Не вышло'))
      }
    })

  return (
    <div className="ds-card" style={{ padding: 0, overflow: 'hidden' }}>
      <div className="care-оч-шапка">
        <div>
          <div style={{ fontWeight: 700, fontSize: 17 }}>
            {текущее.имяКлиента}
            {текущее.is_synthetic && (
              <span className="ds-chip ds-chip-warning" style={{ marginLeft: 8, fontSize: 11 }}>
                тестовое
              </span>
            )}
          </div>
          {текущее.контекст && (
            <div style={{ fontSize: 12, color: 'var(--ds-muted)' }}>{текущее.контекст}</div>
          )}
        </div>
        <div style={{ fontSize: 12, color: 'var(--ds-muted)' }}>
          {номер + 1} из {очередь.length}
        </div>
      </div>

      <div style={{ padding: '18px 20px' }}>
        <div className="ds-label" style={{ marginBottom: 10 }}>
          {текущее.подписьПоля}
        </div>

        {/* Было → стало крупно и рядом: это и есть решение, остальное — опоры. */}
        <div className="care-было-стало">
          <div className="care-бс-часть">
            <div className="care-бс-метка">в карточке</div>
            <div className="care-бс-значение">{текущее.было}</div>
          </div>
          <div className="care-бс-стрелка" aria-hidden>
            →
          </div>
          <div className="care-бс-часть" data-новое="1">
            <div className="care-бс-метка">услышали</div>
            <div className="care-бс-значение">{текущее.стало}</div>
          </div>
        </div>

        {текущее.этоНамерение && (
          <div className="ds-chip ds-chip-warning" style={{ marginTop: 12 }}>
            сказано как намерение, а не как решение
          </div>
        )}

        {текущее.цитата ? (
          <blockquote className="care-цитата">
            «{текущее.цитата}»
            {текущее.ктоСказал && (
              <footer style={{ marginTop: 6, fontSize: 12, color: 'var(--ds-muted)' }}>
                — {КТО[текущее.ктоСказал] ?? текущее.ктоСказал}
              </footer>
            )}
          </blockquote>
        ) : (
          // Без точных слов решение принимается на веру, и об этом надо сказать
          // прямо: куратор должен сходить в переписку сам.
          <p style={{ fontSize: 13, color: 'var(--ds-error-ink)', marginTop: 12 }}>
            Точных слов не сохранилось — проверьте в переписке, прежде чем принимать.
          </p>
        )}

        <p style={{ fontSize: 12, color: 'var(--ds-muted)', marginTop: 12 }}>
          <Link href={`/care/cases/${текущее.caseId}`} className="ds-link">
            Открыть дело →
          </Link>
        </p>

        {отклоняем ? (
          <div style={{ marginTop: 16 }}>
            <textarea
              className="ds-input"
              rows={2}
              placeholder="Почему отклоняем — это останется в истории дела"
              value={причина}
              onChange={(e) => установитьПричину(e.target.value)}
              style={{ width: '100%', resize: 'vertical' }}
            />
            <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
              <button
                className="ds-btn ds-btn-primary ds-btn-sm"
                disabled={идёт || !причина.trim()}
                onClick={() => решить(() => отклонитьНовое(текущее.proposalId, причина))}
              >
                Отклонить
              </button>
              <button
                className="ds-btn ds-btn-ghost ds-btn-sm"
                onClick={() => отклонять(false)}
                disabled={идёт}
              >
                Назад
              </button>
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', gap: 8, marginTop: 18, flexWrap: 'wrap' }}>
            <button
              className="ds-btn ds-btn-primary ds-btn-sm"
              disabled={идёт}
              onClick={() => решить(() => принятьНовое(текущее.proposalId))}
            >
              Принять новое
            </button>
            <button
              className="ds-btn ds-btn-secondary ds-btn-sm"
              disabled={идёт}
              onClick={() => решить(() => уточнитьУКлиента(текущее.proposalId))}
            >
              Уточнить у клиента
            </button>
            <button
              className="ds-btn ds-btn-ghost ds-btn-sm"
              disabled={идёт}
              onClick={() => отклонять(true)}
            >
              Отклонить
            </button>
            {!последнее && (
              <button
                className="ds-btn ds-btn-ghost ds-btn-sm"
                disabled={идёт}
                onClick={дальше}
                title="Вернётся в очередь — решение не принято"
              >
                Пропустить
              </button>
            )}
          </div>
        )}

        {сообщение && (
          <p style={{ fontSize: 12, color: 'var(--ds-muted)', marginTop: 12 }}>{сообщение}</p>
        )}
        {ошибка && (
          <p style={{ fontSize: 12, color: 'var(--ds-error-ink)', marginTop: 12 }}>{ошибка}</p>
        )}
      </div>
    </div>
  )
}
