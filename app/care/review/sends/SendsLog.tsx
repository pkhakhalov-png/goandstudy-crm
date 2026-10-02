'use client'

/**
 * Журнал отправок.
 *
 * ПОЧЕМУ НЕИЗВЕСТНЫЕ НАВЕРХУ И БЕЗ СОКРАЩЕНИЙ. Это не история, а работа:
 * запрос ушёл, ответа не пришло, и узнать исход можно только глазами — открыть
 * чат клиента и посмотреть. Пока человек этого не сделал, мы не знаем, получил
 * он сообщение или нет, и обе ошибки дорогие: промолчать там, где надо
 * напомнить, или прислать второе такое же.
 *
 * ПОЧЕМУ КНОПКИ НАЗЫВАЮТ ДЕЙСТВИЕ ЧЕЛОВЕКА, А НЕ СИСТЕМЫ. «Дошло» — это то,
 * что он увидел, а не то, что сделала система. Отметка ничего не отправляет.
 */
import { useState, useTransition } from 'react'
import Link from 'next/link'
import { отметитьДошло } from './actions'
import type { Отправки, СтрокаОтправки } from '@/lib/care/outbox'

const ПОДПИСЬ: Record<СтрокаОтправки['статус'], string> = {
  queued: 'в очереди',
  sent: 'отправлено',
  unknown: 'исход неизвестен',
  failed: 'не ушло',
  cancelled: 'отменено',
}

function Когда({ значение }: { значение: string }) {
  return (
    <span style={{ fontSize: 12, color: 'var(--ds-muted)' }}>
      {new Date(значение).toLocaleString('ru-RU', {
        day: 'numeric',
        month: 'long',
        hour: '2-digit',
        minute: '2-digit',
      })}
    </span>
  )
}

export function SendsLog({ отправки }: { отправки: Отправки }) {
  const [сообщение, установитьСообщение] = useState<string | null>(null)
  const [ошибка, установитьОшибку] = useState<string | null>(null)
  const [идёт, начать] = useTransition()

  const отметить = (id: string, дошло: boolean) =>
    начать(async () => {
      установитьОшибку(null)
      установитьСообщение(null)
      const и = await отметитьДошло(id, дошло)
      if (и.ok) установитьСообщение(и.текст)
      else установитьОшибку(и.ошибка)
    })

  return (
    <div style={{ display: 'grid', gap: 22 }}>
      {сообщение && <p style={{ fontSize: 13, color: 'var(--ds-success-ink)', margin: 0 }}>{сообщение}</p>}
      {ошибка && <p style={{ fontSize: 13, color: 'var(--ds-error-ink)', margin: 0 }}>{ошибка}</p>}

      <section>
        <div className="ds-label" style={{ marginBottom: 10 }}>
          Исход неизвестен · {отправки.неизвестные.length}
        </div>

        {отправки.неизвестные.length === 0 ? (
          <p style={{ fontSize: 13, color: 'var(--ds-muted)', margin: 0, lineHeight: 1.6 }}>
            Таких нет. Сюда попадает отправка, на которую Телеграм не ответил: дошло или нет,
            системе узнать нечем, и смотрит человек.
          </p>
        ) : (
          <div className="ds-card" style={{ padding: 0 }}>
            {отправки.неизвестные.map((с) => (
              <div key={с.id} className="care-отпр">
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: 13, lineHeight: 1.55, whiteSpace: 'pre-line' }}>{с.текст}</div>
                  <div style={{ marginTop: 6, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    {с.имяПолучателя && (
                      <span style={{ fontSize: 12, color: 'var(--ds-muted)' }}>{с.имяПолучателя}</span>
                    )}
                    <Когда значение={с.когда} />
                    {с.caseId && (
                      <Link href={`/care/cases/${с.caseId}`} className="ds-link" style={{ fontSize: 12 }}>
                        дело →
                      </Link>
                    )}
                  </div>
                  {с.ошибка && (
                    <div style={{ fontSize: 12, color: 'var(--ds-muted)', marginTop: 4 }}>{с.ошибка}</div>
                  )}
                </div>

                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button
                    className="ds-btn ds-btn-primary ds-btn-sm"
                    disabled={идёт}
                    onClick={() => отметить(с.id, true)}
                    title="Сообщение в чате есть"
                  >
                    Дошло
                  </button>
                  <button
                    className="ds-btn ds-btn-ghost ds-btn-sm"
                    disabled={идёт}
                    onClick={() => отметить(с.id, false)}
                    title="Сообщения в чате нет"
                  >
                    Не дошло
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <div className="ds-label" style={{ marginBottom: 10 }}>
          Последние отправки
        </div>
        {отправки.последние.length === 0 ? (
          <p style={{ fontSize: 13, color: 'var(--ds-muted)', margin: 0 }}>
            Наружу пока не уходило ничего.
          </p>
        ) : (
          <div className="ds-card" style={{ padding: 0 }}>
            {отправки.последние.map((с) => (
              <div key={с.id} className="care-отпр">
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: 13, lineHeight: 1.55, whiteSpace: 'pre-line' }}>
                    {с.текст.length > 220 ? `${с.текст.slice(0, 220)}…` : с.текст}
                  </div>
                  <div style={{ marginTop: 6, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    <span
                      className="ds-chip"
                      style={{
                        fontSize: 11,
                        background:
                          с.статус === 'sent' ? 'var(--ds-success-soft, var(--ds-bg-alt))' : 'var(--ds-bg-alt)',
                      }}
                    >
                      {ПОДПИСЬ[с.статус]}
                    </span>
                    {с.имяПолучателя && (
                      <span style={{ fontSize: 12, color: 'var(--ds-muted)' }}>{с.имяПолучателя}</span>
                    )}
                    <Когда значение={с.отправлено ?? с.когда} />
                    {с.caseId && (
                      <Link href={`/care/cases/${с.caseId}`} className="ds-link" style={{ fontSize: 12 }}>
                        дело →
                      </Link>
                    )}
                  </div>
                  {/* Причину отмены показываем: «отменено» без неё читается как
                      поломка, а чаще это сработавшая защита. */}
                  {(с.причинаОтмены || (с.статус === 'failed' && с.ошибка)) && (
                    <div style={{ fontSize: 12, color: 'var(--ds-muted)', marginTop: 4 }}>
                      {с.причинаОтмены ?? с.ошибка}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
