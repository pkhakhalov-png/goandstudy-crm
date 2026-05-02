'use client'

import { useState, useTransition } from 'react'
import {
  addRoadmapItem,
  updateRoadmapItem,
  deleteRoadmapItem,
  approveRoadmap,
  unapproveRoadmap,
} from '@/lib/roadmap-actions'
import {
  ROADMAP_STAGES,
  formatRoadmapMonth,
  type RoadmapItemRow,
  type RoadmapStageKey,
} from '@/lib/roadmap-types'

interface Props {
  clientId: number
  initial: RoadmapItemRow[]
  approvedAt: string | null
  approvedBy?: string | null
  /** true для куратора/админа: видит редактор + кнопку «Утвердить». */
  canEdit?: boolean
}

export function RoadmapBlock({ clientId, initial, approvedAt: approvedAtProp, approvedBy, canEdit = false }: Props) {
  const [items, setItems] = useState<RoadmapItemRow[]>(initial)
  const [approvedAt, setApprovedAt] = useState<string | null>(approvedAtProp)
  const [pending, startTransition] = useTransition()
  const [err, setErr] = useState<string | null>(null)
  const [showAddFor, setShowAddFor] = useState<RoadmapStageKey | null>(null)

  const itemsByStage = ROADMAP_STAGES.map(stage => ({
    stage,
    items: items.filter(i => i.stage === stage.key),
  }))

  const totalItems = items.length
  const doneItems = items.filter(i => i.done).length
  const isApproved = !!approvedAt

  // Куратор может менять структуру только до утверждения. После — только галочки done.
  const canEditStructure = canEdit && !isApproved

  const onAdd = (stage: RoadmapStageKey, title: string, month: string, comment: string) => {
    if (!title.trim()) return
    setErr(null)
    startTransition(async () => {
      const r = await addRoadmapItem({ clientId, stage, title, month: month || undefined, comment: comment || undefined })
      if (!r.ok) setErr(r.error)
      else {
        setItems(prev => [...prev, {
          id: crypto.randomUUID(), stage, title: title.trim(),
          month: month || undefined, comment: comment || undefined, done: false,
        }])
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

  const onApprove = () => {
    if (!confirm('Утвердить дорожную карту? После этого структура будет зафиксирована, а клиент увидит план.')) return
    setErr(null)
    startTransition(async () => {
      const r = await approveRoadmap({ clientId })
      if (!r.ok) setErr(r.error)
      else setApprovedAt(new Date().toISOString())
    })
  }

  const onUnapprove = () => {
    if (!confirm('Снять утверждение? Можно будет менять структуру.')) return
    setErr(null)
    startTransition(async () => {
      const r = await unapproveRoadmap({ clientId })
      if (!r.ok) setErr(r.error)
      else setApprovedAt(null)
    })
  }

  // Для клиента: пока не утверждено — пусто.
  if (!canEdit && !isApproved) {
    return (
      <div style={{
        padding: '32px 24px', background: 'var(--ds-bg-alt)', borderRadius: 'var(--ds-r-md)',
        border: '1px dashed var(--ds-border)', textAlign: 'center', color: 'var(--ds-muted)', fontSize: 13,
      }}>
        Куратор готовит дорожную карту. Появится здесь после утверждения.
      </div>
    )
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, gap: 12, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 12, color: 'var(--ds-muted)' }}>
          {totalItems > 0 && <>{doneItems} / {totalItems} выполнено</>}
        </div>
        <ApprovalChip approvedAt={approvedAt} approvedBy={approvedBy} />
      </div>

      {err && <div style={{ padding: '8px 12px', background: '#FEE2E2', color: '#B91C1C', borderRadius: 8, fontSize: 12, marginBottom: 12 }}>{err}</div>}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        {itemsByStage.map(({ stage, items: stageItems }) => {
          // Клиенту скрываем стадии без пунктов
          if (stageItems.length === 0 && !canEditStructure) return null

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
                {stageItems.length > 0 && (
                  <span style={{ fontSize: 11, color: 'var(--ds-muted)', fontWeight: 600 }}>
                    {done}/{stageItems.length}
                  </span>
                )}
              </div>

              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {stageItems.map((item, idx) => (
                  <ItemRow
                    key={item.id}
                    item={item}
                    isLast={idx === stageItems.length - 1 && (!canEditStructure || showAddFor !== stage.key)}
                    canEditStructure={canEditStructure}
                    canToggleDone={canEdit}
                    disabled={pending}
                    onPatch={(p) => onPatch(item.id, p)}
                    onDelete={() => onDelete(item.id)}
                  />
                ))}

                {canEditStructure && showAddFor === stage.key && (
                  <AddItemRow
                    onSave={(title, month, comment) => onAdd(stage.key, title, month, comment)}
                    onCancel={() => setShowAddFor(null)}
                    disabled={pending}
                  />
                )}

                {canEditStructure && showAddFor !== stage.key && (
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

      {canEdit && (
        <div style={{ marginTop: 24, paddingTop: 20, borderTop: '1px solid var(--ds-border-soft)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ fontSize: 12, color: 'var(--ds-muted)', flex: 1, minWidth: 180 }}>
            {isApproved
              ? 'Карта утверждена — клиенту видна. Структуру менять нельзя, только проставлять галочки.'
              : 'После утверждения клиент увидит план. До этого структуру можно менять.'}
          </div>
          {isApproved ? (
            <button
              type="button"
              disabled={pending}
              onClick={onUnapprove}
              className="ds-btn ds-btn-secondary"
              style={{ fontSize: 13, padding: '8px 16px' }}
            >
              Снять утверждение
            </button>
          ) : (
            <button
              type="button"
              disabled={pending || totalItems === 0}
              onClick={onApprove}
              className="ds-btn ds-btn-primary"
              style={{ fontSize: 13, padding: '8px 20px', fontWeight: 600 }}
            >
              ✓ Утвердить дорожную карту
            </button>
          )}
        </div>
      )}
    </div>
  )
}

function ApprovalChip({ approvedAt, approvedBy }: { approvedAt: string | null; approvedBy?: string | null }) {
  if (!approvedAt) {
    return (
      <span className="ds-chip" style={{
        textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700, fontSize: 10,
        background: '#FEF3C7', color: '#92400E', padding: '4px 10px', borderRadius: 999,
      }}>
        Черновик
      </span>
    )
  }
  return (
    <span
      className="ds-chip ds-chip-success"
      style={{ textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700, fontSize: 10 }}
      title={approvedBy ? `Утвердил ${approvedBy}, ${new Date(approvedAt).toLocaleDateString('ru')}` : new Date(approvedAt).toLocaleDateString('ru')}
    >
      ✓ Утверждено
    </span>
  )
}

function ItemRow({
  item, isLast, canEditStructure, canToggleDone, disabled, onPatch, onDelete,
}: {
  item: RoadmapItemRow
  isLast: boolean
  canEditStructure: boolean
  canToggleDone: boolean
  disabled: boolean
  onPatch: (p: Partial<RoadmapItemRow>) => void
  onDelete: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [title, setTitle] = useState(item.title)
  const [month, setMonth] = useState(item.month || '')
  const [comment, setComment] = useState(item.comment || '')

  const save = () => {
    onPatch({ title: title.trim(), month: month || undefined, comment: comment.trim() || undefined })
    setEditing(false)
  }

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', gap: 6, padding: '12px 0',
      borderBottom: isLast ? 'none' : '1px solid var(--ds-border-soft)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 13 }}>
        <input
          type="checkbox"
          checked={!!item.done}
          disabled={!canToggleDone || disabled}
          onChange={(e) => onPatch({ done: e.target.checked })}
          style={{ width: 18, height: 18, accentColor: 'var(--ds-purple)', cursor: canToggleDone ? 'pointer' : 'default' }}
        />

        <div style={{ flex: 1, minWidth: 0 }}>
          {editing ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  autoFocus
                  placeholder="Название пункта"
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
                    color: 'var(--ds-ink)', background: 'var(--ds-bg)', width: 140,
                  }}
                />
              </div>
              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Комментарий (опционально)"
                rows={2}
                style={{
                  padding: '6px 10px', fontSize: 13,
                  border: '1px solid var(--ds-purple)', borderRadius: 6,
                  color: 'var(--ds-ink)', background: 'var(--ds-bg)',
                  fontFamily: 'inherit', resize: 'vertical',
                }}
              />
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="button" onClick={save} className="ds-btn ds-btn-primary ds-btn-sm" style={{ fontSize: 12 }}>
                  Сохранить
                </button>
                <button type="button" onClick={() => setEditing(false)} className="ds-btn ds-btn-secondary ds-btn-sm" style={{ fontSize: 12 }}>
                  Отмена
                </button>
              </div>
            </div>
          ) : (
            <div
              style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12,
                cursor: canEditStructure ? 'pointer' : 'default',
              }}
              onClick={() => canEditStructure && setEditing(true)}
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

        {canEditStructure && !editing && (
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

      {/* Комментарий показываем только если он есть и не в режиме редактирования */}
      {!editing && item.comment && item.comment.trim() && (
        <div style={{
          marginLeft: 30, fontSize: 12, color: 'var(--ds-muted)',
          padding: '6px 10px', background: 'var(--ds-bg-alt)',
          borderRadius: 6, lineHeight: 1.4, fontStyle: 'italic',
        }}>
          {item.comment}
        </div>
      )}
    </div>
  )
}

function AddItemRow({ onSave, onCancel, disabled }: {
  onSave: (title: string, month: string, comment: string) => void
  onCancel: () => void
  disabled: boolean
}) {
  const [title, setTitle] = useState('')
  const [month, setMonth] = useState('')
  const [comment, setComment] = useState('')

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '12px 0', borderTop: '1px solid var(--ds-border-soft)' }}>
      <div style={{ display: 'flex', gap: 8 }}>
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
      </div>
      <textarea
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        placeholder="Комментарий (опционально)"
        rows={2}
        style={{
          padding: '6px 10px', fontSize: 13,
          border: '1px solid var(--ds-purple)', borderRadius: 6,
          color: 'var(--ds-ink)', background: 'var(--ds-bg)',
          fontFamily: 'inherit', resize: 'vertical',
        }}
      />
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          type="button"
          disabled={disabled || !title.trim()}
          onClick={() => onSave(title, month, comment)}
          className="ds-btn ds-btn-primary ds-btn-sm"
          style={{ fontSize: 12 }}
        >
          Добавить
        </button>
        <button type="button" onClick={onCancel} className="ds-btn ds-btn-secondary ds-btn-sm" style={{ fontSize: 12 }}>
          Отмена
        </button>
      </div>
    </div>
  )
}
