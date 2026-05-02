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

  return (
    <CollapsibleCard
      eyebrow="Детально по шагам"
      title="Дорожная карта"
      summary={
        !isApproved
          ? 'Куратор готовит план — появится после утверждения'
          : 'План работ от куратора'
      }
      chip={
        !isApproved
          ? <span className="ds-chip ds-chip-neutral" style={{ textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700, fontSize: 10 }}>в работе</span>
          : <span className="ds-chip ds-chip-success" style={{ textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700, fontSize: 10 }}>✓ утверждено</span>
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
