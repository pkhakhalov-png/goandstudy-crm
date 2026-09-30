'use client'

/**
 * Панель помощника. Раздел 7 дизайн-документа.
 *
 * Чего здесь нет намеренно (раздел 1.2): аватара, имени, «печатает…», эмодзи,
 * речи от первого лица. Это инструмент, а не собеседник.
 *
 * Область ограничивается чипом рядом с полем ввода — «Все мои клиенты» или
 * конкретное дело. Это параметр запроса, а не текст в промпте: написать
 * «покажи всех» в поле ввода не расширит область, потому что инструменты
 * помощника её не принимают.
 */
import { useState, useTransition } from 'react'
import { спроситьПомощника, type Реплика as РепликаИзБазы } from './assistant-actions'

type Реплика = { чья: 'куратор' | 'помощник'; текст: string; стоимость?: number }

/**
 * Прежние разговоры разворачиваются в те же реплики, что и новые.
 *
 * Так панель не знает, что пришло из базы, а что набрали только что, — и
 * показывает разговор одним куском, каким он и был.
 */
function изИстории(история: РепликаИзБазы[]): Реплика[] {
  return история.flatMap((р) => [
    { чья: 'куратор' as const, текст: р.вопрос },
    { чья: 'помощник' as const, текст: р.ответ, стоимость: р.долларов },
  ])
}

export function AssistantPanel({
  caseId,
  областьПодпись,
  доступен,
  подсказки,
  история = [],
}: {
  caseId: string | null
  областьПодпись: string
  доступен: boolean
  подсказки: string[]
  /** Что уже спрашивали — чтобы разговор пережил обновление страницы. */
  история?: РепликаИзБазы[]
}) {
  const [диалог, установитьДиалог] = useState<Реплика[]>(() => изИстории(история))
  const [ввод, установитьВвод] = useState('')
  const [ошибка, установитьОшибку] = useState<string | null>(null)
  const [идёт, начать] = useTransition()

  if (!доступен) {
    return (
      <div className="care-ai-panel">
        <div className="ds-label" style={{ marginBottom: 10 }}>
          <span className="care-ai-dot" />
          Помощник
        </div>
        <p style={{ fontSize: 13, color: 'var(--ds-muted)', margin: 0, lineHeight: 1.6 }}>
          Вам ещё не включён. Он умеет отвечать по данным дел: кто давно молчит, что
          горит, чего не хватает.
        </p>
        <p style={{ fontSize: 13, color: 'var(--ds-muted)', marginTop: 10, lineHeight: 1.6 }}>
          Менять данные и отправлять сообщения он не может — таких инструментов у него нет.
        </p>
      </div>
    )
  }

  const спросить = (вопрос: string) => {
    const текст = вопрос.trim()
    if (!текст || идёт) return
    установитьОшибку(null)
    установитьДиалог((д) => [...д, { чья: 'куратор', текст }])
    установитьВвод('')
    начать(async () => {
      const ответ = await спроситьПомощника(текст, caseId)
      if (ответ.ok) {
        установитьДиалог((д) => [...д, { чья: 'помощник', текст: ответ.текст, стоимость: ответ.долларов }])
      } else {
        установитьОшибку(ответ.ошибка)
      }
    })
  }

  return (
    <div className="care-ai-panel">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <div className="ds-label" style={{ margin: 0 }}>
          <span className="care-ai-dot" />
          Помощник
        </div>
        {/* Область — параметр запроса, а не слова в промпте. */}
        <span className="ds-chip ds-chip-neutral" style={{ fontSize: 11 }}>
          {областьПодпись}
        </span>
      </div>

      <div style={{ marginTop: 12, display: 'grid', gap: 10, maxHeight: 420, overflowY: 'auto' }}>
        {диалог.length === 0 && (
          <p style={{ fontSize: 13, color: 'var(--ds-muted)', margin: 0, lineHeight: 1.6 }}>
            Отвечает по данным ваших дел и переписки. Может собрать подборку программ —
            она ляжет черновиком на вашу проверку. Отправить что-либо клиенту он не может.
          </p>
        )}

        {диалог.map((р, i) => (
          <div
            key={i}
            style={{
              fontSize: 13,
              lineHeight: 1.6,
              padding: р.чья === 'куратор' ? '8px 10px' : '10px 12px',
              borderRadius: 10,
              background: р.чья === 'куратор' ? 'var(--ds-bg-alt)' : 'var(--ds-ai-soft)',
              borderLeft: р.чья === 'помощник' ? '2px solid var(--ds-ai)' : undefined,
              whiteSpace: 'pre-line',
            }}
          >
            {р.текст}
            {р.стоимость != null && (
              <div style={{ fontSize: 11, color: 'var(--ds-muted)', marginTop: 6 }}>
                {/* Расход показывается человеку, а не только пишется в базу:
                    цену вопроса видно до того, как она станет строкой в отчёте. */}
                {р.стоимость < 0.01 ? 'меньше цента' : `${р.стоимость.toFixed(2)} $`}
              </div>
            )}
          </div>
        ))}

        {идёт && (
          <div style={{ fontSize: 13, color: 'var(--ds-muted)' }}>
            Читаю дела… Подбор программ идёт дольше — до полутора минут.
          </div>
        )}
      </div>

      {ошибка && (
        <p style={{ color: 'var(--ds-error-ink)', fontSize: 12, marginTop: 10 }}>{ошибка}</p>
      )}

      {диалог.length === 0 && подсказки.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 12 }}>
          {подсказки.map((п) => (
            <button key={п} className="ds-btn ds-btn-ghost ds-btn-sm" onClick={() => спросить(п)} disabled={идёт}>
              {п}
            </button>
          ))}
        </div>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault()
          спросить(ввод)
        }}
        style={{ marginTop: 12, display: 'flex', gap: 6 }}
      >
        <input
          className="ds-input"
          placeholder="Спросить о делах"
          value={ввод}
          onChange={(e) => установитьВвод(e.target.value)}
          disabled={идёт}
          style={{ flex: 1 }}
        />
        <button className="ds-btn ds-btn-primary ds-btn-sm" type="submit" disabled={идёт || !ввод.trim()}>
          {идёт ? '…' : '→'}
        </button>
      </form>
    </div>
  )
}
