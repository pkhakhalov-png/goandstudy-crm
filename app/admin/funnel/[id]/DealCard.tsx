'use client'

import { useState } from 'react'
import Link from 'next/link'
import { moveDeal, addDealNote, updateDeal, createDealTask, toggleDealTask, deleteDealTask, linkDealToClient, searchClients, sendDealMessage } from '../actions'
import { uploadDealFile, deleteDealFile } from './fileActions'

interface Stage { id: string; name: string; color: string; position: number; stage_type: string }

interface Props {
  deal: any
  stages: Stage[]
  activities: any[]
  salespersons: { id: string; name: string }[]
  clientData: any
  bookingData: any
  files: any[]
  messages: any[]
  tasks: any[]
  userId: string
}

const fileIcon: Record<string, string> = {
  'application/pdf': '📄',
  'image/png': '🖼️', 'image/jpeg': '🖼️', 'image/webp': '🖼️',
  'application/msword': '📝', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '📝',
  'application/vnd.ms-excel': '📊', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '📊',
}

function formatSize(bytes: number) {
  if (bytes < 1024) return bytes + ' Б'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' КБ'
  return (bytes / 1024 / 1024).toFixed(1) + ' МБ'
}

const sourceLabel: Record<string, string> = { manual: 'Вручную', booking: 'Запись с сайта', website: 'Сайт', telegram: 'Telegram' }
const activityIcon: Record<string, string> = { note: '📝', stage_change: '→', system: '⚙️', call: '📞', message: '💬', file_upload: '📎', task_done: '✅' }

