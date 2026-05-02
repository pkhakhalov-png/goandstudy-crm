'use client'

import { CollapsibleCard } from './CollapsibleCard'
import { RoadmapBlock } from '@/app/_shared/RoadmapBlock'
import type { RoadmapItemRow } from '@/lib/roadmap-types'

interface Props {
  clientId: number
  items: RoadmapItemRow[]
}

export function RoadmapCard({ clientId, items }: Props) {
  const total = items.length
  const done = items.filter(i => i.done).length

  return (
    <CollapsibleCard
      eyebrow="Детально по шагам"
      title="Дорожная карта"
      summary={
        total === 0
          ? 'Куратор пока не наполнил план'
          : `${done} / ${total} задач выполнено`
      }
      chip={
        total === 0
          ? <span className="ds-chip ds-chip-neutral" style={{ textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700, fontSize: 10 }}>пусто</span>
          : <span style={{ fontFamily: 'var(--ds-font-display-stack)', fontWeight: 700, fontSize: 13, color: 'var(--ds-purple-deep)', fontVariantNumeric: 'tabular-nums' }}>
              {done} / {total}
            </span>
      }
    >
      <RoadmapBlock clientId={clientId} initial={items} canEdit={false} />
    </CollapsibleCard>
  )
}
