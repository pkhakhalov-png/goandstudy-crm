'use client'

import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { completeTask } from './actions'

interface Props {
  tasks: any[]
  dealMap: Record<string, any>
}

export function SalesTasksPanel({ tasks, dealMap }: Props) {
  const router = useRouter()

  async function handleComplete(taskId: string) {
    const fd = new FormData()
    fd.append('task_id', taskId)
    await completeTask(fd)
    router.refresh()
  }

  return (
    <div style={{ padding: '12px 24px 0' }}>
      <div style={{
        background: 'rgba(220,53,69,.04)', border: '1px solid rgba(220,53,69,.15)',
        borderRadius: 14, padding: '14px 18px',
      }}>
        <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--red)', marginBottom: 10 }}>
          Задачи ({tasks.length})
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {tasks.slice(0, 10).map(t => {
            const isOverdue = t.deadline && new Date(t.deadline) < new Date()
            return (
              <div key={t.id} style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px',
                borderRadius: 10,
                background: isOverdue ? 'rgba(220,53,69,.06)' : 'rgba(201,125,0,.06)',
                border: `1px solid ${isOverdue ? 'rgba(220,53,69,.15)' : 'rgba(201,125,0,.15)'}`,
              }}>
                <button onClick={() => handleComplete(t.id)}
                  title="Выполнено"
                  style={{
                    width: 20, height: 20, borderRadius: 6, flexShrink: 0, cursor: 'pointer',
                    border: '2px solid var(--green)', background: 'transparent',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = 'var(--green)' }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}>
                </button>
                <Link href={`/sales/funnel/${t.deal_id}`} style={{ flex: 1, fontSize: 12, fontWeight: 600, color: 'var(--text)', textDecoration: 'none' }}>
                  {t.title}
                </Link>
                {t.deadline && (
                  <div style={{ fontSize: 10, color: isOverdue ? 'var(--red)' : 'var(--gold)', fontWeight: 600, flexShrink: 0 }}>
                    {isOverdue ? 'Просрочена' : new Date(t.deadline).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
