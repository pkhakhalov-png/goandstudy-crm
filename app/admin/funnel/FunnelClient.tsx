'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { moveDeal, createDeal, updateStage, addStage, removeStage, softDeleteDeal, restoreDeal, permanentDeleteDeal, emptyTrash, findDuplicates, mergeDeals, loadMoreDeals, searchClients } from './actions'

const COLORS = ['#FF9500', '#FF453A', '#FF375F', '#AF52DE', '#B15ECC', '#5856D6', '#007AFF', '#5AC8FA', '#34C759', '#30D158', '#FF9F0A', '#8E8E93']

interface Stage { id: string; name: string; color: string; position: number; stage_type: string; value: number }
interface Deal {
  id: string; title: string; stage_id: string; salesperson_id: string
  contact_name: string; contact_phone: string | null; contact_telegram: string | null
  contact_email: string | null; contact_whatsapp: string | null
  budget: number; source: string; created_at: string; updated_at: string
  activities?: any[]
}

interface TrashedDeal {
  id: string; contact_name: string; contact_phone: string | null
  budget: number; stage_id: string; deleted_at: string
}

interface Props {
  stages: Stage[]
  deals: Deal[]
  salespersons: { id: string; name: string }[]
  isAdmin: boolean
  userId: string
  trashedDeals: TrashedDeal[]
  stageCounts: Record<string, number>
  curators?: { id: string; name: string }[]
  availableGroups?: { chat_id: string; title: string }[]
  basePath?: string
}

const sourceLabel: Record<string, string> = { manual: 'Вручную', booking: 'Запись', website: 'Сайт', telegram: 'Telegram' }

