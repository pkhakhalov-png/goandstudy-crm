'use client'

import { CollapsibleCard } from './CollapsibleCard'
import { RoadmapBlock } from '@/app/_shared/RoadmapBlock'
import type { RoadmapItemRow } from '@/lib/roadmap-types'

interface Props {
  clientId: number
  items: RoadmapItemRow[]
  approvedAt: string | null
  approvedBy: string | null
}

export function RoadmapCard({ clientId, items, approvedAt, approvedBy }: Props) {
  const total = items.length
  const done = items.filter(i => i.done).length
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
        initial={items}
        approvedAt={approvedAt}
        approvedBy={approvedBy}
        canEdit={false}
      />
    </CollapsibleCard>
  )
}
