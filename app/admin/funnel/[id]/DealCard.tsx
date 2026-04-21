'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { moveDeal, addDealNote, updateDeal, createDealTask, toggleDealTask, deleteDealTask, linkDealToClient, searchClients, sendDealMessage, sendDealFile, suggestReply } from '../actions'
import { uploadDealFile, deleteDealFile } from './fileActions'
import { createClient } from '@/lib/supabase/client'

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
  curators: { id: string; name: string }[]
  availableGroups: { chat_id: string; title: string }[]
  backUrl?: string
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

// Telegram-like sender colors (8 colors). Deterministic by name hash.
const SENDER_COLORS = [
  '#E17076', // red
  '#7BC862', // green
  '#65AADD', // blue
  '#EE7AAE', // pink
  '#A695E7', // purple
  '#FAA774', // orange
  '#6EC9CB', // teal
  '#E5BC60', // yellow
]
function colorForSender(name: string | null | undefined): string {
  if (!name) return SENDER_COLORS[0]
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0
  return SENDER_COLORS[hash % SENDER_COLORS.length]
}
const activityIcon: Record<string, string> = { note: '📝', stage_change: '→', system: '⚙️', call: '📞', message: '💬', file_upload: '📎', task_done: '✅' }

export function DealCard({ deal, stages, activities, salespersons, clientData, bookingData, files, messages, tasks, userId, curators, availableGroups, backUrl = '/admin/funnel' }: Props) {
  const router = useRouter()
  const [tab, setTab] = useState<'main' | 'activity' | 'files' | 'messages' | 'tasks'>('main')

  // Supabase Realtime: refresh page when new message/file arrives for this deal
  useEffect(() => {
    const supabase = createClient()
    const channel = supabase
      .channel(`deal-${deal.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'deal_messages', filter: `deal_id=eq.${deal.id}` }, () => {
        router.refresh()
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'deal_files', filter: `deal_id=eq.${deal.id}` }, () => {
        router.refresh()
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'deal_activities', filter: `deal_id=eq.${deal.id}` }, () => {
        router.refresh()
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [deal.id, router])
  const [noteText, setNoteText] = useState('')
  const [saving, setSaving] = useState(false)
  const [editing, setEditing] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [taskTitle, setTaskTitle] = useState('')
  const [taskDeadline, setTaskDeadline] = useState('')
  const [clientSearch, setClientSearch] = useState('')
  const [clientResults, setClientResults] = useState<any[]>([])
  const [showClientSearch, setShowClientSearch] = useState(false)
  // Onboarding modal state
  const [onboardingModal, setOnboardingModal] = useState<{ stageId: string; stageName: string } | null>(null)
  const [obCuratorId, setObCuratorId] = useState('')
  const [obTotalAmount, setObTotalAmount] = useState('')
  const [obMonths, setObMonths] = useState('6')
  const [obFirstPayDate, setObFirstPayDate] = useState(new Date().toISOString().split('T')[0])
  const [obGroupChatId, setObGroupChatId] = useState('')
  const [obSaving, setObSaving] = useState(false)
  const [obExistingClient, setObExistingClient] = useState<any>(clientData || null)

  const [consultNotes, setConsultNotes] = useState(deal.custom_fields?.consultation_notes || '')
  const [consultSaving, setConsultSaving] = useState(false)
  const [consultSaved, setConsultSaved] = useState(false)

  const [msgText, setMsgText] = useState('')
  const [msgChannel, setMsgChannel] = useState<'telegram' | 'whatsapp'>(
    (deal.contact_telegram || deal.source === 'telegram_group_bot' || deal.custom_fields?.is_group)
      ? 'telegram'
      : 'whatsapp'
  )
  const [msgSending, setMsgSending] = useState(false)
  const [msgError, setMsgError] = useState<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const chatFileInputRef = useRef<HTMLInputElement>(null)
  const [pendingFile, setPendingFile] = useState<File | null>(null)

  // AI sales assistant — streaming panel
  const [aiPanelOpen, setAiPanelOpen] = useState(true)
  const [aiStreaming, setAiStreaming] = useState(false)
  const [aiText, setAiText] = useState('')
  const [aiError, setAiError] = useState<string | null>(null)
  const aiAbortRef = useRef<AbortController | null>(null)
  const lastAnalyzedCountRef = useRef<number>(0)

  // Extract only "next message" block for copy/insert
  function extractNextMessage(text: string): string {
    if (!text) return ''
    const m = text.match(/💬\s*СЛЕДУЮЩЕЕ СООБЩЕНИЕ:\s*([\s\S]*?)(?=\n[⚠️💰🎁🎯]|$)/)
    if (m) return m[1].trim()
    return text.trim()
  }

  async function runAiSuggest() {
    // Cancel previous stream if still running
    if (aiAbortRef.current) aiAbortRef.current.abort()
    const controller = new AbortController()
    aiAbortRef.current = controller

    setAiStreaming(true)
    setAiError(null)
    setAiText('')

    try {
      const res = await fetch('/api/ai/suggest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dealId: deal.id }),
        signal: controller.signal,
      })

      if (!res.ok || !res.body) {
        const txt = await res.text().catch(() => 'error')
        setAiError(txt)
        setAiStreaming(false)
        return
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let acc = ''
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        const chunk = decoder.decode(value, { stream: true })
        acc += chunk
        setAiText(acc)
      }
      setAiStreaming(false)
    } catch (e: any) {
      if (e?.name !== 'AbortError') setAiError(e?.message || 'Ошибка AI')
      setAiStreaming(false)
    }
  }

  // Auto-run when new incoming messages arrive (last message is incoming and different from last analyzed count)
  useEffect(() => {
    if (!aiPanelOpen) return
    const last = messages[messages.length - 1]
    if (!last) return
    if (messages.length === lastAnalyzedCountRef.current) return
    // Only auto-run if the last message is incoming — no need to analyze after we just sent one
    if (last.direction === 'incoming') {
      lastAnalyzedCountRef.current = messages.length
      runAiSuggest()
    } else {
      lastAnalyzedCountRef.current = messages.length
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages.length, aiPanelOpen])

  function insertSuggestionToInput() {
    if (aiText) setMsgText(extractNextMessage(aiText))
    setAiPanelOpen(false)
  }

  async function copySuggestion() {
    if (aiText) {
      try { await navigator.clipboard.writeText(extractNextMessage(aiText)) } catch {}
    }
  }

  // Auto-scroll to last message when opening messages tab or when new message arrives
  useEffect(() => {
    if (tab === 'messages') {
      messagesEndRef.current?.scrollIntoView({ behavior: 'instant' as ScrollBehavior, block: 'end' })
    }
  }, [tab, messages.length])

  async function handleSendMsg() {
    if (!msgText.trim() && !pendingFile) return
    setMsgSending(true)
    setMsgError(null)

    if (pendingFile) {
      // Send file (with optional caption)
      const fd = new FormData()
      fd.append('deal_id', deal.id)
      fd.append('channel', msgChannel)
      fd.append('file', pendingFile)
      if (msgText.trim()) fd.append('caption', msgText.trim())
      const res = await sendDealFile(fd)
      setMsgSending(false)
      if (res.error) { setMsgError(res.error); return }
      setMsgText('')
      setPendingFile(null)
      if (chatFileInputRef.current) chatFileInputRef.current.value = ''
    } else {
      // Send plain text
      const fd = new FormData()
      fd.append('deal_id', deal.id)
      fd.append('text', msgText)
      fd.append('channel', msgChannel)
      const res = await sendDealMessage(fd)
      setMsgSending(false)
      if (res.error) setMsgError(res.error)
      else setMsgText('')
    }
  }

  const currentStage = stages.find(s => s.id === deal.stage_id)
  const sp = salespersons.find(s => s.id === deal.salesperson_id)

  const ONBOARDING_STAGES = ['Первичная продажа', 'Оплата услуг']

  async function handleMove(stageId: string) {
    const newStage = stages.find(s => s.id === stageId)
    // If moving to payment stage and no client yet — show onboarding modal
    if (newStage && ONBOARDING_STAGES.includes(newStage.name)) {
      setOnboardingModal({ stageId, stageName: newStage.name })
      return
    }
    const fd = new FormData()
    fd.append('deal_id', deal.id)
    fd.append('stage_id', stageId)
    fd.append('old_stage_name', currentStage?.name || '')
    fd.append('new_stage_name', newStage?.name || '')
    await moveDeal(fd)
  }

  async function handleOnboardingSubmit() {
    if (!obCuratorId || !obTotalAmount || !obMonths) return
    setObSaving(true)

    // 1. Move deal to the stage (this auto-creates client)
    const fd = new FormData()
    fd.append('deal_id', deal.id)
    fd.append('stage_id', onboardingModal!.stageId)
    fd.append('old_stage_name', currentStage?.name || '')
    fd.append('new_stage_name', onboardingModal!.stageName)
    // Pass onboarding data
    fd.append('curator_id', obCuratorId)
    fd.append('total_amount', obTotalAmount)
    fd.append('months', obMonths)
    fd.append('first_pay_date', obFirstPayDate)
    if (obGroupChatId) fd.append('group_chat_id', obGroupChatId)
    await moveDeal(fd)
    setObSaving(false)
    setOnboardingModal(null)
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
          <Link href={backUrl} style={{ color: 'var(--muted)', textDecoration: 'none', fontSize: 13 }}>← Воронка</Link>
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
        <div style={{ width: 280, minWidth: 280, borderRight: '1px solid var(--bor2)', display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>

          {/* Contact header */}
          <div style={{ padding: '20px', borderBottom: '1px solid var(--bor2)' }}>
            {deal.custom_fields?.is_group && (
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 8px', background: 'rgba(177,94,204,.1)', color: 'var(--purple)', fontSize: 10, fontWeight: 700, borderRadius: 6, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '.03em' }}>
                👥 Групповой чат
              </div>
            )}
            <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>{deal.contact_name}</div>
            {deal.custom_fields?.is_group && (() => {
              const participants = Array.from(new Set(
                (messages as any[])
                  .filter(m => m.direction === 'incoming' && m.sender_name)
                  .map(m => m.sender_name)
              ))
              return participants.length > 0 ? (
                <div style={{ marginTop: 8, fontSize: 11 }}>
                  <div style={{ color: 'var(--muted)', marginBottom: 4, fontWeight: 600 }}>Участники ({participants.length})</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                    {participants.map((p, i) => {
                      const color = colorForSender(p as string)
                      return (
                        <span key={i} style={{
                          display: 'inline-flex', alignItems: 'center', gap: 4,
                          padding: '3px 8px', borderRadius: 6,
                          background: color + '15', color: color,
                          fontWeight: 600, fontSize: 10,
                        }}>
                          <span style={{ width: 6, height: 6, borderRadius: '50%', background: color }} />
                          {p as string}
                        </span>
                      )
                    })}
                  </div>
                </div>
              ) : null
            })()}
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
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ color: 'var(--muted)' }}>Менеджер</span>
                <select
                  value={deal.salesperson_id || ''}
                  onChange={async (e) => {
                    const newId = e.target.value
                    if (!newId || newId === deal.salesperson_id) return
                    const fd = new FormData()
                    fd.append('deal_id', deal.id)
                    fd.append('salesperson_id', newId)
                    fd.append('contact_name', deal.contact_name)
                    fd.append('contact_phone', deal.contact_phone || '')
                    fd.append('contact_telegram', deal.contact_telegram || '')
                    fd.append('contact_whatsapp', deal.contact_whatsapp || '')
                    fd.append('contact_email', deal.contact_email || '')
                    fd.append('budget', String(deal.budget || 0))
                    fd.append('title', deal.title)
                    await updateDeal(fd)
                  }}
                  style={{ fontSize: 12, padding: '3px 8px', borderRadius: 6, border: '1px solid var(--bor2)', background: 'var(--surf)', color: 'var(--text)', cursor: 'pointer', fontFamily: 'inherit', maxWidth: 140 }}>
                  {salespersons.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
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

          {/* Quiz data */}
          {deal.custom_fields && Object.keys(deal.custom_fields).some(k => k.startsWith('quiz_')) && (
            <div style={{ padding: '16px 20px', borderTop: '1px solid var(--bor2)' }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>Данные из Анкеты</div>
              <div style={{ display: 'grid', gap: 6, fontSize: 12 }}>
                {[
                  ['Возраст', deal.custom_fields.quiz_age],
                  ['Статус', deal.custom_fields.quiz_status],
                  ['Бюджет', deal.custom_fields.quiz_budget],
                  ['Степень', deal.custom_fields.quiz_degree],
                  ['Формат', deal.custom_fields.quiz_format],
                  ['Страна', deal.custom_fields.quiz_country],
                  ['Год', deal.custom_fields.quiz_year],
                  ['Этап', Array.isArray(deal.custom_fields.quiz_stage) ? deal.custom_fields.quiz_stage.join(', ') : deal.custom_fields.quiz_stage],
                  ['Формат конс.', deal.custom_fields.quiz_consultation_format],
                ].filter(([, v]) => v).map(([label, val]) => (
                  <div key={label as string} style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                    <span style={{ color: 'var(--muted)', flexShrink: 0 }}>{label}</span>
                    <span style={{ fontWeight: 500, color: 'var(--text)', textAlign: 'right' }}>{val}</span>
                  </div>
                ))}
                {deal.custom_fields.quiz_about && (
                  <div style={{ marginTop: 4 }}>
                    <div style={{ color: 'var(--muted)', marginBottom: 2 }}>О себе</div>
                    <div style={{ fontSize: 11, color: 'var(--text)', padding: '6px 8px', background: 'var(--bg)', borderRadius: 6, lineHeight: 1.5 }}>{deal.custom_fields.quiz_about}</div>
                  </div>
                )}
                {deal.custom_fields.quiz_result && (
                  <div style={{ marginTop: 4 }}>
                    <div style={{ color: 'var(--muted)', marginBottom: 2 }}>Ожидаемый результат</div>
                    <div style={{ fontSize: 11, color: 'var(--text)', padding: '6px 8px', background: 'var(--bg)', borderRadius: 6, lineHeight: 1.5 }}>{deal.custom_fields.quiz_result}</div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Consultation notes */}
          <div style={{ padding: '16px 20px', borderTop: '1px solid var(--bor2)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Итог консультации</div>
              {consultSaved && <span style={{ fontSize: 10, color: 'var(--green)', fontWeight: 600 }}>Сохранено</span>}
            </div>
            <textarea
              value={consultNotes}
              onChange={e => { setConsultNotes(e.target.value); setConsultSaved(false) }}
              placeholder="Запишите ключевую информацию о клиенте после консультации: цели, потребности, возражения, договорённости..."
              rows={4}
              style={{
                width: '100%', padding: '10px 12px', borderRadius: 10,
                border: '1px solid var(--bor2)', fontSize: 12, fontFamily: 'inherit',
                outline: 'none', background: 'var(--bg)', resize: 'vertical',
                minHeight: 80, lineHeight: 1.5, color: 'var(--text)',
                boxSizing: 'border-box',
              }}
            />
            <button
              onClick={async () => {
                setConsultSaving(true)
                const fd = new FormData()
                fd.append('deal_id', deal.id)
                fd.append('consultation_notes', consultNotes)
                await addDealNote(fd)
                // Also save to custom_fields
                const updateFd = new FormData()
                updateFd.append('deal_id', deal.id)
                updateFd.append('title', deal.title)
                updateFd.append('contact_name', deal.contact_name)
                updateFd.append('contact_phone', deal.contact_phone || '')
                updateFd.append('contact_telegram', deal.contact_telegram || '')
                updateFd.append('contact_whatsapp', deal.contact_whatsapp || '')
                updateFd.append('contact_email', deal.contact_email || '')
                updateFd.append('budget', String(deal.budget || 0))
                updateFd.append('salesperson_id', deal.salesperson_id || '')
                updateFd.append('consultation_notes', consultNotes)
                await updateDeal(updateFd)
                setConsultSaving(false)
                setConsultSaved(true)
                setTimeout(() => setConsultSaved(false), 3000)
              }}
              disabled={consultSaving}
              className="btn-p"
              style={{ width: '100%', marginTop: 8, fontSize: 11, padding: '8px' }}>
              {consultSaving ? 'Сохраняем...' : 'Сохранить'}
            </button>
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
              <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 160px)', maxHeight: 'calc(100vh - 160px)' }}>
                {messages.length > 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: 1, overflowY: 'auto', paddingBottom: 12, minHeight: 0 }}>
                    {messages.map((m: any) => {
                      const attachedFile = m.file_id ? files.find((f: any) => f.id === m.file_id) : null
                      const isImage = attachedFile?.mime_type?.startsWith('image/')
                      const contentIsTag = typeof m.content === 'string' && /^\[.+\]$/.test(m.content)
                      return (
                      <div key={m.id} style={{
                        display: 'flex', flexDirection: 'column',
                        alignItems: m.direction === 'outgoing' ? 'flex-end' : 'flex-start',
                      }}>
                        <div style={{
                          maxWidth: '75%', padding: attachedFile && isImage ? '6px' : '10px 14px', borderRadius: 14,
                          background: m.direction === 'outgoing' ? 'var(--purple)' : 'var(--surf)',
                          color: m.direction === 'outgoing' ? '#fff' : 'var(--text)',
                          border: m.direction === 'outgoing' ? 'none' : '1px solid var(--bor)',
                          borderBottomRightRadius: m.direction === 'outgoing' ? 4 : 14,
                          borderBottomLeftRadius: m.direction === 'incoming' ? 4 : 14,
                          borderLeft: m.direction === 'incoming' && m.sender_name ? `3px solid ${colorForSender(m.sender_name)}` : undefined,
                          overflow: 'hidden',
                        }}>
                          {m.sender_name && m.direction === 'incoming' && (
                            <div style={{
                              display: 'flex', alignItems: 'center', gap: 6,
                              fontSize: 11, fontWeight: 700, marginBottom: 4,
                              padding: attachedFile && isImage ? '4px 8px 0' : 0,
                              color: colorForSender(m.sender_name),
                            }}>
                              <div style={{
                                width: 18, height: 18, borderRadius: '50%',
                                background: colorForSender(m.sender_name),
                                color: '#fff', fontSize: 9, fontWeight: 800,
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                flexShrink: 0,
                              }}>{(m.sender_name as string).split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase()}</div>
                              <span>{m.sender_name}</span>
                            </div>
                          )}

                          {attachedFile && isImage && (
                            <a href={attachedFile.url} target="_blank" rel="noopener" style={{ display: 'block' }}>
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={attachedFile.url} alt="" style={{ display: 'block', maxWidth: 240, maxHeight: 240, borderRadius: 8, objectFit: 'cover' }} />
                            </a>
                          )}

                          {attachedFile && !isImage && (
                            <a href={attachedFile.url} target="_blank" rel="noopener" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 4px', color: m.direction === 'outgoing' ? '#fff' : 'var(--text)', textDecoration: 'none' }}>
                              <span style={{ fontSize: 20 }}>📎</span>
                              <span style={{ fontSize: 12, fontWeight: 600, wordBreak: 'break-all' }}>{attachedFile.name}</span>
                            </a>
                          )}

                          {m.content && !contentIsTag && (
                            <div style={{ fontSize: 13, padding: attachedFile && isImage ? '4px 8px 0' : 0 }}>{m.content}</div>
                          )}

                          <div style={{ fontSize: 9, marginTop: 4, opacity: 0.6, textAlign: 'right', padding: attachedFile && isImage ? '0 8px 4px' : 0 }}>
                            {m.channel === 'telegram' ? 'TG' : 'WA'} · {new Date(m.created_at).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
                          </div>
                        </div>
                      </div>
                      )
                    })}
                    <div ref={messagesEndRef} />
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
                  {pendingFile && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, padding: '8px 12px', background: 'rgba(177,94,204,.08)', border: '1px solid rgba(177,94,204,.2)', borderRadius: 10 }}>
                      <span style={{ fontSize: 18 }}>{pendingFile.type.startsWith('image/') ? '🖼' : '📎'}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{pendingFile.name}</div>
                        <div style={{ fontSize: 10, color: 'var(--muted)' }}>{formatSize(pendingFile.size)}</div>
                      </div>
                      <button
                        onClick={() => { setPendingFile(null); if (chatFileInputRef.current) chatFileInputRef.current.value = '' }}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: 18, padding: '0 4px' }}
                        title="Убрать файл"
                      >×</button>
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: 6, alignItems: 'flex-end' }}>
                    <div style={{ display: 'flex', gap: 4 }}>
                      {(() => {
                        const isGroupDeal = deal.source === 'telegram_group_bot' || deal.custom_fields?.is_group === true
                        const tgEnabled = !!deal.contact_telegram || isGroupDeal
                        return (
                          <button
                            onClick={() => setMsgChannel('telegram')}
                            disabled={!tgEnabled}
                            title={tgEnabled ? (isGroupDeal ? 'Отправить в Telegram-группу' : 'Отправить в Telegram') : 'У клиента нет Telegram'}
                            style={{
                              padding: '8px 10px', borderRadius: 8, border: '1px solid var(--bor)',
                              background: msgChannel === 'telegram' ? 'rgba(0,136,204,.12)' : 'var(--surf)',
                              color: msgChannel === 'telegram' ? '#0088cc' : 'var(--muted)',
                              cursor: tgEnabled ? 'pointer' : 'not-allowed',
                              fontSize: 11, fontWeight: 700,
                              opacity: tgEnabled ? 1 : 0.4,
                            }}>TG</button>
                        )
                      })()}
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
                      <button
                        onClick={() => chatFileInputRef.current?.click()}
                        disabled={msgSending}
                        title="Прикрепить файл"
                        style={{
                          padding: '8px 10px', borderRadius: 8, border: '1px solid var(--bor)',
                          background: 'var(--surf)', color: 'var(--muted)',
                          cursor: 'pointer', fontSize: 14,
                        }}>📎</button>
                      <input
                        ref={chatFileInputRef}
                        type="file"
                        style={{ display: 'none' }}
                        onChange={e => {
                          const f = e.target.files?.[0]
                          if (f) setPendingFile(f)
                        }}
                      />
                    </div>
                    <textarea
                      value={msgText}
                      onChange={e => setMsgText(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendMsg() } }}
                      placeholder={pendingFile ? 'Подпись к файлу (необязательно)...' : 'Напишите сообщение... (Enter — отправить, Shift+Enter — новая строка)'}
                      rows={2}
                      style={{
                        flex: 1, padding: '10px 14px', border: '1px solid var(--bor2)', borderRadius: 10,
                        fontSize: 14, fontFamily: 'inherit', outline: 'none', background: 'var(--bg)',
                        resize: 'vertical', minHeight: 44, maxHeight: 240, lineHeight: 1.5,
                      }}
                    />
                    <button
                      onClick={handleSendMsg}
                      disabled={msgSending || (!msgText.trim() && !pendingFile)}
                      className="btn-p"
                      style={{ padding: '10px 16px', fontSize: 12, opacity: (msgSending || (!msgText.trim() && !pendingFile)) ? 0.5 : 1 }}>
                      {msgSending ? '...' : 'Отправить'}
                    </button>
                  </div>
                </div>

                {/* Horizontal AI Terminal panel — always visible under chat */}
                <div style={{
                  marginTop: 10,
                  background: '#0d1117', color: '#c9d1d9',
                  border: '1px solid #30363d', borderRadius: 10,
                  fontFamily: '"JetBrains Mono", "SF Mono", Menlo, monospace',
                  display: 'flex', flexDirection: 'column',
                  height: aiPanelOpen ? 260 : 36,
                  overflow: 'hidden',
                  transition: 'height .2s',
                }}>
                  {/* Title bar */}
                  <div style={{
                    padding: '8px 12px', borderBottom: aiPanelOpen ? '1px solid #21262d' : 'none',
                    display: 'flex', alignItems: 'center', gap: 8,
                    background: '#161b22', cursor: 'pointer',
                  }}
                  onClick={() => setAiPanelOpen(!aiPanelOpen)}>
                    <div style={{ display: 'flex', gap: 5 }}>
                      <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#ff5f56' }} />
                      <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#ffbd2e' }} />
                      <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#27c93f' }} />
                    </div>
                    <div style={{ flex: 1, fontSize: 11, color: '#8b949e', fontWeight: 700, marginLeft: 4 }}>
                      ai-sales-assistant — claude-sonnet-4-6
                      {aiStreaming && <span style={{ marginLeft: 8, color: '#7ee787' }}>● streaming...</span>}
                    </div>
                    {aiPanelOpen && (
                      <button
                        onClick={(e) => { e.stopPropagation(); runAiSuggest() }}
                        disabled={aiStreaming}
                        title="Перезапустить анализ"
                        style={{
                          background: 'none', border: '1px solid #30363d', borderRadius: 5,
                          color: '#7ee787', padding: '3px 8px', fontSize: 10, cursor: 'pointer',
                          fontFamily: 'inherit', opacity: aiStreaming ? 0.5 : 1,
                        }}>↻ rerun</button>
                    )}
                    <span style={{ color: '#8b949e', fontSize: 12, marginLeft: 4 }}>{aiPanelOpen ? '▾' : '▸'}</span>
                  </div>

                  {/* Body */}
                  {aiPanelOpen && (
                    <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
                      {/* Content area */}
                      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 14px', fontSize: 12, lineHeight: 1.55 }}>
                        {aiError ? (
                          <div style={{ color: '#ff7b72' }}>
                            <div style={{ color: '#8b949e' }}>$ ai --analyze</div>
                            <div style={{ marginTop: 6 }}>ERROR: {aiError}</div>
                          </div>
                        ) : !aiText && !aiStreaming ? (
                          <div style={{ color: '#8b949e' }}>
                            <div>$ ai --watch</div>
                            <div style={{ marginTop: 8 }}>Жду новых сообщений от клиента...</div>
                            <div style={{ marginTop: 4, fontSize: 10 }}>Анализ автоматически запустится при входящем. Или нажми ↻ rerun.</div>
                          </div>
                        ) : (
                          <div>
                            <div style={{ color: '#8b949e', marginBottom: 6 }}>$ ai --analyze deal-{deal.id.slice(0, 8)}</div>
                            <div style={{ whiteSpace: 'pre-wrap', color: '#c9d1d9' }}>
                              {aiText}
                              {aiStreaming && <span className="ai-cursor" style={{ display: 'inline-block', width: 7, height: 13, background: '#7ee787', verticalAlign: 'middle', marginLeft: 2 }} />}
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Action buttons vertical */}
                      {aiText && !aiStreaming && !aiError && (
                        <div style={{
                          borderLeft: '1px solid #21262d', padding: 10,
                          background: '#161b22', display: 'flex', flexDirection: 'column', gap: 6,
                          width: 150, flexShrink: 0,
                        }}>
                          <button onClick={copySuggestion}
                            style={{
                              background: '#21262d', border: '1px solid #30363d',
                              color: '#c9d1d9', padding: '8px 10px', borderRadius: 6,
                              cursor: 'pointer', fontSize: 11, fontFamily: 'inherit', fontWeight: 600,
                            }}>📋 Копировать</button>
                          <button onClick={insertSuggestionToInput}
                            style={{
                              background: '#238636', border: '1px solid #2ea043',
                              color: '#fff', padding: '8px 10px', borderRadius: 6,
                              cursor: 'pointer', fontSize: 11, fontFamily: 'inherit', fontWeight: 700,
                            }}>→ В поле ввода</button>
                        </div>
                      )}
                    </div>
                  )}

                  <style>{`
                    @keyframes ai-blink { 0%, 100% { opacity: 1 } 50% { opacity: 0 } }
                    .ai-cursor { animation: ai-blink 1s step-start infinite; }
                  `}</style>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

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

            {obExistingClient && (
              <div style={{ padding: '12px 16px', background: 'rgba(52,199,89,.06)', border: '1px solid rgba(52,199,89,.2)', borderRadius: 12, marginBottom: 16 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--green)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>Клиент найден в базе</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>{obExistingClient.name}</div>
                <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 6 }}>Платежи и расходы уже существуют. Можно только назначить куратора и TG группу.</div>
              </div>
            )}

            <div style={{ display: 'grid', gap: 14 }}>
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', marginBottom: 4, display: 'block' }}>Куратор</label>
                <select value={obCuratorId} onChange={e => setObCuratorId(e.target.value)}
                  style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--bor2)', fontSize: 13, fontFamily: 'inherit', background: 'var(--bg)' }}>
                  <option value="">Без куратора</option>
                  {curators.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>

              {!obExistingClient && (
                <>
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
                </>
              )}

              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', marginBottom: 4, display: 'block' }}>TG группа</label>
                <select value={obGroupChatId} onChange={e => setObGroupChatId(e.target.value)}
                  style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--bor2)', fontSize: 13, fontFamily: 'inherit', background: 'var(--bg)' }}>
                  <option value="">Не привязывать</option>
                  {availableGroups.map(g => <option key={g.chat_id} value={g.chat_id}>{g.title}</option>)}
                </select>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 8, marginTop: 20 }}>
              <button onClick={handleOnboardingSubmit} disabled={obSaving || (!obExistingClient && !obTotalAmount)}
                className="btn-p" style={{ flex: 1, padding: '10px', fontSize: 13, opacity: (!obExistingClient && !obTotalAmount) ? 0.5 : 1 }}>
                {obSaving ? 'Оформляем...' : obExistingClient ? 'Привязать и перенести' : 'Оформить'}
              </button>
              <button onClick={() => setOnboardingModal(null)} className="btn-s" style={{ padding: '10px 20px', fontSize: 13 }}>
                Отмена
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
