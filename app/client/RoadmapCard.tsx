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
  const total = data.stages.reduce((acc, s) => acc + s.items.length, 0)
  const done = data.stages.reduce((acc, s) => acc + s.items.filter(i => i.done).length, 0)
  const isApproved = !!approvedAt

  return (
    <CollapsibleCard
      eyebrow="Детально по шагам"
      title="Дорожная карта"
      summary={
        !isApproved
          ? 'Куратор готовит план — появится после утверждения'
          : `${done} / ${total} задач выполнено`
      }
      chip={
        !isApproved
          ? <span className="ds-chip ds-chip-neutral" style={{ textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700, fontSize: 10 }}>в работе</span>
          : <span style={{ fontFamily: 'var(--ds-font-display-stack)', fontWeight: 700, fontSize: 13, color: 'var(--ds-purple-deep)', fontVariantNumeric: 'tabular-nums' }}>
              {done} / {total}
            </span>
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
