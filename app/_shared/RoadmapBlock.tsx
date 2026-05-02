'use client'

import { useState, useTransition } from 'react'
import {
  addRoadmapStage, updateRoadmapStage, deleteRoadmapStage,
  addRoadmapItem, updateRoadmapItem, deleteRoadmapItem,
  approveRoadmap, unapproveRoadmap, seedRoadmapTemplate,
} from '@/lib/roadmap-actions'
import {
  formatRoadmapMonth,
  type RoadmapData, type RoadmapStage, type RoadmapItem,
} from '@/lib/roadmap-types'
import { MonthYearPicker } from './MonthYearPicker'

interface Props {
  clientId: number
  initial: RoadmapData
  approvedAt: string | null
  approvedBy?: string | null
  canEdit?: boolean
}

export function RoadmapBlock({ clientId, initial, approvedAt: approvedAtProp, approvedBy, canEdit = false }: Props) {
  const [data, setData] = useState<RoadmapData>(initial)
  const [approvedAt, setApprovedAt] = useState<string | null>(approvedAtProp)
  const [pending, startTransition] = useTransition()
  const [err, setErr] = useState<string | null>(null)
  const [showAddFor, setShowAddFor] = useState<string | null>(null)
  const [addingStage, setAddingStage] = useState(false)

  const totalItems = data.stages.reduce((acc, s) => acc + s.items.length, 0)
  const doneItems = data.stages.reduce((acc, s) => acc + s.items.filter(i => i.done).length, 0)
  const isApproved = !!approvedAt
  const canEditStructure = canEdit && !isApproved

  const showError = (e: string) => setErr(e)

  // ─── stage actions ──────────────────────────────────────────────────────
  const onAddStage = (title: string) => {
    if (!title.trim()) return
    startTransition(async () => {
      const r = await addRoadmapStage({ clientId, title })
      if (!r.ok) showError(r.error)
      else {
        setData(d => ({ stages: [...d.stages, { id: crypto.randomUUID(), title: title.trim(), items: [] }] }))
        setAddingStage(false)
      }
    })
  }

  const onPatchStage = (stageId: string, patch: Partial<Pick<RoadmapStage, 'title' | 'month'>>) => {
    setData(d => ({ stages: d.stages.map(s => s.id === stageId ? { ...s, ...patch } : s) }))
    startTransition(async () => {
      const r = await updateRoadmapStage({ clientId, stageId, patch })
      if (!r.ok) showError(r.error)
    })
  }

  const onDeleteStage = (stageId: string) => {
    if (!confirm('Удалить этап целиком (со всеми пунктами)?')) return
    setData(d => ({ stages: d.stages.filter(s => s.id !== stageId) }))
    startTransition(async () => {
      const r = await deleteRoadmapStage({ clientId, stageId })
      if (!r.ok) showError(r.error)
    })
  }

  // ─── item actions ───────────────────────────────────────────────────────
  const onAddItem = (stageId: string, title: string, month: string, comment: string) => {
    if (!title.trim()) return
    startTransition(async () => {
      const r = await addRoadmapItem({ clientId, stageId, title, month: month || undefined, comment: comment || undefined })
      if (!r.ok) showError(r.error)
      else {
        const newItem: RoadmapItem = { id: crypto.randomUUID(), title: title.trim(), month: month || undefined, comment: comment || undefined, done: false }
        setData(d => ({ stages: d.stages.map(s => s.id === stageId ? { ...s, items: [...s.items, newItem] } : s) }))
        setShowAddFor(null)
      }
    })
  }

  const onPatchItem = (stageId: string, itemId: string, patch: Partial<RoadmapItem>) => {
    setData(d => ({ stages: d.stages.map(s => s.id !== stageId ? s : { ...s, items: s.items.map(i => i.id === itemId ? { ...i, ...patch } : i) }) }))
    startTransition(async () => {
      const r = await updateRoadmapItem({ clientId, stageId, itemId, patch: patch as any })
      if (!r.ok) showError(r.error)
    })
  }

  const onDeleteItem = (stageId: string, itemId: string) => {
    if (!confirm('Удалить пункт?')) return
    setData(d => ({ stages: d.stages.map(s => s.id !== stageId ? s : { ...s, items: s.items.filter(i => i.id !== itemId) }) }))
    startTransition(async () => {
      const r = await deleteRoadmapItem({ clientId, stageId, itemId })
      if (!r.ok) showError(r.error)
    })
  }

  // ─── approval ───────────────────────────────────────────────────────────
  const onApprove = () => {
    if (!confirm('Утвердить дорожную карту? После этого структура зафиксируется и клиент увидит план.')) return
    startTransition(async () => {
      const r = await approveRoadmap({ clientId })
      if (!r.ok) showError(r.error)
      else setApprovedAt(new Date().toISOString())
    })
  }

  const onUnapprove = () => {
    if (!confirm('Снять утверждение? Можно будет менять структуру.')) return
    startTransition(async () => {
      const r = await unapproveRoadmap({ clientId })
      if (!r.ok) showError(r.error)
      else setApprovedAt(null)
    })
  }

  const onSeedTemplate = () => {
    startTransition(async () => {
      const r = await seedRoadmapTemplate({ clientId })
      if (!r.ok) showError(r.error)
      else window.location.reload()
    })
  }

  // ─── render ─────────────────────────────────────────────────────────────

  // Клиенту до утверждения — пусто
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

  // Куратору с пустой картой — кнопка засеять шаблон
  if (canEdit && data.stages.length === 0) {
    return (
      <div style={{
        padding: '32px 24px', background: 'var(--ds-bg-alt)', borderRadius: 'var(--ds-r-md)',
        border: '1px dashed var(--ds-border)', textAlign: 'center',
      }}>
        <div style={{ fontSize: 13, color: 'var(--ds-muted)', marginBottom: 16 }}>
          Дорожная карта пуста. Запусти шаблон или начни с чистого листа.
        </div>
        <div style={{ display: 'flex', justifyContent: 'center', gap: 8 }}>
          <button type="button" disabled={pending} onClick={onSeedTemplate} className="ds-btn ds-btn-primary ds-btn-sm" style={{ fontSize: 12 }}>
            Заполнить шаблоном
          </button>
          <button type="button" disabled={pending} onClick={() => setAddingStage(true)} className="ds-btn ds-btn-secondary ds-btn-sm" style={{ fontSize: 12 }}>
            + добавить этап вручную
          </button>
        </div>
        {addingStage && (
          <div style={{ marginTop: 12 }}>
            <StageTitleEditor onSave={onAddStage} onCancel={() => setAddingStage(false)} disabled={pending} placeholder="Название этапа" />
          </div>
        )}
      </div>
    )
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, gap: 12, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 12, color: 'var(--ds-muted)' }}>
          {totalItems > 0 && <>{doneItems} / {totalItems} выполнено</>}
        </div>
        <ApprovalChip approvedAt={approvedAt} approvedBy={approvedBy} />
      </div>

      {err && <div style={{ padding: '8px 12px', background: '#FEE2E2', color: '#B91C1C', borderRadius: 8, fontSize: 12, marginBottom: 12 }}>{err}</div>}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
        {data.stages.map(stage => {
          if (!canEditStructure && stage.items.length === 0) return null
          return (
            <StageBlock
              key={stage.id}
              stage={stage}
              canEditStructure={canEditStructure}
              canToggleDone={canEdit}
              disabled={pending}
              isAdding={showAddFor === stage.id}
              onStartAdd={() => setShowAddFor(stage.id)}
              onCancelAdd={() => setShowAddFor(null)}
              onAddItem={(t, m, c) => onAddItem(stage.id, t, m, c)}
              onPatchStage={(p) => onPatchStage(stage.id, p)}
              onDeleteStage={() => onDeleteStage(stage.id)}
              onPatchItem={(itemId, patch) => onPatchItem(stage.id, itemId, patch)}
              onDeleteItem={(itemId) => onDeleteItem(stage.id, itemId)}
            />
          )
        })}

        {canEditStructure && (
          <div style={{ paddingTop: 12 }}>
            {addingStage ? (
              <StageTitleEditor onSave={onAddStage} onCancel={() => setAddingStage(false)} disabled={pending} placeholder="Название этапа" />
            ) : (
              <button
                type="button"
                onClick={() => setAddingStage(true)}
                disabled={pending}
                style={{
                  background: 'transparent', border: '1px dashed var(--ds-border)',
                  borderRadius: 'var(--ds-r-sm)', padding: '8px 14px',
                  fontSize: 13, color: 'var(--ds-purple)', cursor: 'pointer', fontWeight: 600,
                }}
              >
                + добавить этап
              </button>
            )}
          </div>
        )}
      </div>

      {canEdit && (
        <div style={{ marginTop: 24, paddingTop: 20, borderTop: '1px solid var(--ds-border-soft)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ fontSize: 12, color: 'var(--ds-muted)', flex: 1, minWidth: 180 }}>
            {isApproved
              ? 'Карта утверждена — клиенту видна. Только галочки выполнения.'
              : 'После утверждения клиент увидит план. До этого структуру можно менять.'}
          </div>
          {isApproved ? (
            <button type="button" disabled={pending} onClick={onUnapprove} className="ds-btn ds-btn-secondary" style={{ fontSize: 13, padding: '8px 16px' }}>
              Снять утверждение
            </button>
          ) : (
            <button type="button" disabled={pending || totalItems === 0} onClick={onApprove} className="ds-btn ds-btn-primary" style={{ fontSize: 13, padding: '8px 20px', fontWeight: 600 }}>
              ✓ Утвердить дорожную карту
            </button>
          )}
        </div>
      )}
    </div>
  )
}

