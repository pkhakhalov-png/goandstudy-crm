/**
 * Дело клиента.
 *
 * Три колонки по макету: кто это и что известно · что делаем · откуда знаем.
 *
 * У каждого факта видно происхождение и статус. Это не украшение: на вопрос
 * «почему тут написано вот это» нужно уметь ответить через полгода, когда ни
 * куратора, ни памяти о разговоре уже нет.
 *
 * Документы читаются из рабочей таблицы и только на чтение. Своих мы не
 * заводим до решения владельца по обработке персональных документов.
 */
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { сессияКонтура } from '@/lib/care/session'
import { подробностиДела, коллегиДляПередачи } from '@/lib/care/cases'
import { NewTask, TaskActions, FactActions, TransferCase } from './CaseOperations'

export const dynamic = 'force-dynamic'

const ПОДПИСЬ_СТАТУСА: Record<string, { текст: string; класс: string }> = {
  draft: { текст: 'черновик', класс: 'ds-chip-warning' },
  confirmed: { текст: 'подтверждён', класс: 'ds-chip-success' },
  superseded: { текст: 'заменён', класс: 'ds-chip-neutral' },
  rejected: { текст: 'отклонён', класс: 'ds-chip-error' },
}

const ПОДПИСЬ_ОЖИДАНИЯ: Record<string, string> = {
  none: '—',
  client: 'клиента',
  university: 'вуз',
  specialist: 'специалиста',
  review: 'проверку',
}

