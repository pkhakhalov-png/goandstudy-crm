/**
 * Дело клиента. Раздел 5 дизайн-документа.
 *
 * Не вкладки, а три колонки: контекст · работа · помощник. Вкладки прячут
 * противоречия — профиль в одной, переписка в другой, и то, что они
 * расходятся, не видно никогда.
 *
 * Надёжность каждого факта видна глазом, без наведения и без клика:
 * подтверждённый — с галочкой и датой, машинный непроверенный — пунктиром
 * индиго, заменённый — зачёркнут. Это не украшение: без источника и цитаты
 * предложение ИИ проверить нельзя, а значит нельзя и принять.
 */
import Link from 'next/link'
import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import { сессияКонтура } from '@/lib/care/session'
import { подробностиДела, коллегиДляПередачи } from '@/lib/care/cases'
import { подписьПоля, подписьЗначения, периодПоля, подписьСтатуса, подписьОжидания, срок, инициалы, склонение } from '@/lib/care/labels'
import { буквыВуза, цветВуза } from '@/lib/care/herb'
import { PublishShortlist, CaseAssistant, NewTask, ProgramControls, TaskActions, FactActions, FactIsDecision, TransferCase } from './CaseOperations'
import { AssistantPanel } from '../../AssistantPanel'
import { историяПомощника } from '../../assistant-actions'
import { флагВключён } from '@/lib/care/flags'

export const dynamic = 'force-dynamic'

/** Выводы сверки проверенного с фактами клиента. */
function сверка(заметки: Record<string, unknown>): { вид: string; вывод: string; объяснение: string }[] {
  const список = (заметки as { сверка?: unknown }).сверка
  if (!Array.isArray(список)) return []
  return список as { вид: string; вывод: string; объяснение: string }[]
}

/** Что в строке подборки уже проверено на сайте вуза. */
function проверенное(
  заметки: Record<string, unknown>
): { вид: string; значение: string; цитата: string }[] {
  const список = (заметки as { проверено?: unknown }).проверено
  if (!Array.isArray(список)) return []
  return список as { вид: string; значение: string; цитата: string }[]
}

