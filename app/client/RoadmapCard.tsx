'use client'

import type { RoadmapStage } from './mock-data'
import { CollapsibleCard } from './CollapsibleCard'

interface Props {
  roadmap: RoadmapStage[]
}

export function RoadmapCard({ roadmap }: Props) {
  const totalItems = roadmap.reduce((acc, s) => acc + s.items.length, 0)
  const doneItems = roadmap.reduce((acc, s) => acc + s.items.filter(i => i.done).length, 0)
  const currentStage = roadmap.find(s => s.items.some(i => i.current))

  const summary = currentStage
    ? `${doneItems} / ${totalItems} задач · текущий этап — ${currentStage.stageName}`
    : `${doneItems} / ${totalItems} задач`

  return (
    <CollapsibleCard
      eyebrow="Детально по шагам"
      title="Дорожная карта"
      summary={summary}
      chip={
        <span
          style={{
            fontFamily: 'var(--ds-font-display-stack)',
            fontWeight: 700,
            fontSize: 13,
            color: 'var(--ds-purple-deep)',
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {doneItems} / {totalItems}
        </span>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        {roadmap.map(stage => (
          <RoadmapStageBlock key={stage.stageKey} stage={stage} />
        ))}
      </div>
    </CollapsibleCard>
  )
}

function RoadmapStageBlock({ stage }: { stage: RoadmapStage }) {
  const doneInStage = stage.items.filter(i => i.done).length
  const totalInStage = stage.items.length
  const allDone = doneInStage === totalInStage
  const hasCurrent = stage.items.some(i => i.current)

  return (
    <div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 10,
          gap: 12,
        }}
      >
        <h4
          style={{
            fontFamily: 'var(--ds-font-display-stack)',
            fontWeight: 700,
            fontSize: 13,
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            color: allDone || hasCurrent ? 'var(--ds-ink)' : 'var(--ds-muted)',
            margin: 0,
          }}
        >
          {stage.stageName}
        </h4>
        <span
          className="ds-mono"
          style={{
            fontSize: 11,
            color: allDone ? 'var(--ds-success-ink)' : 'var(--ds-muted)',
            fontWeight: 600,
          }}
        >
          {doneInStage}/{totalInStage}
        </span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {stage.items.map((item, idx) => (
          <div
            key={item.key}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              padding: '10px 0',
              borderBottom: idx === stage.items.length - 1 ? 'none' : '1px solid var(--ds-border-soft)',
              fontSize: 13,
            }}
          >
            <div
              style={{
                width: 20,
                height: 20,
                borderRadius: '50%',
                border: `2px solid ${item.done ? 'var(--ds-success)' : item.current ? 'var(--ds-purple)' : 'var(--ds-border)'}`,
                background: item.done ? 'var(--ds-success)' : 'var(--ds-bg)',
                color: '#fff',
                display: 'grid',
                placeItems: 'center',
                fontSize: 11,
                fontWeight: 700,
                flexShrink: 0,
                boxShadow: item.current ? '0 0 0 3px rgba(181,127,207,0.18)' : 'none',
              }}
            >
              {item.done ? '✓' : ''}
            </div>
            <div
              style={{
                flex: 1,
                color: item.done ? 'var(--ds-ink-dim)' : item.current ? 'var(--ds-ink)' : 'var(--ds-muted)',
                fontWeight: item.current ? 600 : 400,
                letterSpacing: '-0.005em',
                lineHeight: 1.4,
              }}
            >
              {item.title}
              {item.current && (
                <span
                  style={{
                    display: 'inline-block',
                    marginLeft: 8,
                    padding: '1px 8px',
                    borderRadius: 4,
                    background: 'var(--ds-purple-soft)',
                    color: 'var(--ds-purple-deep)',
                    fontSize: 10,
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                  }}
                >
                  сейчас
                </span>
              )}
            </div>
            <span
              className="ds-mono"
              style={{
                fontSize: 11,
                color: item.done ? 'var(--ds-muted)' : item.current ? 'var(--ds-purple-deep)' : 'var(--ds-muted)',
                fontWeight: item.current ? 700 : 500,
                flexShrink: 0,
              }}
            >
              {item.done ? item.date : `→ ${item.date}`}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
