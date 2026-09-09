'use client'

import { useTransition } from 'react'
import { cancelJob } from './actions'

const STEP_RU: Record<string, string> = {
  article_brief: 'бриф',
  article_draft: 'черновик',
  article_qa: 'проверки и починка',
  article_illustrate: 'обложка и схемы',
  article_linkplan: 'входящие ссылки',
}

const STATUS_RU: Record<string, string> = {
  pending: 'ждёт', running: 'идёт', waiting: 'ждёт', done: 'готово',
  failed: 'ошибка', cancelled: 'снята', awaiting_human: 'нужен человек',
}

export function JobQueue({ jobs }: { jobs: any[] }) {
  const [pending, start] = useTransition()
  const active = jobs.filter((j) => ['pending', 'running', 'waiting'].includes(j.status))
  const recent = jobs.filter((j) => !['pending', 'running', 'waiting'].includes(j.status)).slice(0, 6)

  if (jobs.length === 0) return null

  return (
    <div style={{ border: '1px solid var(--bor)', borderRadius: 10, padding: 14, background: 'var(--surf)', marginBottom: 16 }}>
      <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>
        Очередь конвейера {active.length > 0 && <span style={{ color: 'var(--purple)' }}>· в работе {active.length}</span>}
      </div>

      {active.length === 0 ? (
        <div style={{ fontSize: 12, color: 'var(--muted)' }}>Активных задач нет.</div>
      ) : (
        active.map((j) => (
          <div key={j.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, fontSize: 12, padding: '5px 0', borderTop: '1px solid var(--bor)' }}>
            <span>
              <b>{STEP_RU[j.step] ?? j.step}</b>
              {j.article_id ? ` · статья ${j.article_id}` : ''}
              <span style={{ color: 'var(--muted)' }}> · {STATUS_RU[j.status] ?? j.status}</span>
              {j.attempts > 0 && <span style={{ color: 'var(--muted)' }}> · попыток {j.attempts}</span>}
            </span>
            <button className="btn-s" style={{ fontSize: 11, padding: '2px 8px' }} disabled={pending || j.status === 'running'}
              onClick={() => start(async () => { await cancelJob(j.id) })}>
              снять
            </button>
          </div>
        ))
      )}

      {recent.length > 0 && (
        <div style={{ marginTop: 10, fontSize: 11, color: 'var(--muted)' }}>
          Последние: {recent.map((j) => `${STEP_RU[j.step] ?? j.step} — ${STATUS_RU[j.status] ?? j.status}`).join(' · ')}
        </div>
      )}

      {active.length > 0 && (
        <div style={{ marginTop: 10, fontSize: 11, color: 'var(--muted)', lineHeight: 1.5 }}>
          Задачи выполняет воркер: <code>npx tsx scripts/seo-worker.ts</code>. Пока он не запущен,
          очередь просто ждёт — ничего не теряется.
        </div>
      )}
    </div>
  )
}