export default async function ДелоСтраница({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  // Адрес, на котором стоит кабинет: ссылку для клиента нельзя собрать из
  // ничего, а на превью и в бою он разный. Берём из заголовков запроса, а не
  // из переменной окружения: переменную забудут переставить при переезде, а
  // заголовок всегда говорит, откуда пришли на самом деле.
  const заголовки = await headers()
  const хост = заголовки.get('x-forwarded-host') ?? заголовки.get('host') ?? ''
  const схема = заголовки.get('x-forwarded-proto') ?? (хост.startsWith('localhost') ? 'http' : 'https')
  const адресОснования = хост ? `${схема}://${хост}` : ''
  // Превью закрыто Deployment Protection: ссылка для клиента там не работает,
  // и куратор должен узнать об этом от нас, а не от клиента.
  const боевойАдрес = хост.endsWith('crm.goandstudy.com')
  const сессия = await сессияКонтура()
  if (!сессия?.участник) notFound()

  const [д, коллеги, помощникВключён] = await Promise.all([
    подробностиДела(сессия.участник, id),
    коллегиДляПередачи(сессия.участник),
    флагВключён('ai', { memberId: сессия.участник.id }),
  ])
  // Нет доступа и нет дела отвечают одинаково: разные ответы рассказали бы
  // постороннему, что дело существует.
  if (!д) notFound()

  const черновиков = д.факты.filter((ф) => ф.status === 'draft').length

  // Отклонённое и заменённое — это не то, что известно. Куратор уже сказал по
  // ним «нет»; показывать их в списке сведений значит спорить с его решением
  // и засорять экран, на котором он ищет текущую картину.
  const известное = д.факты.filter((ф) => ф.status === 'confirmed' || ф.status === 'draft')
  const открытыхЗадач = д.задачи.filter((з) => з.status !== 'done' && з.status !== 'failed').length

  return (
    <>
      <Link href="/care/cases" className="ds-link" style={{ fontSize: 13 }}>
        ← Клиенты
      </Link>

      <div className="care-case" style={{ marginTop: 16 }}>
        {/* ── Контекст ───────────────────────────────────────────────── */}
        <aside className="care-case-ctx">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
            <span className="care-ava" data-size="lg">
              {инициалы(д.имяКлиента)}
            </span>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 700, fontSize: 19, lineHeight: 1.2 }}>{д.имяКлиента}</div>
              <div style={{ fontSize: 12, color: 'var(--ds-muted)' }}>
                Куратор: {сессия.имя ?? 'вы'}
              </div>
            </div>
          </div>

          {д.дело.is_synthetic && (
            <div className="ds-chip ds-chip-warning" style={{ marginBottom: 12 }}>
              тестовое дело
            </div>
          )}

          {/* Цикл поступления показывается всегда, даже когда он один:
              интерфейс должен приучать, что заявки принадлежат циклу. */}
          <div className="ds-card" style={{ padding: 14, marginBottom: 12 }}>
            <div className="ds-label" style={{ marginBottom: 6 }}>
              Цикл поступления
            </div>
            <div style={{ fontWeight: 600 }}>
              {д.дело.intake_year}
              {д.дело.intake_term ? ` · ${д.дело.intake_term}` : ''}
            </div>
            {д.дело.service_scope && (
              <div style={{ fontSize: 13, color: 'var(--ds-muted)', marginTop: 2 }}>
                {д.дело.service_scope}
              </div>
            )}
          </div>

          <div className="ds-card" style={{ padding: 14, marginBottom: 12 }}>
            <div className="ds-label" style={{ marginBottom: 8 }}>
              В деле
            </div>
            <div style={{ display: 'grid', gap: 5, fontSize: 13 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Задачи</span>
                <span style={{ fontWeight: 600 }}>{открытыхЗадач}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Что известно</span>
                <span style={{ fontWeight: 600 }}>
                  {известное.length}
                  {черновиков > 0 && (
                    <span style={{ color: 'var(--ds-ai)', marginLeft: 5 }} title="не подтверждено">
                      ●{черновиков}
                    </span>
                  )}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Документы</span>
                <span style={{ fontWeight: 600 }}>{д.документы.length}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Источники</span>
                <span style={{ fontWeight: 600 }}>{д.источники.length}</span>
              </div>
            </div>
          </div>

          <TransferCase caseId={id} кандидаты={коллеги} />
        </aside>

        {/* ── Работа ─────────────────────────────────────────────────── */}
        <div>
          <section className="care-sec">
            <div className="care-sec-head">
              <h2 className="ds-label" style={{ margin: 0 }}>
                Что известно
              </h2>
              <span className="care-sec-count">
                {черновиков > 0 ? `${черновиков} не подтверждено` : 'всё подтверждено'}
              </span>
            </div>
            <div className="ds-card">
              {известное.length === 0 ? (
                <p style={{ fontSize: 13, color: 'var(--ds-muted)', margin: 0 }}>
                  Пока ничего не записано. Факты появятся, когда помощник разберёт встречу.
                </p>
              ) : (
                известное.map((ф) => (
                  <div key={ф.id} className="care-fact">
                    <div className="care-fact-name">{подписьПоля(ф.field)}</div>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
                      <span className="care-fact-value" data-state={ф.status}>
                        {подписьЗначения(ф.field, ф.value)}
                        {ф.currency ? ` ${ф.currency}` : ''}
                        {периодПоля(ф.field) ? ` ${периодПоля(ф.field)}` : ''}
                      </span>
                      {ф.status === 'confirmed' && (
                        <span style={{ fontSize: 12, color: 'var(--ds-success-ink)' }}>
                          ✓ подтверждено
                        </span>
                      )}
                      {ф.is_plan && (
                        <>
                          <span className="ds-chip ds-chip-warning">намерение, не результат</span>
                          {/* Подбор по намерению не работает — и кнопка стоит
                              там, где написана причина, а не в меню. */}
                          {ф.status === 'confirmed' && <FactIsDecision caseId={id} factId={ф.id} />}
                        </>
                      )}
                    </div>
                    {ф.quote && <div className="care-fact-src">«{ф.quote}»</div>}
                    {ф.status === 'draft' && (
                      <FactActions
                        caseId={id}
                        factId={ф.id}
                        значение={подписьЗначения(ф.field, ф.value)}
                        валюта={ф.currency}
                        деньги={ф.field.startsWith('budget.')}
                      />
                    )}
                  </div>
                ))
              )}
            </div>
          </section>

          <section className="care-sec">
            <div className="care-sec-head">
              <h2 className="ds-label" style={{ margin: 0 }}>
                Подборка и стратегия
              </h2>
              <CaseAssistant caseId={id} />
            </div>
            <div className="ds-card">
              {д.подборка ? (
                <>
                  <div style={{ fontSize: 12, color: 'var(--ds-muted)', marginBottom: 10 }}>
                    Подборка №{д.подборка.version} · {д.подборка.строки.length}{' '}
                    {склонение(д.подборка.строки.length, 'программа', 'программы', 'программ')} · собрана{' '}
                    {new Date(д.подборка.created_at).toLocaleDateString('ru-RU')}
                  </div>
                  {(() => {
                    const живые = д.подборка.строки.filter((с) => с.status !== 'removed')
                    return живые
                  })().map((с, индекс, живые) => {
                    const ref = с.program_ref as Record<string, string>
                    const почему = (с.fit_notes as { почему?: string }).почему
                    return (
                      <div
                        key={с.id}
                        className="care-fact"
                        style={с.status === 'chosen' ? { borderLeft: '3px solid var(--ds-ai)', paddingLeft: 10 } : undefined}
                      >
                        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                          {/* Знак рисуем сами: в справочнике под видом логотипов
                              лежат ссылки на чужие сервисы фавиконок, а страницу
                              открывает клиент. */}
                          <span
                            aria-hidden
                            style={{
                              flex: '0 0 auto',
                              width: 38,
                              height: 38,
                              borderRadius: 10,
                              background: цветВуза(ref.вуз ?? ''),
                              color: '#fff',
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontSize: буквыВуза(ref.вуз ?? '').length > 2 ? 11 : 13,
                              fontWeight: 650,
                              letterSpacing: '.02em',
                            }}
                          >
                            {буквыВуза(ref.вуз ?? '')}
                          </span>
                          <div style={{ minWidth: 0, flex: 1 }}>
                            <div style={{ fontSize: 15, fontWeight: 500 }}>
                              {ref.вуз} — {ref.программа}
                            </div>
                            <div style={{ fontSize: 12, color: 'var(--ds-muted)', marginTop: 2 }}>
                              {[ref.город, ref.страна, с.tuition_amount ? `${с.tuition_amount} ${с.currency ?? ''}`.trim() : 'стоимость не указана']
                                .filter(Boolean)
                                .join(' · ')}
                            </div>
                          </div>
                        </div>
                        {почему && (
                          <div style={{ fontSize: 13, marginTop: 5, lineHeight: 1.5 }}>{почему}</div>
                        )}
                        {ref.ссылка && (
                          <div style={{ marginTop: 5 }}>
                            <a
                              href={ref.ссылка}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="ds-link"
                              style={{ fontSize: 12 }}
                            >
                              страница программы ↗
                            </a>
                            {ref.проверено && (
                              <span style={{ fontSize: 12, color: 'var(--ds-muted)' }}>
                                {' '}· проверено {ref.проверено}
                              </span>
                            )}
                          </div>
                        )}
                        {/* Сверка идёт первой: «не подходит» важнее всего
                            остального в строке, и прятать его под цитатами
                            значит прятать единственное, ради чего всё это. */}
                        {сверка(с.fit_notes)
                          .filter((в) => в.вывод !== 'подходит')
                          .map((в, i) => (
                            <div
                              key={`с${i}`}
                              style={{
                                fontSize: 13,
                                marginTop: 6,
                                padding: '6px 9px',
                                borderRadius: 7,
                                background:
                                  в.вывод === 'не подходит'
                                    ? 'var(--ds-error-soft, var(--ds-bg-alt))'
                                    : 'var(--ds-amber-soft, var(--ds-bg-alt))',
                                color:
                                  в.вывод === 'не подходит'
                                    ? 'var(--ds-error-ink)'
                                    : 'var(--ds-ink, inherit)',
                              }}
                            >
                              {в.вывод === 'не подходит' ? 'Не подходит: ' : 'Неясно: '}
                              {в.объяснение}
                            </div>
                          ))}

                        {/* Проверенное на сайте вуза — с цитатой. Это то, ради
                            чего проверка и затевалась: строка «что проверить»
                            превращается в ответ, который можно показать клиенту. */}
                        {проверенное(с.fit_notes).map((т, i) => (
                          <div
                            key={i}
                            style={{ fontSize: 12, color: 'var(--ds-success-ink)', marginTop: 5 }}
                          >
                            ✓ {т.вид}: {т.значение}
                            {т.цитата && (
                              <div
                                style={{
                                  color: 'var(--ds-muted)',
                                  marginTop: 2,
                                  paddingLeft: 10,
                                  borderLeft: '2px solid var(--ds-line, var(--ds-muted))',
                                }}
                              >
                                «{т.цитата.length > 160 ? `${т.цитата.slice(0, 160)}…` : т.цитата}»
                              </div>
                            )}
                          </div>
                        ))}

                        {/* Список «что проверить» не прячем под «подробнее»: он и
                            есть честность этой подборки. Пустым он не бывает. */}
                        {с.unresolved.length > 0 && (
                          <div style={{ fontSize: 12, color: 'var(--ds-amber-ink, var(--ds-muted))', marginTop: 5 }}>
                            Проверить: {с.unresolved.join(' · ')}
                          </div>
                        )}

                        <ProgramControls
                          caseId={id}
                          itemId={с.id}
                          статус={с.status}
                          первая={индекс === 0}
                          последняя={индекс === живые.length - 1}
                        />
                      </div>
                    )
                  })}

                  {/* Убранное не прячем совсем: «почему мы не рассматривали
                      Мюнхен» — обычный вопрос через месяц. */}
                  {д.подборка.строки.some((с) => с.status === 'removed') && (
                    <details style={{ marginTop: 10 }}>
                      <summary style={{ fontSize: 12, color: 'var(--ds-muted)', cursor: 'pointer' }}>
                        Убранные ({д.подборка.строки.filter((с) => с.status === 'removed').length})
                      </summary>
                      {д.подборка.строки
                        .filter((с) => с.status === 'removed')
                        .map((с) => {
                          const ref = с.program_ref as Record<string, string>
                          return (
                            <div key={с.id} style={{ fontSize: 13, color: 'var(--ds-muted)', marginTop: 8 }}>
                              <span style={{ textDecoration: 'line-through' }}>
                                {ref.вуз} — {ref.программа}
                              </span>
                              {с.removed_reason && <> · {с.removed_reason}</>}
                              <ProgramControls
                                caseId={id}
                                itemId={с.id}
                                статус={с.status}
                                первая={false}
                                последняя={false}
                              />
                            </div>
                          )
                        })}
                    </details>
                  )}

                  <PublishShortlist
                    caseId={id}
                    shortlistId={д.подборка.id}
                    токен={д.подборка.share_token}
                    адресОснования={адресОснования}
                    боевойАдрес={боевойАдрес}
                  />
                </>
              ) : (
                <p style={{ fontSize: 13, color: 'var(--ds-muted)', margin: 0 }}>
                  Подборки ещё нет. Нужны подтверждённые страна и направление — по ним и
                  подбирается.
                </p>
              )}

              {д.стратегия && (
                <div
                  style={{
                    marginTop: 14,
                    paddingTop: 14,
                    borderTop: '1px solid var(--ds-line, var(--ds-muted))',
                  }}
                >
                  <div style={{ fontSize: 12, color: 'var(--ds-muted)', marginBottom: 6 }}>
                    Стратегия поступления · черновик от{' '}
                    {new Date(д.стратегия.created_at).toLocaleDateString('ru-RU')}
                  </div>
                  <div style={{ fontSize: 14, lineHeight: 1.65, whiteSpace: 'pre-line' }}>
                    {д.стратегия.текст}
                  </div>
                </div>
              )}
            </div>
          </section>

          <section className="care-sec">
            <div className="care-sec-head">
              <h2 className="ds-label" style={{ margin: 0 }}>
                План и задачи
              </h2>
              <NewTask caseId={id} />
            </div>
            <div className="ds-card">
              {д.задачи.length === 0 ? (
                <p style={{ fontSize: 13, color: 'var(--ds-muted)', margin: 0 }}>
                  Задач нет — завести первую.
                </p>
              ) : (
                д.задачи.map((з) => {
                  const с = срок(з.due_on)
                  const ждём = подписьОжидания(з.waiting_on)
                  return (
                    <div key={з.id} className="care-fact">
                      <div style={{ fontSize: 15, fontWeight: 500 }}>{з.title}</div>
                      {з.details && (
                        <div style={{ fontSize: 12, color: 'var(--ds-ink-dim)', marginTop: 3, whiteSpace: 'pre-line' }}>
                          {з.details.length > 220 ? `${з.details.slice(0, 220)}…` : з.details}
                        </div>
                      )}
                      <div
                        style={{
                          fontSize: 12,
                          color:
                            с.уровень === 'просрочен' ? 'var(--ds-error-ink)' : 'var(--ds-muted)',
                          marginTop: 2,
                        }}
                      >
                        {[подписьСтатуса(з.status), ждём, з.due_on ? с.текст : null]
                          .filter(Boolean)
                          .join(' · ')}
                        {с.дата && <span style={{ color: 'var(--ds-muted)' }}> ({с.дата})</span>}
                      </div>
                      <TaskActions
                        caseId={id}
                        taskId={з.id}
                        статус={з.status}
                        ждём={з.waiting_on}
                        срок={з.due_on}
                      />
                    </div>
                  )
                })
              )}
            </div>
          </section>

          <section className="care-sec">
            <div className="care-sec-head">
              <h2 className="ds-label" style={{ margin: 0 }}>
                Вузы и заявки
              </h2>
              <span className="care-sec-count">{д.заявки.length}</span>
            </div>
            <div className="ds-card">
              {д.заявки.length === 0 ? (
                <p style={{ fontSize: 13, color: 'var(--ds-muted)', margin: 0 }}>
                  Подборки нет — предложить варианты.
                </p>
              ) : (
                д.заявки.map((з) => {
                  const п = з.program_ref as {
                    title?: string
                    country?: string
                    tuition?: number | null
                    currency?: string | null
                    deadline?: string | null
                  }
                  const дедлайн = срок(п.deadline ?? null)
                  return (
                    <div key={з.id} className="care-fact">
                      <div style={{ fontSize: 14, fontWeight: 500 }}>{п.title ?? 'без названия'}</div>
                      <div style={{ fontSize: 12, color: 'var(--ds-muted)', marginTop: 2 }}>
                        {[
                          п.country,
                          п.tuition ? `${п.tuition.toLocaleString('ru-RU')} ${п.currency ?? ''} / год` : null,
                          п.deadline ? `дедлайн ${дедлайн.текст}` : null,
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </div>
                      {з.note && <div className="care-fact-src">{з.note}</div>}
                    </div>
                  )
                })
              )}
            </div>
          </section>

          <section className="care-sec">
            <div className="care-sec-head">
              <h2 className="ds-label" style={{ margin: 0 }}>
                Документы
              </h2>
              <span className="care-sec-count">из действующей CRM, только просмотр</span>
            </div>
            <div className="ds-card">
              {д.документы.length === 0 ? (
                <p style={{ fontSize: 13, color: 'var(--ds-muted)', margin: 0 }}>
                  Документы не загружены — запросить у клиента.
                </p>
              ) : (
                д.документы.map((док) => (
                  <div key={док.id} className="care-fact">
                    <div style={{ fontSize: 14 }}>{док.file_name ?? док.doc_type ?? 'без названия'}</div>
                    {док.status && (
                      <div style={{ fontSize: 12, color: 'var(--ds-muted)' }}>{док.status}</div>
                    )}
                  </div>
                ))
              )}
            </div>
          </section>

          <section className="care-sec">
            <div className="care-sec-head">
              <h2 className="ds-label" style={{ margin: 0 }}>
                Контакты
              </h2>
            </div>
            <div className="ds-card">
              {д.контакты.length === 0 ? (
                <p style={{ fontSize: 13, color: 'var(--ds-muted)', margin: 0 }}>
                  Контактов нет. Отправлять некому — и это к лучшему, пока их не проверили.
                </p>
              ) : (
                д.контакты.map((к) => (
                  <div key={к.id} className="care-fact">
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                      <span style={{ fontWeight: 600 }}>{к.name}</span>
                      <span className="ds-chip ds-chip-neutral">
                        {к.kind === 'student' ? 'студент' : к.kind === 'parent' ? 'родитель' : 'плательщик'}
                      </span>
                      {к.can_decide && <span className="ds-chip ds-chip-info">решает</span>}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--ds-muted)', marginTop: 2 }}>
                      {к.tg_chat_id ? 'группа в Телеграме привязана' : 'группа в Телеграме не привязана'}
                      {к.phone ? ` · ${к.phone}` : ''}
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>

          <section className="care-sec">
            <div className="care-sec-head">
              <h2 className="ds-label" style={{ margin: 0 }}>
                Переписка и источники
              </h2>
              <span className="care-sec-count">{д.источники.length}</span>
            </div>
            <div className="ds-card">
              {д.источники.length === 0 ? (
                <p style={{ fontSize: 13, color: 'var(--ds-muted)', margin: 0 }}>
                  Источников нет. Переписка переносится скриптом import-history.
                </p>
              ) : (
                д.источники.map((и) => {
                  const ссылка = и.ref as { title?: string; count?: number; from?: string; to?: string }
                  return (
                    <div key={и.id} className="care-fact">
                      <div style={{ fontSize: 14, fontWeight: 500 }}>
                        {ссылка.title ?? (и.kind === 'meeting' ? 'Встреча' : 'Источник')}
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--ds-muted)', marginTop: 2 }}>
                        {ссылка.count != null && `${ссылка.count} сообщений`}
                        {ссылка.from && ссылка.to && (
                          <> · {ссылка.from.slice(0, 10)} — {ссылка.to.slice(0, 10)}</>
                        )}
                        {!и.available && ' · первоисточник недоступен'}
                      </div>
                      {и.note && <div className="care-fact-src">{и.note}</div>}
                    </div>
                  )
                })
              )}
            </div>
          </section>

          <section className="care-sec">
            <div className="care-sec-head">
              <h2 className="ds-label" style={{ margin: 0 }}>
                История дела
              </h2>
            </div>
            <div className="ds-card">
              {д.журнал.length === 0 ? (
                <p style={{ fontSize: 13, color: 'var(--ds-muted)', margin: 0 }}>Записей нет.</p>
              ) : (
                д.журнал.map((с) => (
                  <div key={с.id} className="care-fact">
                    <div style={{ fontSize: 14 }}>{с.action}</div>
                    <div style={{ fontSize: 12, color: 'var(--ds-muted)' }}>
                      {new Date(с.created_at).toLocaleString('ru-RU')} · {с.actor_kind}
                      {с.reason ? ` · ${с.reason}` : ''}
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>
        </div>

        {/* ── Помощник ───────────────────────────────────────────────── */}
        <aside className="care-case-ai">
          <AssistantPanel
            caseId={id}
            областьПодпись={д.имяКлиента}
            доступен={помощникВключён}
            подсказки={['Сделай подборку программ', 'Что здесь требует решения?', 'Чего не хватает по этому делу?']}
            история={await историяПомощника(id)}
          />
        </aside>
      </div>
    </>
  )
}