function значениеФакта(value: unknown, unit: string | null, currency: string | null): string {
  const основа =
    value === null || value === undefined
      ? '—'
      : typeof value === 'object'
        ? JSON.stringify(value)
        : String(value)
  return [основа, currency, unit].filter(Boolean).join(' ')
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

  return (
    <>
      <Link href="/care/cases" className="ds-link" style={{ fontSize: 13 }}>
        ← К списку дел
      </Link>

      <h1 className="ds-hero-h1" style={{ fontSize: 26, margin: '12px 0 4px' }}>
        {д.имяКлиента}
        {д.дело.is_synthetic && (
          <span className="ds-chip ds-chip-warning" style={{ marginLeft: 8, verticalAlign: 'middle' }}>
            тестовое дело
          </span>
        )}
      </h1>
      <p style={{ color: 'var(--ds-muted)', fontSize: 14, marginBottom: 24 }}>
        Набор {д.дело.intake_year}
        {д.дело.intake_term ? ` · ${д.дело.intake_term}` : ''}
        {д.дело.service_scope ? ` · ${д.дело.service_scope}` : ''}
        {' · '}
        <span className="ds-mono">
          {д.дело.is_synthetic ? 'синтетика, в рабочей базе такого клиента нет' : `клиент #${д.дело.client_id}`}
        </span>
      </p>

      <div style={{ marginBottom: 20 }}>
        <TransferCase caseId={id} кандидаты={коллеги} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16 }}>
        {/* ── Кто это и что известно ────────────────────────────────── */}
        <section className="ds-card">
          <h2 className="ds-label">Контакты</h2>
          {д.контакты.length === 0 ? (
            <p style={{ fontSize: 13, color: 'var(--ds-muted)' }}>
              Контактов нет. Отправлять некому — и это к лучшему, пока их не проверили.
            </p>
          ) : (
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, fontSize: 14 }}>
              {д.контакты.map((к) => (
                <li key={к.id} style={{ padding: '8px 0', borderBottom: '1px solid var(--ds-border-soft)' }}>
                  <strong>{к.name}</strong>{' '}
                  <span className="ds-chip ds-chip-neutral">{к.kind}</span>
                  {к.can_decide && <span className="ds-chip ds-chip-info">решает</span>}
                  <div style={{ fontSize: 12, color: 'var(--ds-muted)' }}>
                    {к.tg_chat_id ? `чат ${к.tg_chat_id}` : 'чата в Телеграме нет'}
                    {к.phone ? ` · ${к.phone}` : ''}
                  </div>
                </li>
              ))}
            </ul>
          )}

          <h2 className="ds-label" style={{ marginTop: 20 }}>
            Что известно
          </h2>
          {д.факты.length === 0 ? (
            <p style={{ fontSize: 13, color: 'var(--ds-muted)' }}>
              Фактов ещё нет. Они появятся, когда контур начнёт разбирать встречи — этап 4.
            </p>
          ) : (
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, fontSize: 14 }}>
              {д.факты.map((ф) => {
                const подпись = ПОДПИСЬ_СТАТУСА[ф.status] ?? { текст: ф.status, класс: 'ds-chip-neutral' }
                return (
                  <li key={ф.id} style={{ padding: '8px 0', borderBottom: '1px solid var(--ds-border-soft)' }}>
                    <span className="ds-mono" style={{ fontSize: 12 }}>
                      {ф.field}
                    </span>
                    <div>
                      <strong>{значениеФакта(ф.value, ф.unit, ф.currency)}</strong>{' '}
                      <span className={`ds-chip ${подпись.класс}`}>{подпись.текст}</span>
                      {ф.is_plan && <span className="ds-chip ds-chip-warning">намерение</span>}
                    </div>
                    {ф.quote && (
                      <div style={{ fontSize: 12, color: 'var(--ds-muted)', fontStyle: 'italic' }}>
                        «{ф.quote}»
                      </div>
                    )}
                    {ф.status === 'draft' && <FactActions caseId={id} factId={ф.id} />}
                  </li>
                )
              })}
            </ul>
          )}
        </section>

        {/* ── Что делаем ────────────────────────────────────────────── */}
        <section className="ds-card">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <h2 className="ds-label" style={{ margin: 0 }}>Задачи</h2>
            <NewTask caseId={id} />
          </div>
          {д.задачи.length === 0 ? (
            <p style={{ fontSize: 13, color: 'var(--ds-muted)', marginTop: 8 }}>Задач нет.</p>
          ) : (
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, fontSize: 14 }}>
              {д.задачи.map((з) => (
                <li key={з.id} style={{ padding: '8px 0', borderBottom: '1px solid var(--ds-border-soft)' }}>
                  <div>{з.title}</div>
                  <div style={{ fontSize: 12, color: 'var(--ds-muted)' }}>
                    {з.status}
                    {з.waiting_on !== 'none' && ` · ждём ${ПОДПИСЬ_ОЖИДАНИЯ[з.waiting_on] ?? з.waiting_on}`}
                    {з.due_on && ` · срок ${new Date(з.due_on).toLocaleDateString('ru-RU')}`}
                  </div>
                  <TaskActions caseId={id} taskId={з.id} статус={з.status} />
                </li>
              ))}
            </ul>
          )}

          <h2 className="ds-label" style={{ marginTop: 20 }}>
            Документы
          </h2>
          <p style={{ fontSize: 12, color: 'var(--ds-muted)', marginBottom: 8 }}>
            Из действующей CRM, только просмотр.
          </p>
          {д.документы.length === 0 ? (
            <p style={{ fontSize: 13, color: 'var(--ds-muted)' }}>Документов нет.</p>
          ) : (
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, fontSize: 14 }}>
              {д.документы.map((док) => (
                <li key={док.id} style={{ padding: '6px 0', borderBottom: '1px solid var(--ds-border-soft)' }}>
                  {док.file_name ?? док.doc_type ?? 'без названия'}
                  <span style={{ fontSize: 12, color: 'var(--ds-muted)' }}>
                    {док.status ? ` · ${док.status}` : ''}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* ── Откуда знаем ──────────────────────────────────────────── */}
        <section className="ds-card">
          <h2 className="ds-label">Переписка</h2>
          <p style={{ fontSize: 14 }}>
            {д.сообщений === 0
              ? 'Сообщений в действующей CRM нет.'
              : `${д.сообщений} сообщений в действующей CRM.`}
          </p>

          <h2 className="ds-label" style={{ marginTop: 20 }}>
            История дела
          </h2>
          {д.журнал.length === 0 ? (
            <p style={{ fontSize: 13, color: 'var(--ds-muted)' }}>Записей нет.</p>
          ) : (
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, fontSize: 13 }}>
              {д.журнал.map((с) => (
                <li key={с.id} style={{ padding: '6px 0', borderBottom: '1px solid var(--ds-border-soft)' }}>
                  <span className="ds-mono">{с.action}</span>
                  <div style={{ fontSize: 12, color: 'var(--ds-muted)' }}>
                    {new Date(с.created_at).toLocaleString('ru-RU')} · {с.actor_kind}
                    {с.reason ? ` · ${с.reason}` : ''}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  )
}
