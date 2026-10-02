'use client'

/**
 * Кому уже можно писать.
 *
 * ПОЧЕМУ РУБИЛЬНИК КОНТУРА ЗДЕСЬ ТОЛЬКО ПОКАЗАН. Он меняется миграцией, и это
 * осознанно: предохранитель, который переключается нажатием, однажды
 * переключится по ошибке. Но не показать его нельзя — иначе руководитель
 * включает флаг клиенту, ничего не происходит, и причина остаётся невидимой.
 *
 * ПОЧЕМУ РЯДОМ С ФЛАГОМ СТОИТ СОСТОЯНИЕ ГРУППЫ. Разрешить писать клиенту, в
 * чью группу бот войти не может, — значит получить ощущение готовности и
 * выяснить обратное в день, когда напоминание не ушло.
 */
import { useState, useTransition } from 'react'
import Link from 'next/link'
import { переключитьОтправки } from './switch/actions'
import type { КартинаОтправок } from '@/lib/care/sends'

export function SendsList({ картина }: { картина: КартинаОтправок }) {
  const [сообщение, установитьСообщение] = useState<string | null>(null)
  const [ошибка, установитьОшибку] = useState<string | null>(null)
  const [спросить, установитьВопрос] = useState<string | null>(null)
  const [идёт, начать] = useTransition()

  const переключить = (caseId: string, включить: boolean) =>
    начать(async () => {
      установитьОшибку(null)
      установитьСообщение(null)
      const и = await переключитьОтправки(caseId, включить)
      if (и.ok) {
        установитьСообщение(и.текст)
        установитьВопрос(null)
      } else {
        установитьОшибку(и.ошибка)
      }
    })

  const разрешено = картина.строки.filter((с) => с.разрешено).length

  return (
    <section>
      <div className="ds-label" style={{ marginBottom: 10 }}>
        Кому можно писать · {разрешено} из {картина.строки.length}
      </div>

      <div
        style={{
          fontSize: 13,
          lineHeight: 1.6,
          padding: '10px 14px',
          borderRadius: 10,
          marginBottom: 12,
          background: картина.контурОткрыт ? 'var(--ds-bg-alt)' : 'var(--ds-amber-soft, var(--ds-bg-alt))',
          border: '1px solid var(--ds-border-soft)',
        }}
      >
        {картина.контурОткрыт ? (
          <>
            <strong>Контур открыт наружу.</strong> Утверждённые напоминания уходят тем клиентам,
            кому это разрешено ниже.
          </>
        ) : (
          <>
            <strong>Контур закрыт: наружу не уходит ничего.</strong> Флаги ниже можно расставить
            заранее — они начнут действовать, когда контур откроют. Рубильник меняется миграцией,
            а не нажатием: предохранитель, который переключается кнопкой, однажды переключится по
            ошибке.
          </>
        )}
        {картина.заметкаКонтура && (
          <div style={{ fontSize: 12, color: 'var(--ds-muted)', marginTop: 4 }}>
            {картина.заметкаКонтура}
          </div>
        )}
      </div>

      {сообщение && (
        <p style={{ fontSize: 13, color: 'var(--ds-success-ink)', margin: '0 0 10px' }}>{сообщение}</p>
      )}
      {ошибка && (
        <p style={{ fontSize: 13, color: 'var(--ds-error-ink)', margin: '0 0 10px' }}>{ошибка}</p>
      )}

      {картина.строки.length === 0 ? (
        <p style={{ fontSize: 13, color: 'var(--ds-muted)' }}>На новом кабинете пока никого.</p>
      ) : (
        <div className="ds-card" style={{ padding: 0 }}>
          {картина.строки.map((с) => (
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
                <div style={{ fontSize: 12, color: 'var(--ds-muted)', marginTop: 2 }}>
                  {с.каналДоступен
                    ? 'в группу писать можем'
                    : `писать нельзя: ${с.почемуКанал ?? 'причина неизвестна'}`}
                </div>
              </div>

              {с.разрешено ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <span className="ds-chip ds-chip-info">отправки разрешены</span>
                  <button
                    className="ds-btn ds-btn-ghost ds-btn-sm"
                    disabled={идёт}
                    onClick={() => переключить(с.caseId, false)}
                  >
                    Запретить
                  </button>
                </div>
              ) : спросить === с.caseId ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 12, color: 'var(--ds-muted)' }}>
                    После этого утверждённые напоминания будут уходить клиенту. Разрешить?
                  </span>
                  <button
                    className="ds-btn ds-btn-primary ds-btn-sm"
                    disabled={идёт}
                    onClick={() => переключить(с.caseId, true)}
                  >
                    Да, разрешить
                  </button>
                  <button
                    className="ds-btn ds-btn-ghost ds-btn-sm"
                    disabled={идёт}
                    onClick={() => установитьВопрос(null)}
                  >
                    Отмена
                  </button>
                </div>
              ) : (
                <button
                  className="ds-btn ds-btn-secondary ds-btn-sm"
                  disabled={идёт}
                  onClick={() => установитьВопрос(с.caseId)}
                >
                  Разрешить отправки
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
