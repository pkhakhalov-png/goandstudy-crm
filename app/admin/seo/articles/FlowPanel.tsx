'use client'
import { useState, useTransition } from 'react'
import { saveFlowSettings, startNextNow, decideTopic } from './actions'
import type { FlowState } from '@/lib/seo/flow'

const plural = (n: number, one: string, few: string, many: string) => {
  const d = n % 10, dd = n % 100
  if (d === 1 && dd !== 11) return one
  if (d >= 2 && d <= 4 && (dd < 12 || dd > 14)) return few
  return many
}

export function FlowPanel({ state }: { state: FlowState & { computedAt?: string | null } }) {
  const [pending, start] = useTransition()
  const [s, setS] = useState(state.settings)
  const [note, setNote] = useState<string | null>(null)

  const save = (next: typeof s) => {
    setS(next)
    start(async () => {
      const r = await saveFlowSettings(next)
      setNote(r.error ?? null)
    })
  }

  return (
    <div style={{ border: '1px solid var(--bor)', borderRadius: 10, padding: 14, background: 'var(--surf)', marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>Поток статей</div>
          <div style={{ fontSize: 12, color: 'var(--muted)', maxWidth: 560, lineHeight: 1.5 }}>
            Конвейер сам берёт тему и запускает работу. Нажимать на каждую статью не нужно —
            вы только читаете готовое и решаете, выпускать ли.
          </div>
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
          <input type="checkbox" checked={s.enabled} disabled={pending}
            onChange={(e) => save({ ...s, enabled: e.target.checked })} />
          <span style={{ fontWeight: 700, color: s.enabled ? 'var(--green)' : 'var(--muted)' }}>
            {s.enabled ? 'включён' : 'выключен'}
          </span>
        </label>
      </div>

      <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', marginTop: 12, alignItems: 'flex-end' }}>
        <Field label="Статей в неделю" hint={s.perWeek >= 7 ? `это ${(s.perWeek / 7).toFixed(s.perWeek % 7 ? 1 : 0)} в день` : `раз в ${Math.round(7 / s.perWeek)} дн.`}>
          <select value={s.perWeek} disabled={pending} onChange={(e) => save({ ...s, perWeek: Number(e.target.value) })} style={select}>
            {[1, 2, 3, 5, 7, 14].map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </Field>

        <Field label="Предел на вычитке" hint={`сейчас ждут разбора: ${state.inReview}`}>
          <select value={s.maxInReview} disabled={pending} onChange={(e) => save({ ...s, maxInReview: Number(e.target.value) })} style={select}>
            {[2, 3, 5, 8, 12, 20].map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </Field>

        <div style={{ flex: 1, minWidth: 220 }}>
          <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 4 }}>Следующая тема</div>
          <div style={{ fontSize: 13 }}>
            {state.nextTopic
              ? <>{state.nextTopic.query} <span style={{ color: 'var(--muted)' }}>· {state.nextTopic.impressions.toLocaleString('ru')} показов</span></>
              : <span style={{ color: 'var(--muted)' }}>свободных тем нет</span>}
          </div>
          {state.nextTopic && (
            <div style={{ fontSize: 11, color: 'var(--green)', marginTop: 3 }}>
              проверено: {state.nextTopic.cannibalReason}
            </div>
          )}
          {state.computedAt && (
            <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
              подобрано {new Date(state.computedAt).toLocaleString('ru')}
            </div>
          )}
        </div>

        <button className="btn-s" disabled={pending || !state.nextTopic}
          onClick={() => start(async () => {
            const r = await startNextNow()
            setNote(r.error ?? r.note ?? null)
          })}>
          Запустить сейчас
        </button>
      </div>

      {state.runway && (
        <div style={{ marginTop: 12, padding: '8px 12px', border: '1px solid var(--bor2)', borderRadius: 8, fontSize: 12 }}>
          <div>
            <b>Запас работы: {state.runway.days} {plural(state.runway.days, 'день', 'дня', 'дней')}</b>
            <span style={{ color: 'var(--muted)' }}>
              {' '}— {state.runway.safe} {plural(state.runway.safe, 'тема', 'темы', 'тем')} без вопросов
              {state.runway.unclear > 0 && ` и ${state.runway.unclear} спорных, если одобрите`}
            </span>
          </div>
          <div style={{ color: 'var(--muted)', fontSize: 11, marginTop: 4, lineHeight: 1.5 }}>
            Отсеяно: {state.runway.dropped.own} уже писали, {state.runway.dropped.twin} переформулировок,
            {' '}{state.runway.dropped.risky} отобрали бы запросы у своих страниц,
            {' '}{state.runway.dropped.update} требуют обновления существующей.
            Число тем в базе и число дней — разные величины: каждая написанная статья
            занимает свою семью запросов, и соседние формулировки перестают быть темами.
          </div>
        </div>
      )}

      <div style={{ marginTop: 10, fontSize: 12, color: state.blocker ? 'var(--muted)' : 'var(--green)' }}>
        {state.blocker
          ? <>Сейчас ничего не запускается: {state.blocker}.</>
          : <>Следующая статья уйдёт в работу в ближайший проход воркера.</>}
      </div>

      {note && <div style={{ marginTop: 6, fontSize: 12, color: 'var(--red)' }}>{note}</div>}

      {state.skipped.length > 0 && (
        <details style={{ marginTop: 10 }}>
          <summary style={{ fontSize: 12, color: 'var(--purple)', cursor: 'pointer' }}>
            Отброшено из-за каннибализации: {state.skipped.length}
          </summary>
          <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ fontSize: 11, color: 'var(--muted)', lineHeight: 1.5 }}>
              По этим запросам сайт уже показывается. Новая статья не привела бы новых людей,
              а отобрала бы запросы у собственной страницы. Проверка идёт по запросам, а не по
              похожести текстов: две совершенно разные статьи прекрасно дерутся за один запрос.
            </div>
            {state.skipped.map((sk, i) => (
              <div key={i} style={{ fontSize: 12, borderLeft: '2px solid var(--bor2)', paddingLeft: 8 }}>
                <div style={{ fontWeight: 600 }}>
                  {sk.query}
                  <span style={{ color: VERDICT_COLOR[sk.verdict] ?? 'var(--muted)', fontWeight: 400, marginLeft: 6 }}>
                    {VERDICT_RU[sk.verdict] ?? sk.verdict}
                  </span>
                </div>
                <div style={{ color: 'var(--muted)', fontSize: 11 }}>{sk.reason}</div>
                {sk.caveat && <div style={{ color: 'var(--muted)', fontSize: 11, fontStyle: 'italic' }}>{sk.caveat}</div>}
                {sk.updateTarget && (
                  <a href={`${sk.updateTarget}/`} target="_blank" rel="noopener noreferrer"
                    style={{ fontSize: 11, color: 'var(--purple)', textDecoration: 'none' }}>
                    {sk.updateTarget.replace('https://goandstudy.com', '')} →
                  </a>
                )}
                <div style={{ display: 'flex', gap: 6, marginTop: 5, flexWrap: 'wrap' }}>
                  <Decide id={sk.topicId} act="create" label="Всё равно писать" disabled={pending} run={start} setNote={setNote} />
                  {sk.updateTarget && <Decide id={sk.topicId} act="update" url={sk.updateTarget} label="Обновлять ту" disabled={pending} run={start} setNote={setNote} />}
                  <Decide id={sk.topicId} act="review" label="Отложить" disabled={pending} run={start} setNote={setNote} />
                  <Decide id={sk.topicId} act="reject" label="Отклонить" disabled={pending} run={start} setNote={setNote} />
                </div>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  )
}

const VERDICT_RU: Record<string, string> = {
  risky: 'уже дерутся', update: 'обновлять существующую', unclear: 'спорно — решать вам',
}
const VERDICT_COLOR: Record<string, string> = {
  risky: 'var(--red)', update: 'var(--purple)', unclear: 'var(--muted)',
}

/** Решение человека по спорной теме. Машина считает, выбирает человек. */
function Decide({ id, act, url, label, disabled, run, setNote }: {
  id: number; act: 'create' | 'update' | 'review' | 'reject'; url?: string
  label: string; disabled: boolean
  run: (fn: () => void) => void; setNote: (v: string | null) => void
}) {
  return (
    <button className="btn-s" disabled={disabled} style={{ fontSize: 11, padding: '2px 8px' }}
      onClick={() => run(async () => {
        const r = await decideTopic(id, act, url)
        setNote(r.error ?? r.note ?? null)
      })}>
      {label}
    </button>
  )
}

function Field({ label, hint, children }: { label: string; hint: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 4 }}>{label}</div>
      {children}
      <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 3 }}>{hint}</div>
    </div>
  )
}

const select: React.CSSProperties = {
  padding: '6px 10px', borderRadius: 8, border: '1px solid var(--bor2)',
  background: 'var(--surf2)', fontSize: 13, color: 'var(--text)',
}
