'use client'

import { useState, useRef, useEffect } from 'react'
import Link from 'next/link'
import { advanceStage, addActivity, toggleChecklist, updateClientField, addUniversity } from './actions'
import { removeFromShortlist, updateShortlistNote, updateShortlistStatus } from '@/app/curator/shortlist/actions'

interface Props {
  client: any
  stages: any[]
  clientStages: any[]
  universities: any[]
  documents: any[]
  activities: any[]
  checklist: any[]
  checklistProgress: any[]
  messages: any[]
  files: any[]
  shortlists: any[]
  curatorId: string
}

const badgeColors: Record<string, { bg: string; color: string }> = {
  'СТАРТ': { bg: 'rgba(177,94,204,.12)', color: 'var(--purple)' },
  'КЛЮЧЕВОЙ': { bg: 'rgba(201,125,0,.12)', color: 'var(--gold)' },
  'СОЗВОН': { bg: 'rgba(0,136,204,.12)', color: '#0088cc' },
  'ЕСЛИ НУЖНО': { bg: 'rgba(142,142,147,.1)', color: 'var(--muted)' },
  'ЗАВЕРШЁН': { bg: 'rgba(22,163,97,.12)', color: 'var(--green)' },
  'ФИНАЛ': { bg: 'rgba(22,163,97,.12)', color: 'var(--green)' },
  'РАБОТА КУРАТОРА': { bg: 'rgba(177,94,204,.08)', color: 'var(--purple)' },
  'ДОКУМЕНТЫ': { bg: 'rgba(201,125,0,.08)', color: 'var(--gold)' },
  'ПОДАЧИ': { bg: 'rgba(0,136,204,.08)', color: '#0088cc' },
  'ЛЕГАЛИЗАЦИЯ': { bg: 'rgba(22,163,97,.08)', color: 'var(--green)' },
}

const activityIcon: Record<string, string> = {
  note: '📝', stage_change: '→', system: '⚙️', call: '📞',
  message: '💬', file_upload: '📎', task_done: '✅', checklist: '☑️',
}

const docStatusLabel: Record<string, { label: string; color: string; bg: string }> = {
  missing: { label: 'Не получен', color: 'var(--red)', bg: 'rgba(220,53,69,.08)' },
  received: { label: 'Получен', color: 'var(--green)', bg: 'rgba(22,163,97,.08)' },
  translating: { label: 'На переводе', color: 'var(--gold)', bg: 'rgba(201,125,0,.08)' },
  translated: { label: 'Переведён', color: '#0088cc', bg: 'rgba(0,136,204,.08)' },
  notarized: { label: 'Заверен', color: 'var(--green)', bg: 'rgba(22,163,97,.08)' },
  uploaded_to_uni: { label: 'Загружен в вуз', color: 'var(--purple)', bg: 'rgba(177,94,204,.08)' },
}

const uniStatusLabel: Record<string, { label: string; color: string; bg: string }> = {
  planned: { label: 'Планируется', color: 'var(--muted)', bg: 'rgba(142,142,147,.1)' },
  applied: { label: 'Подано', color: '#0088cc', bg: 'rgba(0,136,204,.1)' },
  offer_received: { label: 'Оффер', color: 'var(--gold)', bg: 'rgba(201,125,0,.1)' },
  rejected: { label: 'Отказ', color: 'var(--red)', bg: 'rgba(220,53,69,.1)' },
  accepted: { label: 'Принят', color: 'var(--green)', bg: 'rgba(22,163,97,.1)' },
}

const cardStyle: React.CSSProperties = { background: 'var(--surf)', border: '1px solid var(--bor2)', borderRadius: 14, padding: '16px 20px' }
const sectionTitle: React.CSSProperties = { fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--muted)', marginBottom: 12 }

// Telegram-like sender colors
const SENDER_COLORS = ['#E17076', '#7BC862', '#65AADD', '#EE7AAE', '#A695E7', '#FAA774', '#6EC9CB', '#E5BC60']
function colorForSender(name: string | null | undefined): string {
  if (!name) return SENDER_COLORS[0]
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0
  return SENDER_COLORS[hash % SENDER_COLORS.length]
}

