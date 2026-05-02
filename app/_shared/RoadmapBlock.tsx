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
  MONTHS_FOR_PICKER,
  getYearsForPicker,
  type RoadmapItemRow,
  type RoadmapStageDef,
} from '@/lib/roadmap-types'

interface Props {
  clientId: number
  initial: RoadmapItemRow[]
  approvedAt: string | null
  approvedBy?: string | null
  canEdit?: boolean
}

export function RoadmapBlock({ clientId, initial, approvedAt: approvedAtProp, approvedBy, canEdit = false }: Props) {
  const [items, setItems] = useState<RoadmapItemRow[]>(initial)
  const [approvedAt, setApprovedAt] = useState<string | null>(approvedAtProp)
  const [pending, startTransition] = useTransition()
  const [err, setErr] = useState<string | null>(null)
  // Ключ группы для добавления: stage|substage или stage
  const [showAddFor, setShowAddFor] = useState<string | null>(null)

  const totalItems = items.length
  const doneItems = items.filter(i => i.done).length
  const isApproved = !!approvedAt
  const canEditStructure = canEdit && !isApproved

  const onAdd = (stage: string, substage: string | undefined, title: string, month: string, comment: string) => {
    if (!title.trim()) return
    setErr(null)
    startTransition(async () => {
      const r = await addRoadmapItem({
        clientId, stage, substage, title,
        month: month || undefined, comment: comment || undefined,
      })
      if (!r.ok) setErr(r.error)
      else {
        setItems(prev => [...prev, {
          id: crypto.randomUUID(),
          stage, substage,
          title: title.trim(),
          month: month || undefined,
          comment: comment || undefined,
          done: false,
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
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, gap: 12, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 12, color: 'var(--ds-muted)' }}>
          {totalItems > 0 && <>{doneItems} / {totalItems} выполнено</>}
        </div>
        <ApprovalChip approvedAt={approvedAt} approvedBy={approvedBy} />
      </div>

      {err && <div style={{ padding: '8px 12px', background: '#FEE2E2', color: '#B91C1C', borderRadius: 8, fontSize: 12, marginBottom: 12 }}>{err}</div>}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
        {ROADMAP_STAGES.map(stage => (
          <StageSection
            key={stage.key}
            stage={stage}
            allItems={items}
            canEditStructure={canEditStructure}
            canToggleDone={canEdit}
            disabled={pending}
            showAddFor={showAddFor}
            setShowAddFor={setShowAddFor}
            onAdd={onAdd}
            onPatch={onPatch}
            onDelete={onDelete}
          />
        ))}
      </div>

      {canEdit && (
        <div style={{ marginTop: 24, paddingTop: 20, borderTop: '1px solid var(--ds-border-soft)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ fontSize: 12, color: 'var(--ds-muted)', flex: 1, minWidth: 180 }}>
            {isApproved
              ? 'Карта утверждена — клиенту видна. Структуру менять нельзя, только проставлять галочки.'
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

function StageSection({
  stage, allItems, canEditStructure, canToggleDone, disabled,
  showAddFor, setShowAddFor, onAdd, onPatch, onDelete,
}: {
  stage: RoadmapStageDef
  allItems: RoadmapItemRow[]
  canEditStructure: boolean
  canToggleDone: boolean
  disabled: boolean
  showAddFor: string | null
  setShowAddFor: (s: string | null) => void
  onAdd: (stage: string, substage: string | undefined, title: string, month: string, comment: string) => void
  onPatch: (itemId: string, patch: Partial<RoadmapItemRow>) => void
  onDelete: (itemId: string) => void
}) {
  const stageItems = allItems.filter(i => i.stage === stage.key)
  // Для read-only: скрываем стадии без пунктов.
  if (stageItems.length === 0 && !canEditStructure) return null

  // Если есть substages — рендерим под-блоками. Иначе — одной кучей.
  if (stage.substages && stage.substages.length > 0) {
    return (
      <div>
        <StageHeading label={stage.label} done={stageItems.filter(i => i.done).length} total={stageItems.length} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, paddingLeft: 12, marginTop: 10, borderLeft: '2px solid var(--ds-border-soft)' }}>
          {stage.substages.map(sub => {
            const subItems = stageItems.filter(i => i.substage === sub.key)
            if (subItems.length === 0 && !canEditStructure) return null
            const groupKey = `${stage.key}|${sub.key}`
            return (
              <SubBlock
                key={sub.key}
                title={sub.label}
                items={subItems}
                canEditStructure={canEditStructure}
                canToggleDone={canToggleDone}
                disabled={disabled}
                isAdding={showAddFor === groupKey}
                onStartAdd={() => setShowAddFor(groupKey)}
                onCancelAdd={() => setShowAddFor(null)}
                onAdd={(t, m, c) => onAdd(stage.key, sub.key, t, m, c)}
                onPatch={onPatch}
                onDelete={onDelete}
              />
            )
          })}
        </div>
      </div>
    )
  }

  // Стадия без подэтапов
  const groupKey = stage.key
  const itemsHere = stageItems.filter(i => !i.substage)
  return (
    <div>
      <StageHeading label={stage.label} done={itemsHere.filter(i => i.done).length} total={itemsHere.length} />
      <div style={{ display: 'flex', flexDirection: 'column', marginTop: 8 }}>
        {itemsHere.map((item, idx) => (
          <ItemRow
            key={item.id}
            item={item}
            isLast={idx === itemsHere.length - 1 && (!canEditStructure || showAddFor !== groupKey)}
            canEditStructure={canEditStructure}
            canToggleDone={canToggleDone}
            disabled={disabled}
            onPatch={(p) => onPatch(item.id, p)}
            onDelete={() => onDelete(item.id)}
          />
        ))}
        {canEditStructure && showAddFor === groupKey && (
          <AddItemRow
            onSave={(t, m, c) => onAdd(stage.key, undefined, t, m, c)}
            onCancel={() => setShowAddFor(null)}
            disabled={disabled}
          />
        )}
        {canEditStructure && showAddFor !== groupKey && (
          <button
            type="button"
            onClick={() => setShowAddFor(groupKey)}
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

function SubBlock({
  title, items, canEditStructure, canToggleDone, disabled,
  isAdding, onStartAdd, onCancelAdd, onAdd, onPatch, onDelete,
}: {
  title: string
  items: RoadmapItemRow[]
  canEditStructure: boolean
  canToggleDone: boolean
  disabled: boolean
  isAdding: boolean
  onStartAdd: () => void
  onCancelAdd: () => void
  onAdd: (title: string, month: string, comment: string) => void
  onPatch: (itemId: string, patch: Partial<RoadmapItemRow>) => void
  onDelete: (itemId: string) => void
}) {
  const done = items.filter(i => i.done).length
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <h5 style={{
          fontSize: 12, fontWeight: 600, textTransform: 'none', letterSpacing: 0,
          color: items.length > 0 ? 'var(--ds-ink)' : 'var(--ds-muted)', margin: 0,
        }}>
          {title}
        </h5>
        {items.length > 0 && (
          <span style={{ fontSize: 11, color: 'var(--ds-muted)', fontWeight: 600 }}>{done}/{items.length}</span>
        )}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {items.map((item, idx) => (
          <ItemRow
            key={item.id}
            item={item}
            isLast={idx === items.length - 1 && !isAdding}
            canEditStructure={canEditStructure}
            canToggleDone={canToggleDone}
            disabled={disabled}
            onPatch={(p) => onPatch(item.id, p)}
            onDelete={() => onDelete(item.id)}
          />
        ))}
        {canEditStructure && isAdding && (
          <AddItemRow onSave={onAdd} onCancel={onCancelAdd} disabled={disabled} />
        )}
        {canEditStructure && !isAdding && (
          <button
            type="button"
            onClick={onStartAdd}
            disabled={disabled}
            style={{
              marginTop: 6, alignSelf: 'flex-start',
              background: 'transparent', border: '1px dashed var(--ds-border)',
              borderRadius: 'var(--ds-r-sm)', padding: '4px 10px',
              fontSize: 11, color: 'var(--ds-muted)', cursor: 'pointer',
            }}
          >
            + добавить
          </button>
        )}
      </div>
    </div>
  )
}

function StageHeading({ label, done, total }: { label: string; done: number; total: number }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <h4 style={{
        fontSize: 14, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em',
        color: total > 0 ? 'var(--ds-ink)' : 'var(--ds-muted)', margin: 0,
      }}>
        {label}
      </h4>
      {total > 0 && (
        <span style={{ fontSize: 11, color: 'var(--ds-muted)', fontWeight: 600 }}>{done}/{total}</span>
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
  const [year, month] = (item.month || '').split('-')
  const [yearVal, setYearVal] = useState(year || '')
  const [monthVal, setMonthVal] = useState(month || '')
  const [comment, setComment] = useState(item.comment || '')

  const save = () => {
    const m = (yearVal && monthVal) ? `${yearVal}-${monthVal}` : ''
    onPatch({ title: title.trim(), month: m || undefined, comment: comment.trim() || undefined })
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
              title={title} setTitle={setTitle}
              year={yearVal} setYear={setYearVal}
              month={monthVal} setMonth={setMonthVal}
              comment={comment} setComment={setComment}
              onSave={save}
              onCancel={() => setEditing(false)}
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

function AddItemRow({ onSave, onCancel, disabled }: {
  onSave: (title: string, month: string, comment: string) => void
  onCancel: () => void
  disabled: boolean
}) {
  const [title, setTitle] = useState('')
  const [year, setYear] = useState('')
  const [month, setMonth] = useState('')
  const [comment, setComment] = useState('')

  return (
    <div style={{ padding: '10px 0', borderTop: '1px dashed var(--ds-border)' }}>
      <ItemEditor
        title={title} setTitle={setTitle}
        year={year} setYear={setYear}
        month={month} setMonth={setMonth}
        comment={comment} setComment={setComment}
        onSave={() => onSave(title, year && month ? `${year}-${month}` : '', comment)}
        onCancel={onCancel}
        saveLabel="Добавить"
        disabledSave={disabled || !title.trim()}
      />
    </div>
  )
}

function ItemEditor({
  title, setTitle, year, setYear, month, setMonth, comment, setComment,
  onSave, onCancel, saveLabel = 'Сохранить', disabledSave,
}: {
  title: string; setTitle: (v: string) => void
  year: string; setYear: (v: string) => void
  month: string; setMonth: (v: string) => void
  comment: string; setComment: (v: string) => void
  onSave: () => void
  onCancel: () => void
  saveLabel?: string
  disabledSave?: boolean
}) {
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
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <select value={month} onChange={(e) => setMonth(e.target.value)} style={{ ...inputStyle, minWidth: 130 }}>
          <option value="">— месяц —</option>
          {MONTHS_FOR_PICKER.map(m => <option key={m.num} value={m.num}>{m.label}</option>)}
        </select>
        <select value={year} onChange={(e) => setYear(e.target.value)} style={{ ...inputStyle, minWidth: 90 }}>
          <option value="">— год —</option>
          {getYearsForPicker().map(y => <option key={y} value={String(y)}>{y}</option>)}
        </select>
        {(year || month) && (
          <button
            type="button"
            onClick={() => { setYear(''); setMonth('') }}
            style={{ background: 'transparent', border: 'none', color: 'var(--ds-muted)', fontSize: 11, cursor: 'pointer', textDecoration: 'underline' }}
          >
            очистить
          </button>
        )}
      </div>
      <textarea
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        placeholder="Комментарий (опционально)"
        rows={2}
        style={{ ...inputStyle, width: '100%', resize: 'vertical' }}
      />
      <div style={{ display: 'flex', gap: 8 }}>
        <button type="button" disabled={disabledSave} onClick={onSave} className="ds-btn ds-btn-primary ds-btn-sm" style={{ fontSize: 12 }}>
          {saveLabel}
        </button>
        <button type="button" onClick={onCancel} className="ds-btn ds-btn-secondary ds-btn-sm" style={{ fontSize: 12 }}>
          Отмена
        </button>
      </div>
    </div>
  )
}
