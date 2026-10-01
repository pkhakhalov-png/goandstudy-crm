'use client'

/**
 * Кто на каком кабинете — и переключение.
 *
 * ПОЧЕМУ ЧЕК-ЛИСТ ПОКАЗЫВАЕТСЯ ДО НАЖАТИЯ. Отказ после нажатия куратор читает
 * как поломку кнопки. Список проверок с пояснением, что сделать, превращает
 * отказ в понятную работу: «чат не привязан — вот команда».
 *
 * ПОЧЕМУ ВОЗВРАТ СПРАШИВАЕТ ПОДТВЕРЖДЕНИЕ. Он отменяет задания и гасит
 * предложения — это не переключатель вида, это остановка работы по живому
 * клиенту. Случайное нажатие здесь дороже лишнего вопроса.
 */
import { useState, useTransition } from 'react'
import Link from 'next/link'
import { чекЛист, включитьДело, выключитьДело } from './actions'
import type { Готовность, СтрокаПереключения } from '@/lib/care/switch'

export function SwitchList({ строки }: { строки: СтрокаПереключения[] }) {
  const [открыто, установитьОткрытое] = useState<string | null>(null)
  const [проверка, установитьПроверку] = useState<Готовность | null>(null)
  const [сообщение, установитьСообщение] = useState<string | null>(null)
  const [ошибка, установитьОшибку] = useState<string | null>(null)
  const [подтвердить, установитьПодтверждение] = useState<string | null>(null)
  const [идёт, начать] = useTransition()

  const наV2 = строки.filter((с) => с.наV2)
  const наLegacy = строки.filter((с) => !с.наV2)

  const раскрыть = (caseId: string) => {
    if (открыто === caseId) {
      установитьОткрытое(null)
      return
    }
    установитьОткрытое(caseId)
    установитьПроверку(null)
    начать(async () => {
      установитьПроверку(await чекЛист(caseId))
    })
  }

  const сделать = (что: () => Promise<{ ok: boolean } & Record<string, unknown>>) =>
    начать(async () => {
      установитьОшибку(null)
      установитьСообщение(null)
      const и = await что()
      if (и.ok) {
        установитьСообщение(String(и.текст ?? 'Готово'))
        установитьОткрытое(null)
        установитьПодтверждение(null)
      } else {
        установитьОшибку(String(и.ошибка ?? 'Не вышло'))
      }
    })

  return (
    <div style={{ display: 'grid', gap: 22 }}>
      {сообщение && (
        <p style={{ fontSize: 13, color: 'var(--ds-success-ink)', margin: 0 }}>{сообщение}</p>
      )}
      {ошибка && <p style={{ fontSize: 13, color: 'var(--ds-error-ink)', margin: 0 }}>{ошибка}</p>}

      <section>
        <div className="ds-label" style={{ marginBottom: 10 }}>
          Новый кабинет · {наV2.length}
        </div>
        {наV2.length === 0 ? (
          <p style={{ fontSize: 13, color: 'var(--ds-muted)' }}>Пока никого.</p>
        ) : (
          <div className="ds-card" style={{ padding: 0 }}>
            {наV2.map((с) => (
              <div key={с.caseId} className="care-перекл">
                <div style={{ minWidth: 0 }}>
                  <Link href={`/care/cases/${с.caseId}`} className="ds-link" style={{ fontWeight: 600 }}>
                    {с.имя}
                  </Link>
                  {с.is_synthetic && (
                    <span className="ds-chip ds-chip-warning" style={{ marginLeft: 8, fontSize: 11 }}>
                      тестовое
                    </span>
                  )}
                  <div style={{ fontSize: 12, color: 'var(--ds-muted)' }}>
                    {с.switched_at ? `с ${с.switched_at.slice(0, 10)}` : 'дата перевода неизвестна'}
                  </div>
                </div>

                {подтвердить === с.caseId ? (
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 12, color: 'var(--ds-muted)' }}>
                      Отменит задания и погасит предложения. Вернуть?
                    </span>
                    <button
                      className="ds-btn ds-btn-primary ds-btn-sm"
                      disabled={идёт}
                      onClick={() => сделать(() => выключитьДело(с.caseId))}
                    >
                      Да, вернуть
                    </button>
                    <button
                      className="ds-btn ds-btn-ghost ds-btn-sm"
                      disabled={идёт}
                      onClick={() => установитьПодтверждение(null)}
                    >
                      Отмена
                    </button>
                  </div>
                ) : (
                  <button
                    className="ds-btn ds-btn-ghost ds-btn-sm"
                    disabled={идёт}
                    onClick={() => установитьПодтверждение(с.caseId)}
                  >
                    Вернуть старому
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <div className="ds-label" style={{ marginBottom: 10 }}>
          Старый кабинет · {наLegacy.length}
        </div>
        {наLegacy.length === 0 ? (
          <p style={{ fontSize: 13, color: 'var(--ds-muted)' }}>Все дела переведены.</p>
        ) : (
          <div className="ds-card" style={{ padding: 0 }}>
            {наLegacy.map((с) => (
              <div key={с.caseId}>
                <div className="care-перекл">
                  <div style={{ minWidth: 0 }}>
                    <Link href={`/care/cases/${с.caseId}`} className="ds-link" style={{ fontWeight: 600 }}>
                      {с.имя}
                    </Link>
                    {с.is_synthetic && (
                      <span className="ds-chip ds-chip-warning" style={{ marginLeft: 8, fontSize: 11 }}>
                        тестовое
                      </span>
                    )}
                  </div>
                  <button
                    className="ds-btn ds-btn-secondary ds-btn-sm"
                    disabled={идёт}
                    onClick={() => раскрыть(с.caseId)}
                  >
                    {открыто === с.caseId ? 'Свернуть' : 'Проверить и перевести'}
                  </button>
                </div>

                {открыто === с.caseId && (
                  <div className="care-перекл-лист">
                    {!проверка ? (
                      <p style={{ fontSize: 13, color: 'var(--ds-muted)', margin: 0 }}>Проверяю…</p>
                    ) : (
                      <>
                        {проверка.пункты.map((п, и) => (
                          <div key={и} style={{ fontSize: 13, marginBottom: 6 }}>
                            <span style={{ color: п.ok ? 'var(--ds-success-ink)' : 'var(--ds-error-ink)' }}>
                              {п.ok ? '✓' : '✗'}
                            </span>{' '}
                            {п.пункт}
                            {!п.ok && п.подсказка && (
                              <div
                                style={{
                                  fontSize: 12,
                                  color: 'var(--ds-muted)',
                                  marginTop: 2,
                                  paddingLeft: 16,
                                  fontFamily: 'var(--ds-font-mono, monospace)',
                                }}
                              >
                                {п.подсказка}
                              </div>
                            )}
                          </div>
                        ))}
                        <button
                          className="ds-btn ds-btn-primary ds-btn-sm"
                          style={{ marginTop: 8 }}
                          disabled={идёт || !проверка.готово}
                          onClick={() => сделать(() => включитьДело(с.caseId))}
                        >
                          {проверка.готово ? 'Перевести на новый кабинет' : 'Сначала закройте пункты выше'}
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