export function ClientCard({ client, stages, clientStages, universities, documents, activities, checklist, checklistProgress, messages, files, shortlists, curatorId }: Props) {
  const [tab, setTab] = useState<'info' | 'activity' | 'universities' | 'shortlist' | 'documents' | 'chat'>('info')
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const [editingField, setEditingField] = useState<string | null>(null)
  const [fieldDraft, setFieldDraft] = useState('')
  const [showAddUni, setShowAddUni] = useState(false)
  const [saving, setSaving] = useState(false)
  const [noteText, setNoteText] = useState('')

  const currentStageCode = client.current_stage_code
  const currentStageIdx = stages.findIndex(s => s.code === currentStageCode)
  const currentStage = currentStageIdx >= 0 ? stages[currentStageIdx] : null
  const nextStage = currentStageIdx >= 0 && currentStageIdx < stages.length - 1 ? stages[currentStageIdx + 1] : null

  // Checklist grouped by stage
  const checklistByStage: Record<string, any[]> = {}
  checklist.forEach(c => {
    if (!checklistByStage[c.stage_id]) checklistByStage[c.stage_id] = []
    checklistByStage[c.stage_id].push(c)
  })
  const progressSet = new Set(checklistProgress.filter(p => p.is_done).map(p => p.checklist_id))

  async function handleAdvanceStage() {
    if (!nextStage || saving) return
    setSaving(true)
    const fd = new FormData()
    fd.append('client_id', String(client.id))
    fd.append('stage_code', nextStage.code)
    await advanceStage(fd)
    setSaving(false)
  }

  async function handleSetStage(code: string) {
    if (code === currentStageCode || saving) return
    setSaving(true)
    const fd = new FormData()
    fd.append('client_id', String(client.id))
    fd.append('stage_code', code)
    await advanceStage(fd)
    setSaving(false)
  }

  async function handleAddNote() {
    if (!noteText.trim() || saving) return
    setSaving(true)
    const fd = new FormData()
    fd.append('client_id', String(client.id))
    fd.append('content', noteText)
    await addActivity(fd)
    setNoteText('')
    setSaving(false)
  }

  async function handleToggleChecklist(checklistId: string, isDone: boolean) {
    const fd = new FormData()
    fd.append('client_id', String(client.id))
    fd.append('checklist_id', checklistId)
    fd.append('is_done', String(!isDone))
    await toggleChecklist(fd)
  }

  // Auto-scroll chat
  useEffect(() => {
    if (tab === 'chat') messagesEndRef.current?.scrollIntoView({ behavior: 'instant' as ScrollBehavior })
  }, [tab, messages.length])

  const tabs = [
    { key: 'info' as const, label: 'Основное' },
    { key: 'chat' as const, label: `Чат${messages.length > 0 ? ` (${messages.length})` : ''}` },
    { key: 'universities' as const, label: `Вузы (${universities.length})` },
    { key: 'shortlist' as const, label: `Подборка (${shortlists.length})` },
    { key: 'documents' as const, label: `Документы (${documents.length})` },
    { key: 'activity' as const, label: `Активность (${activities.length})` },
  ]

  return (
    <div className="main" style={{ display: 'flex', flexDirection: 'column' }}>
      {/* Top bar */}
      <div className="topbar" style={{ gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Link href="/curator/clients" style={{ color: 'var(--muted)', textDecoration: 'none', fontSize: 13 }}>&larr; Клиенты</Link>
          <span style={{ color: 'var(--bor2)' }}>/</span>
          <span className="pt">{client.name}</span>
        </div>
        {currentStage && (
          <div style={{
            padding: '4px 12px', borderRadius: 8, fontSize: 11, fontWeight: 700,
            color: (badgeColors[currentStage.badge] || badgeColors['СТАРТ']).color,
            background: (badgeColors[currentStage.badge] || badgeColors['СТАРТ']).bg,
          }}>
            {currentStage.title}
          </div>
        )}
      </div>

      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* ═══ Left panel — client info + stages ═══ */}
        <div style={{ width: 300, minWidth: 300, borderRight: '1px solid var(--bor2)', display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>

          {/* Contact header */}
          <div style={{ padding: '20px', borderBottom: '1px solid var(--bor2)' }}>
            <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text)', marginBottom: 8 }}>{client.name}</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {client.phone && (
                <a href={`tel:${client.phone}`} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '6px 12px', borderRadius: 8, background: 'rgba(177,94,204,.06)', border: '1px solid rgba(177,94,204,.15)', color: 'var(--purple)', textDecoration: 'none', fontSize: 12, fontWeight: 600 }}>
                  {client.phone}
                </a>
              )}
              {client.telegram && (
                <a href={`https://t.me/${client.telegram.replace('@', '')}`} target="_blank" rel="noopener" style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '6px 12px', borderRadius: 8, background: 'rgba(0,136,204,.06)', border: '1px solid rgba(0,136,204,.15)', color: '#0088cc', textDecoration: 'none', fontSize: 12, fontWeight: 600 }}>
                  TG {client.telegram}
                </a>
              )}
              {client.email && (
                <a href={`mailto:${client.email}`} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '6px 12px', borderRadius: 8, background: 'rgba(0,0,0,.03)', border: '1px solid var(--bor2)', color: 'var(--muted)', textDecoration: 'none', fontSize: 12, fontWeight: 600 }}>
                  {client.email}
                </a>
              )}
            </div>
          </div>

          {/* Details */}
          <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--bor2)' }}>
            <div style={{ display: 'grid', gap: 8, fontSize: 12 }}>
              {[
                ['Страна', 'country', client.country],
                ['Университет', 'university', client.university],
              ].map(([label, field, val]) => (
                <div key={field as string} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ color: 'var(--muted)' }}>{label}</span>
                  {editingField === field ? (
                    <form onSubmit={async (e) => {
                      e.preventDefault()
                      const fd = new FormData()
                      fd.append('client_id', String(client.id))
                      fd.append('field', field as string)
                      fd.append('value', fieldDraft)
                      await updateClientField(fd)
                      setEditingField(null)
                    }} style={{ display: 'flex', gap: 4 }}>
                      <input value={fieldDraft} onChange={e => setFieldDraft(e.target.value)} autoFocus
                        style={{ width: 120, padding: '3px 6px', borderRadius: 6, border: '1px solid var(--bor2)', fontSize: 12, fontFamily: 'inherit', outline: 'none' }} />
                      <button type="submit" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--green)', fontSize: 14 }}>✓</button>
                      <button type="button" onClick={() => setEditingField(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: 14 }}>×</button>
                    </form>
                  ) : (
                    <span onClick={() => { setEditingField(field as string); setFieldDraft((val as string) || '') }}
                      style={{ fontWeight: 600, cursor: 'pointer', borderBottom: '1px dashed var(--bor2)' }}
                      title="Нажмите чтобы изменить">
                      {val || '—'}
                    </span>
                  )}
                </div>
              ))}
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--muted)' }}>Статус</span>
                <span style={{
                  padding: '2px 8px', borderRadius: 6, fontSize: 10, fontWeight: 700,
                  background: client.status === 'active' ? 'rgba(22,163,97,.1)' : 'rgba(142,142,147,.1)',
                  color: client.status === 'active' ? 'var(--green)' : 'var(--muted)',
                }}>
                  {client.status === 'active' ? 'Активен' : 'Завершён'}
                </span>
              </div>
            </div>
          </div>

          {/* Stage pipeline */}
          <div style={{ padding: '16px 20px' }}>
            <div style={sectionTitle}>Этапы работы</div>
            <div style={{ display: 'grid', gap: 4 }}>
              {stages.map((s, i) => {
                const isCurrent = s.code === currentStageCode
                const isPast = currentStageIdx >= 0 && i < currentStageIdx
                const colors = badgeColors[s.badge] || badgeColors['СТАРТ']
                const stageChecklist = checklistByStage[s.id] || []
                const doneCnt = stageChecklist.filter(c => progressSet.has(c.id)).length
                return (
                  <button key={s.id} onClick={() => handleSetStage(s.code)}
                    disabled={saving}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 8,
                      padding: '7px 10px', borderRadius: 8, border: 'none',
                      background: isCurrent ? colors.bg : 'transparent',
                      cursor: isCurrent ? 'default' : 'pointer',
                      fontFamily: 'inherit', textAlign: 'left',
                      transition: 'background .15s',
                      opacity: saving ? 0.6 : 1,
                    }}>
                    <div style={{
                      width: 20, height: 20, borderRadius: '50%', flexShrink: 0,
                      background: isPast ? 'var(--green)' : isCurrent ? colors.color : 'var(--bor2)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      border: isCurrent ? `2px solid ${colors.color}` : 'none',
                    }}>
                      {isPast && <svg viewBox="0 0 9 7" fill="none" stroke="white" strokeWidth="2" width="10" height="10"><polyline points="1,3.5 3.5,6 8,1" /></svg>}
                      {isCurrent && <div style={{ width: 8, height: 8, borderRadius: '50%', background: colors.color }} />}
                      {!isPast && !isCurrent && <span style={{ fontSize: 8, color: '#fff', fontWeight: 700 }}>{i + 1}</span>}
                    </div>
                    <div style={{ flex: 1 }}>
                      <span style={{ fontSize: 11, fontWeight: isCurrent ? 700 : 400, color: isCurrent ? colors.color : isPast ? 'var(--text)' : 'var(--muted)' }}>
                        {s.title}
                      </span>
                      {s.is_optional && <span style={{ fontSize: 9, color: 'var(--muted)', marginLeft: 6 }}>опц.</span>}
                      {stageChecklist.length > 0 && (
                        <span style={{ fontSize: 9, color: doneCnt === stageChecklist.length ? 'var(--green)' : 'var(--muted)', marginLeft: 6 }}>
                          {doneCnt}/{stageChecklist.length}
                        </span>
                      )}
                    </div>
                    {isCurrent && <span style={{ fontSize: 9, color: colors.color, fontWeight: 700 }}>СЕЙЧАС</span>}
                  </button>
                )
              })}
            </div>

            {nextStage && (
              <button onClick={handleAdvanceStage} disabled={saving} className="btn-p"
                style={{ width: '100%', marginTop: 12, fontSize: 12, padding: '10px' }}>
                {saving ? '...' : `Перевести на: ${nextStage.title}`}
              </button>
            )}

            {!nextStage && currentStageIdx === stages.length - 1 && (
              <div style={{ marginTop: 12, textAlign: 'center', padding: '10px', background: 'rgba(22,163,97,.08)', borderRadius: 10, fontSize: 12, fontWeight: 600, color: 'var(--green)' }}>
                Все этапы завершены
              </div>
            )}
          </div>
        </div>

        {/* ═══ Right panel — tabs ═══ */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
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

          <div style={{ flex: 1, overflowY: 'auto', padding: '20px' }}>

            {/* ═══ TAB: Основное ═══ */}
            {tab === 'info' && (
              <div>
                {/* Progress bar */}
                <div style={sectionTitle}>Прогресс</div>
                <div style={{ ...cardStyle, marginBottom: 20 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 2, marginBottom: 12 }}>
                    {stages.map((s, i) => {
                      const isPast = currentStageIdx >= 0 && i < currentStageIdx
                      const isCurrent = s.code === currentStageCode
                      const colors = badgeColors[s.badge] || badgeColors['СТАРТ']
                      return (
                        <div key={s.id} style={{ flex: 1 }}>
                          <div style={{
                            height: 6, borderRadius: 3,
                            background: isPast ? 'var(--green)' : isCurrent ? colors.color : 'var(--bor)',
                            opacity: isPast || isCurrent ? 1 : 0.3,
                          }} />
                        </div>
                      )
                    })}
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>
                        {currentStage ? currentStage.title : 'Не начат'}
                      </span>
                      {currentStage?.subtitle && (
                        <span style={{ fontSize: 11, color: 'var(--muted)', marginLeft: 8 }}>{currentStage.subtitle}</span>
                      )}
                    </div>
                    <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--purple)' }}>
                      {currentStageIdx >= 0 ? currentStageIdx + 1 : 0}/{stages.length}
                    </span>
                  </div>
                </div>

                {/* Checklist for current stage */}
                {currentStage && (checklistByStage[currentStage.id] || []).length > 0 && (
                  <>
                    <div style={sectionTitle}>Чеклист: {currentStage.title}</div>
                    <div style={{ ...cardStyle, marginBottom: 20 }}>
                      <div style={{ display: 'grid', gap: 6 }}>
                        {(checklistByStage[currentStage.id] || []).map((item: any) => {
                          const isDone = progressSet.has(item.id)
                          return (
                            <div key={item.id}
                              onClick={() => handleToggleChecklist(item.id, isDone)}
                              style={{
                                display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px',
                                borderRadius: 8, cursor: 'pointer',
                                background: isDone ? 'rgba(22,163,97,.04)' : 'transparent',
                                border: `1px solid ${isDone ? 'rgba(22,163,97,.15)' : 'var(--bor)'}`,
                              }}>
                              <div style={{
                                width: 18, height: 18, borderRadius: 5, flexShrink: 0,
                                background: isDone ? 'var(--green)' : 'transparent',
                                border: isDone ? 'none' : '2px solid var(--bor2)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                              }}>
                                {isDone && <svg viewBox="0 0 9 7" fill="none" stroke="white" strokeWidth="2" width="9" height="9"><polyline points="1,3.5 3.5,6 8,1" /></svg>}
                              </div>
                              <span style={{
                                fontSize: 12, fontWeight: isDone ? 400 : 500,
                                color: isDone ? 'var(--muted)' : 'var(--text)',
                                textDecoration: isDone ? 'line-through' : 'none',
                              }}>
                                {item.text}
                              </span>
                              {item.external_link && (
                                <a href={item.external_link} target="_blank" rel="noopener"
                                  onClick={e => e.stopPropagation()}
                                  style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--purple)', textDecoration: 'none', fontWeight: 600 }}>
                                  Ссылка
                                </a>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  </>
                )}

                {/* Client notes */}
                {client.notes && (
                  <div style={{ ...cardStyle, marginBottom: 20, background: 'rgba(201,125,0,.04)', borderColor: 'rgba(201,125,0,.15)' }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--gold)', marginBottom: 6 }}>ЗАМЕТКИ</div>
                    <div style={{ fontSize: 12, color: 'var(--text)', whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>{client.notes}</div>
                  </div>
                )}

                {/* Quick info grid */}
                <div style={sectionTitle}>Информация</div>
                <div style={{ ...cardStyle }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, fontSize: 13 }}>
                    {[
                      ['Имя', client.name],
                      ['Страна', client.country],
                      ['Университет', client.university],
                      ['Telegram', client.telegram, '#0088cc'],
                      ['Телефон', client.phone],
                      ['Email', client.email],
                    ].map(([label, val, color]) => (
                      <div key={label as string}>
                        <div style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 600, marginBottom: 4 }}>{label}</div>
                        <div style={{ fontWeight: 600, color: (color as string) || 'var(--text)' }}>{val || '—'}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* ═══ TAB: Чат ═══ */}
            {tab === 'chat' && (
              <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 160px)' }}>
                {/* Chat title */}
                {client.tg_group_title && (
                  <div style={{ padding: '8px 14px', marginBottom: 10, background: 'rgba(0,136,204,.06)', border: '1px solid rgba(0,136,204,.15)', borderRadius: 10, fontSize: 12, color: '#0088cc', fontWeight: 600 }}>
                    {client.tg_group_title}
                  </div>
                )}

                {messages.length > 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: 1, overflowY: 'auto', paddingBottom: 12 }}>
                    {messages.map((m: any) => {
                      const attachedFile = m.file_id ? files.find((f: any) => f.id === m.file_id) : null
                      const isImage = attachedFile?.mime_type?.startsWith('image/')
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

                            {m.content && (
                              <div style={{ fontSize: 13, padding: attachedFile && isImage ? '4px 8px 0' : 0 }}>{m.content}</div>
                            )}

                            <div style={{ fontSize: 9, marginTop: 4, opacity: 0.6, textAlign: 'right', padding: attachedFile && isImage ? '0 8px 4px' : 0 }}>
                              {new Date(m.created_at).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
                              {' · '}
                              {new Date(m.created_at).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}
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
                    <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 6 }}>
                      {client.tg_group_chat_id ? 'Нет сообщений' : 'Чат не привязан'}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                      {client.tg_group_chat_id ? 'Сообщения из группы будут появляться здесь' : 'Группа Telegram будет привязана автоматически при создании рабочего чата'}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ═══ TAB: Университеты ═══ */}
            {tab === 'universities' && (
              <div>
                {/* Add university button/form */}
                {showAddUni ? (
                  <form onSubmit={async (e) => {
                    e.preventDefault()
                    const fd = new FormData(e.currentTarget)
                    fd.append('client_id', String(client.id))
                    await addUniversity(fd)
                    setShowAddUni(false)
                  }} style={{ ...cardStyle, marginBottom: 16 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', marginBottom: 12 }}>Добавить университет</div>
                    <div style={{ display: 'grid', gap: 10 }}>
                      <input name="university_name" required placeholder="Название вуза *" style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid var(--bor2)', fontSize: 12, fontFamily: 'inherit', outline: 'none', background: 'var(--bg)' }} />
                      <input name="program_name" placeholder="Программа" style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid var(--bor2)', fontSize: 12, fontFamily: 'inherit', outline: 'none', background: 'var(--bg)' }} />
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                        <input name="country" placeholder="Страна" style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid var(--bor2)', fontSize: 12, fontFamily: 'inherit', outline: 'none', background: 'var(--bg)' }} />
                        <input name="deadline" type="date" placeholder="Дедлайн" style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid var(--bor2)', fontSize: 12, fontFamily: 'inherit', outline: 'none', background: 'var(--bg)' }} />
                        <select name="priority" style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid var(--bor2)', fontSize: 12, fontFamily: 'inherit', background: 'var(--bg)' }}>
                          <option value="">Приоритет</option>
                          <option value="1">1</option>
                          <option value="2">2</option>
                          <option value="3">3</option>
                        </select>
                      </div>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button type="submit" className="btn-p" style={{ flex: 1, fontSize: 12, padding: '8px' }}>Добавить</button>
                        <button type="button" onClick={() => setShowAddUni(false)} className="btn-s" style={{ padding: '8px 16px', fontSize: 12 }}>Отмена</button>
                      </div>
                    </div>
                  </form>
                ) : (
                  <button onClick={() => setShowAddUni(true)} className="btn-s" style={{ marginBottom: 16, fontSize: 12 }}>
                    + Добавить университет
                  </button>
                )}

                {universities.length === 0 && !showAddUni ? (
                  <div style={{ textAlign: 'center', padding: 40, color: 'var(--muted)', fontSize: 13 }}>
                    Нет привязанных университетов
                  </div>
                ) : universities.length > 0 ? (
                  <div style={{ display: 'grid', gap: 10 }}>
                    {universities.map((u: any) => {
                      const daysLeft = u.deadline ? Math.round((new Date(u.deadline).getTime() - Date.now()) / 86400000) : null
                      const st = uniStatusLabel[u.status] || uniStatusLabel['planned']
                      return (
                        <div key={u.id} style={{ ...cardStyle }}>
                          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
                            {u.priority && (
                              <div style={{
                                width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
                                background: u.priority === 1 ? 'var(--purple)' : u.priority === 2 ? 'var(--gold)' : 'var(--bor2)',
                                color: '#fff', fontSize: 12, fontWeight: 800,
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                              }}>
                                {u.priority}
                              </div>
                            )}
                            <div style={{ flex: 1 }}>
                              <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>{u.university_name}</div>
                              {u.program_name && <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>{u.program_name}</div>}
                              <div style={{ display: 'flex', gap: 12, marginTop: 8, fontSize: 11, color: 'var(--muted)' }}>
                                {u.country && <span>{u.country}{u.city ? `, ${u.city}` : ''}</span>}
                                {u.language && <span>{u.language}</span>}
                                {u.tuition_per_year && <span style={{ fontWeight: 600 }}>{Number(u.tuition_per_year).toLocaleString('ru')} {u.currency || ''}/год</span>}
                              </div>
                            </div>
                            <div style={{ textAlign: 'right', flexShrink: 0 }}>
                              <span style={{ padding: '3px 10px', borderRadius: 6, fontSize: 10, fontWeight: 700, background: st.bg, color: st.color }}>
                                {st.label}
                              </span>
                              {u.deadline && (
                                <div style={{ marginTop: 6 }}>
                                  <div style={{
                                    fontSize: 12, fontWeight: 700,
                                    color: daysLeft !== null && daysLeft < 0 ? 'var(--red)' : daysLeft !== null && daysLeft <= 7 ? 'var(--red)' : daysLeft !== null && daysLeft <= 14 ? 'var(--gold)' : 'var(--muted)',
                                  }}>
                                    {daysLeft !== null && daysLeft >= 0 ? `${daysLeft}д` : daysLeft !== null && daysLeft < 0 ? 'Просрочен' : ''}
                                  </div>
                                  <div style={{ fontSize: 10, color: 'var(--muted)' }}>{u.deadline}</div>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                ) : null}
              </div>
            )}

            {/* ═══ TAB: Подборка программ (из базы вузов) ═══ */}
            {tab === 'shortlist' && (
              <ShortlistBlock shortlists={shortlists} clientId={client.id} />
            )}

            {/* ═══ TAB: Документы ═══ */}
            {tab === 'documents' && (
              <div>
                {documents.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: 40, color: 'var(--muted)', fontSize: 13 }}>
                    Нет документов
                  </div>
                ) : (
                  <div style={{ display: 'grid', gap: 8 }}>
                    {documents.map((d: any) => {
                      const st = docStatusLabel[d.status] || docStatusLabel['missing']
                      return (
                        <div key={d.id} style={{
                          ...cardStyle,
                          display: 'flex', alignItems: 'center', gap: 12,
                        }}>
                          <div style={{ fontSize: 20 }}>
                            {d.status === 'missing' ? '📋' : d.status === 'received' ? '📄' : d.status === 'uploaded_to_uni' ? '✅' : '📝'}
                          </div>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{d.title || d.doc_type}</div>
                            {d.notes && <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 2 }}>{d.notes}</div>}
                            {d.translation_needed && (
                              <span style={{ fontSize: 9, padding: '1px 6px', borderRadius: 4, background: 'rgba(201,125,0,.08)', color: 'var(--gold)', fontWeight: 600, marginTop: 4, display: 'inline-block' }}>
                                Нужен перевод
                              </span>
                            )}
                          </div>
                          <span style={{ padding: '3px 10px', borderRadius: 6, fontSize: 10, fontWeight: 700, background: st.bg, color: st.color }}>
                            {st.label}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )}

            {/* ═══ TAB: Активность ═══ */}
            {tab === 'activity' && (
              <div>
                {/* Add note */}
                <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
                  <input
                    value={noteText}
                    onChange={e => setNoteText(e.target.value)}
                    placeholder="Добавить заметку..."
                    onKeyDown={e => e.key === 'Enter' && handleAddNote()}
                    style={{ flex: 1, padding: '10px 14px', border: '1px solid var(--bor2)', borderRadius: 10, fontSize: 13, fontFamily: 'inherit', outline: 'none', background: 'var(--bg)' }}
                  />
                  <button onClick={handleAddNote} disabled={saving || !noteText.trim()} className="btn-p" style={{ padding: '10px 20px', fontSize: 12 }}>
                    {saving ? '...' : 'Добавить'}
                  </button>
                </div>

                {/* Activity feed */}
                {activities.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: 40, color: 'var(--muted)', fontSize: 13 }}>
                    Нет записей в активности
                  </div>
                ) : (
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
                          <div style={{ fontSize: 13, color: a.activity_type === 'stage_change' ? 'var(--purple)' : 'var(--text)', fontWeight: a.activity_type === 'stage_change' ? 600 : 400 }}>
                            {a.content}
                          </div>
                        </div>
                        <span style={{ fontSize: 10, color: 'var(--muted)', whiteSpace: 'nowrap', flexShrink: 0 }}>
                          {new Date(a.created_at).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

/* ═══ Подборка программ из базы вузов ═══ */

const SHORTLIST_STATUS: Record<string, { label: string; color: string; bg: string }> = {
  shortlisted: { label: 'В подборке', color: 'var(--purple)', bg: 'rgba(177,94,204,.1)' },
  applied: { label: 'Подано', color: '#0088cc', bg: 'rgba(0,136,204,.1)' },
  offered: { label: 'Оффер', color: 'var(--gold)', bg: 'rgba(201,125,0,.1)' },
  rejected: { label: 'Отказ', color: 'var(--red)', bg: 'rgba(220,53,69,.1)' },
  accepted: { label: 'Принят', color: 'var(--green)', bg: 'rgba(22,163,97,.1)' },
}

const COUNTRY_RU: Record<string, string> = {
  ca: 'Канада', au: 'Австралия', gb: 'Великобритания', de: 'Германия', us: 'США',
}

function ShortlistBlock({ shortlists, clientId }: { shortlists: any[]; clientId: number }) {
  if (shortlists.length === 0) {
    return (
      <div style={{ ...cardStyle, textAlign: 'center', padding: 40, color: 'var(--muted)' }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 6 }}>
          Подборка пока пустая
        </div>
        <div style={{ fontSize: 13, marginBottom: 14 }}>
          Открой базу вузов и добавь подходящие программы.
        </div>
        <Link href="/curator/universities" className="btn-p" style={{ fontSize: 12 }}>
          → Открыть базу вузов
        </Link>
      </div>
    )
  }

  return (
    <div style={{ display: 'grid', gap: 10 }}>
      {shortlists.map(s => (
        <ShortlistRow key={s.id} row={s} clientId={clientId} />
      ))}
    </div>
  )
}

function ShortlistRow({ row, clientId }: { row: any; clientId: number }) {
  const [noteDraft, setNoteDraft] = useState(row.note || '')
  const [noteEditing, setNoteEditing] = useState(false)
  const [busy, setBusy] = useState(false)
  const st = SHORTLIST_STATUS[row.status] || SHORTLIST_STATUS.shortlisted
  const country = COUNTRY_RU[(row.country_code || '').toLowerCase()] || (row.country_code || '').toUpperCase()

  async function handleDelete() {
    if (busy || !confirm('Убрать программу из подборки?')) return
    setBusy(true)
    try { await removeFromShortlist(row.id, clientId) } finally { setBusy(false) }
  }

  async function handleStatus(next: string) {
    if (busy || next === row.status) return
    setBusy(true)
    try { await updateShortlistStatus(row.id, clientId, next as any) } finally { setBusy(false) }
  }

  async function handleNoteSave() {
    if (busy) return
    setBusy(true)
    try {
      await updateShortlistNote(row.id, clientId, noteDraft.trim())
      setNoteEditing(false)
    } finally { setBusy(false) }
  }

  return (
    <div style={cardStyle}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 260px', minWidth: 0 }}>
          <Link
            href={`/curator/universities/${row.school_id}`}
            style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', textDecoration: 'none' }}
          >
            {row.school_name}
          </Link>
          <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>
            {row.program_name}
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 8, fontSize: 11, color: 'var(--muted)' }}>
            {country && <span>📍 {country}</span>}
            {row.tuition != null && (
              <span>💵 {Math.round(Number(row.tuition)).toLocaleString('ru')} {row.currency || ''}/год</span>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
          <select
            value={row.status}
            onChange={(e) => handleStatus(e.target.value)}
            disabled={busy}
            style={{
              padding: '4px 10px', borderRadius: 20, fontSize: 10, fontWeight: 700,
              color: st.color, background: st.bg, border: `1px solid ${st.color}`,
              outline: 'none', cursor: 'pointer', fontFamily: 'inherit',
              appearance: 'none',
            }}
          >
            {Object.entries(SHORTLIST_STATUS).map(([k, v]) => (
              <option key={k} value={k} style={{ color: 'var(--text)', background: 'var(--surf)' }}>
                {v.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={handleDelete}
            disabled={busy}
            style={{
              background: 'none', border: 'none', padding: 0,
              color: 'var(--muted)', fontSize: 11, cursor: 'pointer', fontFamily: 'inherit',
            }}
            title="Убрать из подборки"
          >
            ✕ Убрать
          </button>
        </div>
      </div>

      <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--bor)' }}>
        {noteEditing ? (
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
            <textarea
              value={noteDraft}
              onChange={(e) => setNoteDraft(e.target.value)}
              placeholder="Заметка к этой программе…"
              rows={2}
              style={{
                flex: 1, padding: '8px 12px',
                border: '1px solid var(--bor2)', borderRadius: 8,
                fontSize: 12, fontFamily: 'inherit', outline: 'none',
                background: 'var(--bg)', resize: 'vertical',
              }}
            />
            <button type="button" onClick={handleNoteSave} className="btn-p" style={{ fontSize: 11, padding: '6px 12px' }}>
              Сохранить
            </button>
            <button type="button" onClick={() => { setNoteDraft(row.note || ''); setNoteEditing(false) }} className="btn-s" style={{ fontSize: 11, padding: '6px 12px' }}>
              Отмена
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setNoteEditing(true)}
            style={{
              width: '100%', textAlign: 'left', background: 'none',
              border: 'none', padding: 0, fontFamily: 'inherit',
              fontSize: 12, color: row.note ? 'var(--text)' : 'var(--muted)',
              cursor: 'pointer', lineHeight: 1.5,
            }}
          >
            {row.note || '+ Добавить заметку'}
          </button>
        )}
      </div>
    </div>
  )
}
