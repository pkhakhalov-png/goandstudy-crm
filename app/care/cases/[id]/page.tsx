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
import { состояниеОснования } from '@/lib/care/replace'
import { знакомыеГруппы } from '@/lib/care/chats'
import { состояниеПаузы } from '@/lib/care/pause'
import { подписьПоля, подписьЗначения, периодПоля, подписьСтатуса, подписьОжидания, срок, инициалы, склонение } from '@/lib/care/labels'
import { PublishShortlist, CaseAssistant, NewTask, ProgramControls, TaskActions, FactActions, FactIsDecision, TransferCase, ReplaceInShortlist, LinkChat, AnsweredMyself } from './CaseOperations'
import { CaseSection } from '../../CaseSection'
import { ProgramCard } from '../../ProgramCard'
import { AssistantPanel } from '../../AssistantPanel'
import { историяПомощника } from '../../assistant-actions'
import { флагВключён } from '@/lib/care/flags'

export const dynamic = 'force-dynamic'

export default async function ДелоСтраница({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  // Адрес, на котором стоит кабинет: ссылку для клиента нельзя собрать из
  // ничего, а на превью и в бою он разный. Берём из заголовков запроса, а не
  // из переменной окружения: переменную забудут переставить при переезде, а
  // заголовок всегда говорит, откуда пришли на самом деле.
  // Группы, которые знает бот: без них привязать чат можно только из
  // терминала, а без привязанного чата напоминание не уходит никуда.
  const группыБота = await знакомыеГруппы().catch(() => [])

  // Стоит ли пауза автонапоминаний: кнопка должна показывать состояние, а не
  // предлагать нажать второй раз то, что уже нажато.
  const пауза = await состояниеПаузы(id).catch(() => ({ наПаузе: false, до: null, когдаОтметили: null }))

  // Расхождение основания читается здесь же: подборка могла быть собрана при
  // другом бюджете, и узнать об этом надо до того, как её отдадут клиенту.
  const основание = await состояниеОснования(id).catch(() => ({ расхождения: [] as { поле: string; было: string; стало: string }[] }))

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

      {/* ── Шапка дела ─────────────────────────────────────────────────
          Была левая колонка в 280 пикселей: имя, цикл, четыре счётчика и
          кнопка. Она занимала четверть ширины и половину высоты экрана
          пустотой, а читалась за секунду. То же самое в одну строку сверху —
          и вся ширина уходит работе. */}
      <div className="care-case-top" style={{ marginTop: 16 }}>
        <span className="care-ava" data-size="lg">
          {инициалы(д.имяКлиента)}
        </span>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 19, lineHeight: 1.2 }}>{д.имяКлиента}</div>
          <div style={{ fontSize: 12, color: 'var(--ds-muted)' }}>
            Куратор: {сессия.имя ?? 'вы'}
            {' · '}
            {д.дело.intake_year}
            {д.дело.intake_term ? ` · ${д.дело.intake_term}` : ''}
            {д.дело.service_scope ? ` · ${д.дело.service_scope}` : ''}
          </div>
        </div>

        {д.дело.is_synthetic && <span className="ds-chip ds-chip-warning">тестовое дело</span>}

        <div className="care-case-facts">
          <div className="care-case-fact">
            <b>{открытыхЗадач}</b>
            задачи
          </div>
          <div className="care-case-fact">
            <b>
              {известное.length}
              {черновиков > 0 && (
                <span style={{ color: 'var(--ds-ai)', marginLeft: 4 }} title="не подтверждено">
                  ●{черновиков}
                </span>
              )}
            </b>
            известно
          </div>
          <div className="care-case-fact">
            <b>{д.документы.length}</b>
            документы
          </div>
          <div className="care-case-fact">
            <b>{д.источники.length}</b>
            источники
          </div>
          <TransferCase caseId={id} кандидаты={коллеги} />
        </div>
      </div>

      <div className="care-case">
        {/* ── Работа ─────────────────────────────────────────────────── */}
        <div>
          <CaseSection
            ключ="известно"
            заголовок="Что известно"
            сводка={
              известное.length === 0
                ? 'пока ничего'
                : `${известное.length} ${склонение(известное.length, 'запись', 'записи', 'записей')} · ${черновиков > 0 ? `${черновиков} не подтверждено` : 'всё подтверждено'}`
            }
            поумолчанию
            дети={
              <div style={{ padding: '14px 16px 16px' }}>
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

              {/* Привязка здесь же, где видно её отсутствие: отправлять за этим
                  в другой экран значит, что туда не пойдут. */}
              <LinkChat
                caseId={id}
                группы={группыБота}
                привязана={д.контакты.some((к) => к.tg_chat_id !== null)}
              />
            </div>
            }
          />

          <CaseSection
            ключ="подборка"
            заголовок="Подборка и стратегия"
            сводка={
              д.подборка
                ? `${д.подборка.строки.filter((с) => с.status !== 'removed').length} ${склонение(д.подборка.строки.filter((с) => с.status !== 'removed').length, 'программа', 'программы', 'программ')}${д.стратегия ? ' · стратегия написана' : ' · стратегии нет'}`
                : 'ещё не собрана'
            }
            поумолчанию
            действие={<CaseAssistant caseId={id} />}
            дети={
              <div>
              {д.подборка ? (
                <>
                  <ReplaceInShortlist caseId={id} расхождения={основание.расхождения} />
                  <div style={{ fontSize: 12, color: 'var(--ds-muted)', padding: '12px 16px 0' }}>
                    Подборка №{д.подборка.version} · {д.подборка.строки.length}{' '}
                    {склонение(д.подборка.строки.length, 'программа', 'программы', 'программ')} · собрана{' '}
                    {new Date(д.подборка.created_at).toLocaleDateString('ru-RU')}
                  </div>
                  {(() => {
                    const живые = д.подборка.строки.filter((с) => с.status !== 'removed')
                    return (
                      <div className="care-progs">
                        {живые.map((с, индекс) => (
                          <ProgramCard
                            key={с.id}
                            caseId={id}
                            строка={с}
                            номер={индекс + 1}
                            первая={индекс === 0}
                            последняя={индекс === живые.length - 1}
                          />
                        ))}
                      </div>
                    )
                  })()}

                  {/* Убранное не прячем совсем: «почему мы не рассматривали
                      Мюнхен» — обычный вопрос через месяц. */}
                  {д.подборка.строки.some((с) => с.status === 'removed') && (
                    <details style={{ margin: '0 16px 12px' }}>
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

                  <div style={{ padding: '0 16px 14px' }}>
                  <PublishShortlist
                    caseId={id}
                    shortlistId={д.подборка.id}
                    токен={д.подборка.share_token}
                    адресОснования={адресОснования}
                    боевойАдрес={боевойАдрес}
                  />
                  </div>
                </>
              ) : (
                <p style={{ fontSize: 13, color: 'var(--ds-muted)', padding: '14px 16px' }}>
                  Подборки ещё нет. Нужны подтверждённые страна и направление — по ним и
                  подбирается.
                </p>
              )}

              {д.стратегия && (
                <div
                  style={{
                    padding: '14px 16px 16px',
                    borderTop: '1px solid var(--ds-border-soft)',
                  }}
                >
                  <div style={{ fontSize: 12, color: 'var(--ds-muted)', marginBottom: 6 }}>
                    Стратегия поступления · черновик от{' '}
                    {new Date(д.стратегия.created_at).toLocaleDateString('ru-RU')}
                  </div>
                  {/* Мера строки: стратегия на всю ширину в тысячу пикселей
                      не читается — глаз теряет начало следующей строки. */}
                  <div style={{ fontSize: 14, lineHeight: 1.65, whiteSpace: 'pre-line', maxWidth: '68ch' }}>
                    {д.стратегия.текст}
                  </div>
                </div>
              )}
            </div>
            }
          />

          <CaseSection
            ключ="задачи"
            заголовок="План и задачи"
            сводка={`${открытыхЗадач} ${склонение(открытыхЗадач, 'открытая', 'открытых', 'открытых')} из ${д.задачи.length}`}
            поумолчанию
            действие={<NewTask caseId={id} />}
            дети={
              <div style={{ padding: '14px 16px 16px' }}>
              {/* Пауза живёт рядом с задачами: напоминания готовятся по ним,
                  и решение «я уже ответил» принимается, глядя на тот же
                  список. */}
              <AnsweredMyself caseId={id} наПаузе={пауза.наПаузе} до={пауза.до} />

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
            }
          />

          <CaseSection
            ключ="заявки"
            заголовок="Вузы и заявки"
            сводка={д.заявки.length === 0 ? 'заявок нет' : `${д.заявки.length} ${склонение(д.заявки.length, 'заявка', 'заявки', 'заявок')}`}
            дети={
              <div style={{ padding: '14px 16px 16px' }}>
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
            }
          />

          <CaseSection
            ключ="документы"
            заголовок="Документы"
            сводка={`${д.документы.length} · из действующей CRM, только просмотр`}
            дети={
              <div style={{ padding: '14px 16px 16px' }}>
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
            }
          />

          <CaseSection
            ключ="контакты"
            заголовок="Контакты"
            сводка={д.контакты.length === 0 ? 'никого' : `${д.контакты.length} ${склонение(д.контакты.length, 'человек', 'человека', 'человек')}`}
            дети={
              <div style={{ padding: '14px 16px 16px' }}>
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
            }
          />

          <CaseSection
            ключ="источники"
            заголовок="Переписка и источники"
            сводка={д.источники.length === 0 ? 'источников нет' : `${д.источники.length} ${склонение(д.источники.length, 'источник', 'источника', 'источников')}`}
            дети={
              <div style={{ padding: '14px 16px 16px' }}>
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
            }
          />

          <CaseSection
            ключ="журнал"
            заголовок="История дела"
            сводка={д.журнал.length === 0 ? 'записей нет' : `${д.журнал.length} ${склонение(д.журнал.length, 'запись', 'записи', 'записей')}`}
            дети={
              <div style={{ padding: '14px 16px 16px' }}>
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
            }
          />
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