export function FunnelClient({ stages: serverStages, deals: serverDeals, salespersons, isAdmin, userId, trashedDeals, stageCounts, curators = [], availableGroups = [], basePath = '/admin/funnel' }: Props) {
  const router = useRouter()
  const [showNewDeal, setShowNewDeal] = useState(false)
  const [filterSalesperson, setFilterSalesperson] = useState('')
  const [search, setSearch] = useState('')
  const [saving, setSaving] = useState(false)

  // Onboarding modal
  const [onboardingModal, setOnboardingModal] = useState<{ dealId: string; stageId: string; stageName: string; oldStageName: string } | null>(null)
  const [obCuratorId, setObCuratorId] = useState('')
  const [obTotalAmount, setObTotalAmount] = useState('')
  const [obMonths, setObMonths] = useState('6')
  const [obFirstPayDate, setObFirstPayDate] = useState(new Date().toISOString().split('T')[0])
  const [obGroupChatId, setObGroupChatId] = useState('')
  const [obGroupSearch, setObGroupSearch] = useState('')
  const [obSaving, setObSaving] = useState(false)
  const [obExistingClient, setObExistingClient] = useState<any>(null)
  const [obMode, setObMode] = useState<'ask' | 'new' | 'existing'>('ask')

  // Extra deals loaded via pagination
  const [extraDeals, setExtraDeals] = useState<Deal[]>([])
  const [loadingStage, setLoadingStage] = useState<string | null>(null)
  const [stageFullyLoaded, setStageFullyLoaded] = useState<Set<string>>(new Set())

  // Optimistic stage overrides: dealId -> stageId
  const [moveOverrides, setMoveOverrides] = useState<Map<string, string>>(new Map())

  // Clear overrides once server data catches up
  useEffect(() => {
    if (moveOverrides.size === 0) return
    setMoveOverrides(prev => {
      const next = new Map(prev)
      let changed = false
      for (const [dealId, stageId] of prev) {
        if (stageId === '__deleted__') {
          if (!serverDeals.find(d => d.id === dealId)) { next.delete(dealId); changed = true }
        } else {
          const deal = serverDeals.find(d => d.id === dealId)
          if (deal && deal.stage_id === stageId) { next.delete(dealId); changed = true }
        }
      }
      return changed ? next : prev
    })
  }, [serverDeals, moveOverrides.size])

  // Combine server + extra loaded deals, apply overrides
  const allDeals = [...serverDeals, ...extraDeals]
  // Deduplicate by id (server data may include deals we loaded extra)
  const dealsById = new Map(allDeals.map(d => [d.id, d]))
  const localDeals = Array.from(dealsById.values()).map(d => {
    const override = moveOverrides.get(d.id)
    return override ? { ...d, stage_id: override } : d
  })
  const localStages = serverStages

  // Stage editing
  const [editingStageId, setEditingStageId] = useState<string | null>(null)
  const [editingStageName, setEditingStageName] = useState('')
  const [colorPickerStageId, setColorPickerStageId] = useState<string | null>(null)
  const [editingValueStageId, setEditingValueStageId] = useState<string | null>(null)
  const [editingValue, setEditingValue] = useState('')

  // Stage management — insert between columns
  const [insertAtIndex, setInsertAtIndex] = useState<number | null>(null)
  const [newStageName, setNewStageName] = useState('')
  const [removingStage, setRemovingStage] = useState(false)

  // Trash panel
  const [showTrash, setShowTrash] = useState(false)

  // Duplicates
  const [showDupes, setShowDupes] = useState(false)
  const [dupGroups, setDupGroups] = useState<any[]>([])
  const [dupLoading, setDupLoading] = useState(false)
  const [merging, setMerging] = useState<string | null>(null)

  // Drag state
  const [dragDealId, setDragDealId] = useState<string | null>(null)
  const [dragOverStage, setDragOverStage] = useState<string | null>(null)
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)
  const [dragOverTrash, setDragOverTrash] = useState(false)
  const dragCounterRef = useRef<Map<string, number>>(new Map())
  const trashCounterRef = useRef(0)

  // Stage editing handlers
  function startEditName(stage: Stage) {
    setEditingStageId(stage.id)
    setEditingStageName(stage.name)
    setColorPickerStageId(null)
    setInsertAtIndex(null)
  }

  async function saveEditName() {
    if (!editingStageId || !editingStageName.trim()) { setEditingStageId(null); return }
    const fd = new FormData()
    fd.append('stage_id', editingStageId)
    fd.append('name', editingStageName.trim())
    setEditingStageId(null)
    await updateStage(fd)
  }

  async function saveStageValue() {
    if (!editingValueStageId) return
    const fd = new FormData()
    fd.append('stage_id', editingValueStageId)
    fd.append('value', String(Number(editingValue) || 0))
    setEditingValueStageId(null)
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
    if (moveOverrides.get(d.id) === '__deleted__') return false
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

  const ONBOARDING_STAGES = ['Первичная продажа', 'Оплата услуг']

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

    // If dropping on payment stage — show onboarding modal
    if (newStage && ONBOARDING_STAGES.includes(newStage.name)) {
      resetDrag()
      setOnboardingModal({
        dealId: movedDealId,
        stageId,
        stageName: newStage.name,
        oldStageName: oldStage?.name || '',
      })
      // Pre-fill budget from deal
      setObTotalAmount(String(deal.budget || ''))
      setObExistingClient(null)
      setObMode('ask')
      setObGroupSearch('')
      setObGroupChatId('')
      setObCuratorId('')
      return
    }

    // Optimistic — instant
    setMoveOverrides(prev => new Map(prev).set(movedDealId, stageId))
    resetDrag()

    // Server sync — override cleared by useEffect when serverDeals catches up
    const fd = new FormData()
    fd.append('deal_id', movedDealId)
    fd.append('stage_id', stageId)
    fd.append('old_stage_name', oldStage?.name || '')
    fd.append('new_stage_name', newStage?.name || '')
    moveDeal(fd)
  }

  async function handleOnboardingSubmit() {
    if (!onboardingModal) return
    if (obMode === 'new' && !obTotalAmount) return
    setObSaving(true)

    // Optimistic
    setMoveOverrides(prev => new Map(prev).set(onboardingModal.dealId, onboardingModal.stageId))

    const fd = new FormData()
    fd.append('deal_id', onboardingModal.dealId)
    fd.append('stage_id', onboardingModal.stageId)
    fd.append('old_stage_name', onboardingModal.oldStageName)
    fd.append('new_stage_name', onboardingModal.stageName)
    fd.append('curator_id', obCuratorId)
    fd.append('total_amount', obTotalAmount)
    fd.append('months', obMonths)
    fd.append('first_pay_date', obFirstPayDate)
    if (obGroupChatId) fd.append('group_chat_id', obGroupChatId)
    await moveDeal(fd)

    setObSaving(false)
    setOnboardingModal(null)
    setObCuratorId('')
    setObTotalAmount('')
    setObMonths('6')
    setObGroupChatId('')
  }

  function resetDrag() {
    setDragDealId(null)
    setDragOverStage(null)
    setDragOverIndex(null)
    setDragOverTrash(false)
    dragCounterRef.current.clear()
    trashCounterRef.current = 0
  }

  async function handleLoadMore(stageId: string) {
    if (loadingStage || stageFullyLoaded.has(stageId)) return
    setLoadingStage(stageId)
    const currentCount = localDeals.filter(d => d.stage_id === stageId && moveOverrides.get(d.id) !== '__deleted__').length
    const res = await loadMoreDeals(stageId, currentCount, !isAdmin ? userId : undefined)
    if (res.deals.length > 0) {
      setExtraDeals(prev => [...prev, ...res.deals as Deal[]])
    }
    if (!res.hasMore) {
      setStageFullyLoaded(prev => new Set(prev).add(stageId))
    }
    setLoadingStage(null)
  }

  async function handleCheckDupes() {
    setDupLoading(true)
    setShowDupes(true)
    const res = await findDuplicates()
    setDupGroups(res.groups || [])
    setDupLoading(false)
  }

  async function handleMerge(keepId: string, removeIds: string[]) {
    setMerging(keepId)
    const fd = new FormData()
    fd.append('keep_id', keepId)
    fd.append('remove_ids', JSON.stringify(removeIds))
    await mergeDeals(fd)
    setDupGroups(prev => prev.filter(g => {
      const ids = g.deals.map((d: any) => d.id)
      return !ids.includes(keepId)
    }))
    setMerging(null)
  }

  async function handleDropTrash() {
    if (!dragDealId) return
    const dealId = dragDealId
    setMoveOverrides(prev => { const n = new Map(prev); n.set(dealId, '__deleted__'); return n })
    resetDrag()
    const fd = new FormData()
    fd.append('deal_id', dealId)
    softDeleteDeal(fd)
  }

  async function handleInsertStage(position: number) {
    const name = newStageName.trim()
    if (!name) return
    const fd = new FormData()
    fd.append('name', name)
    fd.append('position', String(position))
    setNewStageName('')
    setInsertAtIndex(null)
    await addStage(fd)
  }

  async function handleRestore(dealId: string) {
    const fd = new FormData()
    fd.append('deal_id', dealId)
    await restoreDeal(fd)
  }

  async function handlePermanentDelete(dealId: string) {
    if (!confirm('Удалить сделку навсегда? Это действие нельзя отменить.')) return
    const fd = new FormData()
    fd.append('deal_id', dealId)
    await permanentDeleteDeal(fd)
  }

  async function handleRemoveStage(stageId: string, stageName: string) {
    if (!confirm(`Удалить этап «${stageName}»? Этап с активными сделками удалить нельзя.`)) return
    setRemovingStage(true)
    const fd = new FormData()
    fd.append('stage_id', stageId)
    const res = await removeStage(fd)
    setRemovingStage(false)
    if (res?.error) alert(res.error)
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

  const totalBudget = allStages.reduce((sum, stage) => {
    if (Number(stage.value) <= 0) return sum
    const count = stageCounts[stage.id] || filteredDeals.filter(d => d.stage_id === stage.id).length
    return sum + count * Number(stage.value)
  }, 0)
  const dealCount = filteredDeals.length

  // Divider between stages — shows "+" on hover, expands to input on click
  function StageDivider({ position, afterIndex }: { position: number; afterIndex: number }) {
    const isActive = insertAtIndex === afterIndex

    if (isActive) {
      return (
        <div style={{ width: 200, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 6, padding: '16px 8px', borderRight: '1px solid var(--bor2)', background: 'var(--surf)' }}>
          <input
            value={newStageName}
            onChange={e => setNewStageName(e.target.value)}
            placeholder="Название этапа"
            autoFocus
            onKeyDown={e => { if (e.key === 'Enter') handleInsertStage(position); if (e.key === 'Escape') { setInsertAtIndex(null); setNewStageName('') } }}
            style={{ padding: '7px 10px', border: '1px solid var(--purple)', borderRadius: 8, fontSize: 12, fontFamily: 'inherit', outline: 'none', background: 'var(--bg)', width: '100%' }}
          />
          <div style={{ display: 'flex', gap: 4 }}>
            <button onClick={() => handleInsertStage(position)} className="btn-p" style={{ padding: '5px 12px', fontSize: 11, flex: 1 }}>OK</button>
            <button onClick={() => { setInsertAtIndex(null); setNewStageName('') }} className="btn-s" style={{ padding: '5px 10px', fontSize: 11 }}>Отмена</button>
          </div>
        </div>
      )
    }

    return (
      <div
        className="stage-divider"
        onClick={() => { setInsertAtIndex(afterIndex); setNewStageName(''); setEditingStageId(null); setColorPickerStageId(null) }}
        style={{ width: 24, flexShrink: 0, position: 'relative', cursor: 'pointer', zIndex: 2, marginLeft: -12, marginRight: -12 }}
      >
        {/* Full-height hover zone */}
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: 14 }}>
          <div
            className="stage-divider-btn"
            style={{
              width: 22, height: 22,
              borderRadius: '50%', background: 'var(--purple)', color: '#fff',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 16, fontWeight: 700, lineHeight: 1,
              opacity: 0, transition: 'opacity .15s, transform .15s',
              transform: 'scale(0.7)',
              boxShadow: '0 2px 8px rgba(0,0,0,.15)',
            }}
          >+</div>
        </div>
      </div>
    )
  }

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
        {isAdmin && (
          <button onClick={handleCheckDupes} className="btn-s" style={{ padding: '6px 12px', fontSize: 11 }} disabled={dupLoading}>
            {dupLoading ? '...' : 'Проверка дублей'}
          </button>
        )}
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
      <div style={{ flex: 1, display: 'flex', gap: 0, overflowX: 'auto', padding: 0, position: 'relative' }}
        onDragEnd={resetDrag}>

        {allStages.map((stage, stageIdx) => {
          const stageDeals = getDealsForStage(stage.id)
          const isPaused = stage.stage_type === 'paused' || stage.stage_type === 'lost'
          const isOver = dragOverStage === stage.id && dragDealId && localDeals.find(d => d.id === dragDealId)?.stage_id !== stage.id

          return (
            <div key={stage.id} style={{ display: 'contents' }}>
              {/* Divider before this column (admin only, not during drag) */}
              {isAdmin && !dragDealId && <StageDivider position={stage.position} afterIndex={stageIdx} />}

              <div
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
                    <div onClick={(e) => { e.stopPropagation(); setColorPickerStageId(colorPickerStageId === stage.id ? null : stage.id); setEditingStageId(null); setInsertAtIndex(null) }}
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
                        style={{ fontSize: 14, fontWeight: 800, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', cursor: isAdmin ? 'text' : 'default', textTransform: 'uppercase', letterSpacing: '0.03em', flex: 1 }}
                        title={isAdmin ? 'Двойной клик — переименовать' : ''}>{stage.name}</span>
                    )}

                    {/* Delete stage button */}
                    {isAdmin && (
                      <button onClick={() => handleRemoveStage(stage.id, stage.name)} disabled={removingStage}
                        title="Удалить этап"
                        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0 2px', fontSize: 14, color: 'var(--muted)', lineHeight: 1, opacity: 0, transition: 'opacity .15s', flexShrink: 0 }}
                        className="stage-delete-btn">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                      </button>
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

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: stage.color }}>{stageCounts[stage.id] || stageDeals.length} <span style={{ fontWeight: 500, color: 'var(--muted)', fontSize: 10 }}>сделок</span></span>
                    {Number(stage.value) > 0 && editingValueStageId !== stage.id ? (
                      <span
                        style={{ fontSize: 11, fontWeight: 700, color: 'var(--purple)', cursor: isAdmin ? 'pointer' : 'default' }}
                        onClick={() => isAdmin && (() => { setEditingValueStageId(stage.id); setEditingValue(String(Number(stage.value))); setEditingStageId(null); setColorPickerStageId(null) })()}
                        title={isAdmin ? `${Number(stage.value).toLocaleString('ru')} ₽ × ${stageCounts[stage.id] || stageDeals.length} — клик для редактирования` : `${Number(stage.value).toLocaleString('ru')} ₽ × ${stageCounts[stage.id] || stageDeals.length}`}
                      >{((stageCounts[stage.id] || stageDeals.length) * Number(stage.value)).toLocaleString('ru')} ₽</span>
                    ) : isAdmin ? (
                      editingValueStageId === stage.id ? (
                        <input
                          value={editingValue}
                          onChange={e => setEditingValue(e.target.value)}
                          onBlur={saveStageValue}
                          onKeyDown={e => { if (e.key === 'Enter') saveStageValue(); if (e.key === 'Escape') setEditingValueStageId(null) }}
                          autoFocus
                          type="number"
                          placeholder="0"
                          style={{ width: 70, fontSize: 11, padding: '2px 6px', border: '1px solid var(--purple)', borderRadius: 4, outline: 'none', background: 'var(--bg)', fontFamily: 'inherit', textAlign: 'right' }}
                        />
                      ) : (
                        <span
                          onClick={() => { setEditingValueStageId(stage.id); setEditingValue(String(Number(stage.value) || '')); setEditingStageId(null); setColorPickerStageId(null) }}
                          style={{ fontSize: 10, color: 'var(--muted)', cursor: 'pointer', opacity: 0.5 }}
                          title="Задать сумму этапа"
                        >+ сумма</span>
                      )
                    ) : null}
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
                          onClick={() => router.push(`${basePath}/${deal.id}`)}
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
                          {deal.contact_telegram && (
                            <div style={{ fontSize: 9, color: '#0088cc', fontWeight: 600, marginBottom: 2 }}>TG {deal.contact_telegram}</div>
                          )}
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
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

                  {/* Load more button */}
                  {(() => {
                    const total = stageCounts[stage.id] || 0
                    const remaining = total - stageDeals.length
                    if (remaining <= 0 || stageFullyLoaded.has(stage.id)) return null
                    return (
                      <button
                        onClick={() => handleLoadMore(stage.id)}
                        disabled={loadingStage === stage.id}
                        style={{
                          width: '100%', padding: '8px', margin: '4px 0',
                          background: 'none', border: '1px dashed var(--bor2)', borderRadius: 8,
                          cursor: 'pointer', fontSize: 11, fontWeight: 600, color: 'var(--muted)',
                          transition: 'all .15s',
                        }}
                        onMouseEnter={e => { e.currentTarget.style.borderColor = stage.color; e.currentTarget.style.color = stage.color }}
                        onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--bor2)'; e.currentTarget.style.color = 'var(--muted)' }}
                      >
                        {loadingStage === stage.id ? 'Загрузка...' : `Ещё ${remaining}`}
                      </button>
                    )
                  })()}
                </div>
              </div>

              {/* Divider after last column */}
              {isAdmin && !dragDealId && stageIdx === allStages.length - 1 && (
                <StageDivider position={stage.position + 1} afterIndex={allStages.length} />
              )}
            </div>
          )
        })}
      </div>

      {/* Trash drop zone — appears when dragging */}
      {dragDealId && (
        <div
          onDragOver={e => e.preventDefault()}
          onDragEnter={() => { trashCounterRef.current++; setDragOverTrash(true) }}
          onDragLeave={() => { trashCounterRef.current--; if (trashCounterRef.current <= 0) { trashCounterRef.current = 0; setDragOverTrash(false) } }}
          onDrop={e => { e.preventDefault(); handleDropTrash() }}
          style={{
            position: 'sticky', bottom: 0, left: 0, right: 0,
            height: dragOverTrash ? 72 : 52,
            background: dragOverTrash ? 'rgba(220,53,69,.15)' : 'rgba(220,53,69,.06)',
            borderTop: dragOverTrash ? '2px solid var(--red)' : '2px dashed rgba(220,53,69,.3)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            transition: 'all .2s ease',
            zIndex: 10,
          }}>
          <svg width={dragOverTrash ? 22 : 18} height={dragOverTrash ? 22 : 18} viewBox="0 0 24 24" fill="none" stroke={dragOverTrash ? 'var(--red)' : 'rgba(220,53,69,.5)'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ transition: 'all .2s' }}>
            <polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" /><line x1="10" y1="11" x2="10" y2="17" /><line x1="14" y1="11" x2="14" y2="17" />
          </svg>
          <span style={{ fontSize: 13, fontWeight: 700, color: dragOverTrash ? 'var(--red)' : 'rgba(220,53,69,.5)', transition: 'all .2s' }}>
            {dragOverTrash ? 'Отпустите, чтобы удалить' : 'Перетащите сюда для удаления'}
          </span>
        </div>
      )}

      {/* Trash button — sticky bottom, shows when there are trashed deals */}
      {!dragDealId && trashedDeals.length > 0 && (
        <div style={{ position: 'sticky', bottom: 0, zIndex: 10 }}>
          {/* Toggle button */}
          <button
            onClick={() => setShowTrash(!showTrash)}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '8px 18px', margin: 0,
              background: showTrash ? 'rgba(220,53,69,.1)' : 'var(--surf2)',
              border: 'none', borderTop: '1px solid var(--bor2)',
              cursor: 'pointer', fontSize: 12, fontWeight: 600,
              color: 'var(--red)', width: '100%',
              transition: 'background .15s',
            }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
            </svg>
            Корзина ({trashedDeals.length})
            <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{ marginLeft: 'auto', transform: showTrash ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }}>
              <polyline points="2 4 6 8 10 4" />
            </svg>
          </button>

          {/* Trash panel */}
          {showTrash && (
            <div style={{ background: 'var(--surf)', borderTop: '1px solid var(--bor2)', maxHeight: 300, overflowY: 'auto' }}>
              {trashedDeals.length > 1 && (
                <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '8px 18px', borderBottom: '1px solid var(--bor2)' }}>
                  <button onClick={async () => {
                    if (!confirm(`Удалить все ${trashedDeals.length} сделок из корзины навсегда?`)) return
                    await emptyTrash()
                  }}
                    style={{ background: 'none', border: '1px solid rgba(220,53,69,.2)', borderRadius: 6, padding: '4px 12px', cursor: 'pointer', fontSize: 11, fontWeight: 600, color: 'var(--red)', transition: 'background .15s' }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'rgba(220,53,69,.06)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'none')}>
                    Очистить корзину
                  </button>
                </div>
              )}
              {trashedDeals.map(d => {
                const stage = localStages.find(s => s.id === d.stage_id)
                return (
                  <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 18px', borderBottom: '1px solid var(--bor2)' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {d.contact_name}
                      </div>
                      <div style={{ fontSize: 10, color: 'var(--muted)', display: 'flex', gap: 8, marginTop: 2 }}>
                        {d.contact_phone && <span>{d.contact_phone}</span>}
                        {stage && <span style={{ color: stage.color }}>{stage.name}</span>}
                        <span>Удалена {new Date(d.deleted_at).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}</span>
                      </div>
                    </div>
                    {d.budget > 0 && <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', flexShrink: 0 }}>{Number(d.budget).toLocaleString('ru')} ₽</span>}
                    <button onClick={() => handleRestore(d.id)}
                      style={{ background: 'none', border: '1px solid rgba(52,199,89,.3)', borderRadius: 6, padding: '4px 10px', cursor: 'pointer', fontSize: 11, fontWeight: 600, color: 'var(--green)', flexShrink: 0, transition: 'background .15s' }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'rgba(52,199,89,.08)')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'none')}>
                      Восстановить
                    </button>
                    <button onClick={() => handlePermanentDelete(d.id)}
                      style={{ background: 'none', border: '1px solid rgba(220,53,69,.2)', borderRadius: 6, padding: '4px 10px', cursor: 'pointer', fontSize: 11, fontWeight: 600, color: 'var(--red)', flexShrink: 0, transition: 'background .15s' }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'rgba(220,53,69,.06)')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'none')}>
                      Удалить
                    </button>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* Duplicates modal */}
      {showDupes && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={e => { if (e.target === e.currentTarget) setShowDupes(false) }}>
          <div style={{ background: 'var(--surf)', borderRadius: 16, width: 600, maxHeight: '80vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,.2)' }}>
            {/* Header */}
            <div style={{ padding: '18px 24px', borderBottom: '1px solid var(--bor2)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--text)' }}>Проверка дублей</div>
                <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
                  {dupLoading ? 'Поиск...' : dupGroups.length === 0 ? 'Дублей не найдено' : `${dupGroups.length} групп дублей`}
                </div>
              </div>
              <button onClick={() => setShowDupes(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: 'var(--muted)', padding: '0 4px' }}>×</button>
            </div>

            {/* Groups */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '12px 24px' }}>
              {dupGroups.map((group: any, gi: number) => (
                <div key={gi} style={{ marginBottom: 16, border: '1px solid var(--bor2)', borderRadius: 10, overflow: 'hidden' }}>
                  {/* Group header */}
                  <div style={{ padding: '8px 14px', background: 'var(--surf2)', fontSize: 11, fontWeight: 700, color: 'var(--muted)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>{group.phone} — {group.count} сделок</span>
                    <button
                      onClick={() => handleMerge(group.deals[0].id, group.deals.slice(1).map((d: any) => d.id))}
                      disabled={merging === group.deals[0].id}
                      className="btn-p"
                      style={{ padding: '4px 12px', fontSize: 10 }}
                    >{merging === group.deals[0].id ? '...' : 'Объединить'}</button>
                  </div>

                  {/* Deals in group */}
                  {group.deals.map((d: any, di: number) => {
                    const stage = localStages.find(s => s.id === d.stage_id)
                    return (
                      <div key={d.id} style={{ padding: '8px 14px', borderTop: di > 0 ? '1px solid var(--bor2)' : 'none', display: 'flex', alignItems: 'center', gap: 10 }}>
                        {di === 0 && <span style={{ fontSize: 9, padding: '2px 6px', borderRadius: 4, background: 'rgba(52,199,89,.1)', color: 'var(--green)', fontWeight: 700 }}>ОСНОВНАЯ</span>}
                        {di > 0 && <span style={{ fontSize: 9, padding: '2px 6px', borderRadius: 4, background: 'rgba(220,53,69,.08)', color: 'var(--red)', fontWeight: 700 }}>ДУБЛЬ</span>}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.contact_name}</div>
                          <div style={{ fontSize: 10, color: 'var(--muted)', display: 'flex', gap: 8 }}>
                            <span>{d.contact_phone}</span>
                            {d.contact_telegram && <span style={{ color: '#0088cc' }}>TG {d.contact_telegram}</span>}
                            {d.contact_email && <span>{d.contact_email}</span>}
                          </div>
                        </div>
                        {stage && <span style={{ fontSize: 9, padding: '2px 6px', borderRadius: 4, background: stage.color + '15', color: stage.color, fontWeight: 700, flexShrink: 0 }}>{stage.name}</span>}
                        <span style={{ fontSize: 10, color: 'var(--muted)', flexShrink: 0 }}>{new Date(d.created_at).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}</span>
                      </div>
                    )
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Hover styles */}
      <style>{`
        .stage-delete-btn { opacity: 0 !important; }
        div:hover > div > div > .stage-delete-btn { opacity: 0.5 !important; }
        .stage-delete-btn:hover { opacity: 1 !important; color: var(--red) !important; }
        .stage-divider:hover .stage-divider-btn { opacity: 1 !important; transform: scale(1) !important; }
      `}</style>

      {/* ═══ Onboarding Modal ═══ */}
      {onboardingModal && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 100,
          background: 'rgba(0,0,0,.5)', display: 'flex', alignItems: 'center', justifyContent: 'center',
        }} onClick={() => setOnboardingModal(null)}>
          <div onClick={e => e.stopPropagation()} style={{
            background: 'var(--surf)', borderRadius: 16, padding: '24px 28px',
            width: 420, maxHeight: '80vh', overflowY: 'auto',
            boxShadow: '0 20px 60px rgba(0,0,0,.3)',
          }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>Оформление клиента</div>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 20 }}>
              Перенос на этап «{onboardingModal.stageName}»
            </div>

            {/* ═══ STEP 1: Ask mode ═══ */}
            {obMode === 'ask' && (
              <>
                <div style={{ display: 'grid', gap: 10 }}>
                  <button onClick={() => setObMode('new')}
                    style={{ padding: '16px 20px', borderRadius: 12, border: '1px solid var(--bor2)', background: 'var(--bg)', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'rgba(177,94,204,.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 16 }}>+</div>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>Новый клиент</div>
                      <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>Создать клиента, платежи, назначить куратора</div>
                    </div>
                  </button>
                  <button onClick={() => setObMode('existing')}
                    style={{ padding: '16px 20px', borderRadius: 12, border: '1px solid var(--bor2)', background: 'var(--bg)', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'rgba(22,163,97,.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 16, color: 'var(--green)' }}>&#8594;</div>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>Уже оформлен</div>
                      <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>Просто перенести на этап без создания</div>
                    </div>
                  </button>
                </div>
                <div style={{ display: 'flex', justifyContent: 'center', marginTop: 16 }}>
                  <button onClick={() => setOnboardingModal(null)} className="btn-s" style={{ padding: '10px 20px', fontSize: 13 }}>Отмена</button>
                </div>
              </>
            )}

            {/* ═══ MODE: Just transfer ═══ */}
            {obMode === 'existing' && (
              <>
                <div style={{ padding: '14px 16px', background: 'rgba(22,163,97,.06)', border: '1px solid rgba(22,163,97,.2)', borderRadius: 12, marginBottom: 16 }}>
                  <div style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.5 }}>
                    Клиент уже оформлен — просто переносим сделку на этап «{onboardingModal.stageName}» без создания нового клиента.
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={handleOnboardingSubmit} disabled={obSaving}
                    className="btn-p" style={{ flex: 1, padding: '10px', fontSize: 13 }}>
                    {obSaving ? 'Переносим...' : 'Перенести'}
                  </button>
                  <button onClick={() => setObMode('ask')} className="btn-s" style={{ padding: '10px 20px', fontSize: 13 }}>Назад</button>
                </div>
              </>
            )}

            {/* ═══ MODE: New client form ═══ */}
            {obMode === 'new' && (
              <>
                <div style={{ display: 'grid', gap: 14 }}>
                  <div>
                    <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', marginBottom: 4, display: 'block' }}>Куратор</label>
                    <select value={obCuratorId} onChange={e => setObCuratorId(e.target.value)}
                      style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--bor2)', fontSize: 13, fontFamily: 'inherit', background: 'var(--bg)' }}>
                      <option value="">Без куратора</option>
                      {curators.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', marginBottom: 4, display: 'block' }}>Сумма договора (₽) *</label>
                    <input type="number" value={obTotalAmount} onChange={e => setObTotalAmount(e.target.value)} placeholder="150000"
                      style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--bor2)', fontSize: 13, fontFamily: 'inherit', background: 'var(--bg)' }} />
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    <div>
                      <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', marginBottom: 4, display: 'block' }}>Месяцев *</label>
                      <input type="number" value={obMonths} onChange={e => setObMonths(e.target.value)} min="1" max="24"
                        style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--bor2)', fontSize: 13, fontFamily: 'inherit', background: 'var(--bg)' }} />
                    </div>
                    <div>
                      <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', marginBottom: 4, display: 'block' }}>Первый платёж</label>
                      <input type="date" value={obFirstPayDate} onChange={e => setObFirstPayDate(e.target.value)}
                        style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--bor2)', fontSize: 13, fontFamily: 'inherit', background: 'var(--bg)' }} />
                    </div>
                  </div>
                  <div>
                    <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', marginBottom: 4, display: 'block' }}>TG группа</label>
                    <input value={obGroupSearch} onChange={e => setObGroupSearch(e.target.value)} placeholder="Поиск по названию группы..."
                      style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--bor2)', fontSize: 13, fontFamily: 'inherit', background: 'var(--bg)', marginBottom: 6 }} />
                    {obGroupSearch.length >= 2 && (
                      <div style={{ maxHeight: 150, overflowY: 'auto', display: 'grid', gap: 4 }}>
                        {availableGroups.filter(g => g.title.toLowerCase().includes(obGroupSearch.toLowerCase())).map(g => (
                          <button key={g.chat_id} onClick={() => { setObGroupChatId(g.chat_id); setObGroupSearch(g.title) }}
                            style={{
                              padding: '8px 10px', borderRadius: 8, border: 'none', textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit', fontSize: 12,
                              background: obGroupChatId === g.chat_id ? 'rgba(177,94,204,.1)' : 'var(--bg)',
                              fontWeight: obGroupChatId === g.chat_id ? 600 : 400, color: 'var(--text)',
                            }}>
                            {g.title}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 20 }}>
                  <button onClick={handleOnboardingSubmit} disabled={obSaving || !obTotalAmount}
                    className="btn-p" style={{ flex: 1, padding: '10px', fontSize: 13, opacity: !obTotalAmount ? 0.5 : 1 }}>
                    {obSaving ? 'Оформляем...' : 'Оформить'}
                  </button>
                  <button onClick={() => setObMode('ask')} className="btn-s" style={{ padding: '10px 20px', fontSize: 13 }}>Назад</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  )
}
