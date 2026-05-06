'use client'

import { CollapsibleCard } from './CollapsibleCard'
import { RoadmapBlock } from '@/app/_shared/RoadmapBlock'
import type { RoadmapData } from '@/lib/roadmap-types'

interface Props {
  clientId: number
  data: RoadmapData
  approvedAt: string | null
  approvedBy: string | null
}

export function RoadmapCard({ clientId, data, approvedAt, approvedBy }: Props) {
  const isApproved = !!approvedAt
  const isSent = !!data.sent_at
  // Карта отправлена куратором, но клиент ещё не подтвердил → подсвечиваем
  const needsAction = isSent && !isApproved

  return (
    <CollapsibleCard
      eyebrow="Детально по шагам"
      title="Дорожная карта"
      highlight={needsAction}
      initiallyOpen={needsAction}
      summary={
        isApproved
          ? 'План работ от куратора'
          : needsAction
            ? 'Куратор отправил карту — открой и подтверди'
            : 'Куратор готовит план — появится после отправки'
      }
      chip={
        isApproved
          ? <span className="ds-chip ds-chip-success" style={{ textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700, fontSize: 10 }}>✓ утверждено</span>
          : needsAction
            ? <span className="ds-chip" style={{ textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700, fontSize: 10, background: 'var(--ds-purple-soft)', color: 'var(--ds-purple-deep)', padding: '4px 10px', borderRadius: 999 }}>Подтверди</span>
            : <span className="ds-chip ds-chip-neutral" style={{ textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700, fontSize: 10 }}>в работе</span>
      }
    >
      <RoadmapBlock
        clientId={clientId}
        initial={data}
        approvedAt={approvedAt}
        approvedBy={approvedBy}
        canEdit={false}
      />
    </CollapsibleCard>
  )
}