function StageBlock({
  stage, canEditStructure, canToggleDone, disabled,
  isAdding, onStartAdd, onCancelAdd, onAddItem,
  onPatchStage, onDeleteStage,
  onPatchItem, onDeleteItem,
}: {
  stage: RoadmapStage
  canEditStructure: boolean
  canToggleDone: boolean
  disabled: boolean
  isAdding: boolean
  onStartAdd: () => void
  onCancelAdd: () => void
  onAddItem: (title: string, month: string, comment: string) => void
  onPatchStage: (p: Partial<Pick<RoadmapStage, 'title' | 'month'>>) => void
  onDeleteStage: () => void
  onPatchItem: (itemId: string, patch: Partial<RoadmapItem>) => void
  onDeleteItem: (itemId: string) => void
}) {
  const [renaming, setRenaming] = useState(false)
  const done = stage.items.filter(i => i.done).length
  const total = stage.items.length

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, gap: 8, flexWrap: 'wrap' }}>
        {renaming ? (
          <StageTitleEditor
            initial={stage.title}
            onSave={(t) => { onPatchStage({ title: t }); setRenaming(false) }}
            onCancel={() => setRenaming(false)}
            disabled={disabled}
          />
        ) : (
          <>
            <h4
              onClick={() => canEditStructure && setRenaming(true)}
              style={{
                fontSize: 14, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em',
                color: total > 0 ? 'var(--ds-ink)' : 'var(--ds-muted)', margin: 0,
                cursor: canEditStructure ? 'pointer' : 'default', flex: 1, minWidth: 200,
              }}
            >
              {stage.title}
            </h4>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {canEditStructure ? (
                <MonthYearPicker
                  value={stage.month}
                  onChange={(m) => onPatchStage({ month: m })}
                  size="sm"
                  placeholder="дата"
                  disabled={disabled}
                />
              ) : stage.month ? (
                <span style={{ fontSize: 12, color: 'var(--ds-muted)', fontWeight: 600 }}>
                  {formatRoadmapMonth(stage.month)}
                </span>
              ) : null}
              {total > 0 && <span style={{ fontSize: 11, color: 'var(--ds-muted)', fontWeight: 600 }}>{done}/{total}</span>}
              {canEditStructure && (
                <button
                  type="button"
                  onClick={onDeleteStage}
                  disabled={disabled}
                  style={{ background: 'transparent', border: 'none', color: '#DC2626', cursor: 'pointer', fontSize: 14, opacity: 0.5, padding: 4 }}
                  title="Удалить этап целиком"
                >
                  ✕
                </button>
              )}
            </div>
          </>
        )}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {stage.items.map((item, idx) => (
          <ItemRow
            key={item.id}
            item={item}
            isLast={idx === stage.items.length - 1 && !isAdding}
            canEditStructure={canEditStructure}
            canToggleDone={canToggleDone}
            disabled={disabled}
            onPatch={(p) => onPatchItem(item.id, p)}
            onDelete={() => onDeleteItem(item.id)}
          />
        ))}
        {canEditStructure && isAdding && (
          <div style={{ padding: '10px 0', borderTop: '1px dashed var(--ds-border)' }}>
            <ItemEditor onSave={(t, m, c) => onAddItem(t, m, c)} onCancel={onCancelAdd} disabled={disabled} saveLabel="Добавить" />
          </div>
        )}
        {canEditStructure && !isAdding && (
          <button
            type="button"
            onClick={onStartAdd}
            disabled={disabled}
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
}

function StageTitleEditor({ initial = '', placeholder = 'Название', onSave, onCancel, disabled }: {
  initial?: string
  placeholder?: string
  onSave: (title: string) => void
  onCancel: () => void
  disabled: boolean
}) {
  const [v, setV] = useState(initial)
  return (
    <div style={{ display: 'flex', gap: 6, flex: 1 }}>
      <input
        type="text"
        autoFocus
        value={v}
        onChange={(e) => setV(e.target.value)}
        placeholder={placeholder}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { e.preventDefault(); onSave(v) }
          if (e.key === 'Escape') { e.preventDefault(); onCancel() }
        }}
        style={{
          flex: 1, padding: '6px 10px', fontSize: 13, fontWeight: 600,
          border: '1px solid var(--ds-purple)', borderRadius: 6,
          color: 'var(--ds-ink)', background: 'var(--ds-bg)',
        }}
      />
      <button type="button" disabled={disabled || !v.trim()} onClick={() => onSave(v)} className="ds-btn ds-btn-primary ds-btn-sm" style={{ fontSize: 11, padding: '4px 10px' }}>✓</button>
      <button type="button" onClick={onCancel} className="ds-btn ds-btn-secondary ds-btn-sm" style={{ fontSize: 11, padding: '4px 10px' }}>✕</button>
    </div>
  )
}

