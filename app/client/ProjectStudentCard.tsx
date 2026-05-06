'use client'

import { CollapsibleCard } from './CollapsibleCard'
import { StudentProjectBlock } from '@/app/_shared/StudentProjectBlock'
import { STUDENT_PROJECT_FIELDS, type StudentProjectData } from '@/lib/student-project-types'

interface Props {
  clientId: number
  initial: StudentProjectData
}

export function ProjectStudentCard({ clientId, initial }: Props) {
  const filledCount = STUDENT_PROJECT_FIELDS.filter(f => (initial[f.key] || '').trim().length > 0).length
  const isConfirmed = !!initial.confirmed_at
  // Все поля заполнены, но клиент ещё не подтвердил → подсвечиваем
  const allFilled = filledCount === STUDENT_PROJECT_FIELDS.length
  const needsAction = allFilled && !isConfirmed

  return (
    <CollapsibleCard
      eyebrow="Стратегическая сессия"
      title="Проект студента"
      highlight={needsAction}
      initiallyOpen={needsAction}
      summary={
        isConfirmed
          ? `Зафиксировано ${initial.confirmed_at ? new Date(initial.confirmed_at).toLocaleDateString('ru', { day: 'numeric', month: 'short' }) : ''}`
          : needsAction
            ? 'Куратор заполнил все поля — открой и подтверди'
            : filledCount > 0
              ? `${filledCount} / ${STUDENT_PROJECT_FIELDS.length} полей · в работе`
              : 'Куратор заполнит после стратегической сессии'
      }
      chip={
        isConfirmed
          ? <span className="ds-chip ds-chip-success" style={{ textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700, fontSize: 10 }}>✓ Зафиксировано</span>
          : needsAction
            ? <span className="ds-chip" style={{ textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700, fontSize: 10, background: 'var(--ds-purple-soft)', color: 'var(--ds-purple-deep)', padding: '4px 10px', borderRadius: 999 }}>Подтверди</span>
            : filledCount > 0
              ? <span className="ds-chip" style={{ textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700, fontSize: 10, background: '#FEF3C7', color: '#92400E', padding: '4px 10px', borderRadius: 999 }}>В работе</span>
              : <span className="ds-chip ds-chip-neutral" style={{ textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700, fontSize: 10 }}>Пусто</span>
      }
    >
      <StudentProjectBlock clientId={clientId} initial={initial} isClient />
    </CollapsibleCard>
  )
}
