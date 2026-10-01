/**
 * Программа в подборке — карточкой, а не строкой.
 *
 * ПОЧЕМУ КАРТОЧКАМИ. Подборка из десяти программ списком — это два экрана
 * прокрутки, по которым куратор ищет глазами одну строку. Карточками те же
 * десять видны разом, и порядок — кто первый, кто пятый — читается сразу.
 * Так же устроена подборка в кабинете клиента: куратор и клиент должны
 * обсуждать одно и то же, а не два разных вида одного списка.
 *
 * ЧТО ВИДНО СРАЗУ, А ЧТО ПОД «ПОДРОБНЕЕ». Снаружи — вуз, программа, место,
 * стоимость, почему подходит и всё, что не сходится. Под раскрытием —
 * подтверждённое с цитатами со страницы вуза: это нужно, когда куратор
 * проверяет, а не когда он выбирает.
 *
 * Несходящееся наружу намеренно. «Не подходит по языку» — единственное, ради
 * чего вся проверка и затевалась; спрятать его под раскрытие значит спрятать
 * ровно то, что человек должен увидеть, не нажимая ничего.
 */
import { буквыВуза, цветВуза } from '@/lib/care/herb'
import { ProgramControls } from './cases/[id]/CaseOperations'

export type СтрокаПодборки = {
  id: string
  program_ref: Record<string, unknown>
  tuition_amount: number | null
  currency: string | null
  fit_notes: Record<string, unknown>
  unresolved: string[]
  status: string
  removed_reason?: string | null
}

function сверка(з: Record<string, unknown>): { вид: string; вывод: string; объяснение: string }[] {
  const с = (з as { сверка?: unknown }).сверка
  return Array.isArray(с) ? (с as { вид: string; вывод: string; объяснение: string }[]) : []
}

function проверенное(з: Record<string, unknown>): { вид: string; значение: string; цитата: string }[] {
  const с = (з as { проверено?: unknown }).проверено
  return Array.isArray(с) ? (с as { вид: string; значение: string; цитата: string }[]) : []
}

export function ProgramCard({
  caseId,
  строка,
  номер,
  первая,
  последняя,
}: {
  caseId: string
  строка: СтрокаПодборки
  номер: number
  первая: boolean
  последняя: boolean
}) {
  const ref = строка.program_ref as Record<string, string>
  const почему = (строка.fit_notes as { почему?: string }).почему
  const вуз = ref.вуз ?? ''
  const несходится = сверка(строка.fit_notes).filter((в) => в.вывод !== 'подходит')
  const подтверждено = проверенное(строка.fit_notes)

  const место = [ref.город, ref.страна].filter(Boolean).join(', ')
  const цена = строка.tuition_amount
    ? `${строка.tuition_amount} ${строка.currency ?? ''}`.trim()
    : 'стоимость не указана'

  return (
    <article className="care-prog" data-chosen={строка.status === 'chosen' ? '1' : '0'}>
      <div className="care-prog-head">
        {/* Знак рисуем сами: в справочнике под видом логотипов лежат ссылки на
            чужие сервисы фавиконок, а эту же карточку увидит клиент. */}
        <span
          aria-hidden
          className="care-prog-mark"
          style={{
            background: цветВуза(вуз),
            fontSize: буквыВуза(вуз).length > 2 ? 11 : 13,
          }}
        >
          {буквыВуза(вуз)}
        </span>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div className="care-prog-name">{ref.программа}</div>
          <div className="care-prog-where">{вуз}</div>
        </div>
        <span className="care-prog-num">#{номер}</span>
      </div>

      <div className="care-prog-where">
        {[место, цена].filter(Boolean).join(' · ')}
      </div>

      {строка.status === 'chosen' && (
        <span className="ds-chip ds-chip-info" style={{ alignSelf: 'flex-start' }}>
          выбор клиента
        </span>
      )}

      {почему && <div className="care-prog-why">{почему}</div>}

      {несходится.map((в, i) => (
        <div
          key={i}
          style={{
            fontSize: 12,
            padding: '6px 9px',
            borderRadius: 7,
            background:
              в.вывод === 'не подходит'
                ? 'var(--ds-error-soft, var(--ds-bg))'
                : 'var(--ds-amber-soft, var(--ds-bg))',
            color: в.вывод === 'не подходит' ? 'var(--ds-error-ink)' : 'inherit',
          }}
        >
          {в.вывод === 'не подходит' ? 'Не подходит: ' : 'Неясно: '}
          {в.объяснение}
        </div>
      ))}

      {/* «Что проверить» не прячем: это честность подборки, и пустым оно
          почти не бывает. */}
      {строка.unresolved.length > 0 && (
        <div style={{ fontSize: 12, color: 'var(--ds-amber-ink, var(--ds-muted))' }}>
          Проверить: {строка.unresolved.join(' · ')}
        </div>
      )}

      {(подтверждено.length > 0 || ref.ссылка) && (
        <details>
          <summary className="care-prog-more">
            {подтверждено.length > 0
              ? `Подробнее · проверено ${подтверждено.length}`
              : 'Подробнее'}
          </summary>
          <div style={{ marginTop: 8, display: 'grid', gap: 6 }}>
            {ref.ссылка && (
              <a
                href={ref.ссылка}
                target="_blank"
                rel="noopener noreferrer"
                className="ds-link"
                style={{ fontSize: 12 }}
              >
                страница программы ↗
              </a>
            )}
            {подтверждено.map((т, i) => (
              <div key={i} style={{ fontSize: 12, color: 'var(--ds-success-ink)' }}>
                ✓ {т.вид}: {т.значение}
                {т.цитата && (
                  <div
                    style={{
                      color: 'var(--ds-muted)',
                      marginTop: 2,
                      paddingLeft: 10,
                      borderLeft: '2px solid var(--ds-border-soft)',
                    }}
                  >
                    «{т.цитата.length > 160 ? `${т.цитата.slice(0, 160)}…` : т.цитата}»
                  </div>
                )}
              </div>
            ))}
          </div>
        </details>
      )}

      <div style={{ marginTop: 'auto' }}>
        <ProgramControls
          caseId={caseId}
          itemId={строка.id}
          статус={строка.status}
          первая={первая}
          последняя={последняя}
        />
      </div>
    </article>
  )
}