function ApprovalChip({ approvedAt, approvedBy }: { approvedAt: string | null; approvedBy?: string | null }) {
  if (!approvedAt) {
    return (
      <span className="ds-chip" style={{
        textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700, fontSize: 10,
        background: '#FEF3C7', color: '#92400E', padding: '4px 10px', borderRadius: 999,
      }}>Черновик</span>
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
  item: RoadmapItem
  isLast: boolean
  canEditStructure: boolean
  canToggleDone: boolean
  disabled: boolean
  onPatch: (p: Partial<RoadmapItem>) => void
  onDelete: () => void
}) {
  const [editing, setEditing] = useState(false)

  const save = (title: string, month: string, comment: string) => {
    onPatch({ title: title.trim(), month: month || undefined, comment: comment.trim() || undefined })
    setEditing(false)
  }

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', gap: 6, padding: '10px 0',
      borderBottom: isLast ? 'none' : '1px solid var(--ds-border-soft)',
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, fontSize: 13 }}>
        <input
          type="checkbox"
          checked={!!item.done}
          disabled={!canToggleDone || disabled}
          onChange={(e) => onPatch({ done: e.target.checked })}
          style={{ width: 18, height: 18, accentColor: 'var(--ds-purple)', cursor: canToggleDone ? 'pointer' : 'default', marginTop: 2 }}
        />

        <div style={{ flex: 1, minWidth: 0 }}>
          {editing ? (
            <ItemEditor
              initialTitle={item.title}
              initialMonth={item.month || ''}
              initialComment={item.comment || ''}
              onSave={save}
              onCancel={() => setEditing(false)}
              disabled={disabled}
            />
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
            title="Удалить"
          >
            ✕
          </button>
        )}
      </div>

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

