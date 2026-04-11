'use client'

import { useState, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { moveDeal, createDeal, updateStage } from './actions'

const COLORS = ['#FF9500', '#FF453A', '#FF375F', '#AF52DE', '#B15ECC', '#5856D6', '#007AFF', '#5AC8FA', '#34C759', '#30D158', '#FF9F0A', '#8E8E93']

interface Stage { id: string; name: string; color: string; position: number; stage_type: string }
interface Deal {
  id: string; title: string; stage_id: string; salesperson_id: string
  contact_name: string; contact_phone: string | null; contact_telegram: string | null
  contact_email: string | null; contact_whatsapp: string | null
  budget: number; source: string; created_at: string; updated_at: string
  activities?: any[]
}

interface Props {
  stages: Stage[]
  deals: Deal[]
  salespersons: { id: string; name: string }[]
  isAdmin: boolean
  userId: string
}

const sourceLabel: Record<string, string> = { manual: 'Вручную', booking: 'Запись', website: 'Сайт', telegram: 'Telegram' }

export function FunnelClient({ stages: serverStages, deals: serverDeals, salespersons, isAdmin, userId }: Props) {
  const router = useRouter()
  const [showNewDeal, setShowNewDeal] = useState(false)
  const [filterSalesperson, setFilterSalesperson] = useState('')
  const [search, setSearch] = useState('')
  const [saving, setSaving] = useState(false)

  // Optimistic stage overrides: dealId -> stageId
  const [moveOverrides, setMoveOverrides] = useState<Map<string, string>>(new Map())

  // Apply overrides on top of server data
  const localDeals = serverDeals.map(d => {
    const override = moveOverrides.get(d.id)
    return override ? { ...d, stage_id: override } : d
  })
  const localStages = serverStages

  // Stage editing
  const [editingStageId, setEditingStageId] = useState<string | null>(null)
  const [editingStageName, setEditingStageName] = useState('')
  const [colorPickerStageId, setColorPickerStageId] = useState<string | null>(null)

  // Drag state
  const [dragDealId, setDragDealId] = useState<string | null>(null)
  const [dragOverStage, setDragOverStage] = useState<string | null>(null)
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)
  const dragCounterRef = useRef<Map<string, number>>(new Map())

  // Stage editing handlers
  function startEditName(stage: Stage) {
    setEditingStageId(stage.id)
    setEditingStageName(stage.name)
    setColorPickerStageId(null)
  }

  async function saveEditName() {
    if (!editingStageId || !editingStageName.trim()) { setEditingStageId(null); return }
    const fd = new FormData()
    fd.append('stage_id', editingStageId)
    fd.append('name', editingStageName.trim())
    setEditingStageId(null)
    await updateStage(fd)
  }

  async function changeColor(stageId: string, color: string) {
    setColorPickerStageId(null)
    const fd = new FormData()
    fd.append('stage_id', stageId)
    fd.append('color', color)
    await updateStage(fd)
  }

  const activeStages = localStages.filter(s => s.stage_type === 'active' || s.stage_type === 'success')
  const pausedStages = localStages.filter(s => s.stage_type === 'paused' || s.stage_type === 'lost')
  const allStages = [...activeStages, ...pausedStages]

  const filteredDeals = localDeals.filter(d => {
    if (!isAdmin && d.salesperson_id !== userId) return false
    if (filterSalesperson && d.salesperson_id !== filterSalesperson) return false
    if (search && !d.contact_name.toLowerCase().includes(search.toLowerCase()) && !d.title.toLowerCase().includes(search.toLowerCase()) && !d.contact_phone?.includes(search)) return false
    return true
  })

  function getDealsForStage(stageId: string) {
    return filteredDeals.filter(d => d.stage_id === stageId).sort((a, b) => b.updated_at.localeCompare(a.updated_at))
  }

  function handleDragStart(dealId: string) {
    setDragDealId(dealId)
  }

  function handleDragEnterStage(stageId: string) {
    const counter = dragCounterRef.current
    counter.set(stageId, (counter.get(stageId) || 0) + 1)
    setDragOverStage(stageId)
  }

  function handleDragLeaveStage(stageId: string) {
    const counter = dragCounterRef.current
    const val = (counter.get(stageId) || 1) - 1
    counter.set(stageId, val)
    if (val <= 0) {
      counter.delete(stageId)
      if (dragOverStage === stageId) setDragOverStage(null)
    }
  }

  function handleDragOverCard(e: React.DragEvent, index: number) {
    e.preventDefault()
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    const midY = rect.top + rect.height / 2
    setDragOverIndex(e.clientY < midY ? index : index + 1)
  }

  async function handleDrop(stageId: string) {
    if (!dragDealId) return
    const deal = localDeals.find(d => d.id === dragDealId)
    if (!deal || deal.stage_id === stageId) {
      resetDrag()
      return
    }

    const movedDealId = dragDealId
    const oldStage = localStages.find(s => s.id === deal.stage_id)
    const newStage = localStages.find(s => s.id === stageId)

    // Optimistic — instant, survives server re-render
    setMoveOverrides(prev => new Map(prev).set(movedDealId, stageId))
    resetDrag()

    // Server sync — background, then clear override
    const fd = new FormData()
    fd.append('deal_id', movedDealId)
    fd.append('stage_id', stageId)
    fd.append('old_stage_name', oldStage?.name || '')
    fd.append('new_stage_name', newStage?.name || '')
    await moveDeal(fd)

    // Server has caught up — remove override
    setMoveOverrides(prev => { const n = new Map(prev); n.delete(movedDealId); return n })
  }

  function resetDrag() {
    setDragDealId(null)
    setDragOverStage(null)
    setDragOverIndex(null)
    dragCounterRef.current.clear()
  }

  async function handleNewDeal(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setSaving(true)
    const fd = new FormData(e.currentTarget)
    const firstStage = activeStages[0]
    if (firstStage) fd.append('stage_id', firstStage.id)
    await createDeal(fd)
    setSaving(false)
    setShowNewDeal(false)
  }

  const totalBudget = filteredDeals.reduce((s, d) => s + Number(d.budget), 0)
  const dealCount = filteredDeals.length

  return (
    <>
      {/* Top bar */}
      <div style={{ padding: '10px 28px', borderBottom: '1px solid var(--bor2)', background: 'var(--surf2)', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <button onClick={() => setShowNewDeal(!showNewDeal)} className="btn-p" style={{ padding: '7px 14px', fontSize: 12 }}>
          <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="white" strokeWidth="2.5"><line x1="6" y1="1" x2="6" y2="11" /><line x1="1" y1="6" x2="11" y2="6" /></svg>
          Новая сделка
        </button>
        {isAdmin && (
          <select className="si" value={filterSalesperson} onChange={e => setFilterSalesperson(e.target.value)} style={{ fontSize: 12, padding: '6px 10px' }}>
            <option value="">Все менеджеры</option>
            {salespersons.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--surf)', border: '1px solid var(--bor2)', borderRadius: 8, padding: '6px 10px' }}>
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="var(--muted)" strokeWidth="1.6"><circle cx="7" cy="7" r="5" /><line x1="11" y1="11" x2="14" y2="14" /></svg>
          <input placeholder="Поиск..." value={search} onChange={e => setSearch(e.target.value)}
            style={{ background: 'transparent', border: 'none', outline: 'none', fontSize: 12, color: 'var(--text)', width: 120, fontFamily: 'inherit' }} />
        </div>
        <div style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--muted)' }}>
          {dealCount} сделок · {totalBudget.toLocaleString('ru')} ₽
        </div>
      </div>

      {/* New deal form */}
      {showNewDeal && (
        <div style={{ padding: '14px 28px', borderBottom: '1px solid var(--bor2)', background: 'var(--surf)' }}>
          <form onSubmit={handleNewDeal} style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 600, marginBottom: 3 }}>Название</div>
              <input name="title" required placeholder="Заявка от..." style={{ padding: '7px 10px', border: '1px solid var(--bor2)', borderRadius: 8, fontSize: 12, fontFamily: 'inherit', outline: 'none', background: 'var(--bg)', width: 160 }} />
            </div>
            <div>
              <div style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 600, marginBottom: 3 }}>Контакт</div>
              <input name="contact_name" required placeholder="Имя" style={{ padding: '7px 10px', border: '1px solid var(--bor2)', borderRadius: 8, fontSize: 12, fontFamily: 'inherit', outline: 'none', background: 'var(--bg)', width: 130 }} />
            </div>
            <div>
              <div style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 600, marginBottom: 3 }}>Телефон</div>
              <input name="contact_phone" placeholder="+7..." style={{ padding: '7px 10px', border: '1px solid var(--bor2)', borderRadius: 8, fontSize: 12, fontFamily: 'inherit', outline: 'none', background: 'var(--bg)', width: 130 }} />
            </div>
            <div>
              <div style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 600, marginBottom: 3 }}>Telegram</div>
              <input name="contact_telegram" placeholder="@username" style={{ padding: '7px 10px', border: '1px solid var(--bor2)', borderRadius: 8, fontSize: 12, fontFamily: 'inherit', outline: 'none', background: 'var(--bg)', width: 120 }} />
            </div>
            {isAdmin && (
              <div>
                <div style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 600, marginBottom: 3 }}>Менеджер</div>
                <select name="salesperson_id" className="si" style={{ padding: '7px 10px', fontSize: 12 }}>
                  {salespersons.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
            )}
            <div>
              <div style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 600, marginBottom: 3 }}>Бюджет ₽</div>
              <input name="budget" type="number" defaultValue={0} style={{ padding: '7px 10px', border: '1px solid var(--bor2)', borderRadius: 8, fontSize: 12, fontFamily: 'inherit', outline: 'none', background: 'var(--bg)', width: 90 }} />
            </div>
            <button type="submit" disabled={saving} className="btn-p" style={{ padding: '7px 16px', fontSize: 12 }}>{saving ? '...' : 'Создать'}</button>
          </form>
        </div>
      )}

      {/* Kanban board */}
      <div style={{ flex: 1, display: 'flex', gap: 0, overflowX: 'auto', padding: '0 0 20px' }}
        onDragEnd={resetDrag}>
        {allStages.map(stage => {
          const stageDeals = getDealsForStage(stage.id)
          const isPaused = stage.stage_type === 'paused' || stage.stage_type === 'lost'
          const isOver = dragOverStage === stage.id && dragDealId && localDeals.find(d => d.id === dragDealId)?.stage_id !== stage.id

          return (
            <div key={stage.id}
              onDragOver={e => e.preventDefault()}
              onDragEnter={() => handleDragEnterStage(stage.id)}
              onDragLeave={() => handleDragLeaveStage(stage.id)}
              onDrop={e => { e.preventDefault(); handleDrop(stage.id) }}
              style={{
                minWidth: isPaused ? 200 : 260, width: isPaused ? 200 : 260, flexShrink: 0,
                borderRight: '1px solid var(--bor2)',
                display: 'flex', flexDirection: 'column',
                background: isOver ? stage.color + '08' : isPaused ? 'rgba(0,0,0,.02)' : 'transparent',
                transition: 'background .15s',
              }}>
              {/* Column header */}
              <div style={{
                padding: '14px 14px 12px', borderBottom: `3px solid ${stage.color}`,
                position: 'sticky', top: 0, background: 'var(--surf)', zIndex: 1,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  {/* Color dot — click to pick color */}
                  <div onClick={(e) => { e.stopPropagation(); setColorPickerStageId(colorPickerStageId === stage.id ? null : stage.id); setEditingStageId(null) }}
                    style={{ width: 12, height: 12, borderRadius: '50%', background: stage.color, flexShrink: 0, cursor: 'pointer', border: '2px solid transparent' }}
                    onMouseEnter={e => (e.currentTarget.style.border = '2px solid var(--text)')}
                    onMouseLeave={e => (e.currentTarget.style.border = '2px solid transparent')}
                    title="Изменить цвет" />

                  {/* Name — double click to edit */}
                  {editingStageId === stage.id ? (
                    <input value={editingStageName} onChange={e => setEditingStageName(e.target.value)}
                      onBlur={saveEditName} onKeyDown={e => { if (e.key === 'Enter') saveEditName(); if (e.key === 'Escape') setEditingStageId(null) }}
                      autoFocus
                      style={{ fontSize: 14, fontWeight: 800, color: 'var(--text)', border: '1px solid var(--purple)', borderRadius: 4, padding: '2px 6px', outline: 'none', background: 'var(--bg)', width: '100%', fontFamily: 'inherit', textTransform: 'uppercase', letterSpacing: '0.03em' }} />
                  ) : (
                    <span onDoubleClick={() => isAdmin && startEditName(stage)}
                      style={{ fontSize: 14, fontWeight: 800, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', cursor: isAdmin ? 'text' : 'default', textTransform: 'uppercase', letterSpacing: '0.03em' }}
                      title={isAdmin ? 'Двойной клик — переименовать' : ''}>{stage.name}</span>
                  )}
                </div>

                {/* Color picker */}
                {colorPickerStageId === stage.id && (
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', padding: '4px 0 6px' }}>
                    {COLORS.map(c => (
                      <div key={c} onClick={() => changeColor(stage.id, c)}
                        style={{ width: 18, height: 18, borderRadius: '50%', background: c, cursor: 'pointer', border: c === stage.color ? '2px solid var(--text)' : '2px solid transparent' }}
                        onMouseEnter={e => (e.currentTarget.style.transform = 'scale(1.2)')}
                        onMouseLeave={e => (e.currentTarget.style.transform = 'none')} />
                    ))}
                  </div>
                )}

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: stage.color }}>{stageDeals.length} <span style={{ fontWeight: 500, color: 'var(--muted)', fontSize: 10 }}>сделок</span></span>
                  <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)' }}>{stageDeals.reduce((s, d) => s + Number(d.budget), 0).toLocaleString('ru')} ₽</span>
                </div>
              </div>

              {/* Cards */}
              <div style={{ flex: 1, padding: '8px 8px', overflowY: 'auto', minHeight: 60 }}>
                {/* Drop zone indicator at top */}
                {isOver && dragOverIndex === 0 && (
                  <div style={{ height: 3, background: stage.color, borderRadius: 4, marginBottom: 6, transition: 'all .15s' }} />
                )}

                {stageDeals.map((deal, idx) => {
                  const sp = salespersons.find(s => s.id === deal.salesperson_id)
                  const isDragging = deal.id === dragDealId

                  return (
                    <div key={deal.id}>
                      <div
                        draggable
                        onDragStart={() => handleDragStart(deal.id)}
                        onDragOver={e => handleDragOverCard(e, idx)}
                        onClick={() => router.push(`/admin/funnel/${deal.id}`)}
                        style={{
                          background: 'var(--surf)', border: '1px solid var(--bor)', borderRadius: 10,
                          padding: '10px 12px', marginBottom: 6, cursor: 'grab',
                          boxShadow: isDragging ? '0 8px 24px rgba(0,0,0,.15)' : '0 1px 4px rgba(0,0,0,.04)',
                          borderLeft: `3px solid ${stage.color}`,
                          opacity: isDragging ? 0.35 : 1,
                          transform: isDragging ? 'scale(0.95) rotate(-1deg)' : 'none',
                          transition: dragDealId ? 'none' : 'box-shadow .1s',
                        }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)', marginBottom: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{deal.contact_name}</div>
                        {deal.contact_phone && <div style={{ fontSize: 10, color: 'var(--muted)', marginBottom: 2 }}>{deal.contact_phone}</div>}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 }}>
                          {sp && <span style={{ fontSize: 9, padding: '2px 6px', borderRadius: 4, background: 'rgba(52,199,89,.08)', color: 'var(--green)', fontWeight: 600 }}>{sp.name}</span>}
                          {deal.budget > 0 && <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--purple)' }}>{Number(deal.budget).toLocaleString('ru')} ₽</span>}
                        </div>
                        <div style={{ fontSize: 9, color: 'var(--muted)', marginTop: 4 }}>
                          {sourceLabel[deal.source] || deal.source} · {new Date(deal.created_at).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}
                        </div>
                      </div>

                      {/* Drop indicator between cards */}
                      {isOver && dragOverIndex === idx + 1 && (
                        <div style={{ height: 3, background: stage.color, borderRadius: 4, marginBottom: 6, transition: 'all .15s' }} />
                      )}
                    </div>
                  )
                })}

                {/* Empty column drop zone */}
                {stageDeals.length === 0 && isOver && (
                  <div style={{ height: 40, border: `2px dashed ${stage.color}`, borderRadius: 10, background: stage.color + '08', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <span style={{ fontSize: 10, color: stage.color, fontWeight: 600 }}>Перетащите сюда</span>
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </>
  )
}
