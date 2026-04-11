'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { moveDeal, createDeal, updateStage, addStage, removeStage, softDeleteDeal, bulkMoveDeals, bulkDeleteDeals } from './actions'

interface Stage { id: string; name: string; color: string; position: number; stage_type: string }
interface Deal {
  id: string; title: string; stage_id: string; salesperson_id: string
  contact_name: string; contact_phone: string | null; contact_telegram: string | null
  contact_email: string | null; contact_whatsapp: string | null
  budget: number; source: string; created_at: string; updated_at: string
}

interface Props {
  stages: Stage[]
  deals: Deal[]
  salespersons: { id: string; name: string }[]
  isAdmin: boolean
  userId: string
}

const COLORS = ['#FF9500', '#FF453A', '#FF375F', '#AF52DE', '#B15ECC', '#5856D6', '#007AFF', '#5AC8FA', '#34C759', '#30D158', '#FF9F0A', '#8E8E93']
const sourceLabel: Record<string, string> = { manual: 'Вручную', booking: 'Запись', website: 'Сайт', telegram: 'Telegram' }

export function FunnelClient({ stages: serverStages, deals: serverDeals, salespersons, isAdmin, userId }: Props) {
  const router = useRouter()
  const [localDeals, setLocalDeals] = useState<Deal[]>(serverDeals)
  const [localStages, setLocalStages] = useState<Stage[]>(serverStages)
  const [viewMode, setViewMode] = useState<'kanban' | 'table'>('kanban')
  const [showNewDeal, setShowNewDeal] = useState(false)
  const [filterSalesperson, setFilterSalesperson] = useState('')
  const [search, setSearch] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [saving, setSaving] = useState(false)
  const [selectedDeals, setSelectedDeals] = useState<Set<string>>(new Set())

  // Stage editing
  const [editingStageId, setEditingStageId] = useState<string | null>(null)
  const [editingStageName, setEditingStageName] = useState('')
  const [colorPickerStageId, setColorPickerStageId] = useState<string | null>(null)
  const [showAddStage, setShowAddStage] = useState(false)
  const [newStageName, setNewStageName] = useState('')

  // Drag
  const [dragDealId, setDragDealId] = useState<string | null>(null)
  const [dragOverStage, setDragOverStage] = useState<string | null>(null)
  const dragCounterRef = useRef<Map<string, number>>(new Map())

  // Sync
  if (serverDeals !== localDeals && !dragDealId) setLocalDeals(serverDeals)
  if (serverStages !== localStages && !editingStageId) setLocalStages(serverStages)

  const activeStages = localStages.filter(s => s.stage_type === 'active' || s.stage_type === 'success')
  const pausedStages = localStages.filter(s => s.stage_type === 'paused' || s.stage_type === 'lost')
  const allStages = [...activeStages, ...pausedStages]

  // Filters
  const filteredDeals = localDeals.filter(d => {
    if (!isAdmin && d.salesperson_id !== userId) return false
    if (filterSalesperson && d.salesperson_id !== filterSalesperson) return false
    if (search && !d.contact_name.toLowerCase().includes(search.toLowerCase()) && !d.title.toLowerCase().includes(search.toLowerCase()) && !d.contact_phone?.includes(search)) return false
    if (dateFrom && d.created_at.slice(0, 10) < dateFrom) return false
    if (dateTo && d.created_at.slice(0, 10) > dateTo) return false
    return true
  })

  function getDealsForStage(stageId: string) {
    return filteredDeals.filter(d => d.stage_id === stageId).sort((a, b) => b.updated_at.localeCompare(a.updated_at))
  }

  // Stage editing
  function startEditName(stage: Stage) { setEditingStageId(stage.id); setEditingStageName(stage.name); setColorPickerStageId(null) }
  function saveEditName() {
    if (!editingStageId || !editingStageName.trim()) { setEditingStageId(null); return }
    setLocalStages(prev => prev.map(s => s.id === editingStageId ? { ...s, name: editingStageName.trim() } : s))
    const fd = new FormData(); fd.append('stage_id', editingStageId); fd.append('name', editingStageName.trim())
    updateStage(fd); setEditingStageId(null)
  }
  function changeColor(stageId: string, color: string) {
    setLocalStages(prev => prev.map(s => s.id === stageId ? { ...s, color } : s)); setColorPickerStageId(null)
    const fd = new FormData(); fd.append('stage_id', stageId); fd.append('color', color); updateStage(fd)
  }

  // Drag handlers
  function handleDragEnterStage(stageId: string) {
    const c = dragCounterRef.current; c.set(stageId, (c.get(stageId) || 0) + 1); setDragOverStage(stageId)
  }
  function handleDragLeaveStage(stageId: string) {
    const c = dragCounterRef.current; const v = (c.get(stageId) || 1) - 1; c.set(stageId, v)
    if (v <= 0) { c.delete(stageId); if (dragOverStage === stageId) setDragOverStage(null) }
  }
  function resetDrag() { setDragDealId(null); setDragOverStage(null); dragCounterRef.current.clear() }

  async function handleDrop(stageId: string) {
    if (!dragDealId) return
    const deal = localDeals.find(d => d.id === dragDealId)
    if (!deal || deal.stage_id === stageId) { resetDrag(); return }
    const oldStage = localStages.find(s => s.id === deal.stage_id)
    const newStage = localStages.find(s => s.id === stageId)
    setLocalDeals(prev => prev.map(d => d.id === dragDealId ? { ...d, stage_id: stageId, updated_at: new Date().toISOString() } : d))
    resetDrag()
    const fd = new FormData(); fd.append('deal_id', dragDealId); fd.append('stage_id', stageId)
    fd.append('old_stage_name', oldStage?.name || ''); fd.append('new_stage_name', newStage?.name || '')
    moveDeal(fd)
  }

  // Bulk
  function toggleSelect(id: string) { setSelectedDeals(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n }) }
  async function handleBulkMove(stageId: string) {
    const fd = new FormData(); fd.append('deal_ids', JSON.stringify([...selectedDeals])); fd.append('stage_id', stageId)
    setLocalDeals(prev => prev.map(d => selectedDeals.has(d.id) ? { ...d, stage_id: stageId } : d))
    setSelectedDeals(new Set()); bulkMoveDeals(fd)
  }
  async function handleBulkDelete() {
    const fd = new FormData(); fd.append('deal_ids', JSON.stringify([...selectedDeals]))
    setLocalDeals(prev => prev.filter(d => !selectedDeals.has(d.id)))
    setSelectedDeals(new Set()); bulkDeleteDeals(fd)
  }

  async function handleDeleteDeal(dealId: string) {
    setLocalDeals(prev => prev.filter(d => d.id !== dealId))
    const fd = new FormData(); fd.append('deal_id', dealId); softDeleteDeal(fd)
  }

  async function handleNewDeal(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); setSaving(true)
    const fd = new FormData(e.currentTarget); if (activeStages[0]) fd.append('stage_id', activeStages[0].id)
    await createDeal(fd); setSaving(false); setShowNewDeal(false)
  }

  async function handleAddStage() {
    if (!newStageName.trim()) return
    const fd = new FormData(); fd.append('name', newStageName.trim())
    await addStage(fd); setNewStageName(''); setShowAddStage(false)
  }

  async function handleRemoveStage(stageId: string) {
    const fd = new FormData(); fd.append('stage_id', stageId)
    const result = await removeStage(fd)
    if (result.error) alert(result.error)
  }

  const totalBudget = filteredDeals.reduce((s, d) => s + Number(d.budget), 0)

  return (
    <>
      {/* Top bar */}
      <div style={{ padding: '10px 28px', borderBottom: '1px solid var(--bor2)', background: 'var(--surf2)', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <button onClick={() => setShowNewDeal(!showNewDeal)} className="btn-p" style={{ padding: '7px 14px', fontSize: 12 }}>
          <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="white" strokeWidth="2.5"><line x1="6" y1="1" x2="6" y2="11" /><line x1="1" y1="6" x2="11" y2="6" /></svg>
          Сделка
        </button>

        {/* View toggle */}
        <div style={{ display: 'flex', border: '1px solid var(--bor2)', borderRadius: 8, overflow: 'hidden' }}>
          <button onClick={() => setViewMode('kanban')} style={{ padding: '5px 10px', fontSize: 11, background: viewMode === 'kanban' ? 'var(--pl)' : 'var(--surf)', border: 'none', cursor: 'pointer', color: viewMode === 'kanban' ? 'var(--purple)' : 'var(--muted)', fontWeight: 600, fontFamily: 'inherit' }}>Канбан</button>
          <button onClick={() => setViewMode('table')} style={{ padding: '5px 10px', fontSize: 11, background: viewMode === 'table' ? 'var(--pl)' : 'var(--surf)', border: 'none', cursor: 'pointer', color: viewMode === 'table' ? 'var(--purple)' : 'var(--muted)', fontWeight: 600, fontFamily: 'inherit' }}>Таблица</button>
        </div>

        {isAdmin && (
          <select className="si" value={filterSalesperson} onChange={e => setFilterSalesperson(e.target.value)} style={{ fontSize: 12, padding: '5px 10px' }}>
            <option value="">Все менеджеры</option>
            {salespersons.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        )}
        <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="si" style={{ fontSize: 11, padding: '5px 8px' }} title="Дата от" />
        <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="si" style={{ fontSize: 11, padding: '5px 8px' }} title="Дата до" />
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--surf)', border: '1px solid var(--bor2)', borderRadius: 8, padding: '5px 10px' }}>
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="var(--muted)" strokeWidth="1.6"><circle cx="7" cy="7" r="5" /><line x1="11" y1="11" x2="14" y2="14" /></svg>
          <input placeholder="Поиск..." value={search} onChange={e => setSearch(e.target.value)}
            style={{ background: 'transparent', border: 'none', outline: 'none', fontSize: 12, color: 'var(--text)', width: 100, fontFamily: 'inherit' }} />
        </div>

        {isAdmin && <button onClick={() => router.push('/admin/funnel/trash')} className="btn-s" style={{ fontSize: 11, padding: '5px 10px' }}>Корзина</button>}

        <div style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--muted)' }}>{filteredDeals.length} сделок · {totalBudget.toLocaleString('ru')} ₽</div>
      </div>

      {/* Bulk actions bar */}
      {selectedDeals.size > 0 && (
        <div style={{ padding: '8px 28px', background: 'var(--pl)', borderBottom: '1px solid var(--pb)', display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--purple)' }}>Выбрано: {selectedDeals.size}</span>
          <select onChange={e => { if (e.target.value) handleBulkMove(e.target.value); e.target.value = '' }} className="si" style={{ fontSize: 11, padding: '4px 8px' }}>
            <option value="">Перенести в...</option>
            {allStages.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          {isAdmin && <button onClick={handleBulkDelete} className="btn-s" style={{ fontSize: 11, padding: '4px 10px', color: 'var(--red)', borderColor: 'rgba(220,53,69,.2)' }}>Удалить</button>}
          <button onClick={() => setSelectedDeals(new Set())} className="btn-s" style={{ fontSize: 11, padding: '4px 10px' }}>Снять</button>
        </div>
      )}

      {/* New deal form */}
      {showNewDeal && (
        <div style={{ padding: '12px 28px', borderBottom: '1px solid var(--bor2)', background: 'var(--surf)' }}>
          <form onSubmit={handleNewDeal} style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <div><div style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 600, marginBottom: 3 }}>Название</div><input name="title" required placeholder="Заявка от..." style={{ padding: '6px 10px', border: '1px solid var(--bor2)', borderRadius: 8, fontSize: 12, fontFamily: 'inherit', outline: 'none', background: 'var(--bg)', width: 150 }} /></div>
            <div><div style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 600, marginBottom: 3 }}>Контакт</div><input name="contact_name" required placeholder="Имя" style={{ padding: '6px 10px', border: '1px solid var(--bor2)', borderRadius: 8, fontSize: 12, fontFamily: 'inherit', outline: 'none', background: 'var(--bg)', width: 120 }} /></div>
            <div><div style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 600, marginBottom: 3 }}>Телефон</div><input name="contact_phone" placeholder="+7..." style={{ padding: '6px 10px', border: '1px solid var(--bor2)', borderRadius: 8, fontSize: 12, fontFamily: 'inherit', outline: 'none', background: 'var(--bg)', width: 120 }} /></div>
            <div><div style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 600, marginBottom: 3 }}>Telegram</div><input name="contact_telegram" placeholder="@" style={{ padding: '6px 10px', border: '1px solid var(--bor2)', borderRadius: 8, fontSize: 12, fontFamily: 'inherit', outline: 'none', background: 'var(--bg)', width: 100 }} /></div>
            {isAdmin && <div><div style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 600, marginBottom: 3 }}>Менеджер</div><select name="salesperson_id" className="si" style={{ padding: '6px 10px', fontSize: 12 }}>{salespersons.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>}
            <div><div style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 600, marginBottom: 3 }}>Бюджет</div><input name="budget" type="number" defaultValue={0} style={{ padding: '6px 10px', border: '1px solid var(--bor2)', borderRadius: 8, fontSize: 12, fontFamily: 'inherit', outline: 'none', background: 'var(--bg)', width: 80 }} /></div>
            <button type="submit" disabled={saving} className="btn-p" style={{ padding: '6px 14px', fontSize: 12 }}>{saving ? '...' : 'Создать'}</button>
          </form>
        </div>
      )}

      {/* TABLE VIEW */}
      {viewMode === 'table' && (
        <div style={{ padding: '16px 28px', flex: 1, overflowY: 'auto' }}>
          <div className="tw" style={{ overflowX: 'auto' }}>
            <table style={{ minWidth: 800 }}>
              <thead><tr>
                <th style={{ width: 30 }}><input type="checkbox" checked={selectedDeals.size === filteredDeals.length && filteredDeals.length > 0} onChange={e => setSelectedDeals(e.target.checked ? new Set(filteredDeals.map(d => d.id)) : new Set())} /></th>
                <th>Дата</th><th>Контакт</th><th>Телефон</th><th>Этап</th><th>Бюджет</th><th>Менеджер</th><th>Источник</th>{isAdmin && <th></th>}
              </tr></thead>
              <tbody>
                {filteredDeals.sort((a, b) => b.created_at.localeCompare(a.created_at)).map(deal => {
                  const stage = localStages.find(s => s.id === deal.stage_id)
                  const sp = salespersons.find(s => s.id === deal.salesperson_id)
                  return (
                    <tr key={deal.id} onClick={() => router.push(`${isAdmin ? '/admin' : '/sales'}/funnel/${deal.id}`)} style={{ cursor: 'pointer' }}>
                      <td onClick={e => e.stopPropagation()}><input type="checkbox" checked={selectedDeals.has(deal.id)} onChange={() => toggleSelect(deal.id)} /></td>
                      <td style={{ fontSize: 11, color: 'var(--muted)', whiteSpace: 'nowrap' }}>{new Date(deal.created_at).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}</td>
                      <td><span className="cn">{deal.contact_name}</span></td>
                      <td style={{ fontSize: 12 }}>{deal.contact_phone || '—'}</td>
                      <td><span style={{ padding: '3px 8px', borderRadius: 6, fontSize: 10, fontWeight: 700, color: stage?.color, background: (stage?.color || '') + '15' }}>{stage?.name}</span></td>
                      <td><span className="num">{Number(deal.budget).toLocaleString('ru')} ₽</span></td>
                      <td><span className="stag">{sp?.name ?? '—'}</span></td>
                      <td style={{ fontSize: 10, color: 'var(--muted)' }}>{sourceLabel[deal.source] || deal.source}</td>
                      {isAdmin && <td onClick={e => e.stopPropagation()}><button onClick={() => handleDeleteDeal(deal.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: 14 }} title="В корзину">×</button></td>}
                    </tr>
                  )
                })}
                {filteredDeals.length === 0 && <tr><td colSpan={isAdmin ? 9 : 8} style={{ textAlign: 'center', color: 'var(--muted)', padding: 32 }}>Нет сделок</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* KANBAN VIEW */}
      {viewMode === 'kanban' && (
        <div style={{ flex: 1, display: 'flex', gap: 0, overflowX: 'auto', padding: '0 0 20px' }} onDragEnd={resetDrag}>
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
                  borderRight: '1px solid var(--bor2)', display: 'flex', flexDirection: 'column',
                  background: isOver ? stage.color + '08' : isPaused ? 'rgba(0,0,0,.02)' : 'transparent',
                }}>
                {/* Column header */}
                <div style={{ padding: '14px 14px 12px', borderBottom: `3px solid ${stage.color}`, position: 'sticky', top: 0, background: 'var(--surf)', zIndex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                    <div onClick={() => { setColorPickerStageId(colorPickerStageId === stage.id ? null : stage.id); setEditingStageId(null) }}
                      style={{ width: 12, height: 12, borderRadius: '50%', background: stage.color, flexShrink: 0, cursor: 'pointer', border: '2px solid transparent' }}
                      onMouseEnter={e => (e.currentTarget.style.border = '2px solid var(--text)')} onMouseLeave={e => (e.currentTarget.style.border = '2px solid transparent')} />
                    {editingStageId === stage.id ? (
                      <input value={editingStageName} onChange={e => setEditingStageName(e.target.value)} onBlur={saveEditName} onKeyDown={e => { if (e.key === 'Enter') saveEditName(); if (e.key === 'Escape') setEditingStageId(null) }} autoFocus
                        style={{ fontSize: 14, fontWeight: 800, color: 'var(--text)', border: '1px solid var(--purple)', borderRadius: 4, padding: '2px 6px', outline: 'none', background: 'var(--bg)', width: '100%', fontFamily: 'inherit', textTransform: 'uppercase', letterSpacing: '0.03em' }} />
                    ) : (
                      <span onDoubleClick={() => isAdmin && startEditName(stage)} style={{ fontSize: 14, fontWeight: 800, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', cursor: isAdmin ? 'text' : 'default', textTransform: 'uppercase', letterSpacing: '0.03em' }}>{stage.name}</span>
                    )}
                    {isAdmin && stageDeals.length === 0 && (
                      <button onClick={() => handleRemoveStage(stage.id)} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: 12 }} title="Удалить этап">×</button>
                    )}
                  </div>
                  {colorPickerStageId === stage.id && (
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', padding: '4px 0 6px' }}>
                      {COLORS.map(c => (
                        <div key={c} onClick={() => changeColor(stage.id, c)} style={{ width: 18, height: 18, borderRadius: '50%', background: c, cursor: 'pointer', border: c === stage.color ? '2px solid var(--text)' : '2px solid transparent' }}
                          onMouseEnter={e => (e.currentTarget.style.transform = 'scale(1.2)')} onMouseLeave={e => (e.currentTarget.style.transform = 'none')} />
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
                  {isOver && stageDeals.length === 0 && (
                    <div style={{ height: 40, border: `2px dashed ${stage.color}`, borderRadius: 10, background: stage.color + '08', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <span style={{ fontSize: 10, color: stage.color, fontWeight: 600 }}>Перетащите сюда</span>
                    </div>
                  )}
                  {stageDeals.map(deal => {
                    const sp = salespersons.find(s => s.id === deal.salesperson_id)
                    const isDragging = deal.id === dragDealId
                    const isSelected = selectedDeals.has(deal.id)
                    return (
                      <div key={deal.id} draggable onDragStart={() => setDragDealId(deal.id)} onClick={() => router.push(`${isAdmin ? '/admin' : '/sales'}/funnel/${deal.id}`)}
                        style={{
                          background: isSelected ? 'var(--pl)' : 'var(--surf)', border: isSelected ? '1px solid var(--pb)' : '1px solid var(--bor)',
                          borderRadius: 10, padding: '10px 12px', marginBottom: 6, cursor: 'grab',
                          boxShadow: isDragging ? '0 8px 24px rgba(0,0,0,.15)' : '0 1px 4px rgba(0,0,0,.04)',
                          borderLeft: `3px solid ${stage.color}`, opacity: isDragging ? 0.35 : 1,
                          transform: isDragging ? 'scale(0.95) rotate(-1deg)' : 'none',
                          transition: dragDealId ? 'none' : 'box-shadow .1s',
                        }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                          <input type="checkbox" checked={isSelected} onClick={e => e.stopPropagation()} onChange={() => toggleSelect(deal.id)} style={{ flexShrink: 0 }} />
                          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{deal.contact_name}</span>
                          {isAdmin && <button onClick={e => { e.stopPropagation(); handleDeleteDeal(deal.id) }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: 12, padding: 0, lineHeight: 1 }} title="В корзину">×</button>}
                        </div>
                        {deal.contact_phone && <div style={{ fontSize: 10, color: 'var(--muted)', marginBottom: 2 }}>{deal.contact_phone}</div>}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 }}>
                          {sp && <span style={{ fontSize: 9, padding: '2px 6px', borderRadius: 4, background: 'rgba(52,199,89,.08)', color: 'var(--green)', fontWeight: 600 }}>{sp.name}</span>}
                          {deal.budget > 0 && <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--purple)' }}>{Number(deal.budget).toLocaleString('ru')} ₽</span>}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}

          {/* Add stage column */}
          {isAdmin && (
            <div style={{ minWidth: 200, padding: '14px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-start', paddingTop: 20 }}>
              {showAddStage ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: '100%' }}>
                  <input value={newStageName} onChange={e => setNewStageName(e.target.value)} placeholder="Название этапа" autoFocus
                    onKeyDown={e => { if (e.key === 'Enter') handleAddStage(); if (e.key === 'Escape') setShowAddStage(false) }}
                    style={{ padding: '8px 12px', border: '1px solid var(--bor2)', borderRadius: 8, fontSize: 12, fontFamily: 'inherit', outline: 'none', background: 'var(--bg)' }} />
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button onClick={handleAddStage} className="btn-p" style={{ flex: 1, fontSize: 11, padding: '6px' }}>Добавить</button>
                    <button onClick={() => setShowAddStage(false)} className="btn-s" style={{ fontSize: 11, padding: '6px 10px' }}>Отмена</button>
                  </div>
                </div>
              ) : (
                <button onClick={() => setShowAddStage(true)} style={{
                  padding: '10px 16px', borderRadius: 10, border: '2px dashed var(--bor2)',
                  background: 'transparent', cursor: 'pointer', color: 'var(--muted)', fontSize: 12, fontWeight: 600, fontFamily: 'inherit',
                  display: 'flex', alignItems: 'center', gap: 6,
                }}>
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2"><line x1="6" y1="1" x2="6" y2="11" /><line x1="1" y1="6" x2="11" y2="6" /></svg>
                  Этап
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </>
  )
}
