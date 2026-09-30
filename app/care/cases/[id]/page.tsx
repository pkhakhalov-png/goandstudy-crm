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
import { notFound } from 'next/navigation'
import { сессияКонтура } from '@/lib/care/session'
import { подробностиДела, коллегиДляПередачи } from '@/lib/care/cases'
import { подписьПоля, периодПоля, подписьСтатуса, подписьОжидания, срок, инициалы } from '@/lib/care/labels'
import { NewTask, TaskActions, FactActions, TransferCase } from './CaseOperations'

export const dynamic = 'force-dynamic'

function значениеФакта(value: unknown): string {
  if (value === null || value === undefined) return '—'
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

export default async function ДелоСтраница({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const сессия = await сессияКонтура()
  if (!сессия?.участник) notFound()

  const [д, коллеги] = await Promise.all([
    подробностиДела(сессия.участник, id),
    коллегиДляПередачи(сессия.участник),
  ])
  // Нет доступа и нет дела отвечают одинаково: разные ответы рассказали бы
  // постороннему, что дело существует.
  if (!д) notFound()

  const черновиков = д.факты.filter((ф) => ф.status === 'draft').length
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
                  {д.факты.length}
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
                <span>Переписка</span>
                <span style={{ fontWeight: 600 }}>{д.сообщений}</span>
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
              {д.факты.length === 0 ? (
                <p style={{ fontSize: 13, color: 'var(--ds-muted)', margin: 0 }}>
                  Пока ничего не записано. Факты появятся, когда помощник разберёт встречу.
                </p>
              ) : (
                д.факты.map((ф) => (
                  <div key={ф.id} className="care-fact">
                    <div className="care-fact-name">{подписьПоля(ф.field)}</div>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
                      <span className="care-fact-value" data-state={ф.status}>
                        {значениеФакта(ф.value)}
                        {ф.currency ? ` ${ф.currency}` : ''}
                        {периодПоля(ф.field) ? ` ${периодПоля(ф.field)}` : ''}
                      </span>
                      {ф.status === 'confirmed' && (
                        <span style={{ fontSize: 12, color: 'var(--ds-success-ink)' }}>
                          ✓ подтверждено
                        </span>
                      )}
                      {ф.is_plan && (
                        <span className="ds-chip ds-chip-warning">намерение, не результат</span>
                      )}
                    </div>
                    {ф.quote && <div className="care-fact-src">«{ф.quote}»</div>}
                    {ф.status === 'draft' && <FactActions caseId={id} factId={ф.id} />}
                  </div>
                ))
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
                      <TaskActions caseId={id} taskId={з.id} статус={з.status} />
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
          <div className="care-ai-panel">
            <div className="ds-label" style={{ marginBottom: 10 }}>
              <span className="care-ai-dot" />
              Помощник
            </div>
            <p style={{ fontSize: 13, color: 'var(--ds-muted)', margin: 0, lineHeight: 1.6 }}>
              Пока выключен. Появится на следующем этапе: разберёт встречу, предложит
              изменения профиля и подборку вузов.
            </p>
            <p style={{ fontSize: 13, color: 'var(--ds-muted)', marginTop: 10, lineHeight: 1.6 }}>
              Всё, что он предложит, сначала увидите вы — отправить сам он не сможет.
            </p>
          </div>
        </aside>
      </div>
    </>
  )
}
