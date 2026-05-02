'use client'

import { useState, useTransition } from 'react'
import { addRoadmapItem, updateRoadmapItem, deleteRoadmapItem } from '@/lib/roadmap-actions'
import {
  ROADMAP_STAGES,
  formatRoadmapMonth,
  type RoadmapItemRow,
  type RoadmapStageKey,
} from '@/lib/roadmap-types'

interface Props {
  clientId: number
  initial: RoadmapItemRow[]
  /** true если viewer — куратор/админ (может редактировать). По умолчанию false (клиент, read-only). */
  canEdit?: boolean
}

export function RoadmapBlock({ clientId, initial, canEdit = false }: Props) {
  const [items, setItems] = useState<RoadmapItemRow[]>(initial)
  const [pending, startTransition] = useTransition()
  const [err, setErr] = useState<string | null>(null)
  const [showAddFor, setShowAddFor] = useState<RoadmapStageKey | null>(null)

  const itemsByStage = ROADMAP_STAGES.map(stage => ({
    stage,
    items: items.filter(i => i.stage === stage.key),
  }))

  const totalItems = items.length
  const doneItems = items.filter(i => i.done).length

  const onAdd = (stage: RoadmapStageKey, title: string, month: string) => {
    if (!title.trim()) return
    setErr(null)
    startTransition(async () => {
      const r = await addRoadmapItem({ clientId, stage, title, month: month || undefined })
      if (!r.ok) setErr(r.error)
      else {
        // оптимистично
        setItems(prev => [...prev, { id: crypto.randomUUID(), stage, title: title.trim(), month: month || undefined, done: false }])
        setShowAddFor(null)
      }
    })
  }

  const onPatch = (itemId: string, patch: Partial<RoadmapItemRow>) => {
    setErr(null)
    setItems(prev => prev.map(i => i.id === itemId ? { ...i, ...patch } : i))
    startTransition(async () => {
      const r = await updateRoadmapItem({ clientId, itemId, patch: patch as any })
      if (!r.ok) setErr(r.error)
    })
  }

  const onDelete = (itemId: string) => {
    if (!confirm('Удалить пункт?')) return
    setErr(null)
    setItems(prev => prev.filter(i => i.id !== itemId))
    startTransition(async () => {
      const r = await deleteRoadmapItem({ clientId, itemId })
      if (!r.ok) setErr(r.error)
    })
  }

  if (totalItems === 0 && !canEdit) {
    return (
      <div style={{
        padding: '32px 24px', background: 'var(--ds-bg-alt)', borderRadius: 'var(--ds-r-md)',
        border: '1px dashed var(--ds-border)', textAlign: 'center', color: 'var(--ds-muted)', fontSize: 13,
      }}>
        Куратор пока не наполнил план. Появится здесь после стратегической сессии.
      </div>
    )
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 16 }}>
        <div style={{ fontSize: 12, color: 'var(--ds-muted)' }}>
          {doneItems} / {totalItems} {totalItems > 0 ? 'выполнено' : 'пунктов'}
        </div>
      </div>

      {err && <div style={{ padding: '8px 12px', background: '#FEE2E2', color: '#B91C1C', borderRadius: 8, fontSize: 12, marginBottom: 12 }}>{err}</div>}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        {itemsByStage.map(({ stage, items: stageItems }) => {
          const done = stageItems.filter(i => i.done).length
          return (
            <div key={stage.key}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <h4 style={{
                  fontSize: 13, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em',
                  color: stageItems.length > 0 ? 'var(--ds-ink)' : 'var(--ds-muted)', margin: 0,
                }}>
                  {stage.label}
                </h4>
                <span style={{ fontSize: 11, color: 'var(--ds-muted)', fontWeight: 600 }}>
                  {done}/{stageItems.length}
                </span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {stageItems.map((item, idx) => (
                  <ItemRow
                    key={item.id}
                    item={item}
                    isLast={idx === stageItems.length - 1}
                    canEdit={canEdit}
                    disabled={pending}
                    onPatch={(p) => onPatch(item.id, p)}
                    onDelete={() => onDelete(item.id)}
                  />
                ))}

                {canEdit && showAddFor === stage.key && (
                  <AddItemRow
                    onSave={(title, month) => onAdd(stage.key, title, month)}
                    onCancel={() => setShowAddFor(null)}
                    disabled={pending}
                  />
                )}

                {canEdit && showAddFor !== stage.key && (
                  <button
                    type="button"
                    onClick={() => setShowAddFor(stage.key)}
                    disabled={pending}
                    style={{
                      marginTop: 8, alignSelf: 'flex-start',
                      background: 'transparent', border: '1px dashed var(--ds-border)',
                      borderRadius: 'var(--ds-r-sm)', padding: '6px 12px',
                      fontSize: 12, color: 'var(--ds-muted)', cursor: 'pointer',
                    }}
                  >
                    + добавить пункт
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function ItemRow({
  item, isLast, canEdit, disabled, onPatch, onDelete,
}: {
  item: RoadmapItemRow
  isLast: boolean
  canEdit: boolean
  disabled: boolean
  onPatch: (p: Partial<RoadmapItemRow>) => void
  onDelete: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [title, setTitle] = useState(item.title)
  const [month, setMonth] = useState(item.month || '')

  const save = () => {
    onPatch({ title: title.trim(), month: month || undefined })
    setEditing(false)
  }

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0',
      borderBottom: isLast ? 'none' : '1px solid var(--ds-border-soft)', fontSize: 13,
    }}>
      <input
        type="checkbox"
        checked={!!item.done}
        disabled={!canEdit || disabled}
        onChange={(e) => onPatch({ done: e.target.checked })}
        style={{ width: 18, height: 18, accentColor: 'var(--ds-purple)', cursor: canEdit ? 'pointer' : 'default' }}
      />

      <div style={{ flex: 1, minWidth: 0 }}>
        {editing ? (
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              autoFocus
              style={{
                flex: 1, padding: '4px 8px', fontSize: 13,
                border: '1px solid var(--ds-purple)', borderRadius: 6,
                color: 'var(--ds-ink)', background: 'var(--ds-bg)',
              }}
            />
            <input
              type="month"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              style={{
                padding: '4px 8px', fontSize: 13,
                border: '1px solid var(--ds-purple)', borderRadius: 6,
                color: 'var(--ds-ink)', background: 'var(--ds-bg)', width: 130,
              }}
            />
            <button type="button" onClick={save} className="ds-btn ds-btn-primary ds-btn-sm" style={{ fontSize: 11, padding: '4px 8px' }}>
              ✓
            </button>
            <button type="button" onClick={() => setEditing(false)} className="ds-btn ds-btn-secondary ds-btn-sm" style={{ fontSize: 11, padding: '4px 8px' }}>
              ✕
            </button>
          </div>
        ) : (
          <div
            style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12,
              cursor: canEdit ? 'pointer' : 'default',
            }}
            onClick={() => canEdit && setEditing(true)}
          >
            <span style={{
              color: item.done ? 'var(--ds-muted)' : 'var(--ds-ink)',
              textDecoration: item.done ? 'line-through' : 'none',
            }}>
              {item.title}
            </span>
            <span style={{ fontSize: 11, color: 'var(--ds-muted)', whiteSpace: 'nowrap' }}>
              {formatRoadmapMonth(item.month) || '—'}
            </span>
          </div>
        )}
      </div>

      {canEdit && !editing && (
        <button
          type="button"
          onClick={onDelete}
          disabled={disabled}
          style={{ background: 'transparent', border: 'none', color: '#DC2626', cursor: 'pointer', fontSize: 14, opacity: 0.6, padding: 4 }}
          title="Удалить пункт"
        >
          ✕
        </button>
      )}
    </div>
  )
}

function AddItemRow({ onSave, onCancel, disabled }: {
  onSave: (title: string, month: string) => void
  onCancel: () => void
  disabled: boolean
}) {
  const [title, setTitle] = useState('')
  const [month, setMonth] = useState('')

  return (
    <div style={{ display: 'flex', gap: 8, padding: '10px 0' }}>
      <input
        type="text"
        autoFocus
        placeholder="Название пункта"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        style={{
          flex: 1, padding: '6px 10px', fontSize: 13,
          border: '1px solid var(--ds-purple)', borderRadius: 6,
          color: 'var(--ds-ink)', background: 'var(--ds-bg)',
        }}
      />
      <input
        type="month"
        value={month}
        onChange={(e) => setMonth(e.target.value)}
        style={{
          padding: '6px 10px', fontSize: 13,
          border: '1px solid var(--ds-purple)', borderRadius: 6,
          color: 'var(--ds-ink)', background: 'var(--ds-bg)', width: 150,
        }}
      />
      <button
        type="button"
        disabled={disabled || !title.trim()}
        onClick={() => onSave(title, month)}
        className="ds-btn ds-btn-primary ds-btn-sm"
        style={{ fontSize: 12 }}
      >
        Добавить
      </button>
      <button type="button" onClick={onCancel} className="ds-btn ds-btn-secondary ds-btn-sm" style={{ fontSize: 12 }}>
        Отмена
      </button>
    </div>
  )
}