export function DealCard({ deal, stages, activities, salespersons, clientData, bookingData, files, messages, tasks, userId }: Props) {
  const [tab, setTab] = useState<'main' | 'activity' | 'files' | 'messages' | 'tasks'>('main')
  const [noteText, setNoteText] = useState('')
  const [saving, setSaving] = useState(false)
  const [editing, setEditing] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [taskTitle, setTaskTitle] = useState('')
  const [taskDeadline, setTaskDeadline] = useState('')
  const [clientSearch, setClientSearch] = useState('')
  const [clientResults, setClientResults] = useState<any[]>([])
  const [showClientSearch, setShowClientSearch] = useState(false)
  const [msgText, setMsgText] = useState('')
  const [msgChannel, setMsgChannel] = useState<'telegram' | 'whatsapp'>(deal.contact_telegram ? 'telegram' : 'whatsapp')
  const [msgSending, setMsgSending] = useState(false)
  const [msgError, setMsgError] = useState<string | null>(null)

  async function handleSendMsg() {
    if (!msgText.trim()) return
    setMsgSending(true)
    setMsgError(null)
    const fd = new FormData()
    fd.append('deal_id', deal.id)
    fd.append('text', msgText)
    fd.append('channel', msgChannel)
    const res = await sendDealMessage(fd)
    setMsgSending(false)
    if (res.error) setMsgError(res.error)
    else setMsgText('')
  }

  const currentStage = stages.find(s => s.id === deal.stage_id)
  const sp = salespersons.find(s => s.id === deal.salesperson_id)

  async function handleMove(stageId: string) {
    const newStage = stages.find(s => s.id === stageId)
    const fd = new FormData()
    fd.append('deal_id', deal.id)
    fd.append('stage_id', stageId)
    fd.append('old_stage_name', currentStage?.name || '')
    fd.append('new_stage_name', newStage?.name || '')
    await moveDeal(fd)
  }

  async function handleAddNote() {
    if (!noteText.trim()) return
    setSaving(true)
    const fd = new FormData()
    fd.append('deal_id', deal.id)
    fd.append('content', noteText)
    await addDealNote(fd)
    setNoteText('')
    setSaving(false)
  }

  async function handleSaveEdit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setSaving(true)
    const fd = new FormData(e.currentTarget)
    fd.append('deal_id', deal.id)
    await updateDeal(fd)
    setSaving(false)
    setEditing(false)
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    const fd = new FormData()
    fd.append('deal_id', deal.id)
    fd.append('file', file)
    await uploadDealFile(fd)
    setUploading(false)
    e.target.value = ''
  }

  async function handleDeleteFile(fileId: string) {
    const fd = new FormData()
    fd.append('file_id', fileId)
    fd.append('deal_id', deal.id)
    await deleteDealFile(fd)
  }

  async function handleAddTask() {
    if (!taskTitle.trim()) return
    setSaving(true)
    const fd = new FormData()
    fd.append('deal_id', deal.id); fd.append('title', taskTitle)
    if (taskDeadline) fd.append('deadline', taskDeadline)
    await createDealTask(fd)
    setTaskTitle(''); setTaskDeadline(''); setSaving(false)
  }

  async function handleToggleTask(taskId: string, isDone: boolean) {
    const fd = new FormData(); fd.append('task_id', taskId); fd.append('is_done', String(isDone))
    await toggleDealTask(fd)
  }

  async function handleDeleteTask(taskId: string) {
    const fd = new FormData(); fd.append('task_id', taskId); await deleteDealTask(fd)
  }

  async function handleSearchClients(q: string) {
    setClientSearch(q)
    if (q.length < 2) { setClientResults([]); return }
    const results = await searchClients(q)
    setClientResults(results)
  }

  async function handleLinkClient(clientId: number) {
    const fd = new FormData(); fd.append('deal_id', deal.id); fd.append('client_id', String(clientId))
    await linkDealToClient(fd); setShowClientSearch(false); setClientSearch(''); setClientResults([])
  }

  async function handleUnlinkClient() {
    const fd = new FormData(); fd.append('deal_id', deal.id); fd.append('client_id', '')
    await linkDealToClient(fd)
  }

  const overdueTasks = tasks.filter((t: any) => !t.is_done && t.deadline && new Date(t.deadline) < new Date())

  const tabs = [
    { key: 'main', label: 'Основное' },
    { key: 'activity', label: `Активность (${activities.length})` },
    { key: 'tasks', label: `Задачи${tasks.length > 0 ? ` (${tasks.filter((t: any) => !t.is_done).length})` : ''}` },
    { key: 'files', label: `Файлы${files.length > 0 ? ` (${files.length})` : ''}` },
    { key: 'messages', label: `Сообщения${messages.length > 0 ? ` (${messages.length})` : ''}` },
  ] as const

  return (
    <div className="main" style={{ display: 'flex', flexDirection: 'column' }}>
      {/* Top bar */}
      <div className="topbar" style={{ gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Link href="/admin/funnel" style={{ color: 'var(--muted)', textDecoration: 'none', fontSize: 13 }}>← Воронка</Link>
          <span style={{ color: 'var(--bor2)' }}>/</span>
          <span className="pt">{deal.title}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ padding: '4px 12px', borderRadius: 8, fontSize: 11, fontWeight: 700, color: currentStage?.color, background: currentStage?.color + '15', border: `1px solid ${currentStage?.color}30` }}>
            {currentStage?.name}
          </div>
        </div>
      </div>

      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* Left panel — deal info */}
        <div style={{ width: 340, minWidth: 340, borderRight: '1px solid var(--bor2)', display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>

          {/* Contact header */}
          <div style={{ padding: '20px', borderBottom: '1px solid var(--bor2)' }}>
            <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>{deal.contact_name}</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
              {deal.contact_phone && (
                <a href={`tel:${deal.contact_phone}`} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '6px 12px', borderRadius: 8, background: 'rgba(177,94,204,.06)', border: '1px solid rgba(177,94,204,.15)', color: 'var(--purple)', textDecoration: 'none', fontSize: 12, fontWeight: 600 }}>
                  📞 {deal.contact_phone}
                </a>
              )}
              {deal.contact_telegram && (
                <a href={`https://t.me/${deal.contact_telegram.replace('@', '')}`} target="_blank" rel="noopener" style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '6px 12px', borderRadius: 8, background: 'rgba(0,136,204,.06)', border: '1px solid rgba(0,136,204,.15)', color: '#0088cc', textDecoration: 'none', fontSize: 12, fontWeight: 600 }}>
                  TG {deal.contact_telegram}
                </a>
              )}
              {deal.contact_whatsapp && (
                <a href={`https://wa.me/${deal.contact_whatsapp.replace(/\D/g, '')}`} target="_blank" rel="noopener" style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '6px 12px', borderRadius: 8, background: 'rgba(37,211,102,.06)', border: '1px solid rgba(37,211,102,.15)', color: '#25d366', textDecoration: 'none', fontSize: 12, fontWeight: 600 }}>
                  WA {deal.contact_whatsapp}
                </a>
              )}
              {deal.contact_email && (
                <a href={`mailto:${deal.contact_email}`} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '6px 12px', borderRadius: 8, background: 'rgba(0,0,0,.03)', border: '1px solid var(--bor2)', color: 'var(--muted)', textDecoration: 'none', fontSize: 12, fontWeight: 600 }}>
                  ✉️ {deal.contact_email}
                </a>
              )}
            </div>
          </div>

          {/* Details */}
          <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--bor2)' }}>
            <div style={{ display: 'grid', gap: 8, fontSize: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--muted)' }}>Менеджер</span>
                <span className="stag">{sp?.name ?? '—'}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--muted)' }}>Бюджет</span>
                <span style={{ fontWeight: 700, color: 'var(--text)', fontSize: 14 }}>{Number(deal.budget).toLocaleString('ru')} ₽</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--muted)' }}>Источник</span>
                <span>{sourceLabel[deal.source] || deal.source}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--muted)' }}>Создана</span>
                <span>{new Date(deal.created_at).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--muted)' }}>Обновлена</span>
                <span>{new Date(deal.updated_at).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
              </div>
            </div>

            {!editing && (
              <button onClick={() => setEditing(true)} className="btn-s" style={{ width: '100%', marginTop: 12, fontSize: 11 }}>Редактировать</button>
            )}

            {editing && (
              <form onSubmit={handleSaveEdit} style={{ marginTop: 12, display: 'grid', gap: 8 }}>
                <input name="title" defaultValue={deal.title} placeholder="Название" style={{ padding: '7px 10px', border: '1px solid var(--bor2)', borderRadius: 8, fontSize: 12, fontFamily: 'inherit', outline: 'none', background: 'var(--bg)' }} />
                <input name="contact_name" defaultValue={deal.contact_name} placeholder="Имя контакта" style={{ padding: '7px 10px', border: '1px solid var(--bor2)', borderRadius: 8, fontSize: 12, fontFamily: 'inherit', outline: 'none', background: 'var(--bg)' }} />
                <input name="contact_phone" defaultValue={deal.contact_phone || ''} placeholder="Телефон" style={{ padding: '7px 10px', border: '1px solid var(--bor2)', borderRadius: 8, fontSize: 12, fontFamily: 'inherit', outline: 'none', background: 'var(--bg)' }} />
                <input name="contact_telegram" defaultValue={deal.contact_telegram || ''} placeholder="Telegram" style={{ padding: '7px 10px', border: '1px solid var(--bor2)', borderRadius: 8, fontSize: 12, fontFamily: 'inherit', outline: 'none', background: 'var(--bg)' }} />
                <input name="contact_whatsapp" defaultValue={deal.contact_whatsapp || ''} placeholder="WhatsApp" style={{ padding: '7px 10px', border: '1px solid var(--bor2)', borderRadius: 8, fontSize: 12, fontFamily: 'inherit', outline: 'none', background: 'var(--bg)' }} />
                <input name="contact_email" defaultValue={deal.contact_email || ''} placeholder="Email" style={{ padding: '7px 10px', border: '1px solid var(--bor2)', borderRadius: 8, fontSize: 12, fontFamily: 'inherit', outline: 'none', background: 'var(--bg)' }} />
                <input name="budget" type="number" defaultValue={deal.budget} placeholder="Бюджет" style={{ padding: '7px 10px', border: '1px solid var(--bor2)', borderRadius: 8, fontSize: 12, fontFamily: 'inherit', outline: 'none', background: 'var(--bg)' }} />
                <select name="salesperson_id" defaultValue={deal.salesperson_id} className="si" style={{ padding: '7px 10px', fontSize: 12 }}>
                  {salespersons.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button type="submit" disabled={saving} className="btn-p" style={{ flex: 1, fontSize: 11, padding: '7px' }}>{saving ? '...' : 'Сохранить'}</button>
                  <button type="button" onClick={() => setEditing(false)} className="btn-s" style={{ fontSize: 11, padding: '7px 12px' }}>Отмена</button>
                </div>
              </form>
            )}
          </div>

          {/* Linked booking */}
          {bookingData && (
            <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--bor2)' }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>Запись на консультацию</div>
              <div style={{ padding: '8px 12px', borderRadius: 8, background: 'rgba(255,149,0,.06)', border: '1px solid rgba(255,149,0,.15)', fontSize: 12 }}>
                <span style={{ fontWeight: 600 }}>{new Date(bookingData.booking_date + 'T00:00:00').toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })}</span>
                <span style={{ marginLeft: 8, fontWeight: 700, color: 'var(--gold)' }}>{bookingData.start_time.slice(0, 5)}–{bookingData.end_time.slice(0, 5)}</span>
                <span className={`pill ${bookingData.status === 'completed' ? 'pa' : bookingData.status === 'cancelled' ? 'po' : 'ps'}`} style={{ marginLeft: 8, fontSize: 9 }}>
                  <span className="dot"></span>{bookingData.status === 'completed' ? 'Проведена' : bookingData.status === 'cancelled' ? 'Отменена' : 'Подтверждена'}
                </span>
              </div>
            </div>
          )}

          {/* Linked client */}
          <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--bor2)' }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>Клиент в CRM</div>
            {clientData ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ flex: 1, padding: '8px 12px', borderRadius: 8, background: 'rgba(52,199,89,.06)', border: '1px solid rgba(52,199,89,.15)', fontSize: 12 }}>
                  <span style={{ fontWeight: 700, color: 'var(--green)' }}>{clientData.name}</span>
                  <span style={{ marginLeft: 8, color: 'var(--muted)' }}>{clientData.country}</span>
                </div>
                <button onClick={handleUnlinkClient} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: 12 }} title="Отвязать">×</button>
              </div>
            ) : (
              <>
                {showClientSearch ? (
                  <div>
                    <input value={clientSearch} onChange={e => handleSearchClients(e.target.value)} placeholder="Поиск по имени или телефону..." autoFocus
                      style={{ width: '100%', padding: '7px 10px', border: '1px solid var(--bor2)', borderRadius: 8, fontSize: 12, fontFamily: 'inherit', outline: 'none', background: 'var(--bg)', marginBottom: 6 }} />
                    {clientResults.map((c: any) => (
                      <button key={c.id} onClick={() => handleLinkClient(c.id)}
                        style={{ display: 'block', width: '100%', textAlign: 'left', padding: '6px 10px', borderRadius: 6, border: 'none', background: 'var(--surf2)', cursor: 'pointer', marginBottom: 4, fontFamily: 'inherit', fontSize: 12 }}>
                        <span style={{ fontWeight: 600 }}>{c.name}</span> <span style={{ color: 'var(--muted)' }}>{c.phone}</span>
                      </button>
                    ))}
                    <button onClick={() => { setShowClientSearch(false); setClientResults([]) }} style={{ fontSize: 11, color: 'var(--muted)', background: 'none', border: 'none', cursor: 'pointer', marginTop: 4, fontFamily: 'inherit' }}>Отмена</button>
                  </div>
                ) : (
                  <button onClick={() => setShowClientSearch(true)} className="btn-s" style={{ width: '100%', fontSize: 11 }}>Привязать клиента</button>
                )}
              </>
            )}
          </div>

          {/* Stage pipeline */}
          <div style={{ padding: '16px 20px' }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>Этап воронки</div>
            <div style={{ display: 'grid', gap: 4 }}>
              {stages.map(s => {
                const isCurrent = s.id === deal.stage_id
                return (
                  <button key={s.id} onClick={() => !isCurrent && handleMove(s.id)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 8,
                      padding: '6px 10px', borderRadius: 8, border: 'none',
                      background: isCurrent ? s.color + '15' : 'transparent',
                      cursor: isCurrent ? 'default' : 'pointer',
                      fontFamily: 'inherit', textAlign: 'left',
                      transition: 'background .15s',
                    }}
                    onMouseEnter={e => { if (!isCurrent) (e.currentTarget as HTMLElement).style.background = 'var(--rh)' }}
                    onMouseLeave={e => { if (!isCurrent) (e.currentTarget as HTMLElement).style.background = 'transparent' }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: isCurrent ? s.color : 'var(--bor2)', flexShrink: 0 }} />
                    <span style={{ fontSize: 11, fontWeight: isCurrent ? 700 : 400, color: isCurrent ? s.color : 'var(--muted)' }}>{s.name}</span>
                    {isCurrent && <span style={{ fontSize: 9, marginLeft: 'auto', color: s.color, fontWeight: 700 }}>текущий</span>}
                  </button>
                )
              })}
            </div>
          </div>
        </div>

        {/* Right panel — tabs content */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {/* Tabs */}
          <div style={{ display: 'flex', borderBottom: '1px solid var(--bor2)', padding: '0 20px', background: 'var(--surf)' }}>
            {tabs.map(t => (
              <button key={t.key} onClick={() => setTab(t.key)}
                style={{
                  padding: '12px 16px', fontSize: 12, fontWeight: tab === t.key ? 700 : 500,
                  color: tab === t.key ? 'var(--purple)' : 'var(--muted)',
                  background: 'none', border: 'none',
                  borderBottom: tab === t.key ? '2px solid var(--purple)' : '2px solid transparent',
                  cursor: 'pointer', fontFamily: 'inherit',
                }}>
                {t.label}
              </button>
            ))}
          </div>

          {/* Tab content */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '20px' }}>

            {/* Основное */}
            {tab === 'main' && (
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>Информация о сделке</div>
                <div style={{ background: 'var(--surf)', border: '1px solid var(--bor)', borderRadius: 14, padding: '18px 20px', boxShadow: 'var(--sh)', marginBottom: 16 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, fontSize: 13 }}>
                    <div>
                      <div style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 600, marginBottom: 4 }}>Название</div>
                      <div style={{ fontWeight: 600, color: 'var(--text)' }}>{deal.title}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 600, marginBottom: 4 }}>Контакт</div>
                      <div style={{ fontWeight: 600, color: 'var(--text)' }}>{deal.contact_name}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 600, marginBottom: 4 }}>Бюджет</div>
                      <div style={{ fontWeight: 700, fontSize: 16, color: 'var(--purple)' }}>{Number(deal.budget).toLocaleString('ru')} ₽</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 600, marginBottom: 4 }}>Этап</div>
                      <span style={{ padding: '4px 10px', borderRadius: 8, fontSize: 11, fontWeight: 700, color: currentStage?.color, background: currentStage?.color + '15', border: `1px solid ${currentStage?.color}30` }}>
                        {currentStage?.name}
                      </span>
                    </div>
                    <div>
                      <div style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 600, marginBottom: 4 }}>Менеджер</div>
                      <span className="stag">{sp?.name ?? '—'}</span>
                    </div>
                    <div>
                      <div style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 600, marginBottom: 4 }}>Источник</div>
                      <div>{sourceLabel[deal.source] || deal.source}</div>
                    </div>
                  </div>
                </div>

                {/* Timeline summary */}
                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>Хронология</div>
                <div style={{ background: 'var(--surf)', border: '1px solid var(--bor)', borderRadius: 14, padding: '14px 20px', boxShadow: 'var(--sh)' }}>
                  {activities.slice(0, 5).map((a: any) => (
                    <div key={a.id} style={{ display: 'flex', gap: 10, padding: '8px 0', borderBottom: '1px solid rgba(0,0,0,.03)', fontSize: 12 }}>
                      <span style={{ fontSize: 14 }}>{activityIcon[a.activity_type] || '⚙️'}</span>
                      <div style={{ flex: 1 }}>
                        <span style={{ fontWeight: 600, color: 'var(--text)' }}>{a.user_name}</span>
                        <span style={{ color: 'var(--muted)', marginLeft: 6 }}>{a.content}</span>
                      </div>
                      <span style={{ fontSize: 10, color: 'var(--muted)', whiteSpace: 'nowrap' }}>{new Date(a.created_at).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                  ))}
                  {activities.length > 5 && (
                    <button onClick={() => setTab('activity')} style={{ marginTop: 8, background: 'none', border: 'none', color: 'var(--purple)', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                      Показать все ({activities.length}) →
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Активность */}
            {tab === 'activity' && (
              <div>
                {/* Add note */}
                <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
                  <input value={noteText} onChange={e => setNoteText(e.target.value)} placeholder="Добавить заметку..."
                    onKeyDown={e => e.key === 'Enter' && handleAddNote()}
                    style={{ flex: 1, padding: '10px 14px', border: '1px solid var(--bor2)', borderRadius: 10, fontSize: 13, fontFamily: 'inherit', outline: 'none', background: 'var(--bg)' }} />
                  <button onClick={handleAddNote} disabled={saving || !noteText.trim()} className="btn-p" style={{ padding: '10px 20px', fontSize: 12 }}>
                    {saving ? '...' : 'Добавить'}
                  </button>
                </div>

                {/* Activity feed */}
                <div style={{ display: 'grid', gap: 0 }}>
                  {activities.map((a: any, i: number) => (
                    <div key={a.id} style={{ display: 'flex', gap: 12, padding: '12px 0', borderBottom: i < activities.length - 1 ? '1px solid rgba(0,0,0,.04)' : 'none' }}>
                      <div style={{
                        width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
                        background: a.activity_type === 'note' ? 'rgba(177,94,204,.1)' : a.activity_type === 'stage_change' ? 'rgba(0,122,255,.1)' : 'rgba(0,0,0,.04)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14,
                      }}>
                        {activityIcon[a.activity_type] || '⚙️'}
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)' }}>{a.user_name}</span>
                          <span style={{ fontSize: 10, color: 'var(--muted)' }}>
                            {new Date(a.created_at).toLocaleString('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                        <div style={{ fontSize: 13, color: a.activity_type === 'stage_change' ? 'var(--purple)' : 'var(--text)', fontWeight: a.activity_type === 'stage_change' ? 600 : 400 }}>
                          {a.content}
                        </div>
                      </div>
                    </div>
                  ))}
                  {activities.length === 0 && <div style={{ textAlign: 'center', color: 'var(--muted)', padding: 40, fontSize: 13 }}>Нет записей в активности</div>}
                </div>
              </div>
            )}

            {/* Задачи */}
            {tab === 'tasks' && (
              <div>
                <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
                  <input value={taskTitle} onChange={e => setTaskTitle(e.target.value)} placeholder="Новая задача..."
                    onKeyDown={e => e.key === 'Enter' && handleAddTask()}
                    style={{ flex: 1, padding: '10px 14px', border: '1px solid var(--bor2)', borderRadius: 10, fontSize: 13, fontFamily: 'inherit', outline: 'none', background: 'var(--bg)' }} />
                  <input type="datetime-local" value={taskDeadline} onChange={e => setTaskDeadline(e.target.value)}
                    style={{ padding: '10px 12px', border: '1px solid var(--bor2)', borderRadius: 10, fontSize: 12, fontFamily: 'inherit', outline: 'none', background: 'var(--bg)' }} />
                  <button onClick={handleAddTask} disabled={saving || !taskTitle.trim()} className="btn-p" style={{ padding: '10px 16px', fontSize: 12 }}>
                    {saving ? '...' : 'Добавить'}
                  </button>
                </div>

                {tasks.length === 0 && <div style={{ textAlign: 'center', color: 'var(--muted)', padding: 24, fontSize: 12 }}>Нет задач</div>}

                <div style={{ display: 'grid', gap: 6 }}>
                  {tasks.map((t: any) => {
                    const isOverdue = !t.is_done && t.deadline && new Date(t.deadline) < new Date()
                    return (
                      <div key={t.id} style={{
                        display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px',
                        borderRadius: 10, background: t.is_done ? 'rgba(52,199,89,.04)' : isOverdue ? 'rgba(255,59,48,.04)' : 'var(--surf)',
                        border: `1px solid ${t.is_done ? 'rgba(52,199,89,.15)' : isOverdue ? 'rgba(255,59,48,.2)' : 'var(--bor)'}`,
                      }}>
                        <div onClick={() => handleToggleTask(t.id, t.is_done)} style={{
                          width: 20, height: 20, borderRadius: 6, flexShrink: 0, cursor: 'pointer',
                          background: t.is_done ? 'var(--green)' : 'transparent',
                          border: t.is_done ? 'none' : '2px solid var(--bor2)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>
                          {t.is_done && <svg viewBox="0 0 9 7" fill="none" stroke="white" strokeWidth="2" width="10" height="10"><polyline points="1,3.5 3.5,6 8,1" /></svg>}
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 13, fontWeight: 600, color: t.is_done ? 'var(--muted)' : 'var(--text)', textDecoration: t.is_done ? 'line-through' : 'none' }}>{t.title}</div>
                          {t.deadline && (
                            <div style={{ fontSize: 10, color: isOverdue ? 'var(--red)' : 'var(--muted)', fontWeight: isOverdue ? 700 : 400, marginTop: 2 }}>
                              {isOverdue ? 'Просрочена: ' : 'До: '}{new Date(t.deadline).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                            </div>
                          )}
                        </div>
                        <button onClick={() => handleDeleteTask(t.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: 14 }}>×</button>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Файлы */}
            {tab === 'files' && (
              <div>
                {/* Upload area */}
                <label style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
                  padding: '20px', borderRadius: 14, marginBottom: 16,
                  border: '2px dashed var(--bor2)', background: 'var(--surf2)',
                  cursor: 'pointer', transition: 'border-color .15s',
                }}
                  onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--purple)')}
                  onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--bor2)')}>
                  <input type="file" onChange={handleFileUpload} hidden />
                  {uploading ? (
                    <span style={{ fontSize: 13, color: 'var(--purple)', fontWeight: 600 }}>Загрузка...</span>
                  ) : (
                    <>
                      <svg viewBox="0 0 24 24" fill="none" stroke="var(--purple)" strokeWidth="2" width="20" height="20"><path d="M12 5v14M5 12l7-7 7 7" /></svg>
                      <span style={{ fontSize: 13, color: 'var(--muted)' }}>Нажмите для загрузки файла <span style={{ color: 'var(--purple)', fontWeight: 600 }}>(макс. 10 МБ)</span></span>
                    </>
                  )}
                </label>

                {/* File list */}
                {files.length === 0 && !uploading && (
                  <div style={{ textAlign: 'center', color: 'var(--muted)', padding: 24, fontSize: 12 }}>Файлов пока нет</div>
                )}

                <div style={{ display: 'grid', gap: 8 }}>
                  {files.map((f: any) => (
                    <div key={f.id} style={{
                      display: 'flex', alignItems: 'center', gap: 12,
                      padding: '12px 16px', borderRadius: 12,
                      background: 'var(--surf)', border: '1px solid var(--bor)',
                      boxShadow: '0 1px 4px rgba(0,0,0,.04)',
                    }}>
                      <span style={{ fontSize: 24 }}>{fileIcon[f.mime_type] || '📎'}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <a href={f.url} target="_blank" rel="noopener"
                          style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', textDecoration: 'none', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                          onMouseEnter={e => (e.currentTarget.style.color = 'var(--purple)')}
                          onMouseLeave={e => (e.currentTarget.style.color = 'var(--text)')}>
                          {f.name}
                        </a>
                        <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 2 }}>
                          {formatSize(f.size)} · {new Date(f.created_at).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                          {f.source !== 'upload' && <span style={{ marginLeft: 6, padding: '1px 6px', borderRadius: 4, background: f.source === 'telegram' ? 'rgba(0,136,204,.08)' : 'rgba(37,211,102,.08)', color: f.source === 'telegram' ? '#0088cc' : '#25d366', fontSize: 9, fontWeight: 600 }}>{f.source === 'telegram' ? 'TG' : 'WA'}</span>}
                        </div>
                      </div>
                      <a href={f.url} target="_blank" rel="noopener" style={{ padding: '4px 10px', borderRadius: 6, background: 'var(--pl)', color: 'var(--purple)', fontSize: 10, fontWeight: 600, textDecoration: 'none', flexShrink: 0 }}>Открыть</a>
                      <button onClick={() => handleDeleteFile(f.id)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: 'var(--muted)', fontSize: 14 }}
                        title="Удалить">×</button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Сообщения */}
            {tab === 'messages' && (
              <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                {messages.length > 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: 1, overflowY: 'auto', paddingBottom: 12 }}>
                    {messages.map((m: any) => (
                      <div key={m.id} style={{
                        display: 'flex', flexDirection: 'column',
                        alignItems: m.direction === 'outgoing' ? 'flex-end' : 'flex-start',
                      }}>
                        <div style={{
                          maxWidth: '75%', padding: '10px 14px', borderRadius: 14,
                          background: m.direction === 'outgoing' ? 'var(--purple)' : 'var(--surf)',
                          color: m.direction === 'outgoing' ? '#fff' : 'var(--text)',
                          border: m.direction === 'outgoing' ? 'none' : '1px solid var(--bor)',
                          borderBottomRightRadius: m.direction === 'outgoing' ? 4 : 14,
                          borderBottomLeftRadius: m.direction === 'incoming' ? 4 : 14,
                        }}>
                          {m.sender_name && m.direction === 'incoming' && (
                            <div style={{ fontSize: 10, fontWeight: 700, marginBottom: 3, color: m.channel === 'telegram' ? '#0088cc' : '#25d366' }}>{m.sender_name}</div>
                          )}
                          <div style={{ fontSize: 13 }}>{m.content}</div>
                          <div style={{ fontSize: 9, marginTop: 4, opacity: 0.6, textAlign: 'right' }}>
                            {m.channel === 'telegram' ? 'TG' : 'WA'} · {new Date(m.created_at).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{ textAlign: 'center', padding: 40, flex: 1 }}>
                    <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'rgba(0,136,204,.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', fontSize: 24 }}>💬</div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 6 }}>Нет сообщений</div>
                    <div style={{ fontSize: 12, color: 'var(--muted)' }}>Напишите первым — сообщения будут появляться здесь</div>
                  </div>
                )}

                {/* Input + send */}
                <div style={{ borderTop: '1px solid var(--bor)', paddingTop: 10, marginTop: 'auto' }}>
                  {msgError && (
                    <div style={{ fontSize: 11, color: 'var(--red)', marginBottom: 6, padding: '6px 10px', background: 'rgba(220,53,69,.06)', borderRadius: 8 }}>{msgError}</div>
                  )}
                  <div style={{ display: 'flex', gap: 6, alignItems: 'flex-end' }}>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button
                        onClick={() => setMsgChannel('telegram')}
                        disabled={!deal.contact_telegram}
                        title={deal.contact_telegram ? 'Отправить в Telegram' : 'У клиента нет Telegram'}
                        style={{
                          padding: '8px 10px', borderRadius: 8, border: '1px solid var(--bor)',
                          background: msgChannel === 'telegram' ? 'rgba(0,136,204,.12)' : 'var(--surf)',
                          color: msgChannel === 'telegram' ? '#0088cc' : 'var(--muted)',
                          cursor: deal.contact_telegram ? 'pointer' : 'not-allowed',
                          fontSize: 11, fontWeight: 700,
                          opacity: deal.contact_telegram ? 1 : 0.4,
                        }}>TG</button>
                      <button
                        onClick={() => setMsgChannel('whatsapp')}
                        disabled={!deal.contact_phone}
                        title={deal.contact_phone ? 'Отправить в WhatsApp' : 'У клиента нет телефона'}
                        style={{
                          padding: '8px 10px', borderRadius: 8, border: '1px solid var(--bor)',
                          background: msgChannel === 'whatsapp' ? 'rgba(37,211,102,.12)' : 'var(--surf)',
                          color: msgChannel === 'whatsapp' ? '#25d366' : 'var(--muted)',
                          cursor: deal.contact_phone ? 'pointer' : 'not-allowed',
                          fontSize: 11, fontWeight: 700,
                          opacity: deal.contact_phone ? 1 : 0.4,
                        }}>WA</button>
                    </div>
                    <textarea
                      value={msgText}
                      onChange={e => setMsgText(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendMsg() } }}
                      placeholder="Напишите сообщение... (Enter — отправить, Shift+Enter — новая строка)"
                      rows={1}
                      style={{
                        flex: 1, padding: '10px 12px', border: '1px solid var(--bor2)', borderRadius: 10,
                        fontSize: 13, fontFamily: 'inherit', outline: 'none', background: 'var(--bg)',
                        resize: 'none', minHeight: 40, maxHeight: 120,
                      }}
                    />
                    <button
                      onClick={handleSendMsg}
                      disabled={msgSending || !msgText.trim()}
                      className="btn-p"
                      style={{ padding: '10px 16px', fontSize: 12, opacity: (msgSending || !msgText.trim()) ? 0.5 : 1 }}>
                      {msgSending ? '...' : 'Отправить'}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
