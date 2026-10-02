/**
 * На проверку. Раздел 8 дизайн-документа.
 *
 * Однородные мелочи проверяются подряд, а не через открытие двадцати
 * карточек. Куратор физически не может проверять всё, если каждая мелочь
 * требует навигации.
 *
 * Здесь черновики фактов, а рядом три очереди с одной формой «1 из N»:
 * напоминания, подборки и расхождения. Форма одна нарочно — куратор учит её
 * один раз.
 */
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { сессияКонтура } from '@/lib/care/session'
import { очередьПроверки } from '@/lib/care/cases'
import { подписьПоля, подписьЗначения, периодПоля, инициалы, склонение } from '@/lib/care/labels'
import { FactActions } from '../cases/[id]/CaseOperations'

export const dynamic = 'force-dynamic'

export default async function НаПроверкуСтраница() {
  const сессия = await сессияКонтура()
  if (!сессия?.участник) notFound()

  const очередь = await очередьПроверки(сессия.участник)
  const всего = очередь.reduce((s, д) => s + д.факты.length, 0)

  return (
    <>
      <h1 className="ds-hero-h1" style={{ fontSize: 30, marginBottom: 4 }}>
        На проверку
      </h1>
      <p style={{ marginBottom: 10 }}>
        <Link href="/care/review/reminders" className="ds-link" style={{ fontSize: 14 }}>
          Напоминания клиентам →
        </Link>
        {'  ·  '}
        <Link href="/care/review/shortlists" className="ds-link" style={{ fontSize: 14 }}>
          Подборки программ →
        </Link>
        {'  ·  '}
        <Link href="/care/review/facts" className="ds-link" style={{ fontSize: 14 }}>
          Расхождения в сведениях →
        </Link>
        {'  ·  '}
        <Link href="/care/review/sends" className="ds-link" style={{ fontSize: 14 }}>
          Что ушло клиентам →
        </Link>
      </p>
      <p style={{ color: 'var(--ds-muted)', marginBottom: 22, fontSize: 14 }}>
        {всего === 0
          ? 'Ничего не ждёт вашего решения'
          : `${всего} ${склонение(всего, 'запись ждёт', 'записи ждут', 'записей ждут')} решения у ${очередь.length} ${склонение(очередь.length, 'клиента', 'клиентов', 'клиентов')}`}
      </p>

      {всего === 0 ? (
        <div className="ds-empty">
          <div className="ds-empty-title">Всё проверено</div>
          <p style={{ fontSize: 14, color: 'var(--ds-muted)', maxWidth: 460, margin: '8px auto 0' }}>
            Неподтверждённых сведений нет. Новые появятся, когда помощник разберёт
            встречу или сообщение.
          </p>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 16 }}>
          {очередь.map((д) => (
            <div key={д.caseId} className="ds-card">
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
                <span className="care-ava">{инициалы(д.имяКлиента)}</span>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <Link href={`/care/cases/${д.caseId}`} className="ds-link" style={{ fontWeight: 700, fontSize: 16 }}>
                    {д.имяКлиента}
                  </Link>
                  {д.is_synthetic && <span className="ds-chip ds-chip-warning">тест</span>}
                  <div style={{ fontSize: 12, color: 'var(--ds-muted)' }}>{д.контекст}</div>
                </div>
                <span className="care-sec-count">
                  {д.факты.length} {склонение(д.факты.length, 'запись', 'записи', 'записей')}
                </span>
              </div>

              {д.факты.map((ф) => (
                <div key={ф.id} className="care-fact">
                  <div className="care-fact-name">{подписьПоля(ф.field)}</div>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
                    {/* Если поле уже заполнено, показываем «было → стало».
                        Принять замену, не увидев, что заменяешь, — это не
                        решение, а нажатие кнопки. */}
                    {ф.заменяет && (
                      <>
                        <span
                          style={{
                            fontSize: 15,
                            color: 'var(--ds-stale)',
                            textDecoration: 'line-through',
                          }}
                        >
                          {подписьЗначения(ф.field, ф.заменяет.значение)}
                          {ф.заменяет.currency ? ` ${ф.заменяет.currency}` : ''}
                        </span>
                        <span style={{ color: 'var(--ds-muted)' }}>→</span>
                      </>
                    )}
                    <span className="care-fact-value" data-state="draft">
                      {подписьЗначения(ф.field, ф.value)}
                      {ф.currency ? ` ${ф.currency}` : ''}
                      {периодПоля(ф.field) ? ` ${периодПоля(ф.field)}` : ''}
                    </span>
                    {ф.is_plan && <span className="ds-chip ds-chip-warning">намерение, не результат</span>}
                    {ф.заменяет && <span className="ds-chip ds-chip-warning">заменит текущее</span>}
                  </div>
                  {/* Цитата обязательна: без неё проверить нечего, а значит
                      и принимать нечего. */}
                  {ф.заменяет?.цитата && (
                    <div className="care-fact-src" style={{ color: 'var(--ds-stale)' }}>
                      прежнее стояло на: «{ф.заменяет.цитата}»
                    </div>
                  )}
                  {ф.quote ? (
                    <div className="care-fact-src">«{ф.quote}»</div>
                  ) : (
                    <div style={{ fontSize: 12, color: 'var(--ds-stale)', marginTop: 5 }}>
                      источник не указан — проверить нечем
                    </div>
                  )}
                  <FactActions
                    caseId={д.caseId}
                    factId={ф.id}
                    значение={подписьЗначения(ф.field, ф.value)}
                    валюта={ф.currency}
                    деньги={ф.field.startsWith('budget.')}
                  />
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </>
  )
}
