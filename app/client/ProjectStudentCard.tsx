'use client'

import { CollapsibleCard } from './CollapsibleCard'
import { StudentProjectBlock } from '@/app/_shared/StudentProjectBlock'
import type { StudentProjectData } from '@/lib/client-data'

interface Props {
  clientId: number
  initial: StudentProjectData
}

export function ProjectStudentCard({ clientId, initial }: Props) {
  const filledCount = Object.entries(initial)
    .filter(([k, v]) => k !== 'updated_at' && k !== 'updated_by_name' && k !== 'note' && typeof v === 'string' && v.trim().length > 0)
    .length

  return (
    <CollapsibleCard
      eyebrow="Стратегическая сессия"
      title="Проект студента"
      summary={
        filledCount > 0
          ? `${filledCount} полей заполнено · обновил ${initial.updated_by_name || 'куратор'}, ${initial.updated_at ? new Date(initial.updated_at).toLocaleDateString('ru', { day: 'numeric', month: 'short' }) : '—'}`
          : 'Куратор заполнит после стратегической сессии'
      }
      chip={
        filledCount > 0
          ? <span className="ds-chip ds-chip-success" style={{ textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700, fontSize: 10 }}>✓ зафиксирован</span>
          : <span className="ds-chip ds-chip-neutral" style={{ textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700, fontSize: 10 }}>пусто</span>
      }
    >
      <StudentProjectBlock clientId={clientId} initial={initial} />
    </CollapsibleCard>
  )
}