function ItemEditor({
  initialTitle = '', initialMonth = '', initialComment = '',
  onSave, onCancel, disabled, saveLabel = 'Сохранить',
}: {
  initialTitle?: string
  initialMonth?: string
  initialComment?: string
  onSave: (title: string, month: string, comment: string) => void
  onCancel: () => void
  disabled: boolean
  saveLabel?: string
}) {
  const [title, setTitle] = useState(initialTitle)
  const [month, setMonth] = useState(initialMonth)
  const [comment, setComment] = useState(initialComment)

  const inputStyle: React.CSSProperties = {
    padding: '6px 10px', fontSize: 13,
    border: '1px solid var(--ds-purple)', borderRadius: 6,
    color: 'var(--ds-ink)', background: 'var(--ds-bg)',
    fontFamily: 'inherit',
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <input
        type="text"
        autoFocus
        placeholder="Название пункта"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        style={{ ...inputStyle, width: '100%' }}
      />
      <MonthYearPicker
        value={month}
        onChange={setMonth}
        placeholder="Выбрать дату"
        disabled={disabled}
      />
      <textarea
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        placeholder="Комментарий (опционально)"
        rows={2}
        style={{ ...inputStyle, width: '100%', resize: 'vertical' }}
      />
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          type="button"
          disabled={disabled || !title.trim()}
          onClick={() => onSave(title, month, comment)}
          className="ds-btn ds-btn-primary ds-btn-sm"
          style={{ fontSize: 12 }}
        >
          {saveLabel}
        </button>
        <button type="button" onClick={onCancel} className="ds-btn ds-btn-secondary ds-btn-sm" style={{ fontSize: 12 }}>
          Отмена
        </button>
      </div>
    </div>
  )
}
