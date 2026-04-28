'use client'

import Link from 'next/link'
import { useState, useTransition } from 'react'
import {
  addApplicationNote,
  updateApplicationStage,
  setApplicationDecision,
  addApplicationDocument,
  updateApplicationDocumentStatus,
  uploadApplicationDocument,
  deleteApplicationDocument,
  getApplicationDocumentDownloadUrl,
  type AppStage,
  type AppDecision,
  type AppDocStatus,
} from '@/app/curator/applications/actions'

const GLOBAL_DOC_LABELS: Record<string, string> = {
  passport: 'Паспорт',
  diploma: 'Диплом',
  transcript: 'Транскрипт',
  attestat: 'Аттестат',
  ielts: 'IELTS / TOEFL',
  recommendation: 'Рекомендательное письмо',
}

const ESSAY_STATUS_TO_DOC_STATUS: Record<string, 'approved' | 'in_review' | 'pending'> = {
  approved: 'approved',
  sent: 'in_review',
  editing: 'in_review',
  draft: 'pending',
}

const STAGE_LABELS: Record<AppStage, string> = {
  created: 'Заявка создана',
  docs_collected: 'Документы загружены',
  fee_paid: 'Application fee оплачен',
  submitted: 'Подано в вуз',
  decision: 'Решение получено',
}

const STAGE_ORDER: AppStage[] = ['created', 'docs_collected', 'fee_paid', 'submitted', 'decision']

const DECISION_LABELS: Record<AppDecision, string> = {
  offer: '🎉 Оффер',
  conditional_offer: 'Условный оффер',
  rejected: 'Отказ',
  waitlisted: 'Лист ожидания',
  withdrawn: 'Отозвано',
}

const DOC_STATUS_LABELS: Record<AppDocStatus, string> = {
  pending: 'Ожидает',
  in_review: 'На проверке',
  approved: 'Принято',
  rejected: 'Отклонено',
  optional: 'Опционально',
}

const DOC_STATUS_CHIP: Record<AppDocStatus, string> = {
  pending: 'ds-chip-warning',
  in_review: 'ds-chip-info',
  approved: 'ds-chip-success',
  rejected: 'ds-chip-error',
  optional: 'ds-chip-neutral',
}

const EVENT_LABELS: Record<string, string> = {
  stage_change: 'Смена стадии',
  note: 'Заметка куратора',
  school_message: 'Сообщение от вуза',
  doc_uploaded: 'Загружен документ',
  decision_set: 'Зафиксировано решение',
}

export function ApplicationView({
  app,
  documents,
  events,
  isCurator,
  clientId,
  globalDocs,
  essays,
  previewQuery = '',
}: {
  app: any
  documents: any[]
  events: any[]
  isCurator: boolean
  clientId: number
  globalDocs: any[]
  essays: any[]
  previewQuery?: string
}) {
  const stageIdx = STAGE_ORDER.indexOf(app.stage)

  // Свежее уведомление: последнее значимое событие за 14 дней
  const RECENT_DAYS = 14
  const cutoff = Date.now() - RECENT_DAYS * 24 * 60 * 60 * 1000
  const recentEvent = events.find(e =>
    (e.event_type === 'stage_change' || e.event_type === 'decision_set') &&
    new Date(e.created_at).getTime() >= cutoff
  )
  const isOfferDecision = app.decision === 'offer' || app.decision === 'conditional_offer'
  const isRejectDecision = app.decision === 'rejected'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Свежий апдейт от куратора */}
      {recentEvent && !isCurator && (
        <div style={{
          padding: '14px 18px',
          background: isOfferDecision
            ? 'linear-gradient(135deg, rgba(232,184,68,0.18) 0%, rgba(52,199,89,0.16) 100%)'
            : isRejectDecision
              ? 'var(--ds-error-soft)'
              : 'var(--ds-purple-soft)',
          border: `1px solid ${
            isOfferDecision ? 'rgba(232,184,68,0.4)' :
            isRejectDecision ? 'rgba(255,59,48,0.3)' :
            'var(--ds-purple)'
          }`,
          borderRadius: 'var(--ds-r-md)',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          boxShadow: isOfferDecision ? '0 4px 16px -6px rgba(232,184,68,0.25)' : 'none',
        }}>
          <div style={{ fontSize: 22, lineHeight: 1 }}>
            {isOfferDecision ? '🎉' : isRejectDecision ? '😔' : '🔔'}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.10em', textTransform: 'uppercase', color: 'var(--ds-muted)', marginBottom: 2 }}>
              Куратор обновил {new Date(recentEvent.created_at).toLocaleDateString('ru', { day: 'numeric', month: 'long' })}
            </div>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--ds-ink)' }}>
              {recentEvent.content || 'Изменения по заявке'}
            </div>
          </div>
        </div>
      )}

      {/* Hero — белая «приподнятая» карточка с тенью */}
      <div style={{
        padding: 32,
        background: '#fff',
        borderRadius: 'var(--ds-r-lg)',
        border: '1px solid var(--ds-border-soft)',
        boxShadow: '0 8px 32px -8px rgba(29,29,31,0.12), 0 2px 8px -2px rgba(29,29,31,0.06)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 20, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 240 }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--ds-purple)', marginBottom: 8 }}>
              Заявка
            </div>
            <h1 style={{ fontFamily: 'var(--ds-font-display-stack)', fontWeight: 700, fontSize: 32, textTransform: 'uppercase', letterSpacing: '0.02em', margin: 0, lineHeight: 1.1, color: 'var(--ds-ink)' }}>
              {app.university_name}
            </h1>
            {(app.program_name || app.country || app.intake) && (
              <div style={{ fontSize: 14, color: 'var(--ds-muted)', marginTop: 10 }}>
                {[app.program_name, app.country, app.intake].filter(Boolean).join(' · ')}
              </div>
            )}
            <div style={{ display: 'flex', gap: 24, marginTop: 14, flexWrap: 'wrap' }}>
              {app.app_deadline && (
                <div style={{ fontSize: 12 }}>
                  <span style={{ color: 'var(--ds-muted)' }}>Дедлайн: </span>
                  <b style={{ color: 'var(--ds-ink)' }}>{new Date(app.app_deadline).toLocaleDateString('ru')}</b>
                </div>
              )}
              {app.fee_amount && (
                <div style={{ fontSize: 12 }}>
                  <span style={{ color: 'var(--ds-muted)' }}>Application fee: </span>
                  <b style={{ color: 'var(--ds-ink)' }}>{app.fee_amount} {app.fee_currency || ''}</b>
                  {app.fee_paid_at && <span style={{ color: 'var(--ds-success-ink)', marginLeft: 8 }}>· оплачено</span>}
                </div>
              )}
            </div>
          </div>

          {app.decision && (
            <div style={{
              padding: '14px 20px',
              borderRadius: 12,
              background: app.decision === 'offer' || app.decision === 'conditional_offer'
                ? 'var(--ds-success-soft)'
                : app.decision === 'rejected' ? 'var(--ds-error-soft)' : 'var(--ds-bg-alt)',
              border: `1px solid ${
                app.decision === 'offer' || app.decision === 'conditional_offer'
                  ? 'rgba(52, 199, 89, 0.32)'
                  : app.decision === 'rejected' ? 'rgba(255, 59, 48, 0.32)' : 'var(--ds-border)'
              }`,
              alignSelf: 'flex-start',
            }}>
              <div style={{ fontSize: 11, color: 'var(--ds-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700 }}>Решение</div>
              <div style={{ fontSize: 18, fontWeight: 700, marginTop: 4, color: 'var(--ds-ink)' }}>
                {DECISION_LABELS[app.decision as AppDecision]}
              </div>
              {app.decision_at && (
                <div style={{ fontSize: 11, color: 'var(--ds-muted)', marginTop: 4 }}>
                  {new Date(app.decision_at).toLocaleDateString('ru')}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Stepper */}
        <div style={{ marginTop: 28, display: 'flex', gap: 8 }}>
          {STAGE_ORDER.map((s, i) => {
            const done = i <= stageIdx
            const current = i === stageIdx
            return (
              <div key={s} style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{
                  height: 6,
                  borderRadius: 3,
                  background: done ? 'var(--ds-purple)' : 'var(--ds-border)',
                }} />
                <div style={{
                  fontSize: 11,
                  fontWeight: current ? 700 : 500,
                  color: done ? 'var(--ds-ink)' : 'var(--ds-muted)',
                  lineHeight: 1.3,
                }}>
                  {STAGE_LABELS[s]}
                </div>
              </div>
            )
          })}
        </div>

        {isCurator && (
          <CuratorStageControls app={app} clientId={clientId} />
        )}
      </div>

      {/* Общие документы — серый «утопленный» (reference) */}
      <div style={{
        padding: 28,
        background: 'var(--ds-bg-alt)',
        borderRadius: 'var(--ds-r-lg)',
        border: '1px solid var(--ds-border-soft)',
        boxShadow: 'inset 0 1px 2px rgba(29,29,31,0.04)',
      }}>
        <GlobalDocsSummary
          globalDocs={globalDocs}
          essays={essays}
          previewQuery={previewQuery}
        />
      </div>

      {/* Доп. документы — белая «приподнятая» с тенью + purple-акцент */}
      <div style={{
        padding: 28,
        background: '#fff',
        borderRadius: 'var(--ds-r-lg)',
        border: '1px solid var(--ds-border-soft)',
        borderLeft: '4px solid var(--ds-purple)',
        boxShadow: '0 8px 32px -8px rgba(29,29,31,0.12), 0 2px 8px -2px rgba(29,29,31,0.06)',
      }}>
        <ExtraDocsSection
          applicationId={app.id}
          clientId={clientId}
          documents={documents}
          isCurator={isCurator}
        />
      </div>

      {/* Events / Timeline — серый «утопленный» (log) */}
      <div style={{
        padding: 28,
        background: 'var(--ds-bg-alt)',
        borderRadius: 'var(--ds-r-lg)',
        border: '1px solid var(--ds-border-soft)',
        boxShadow: 'inset 0 1px 2px rgba(29,29,31,0.04)',
      }}>
        <EventsSection
          applicationId={app.id}
          clientId={clientId}
          events={events}
          isCurator={isCurator}
        />
      </div>
    </div>
  )
}

function CuratorStageControls({ app, clientId }: { app: any; clientId: number }) {
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function changeStage(stage: AppStage) {
    start(async () => {
      const res = await updateApplicationStage({ applicationId: app.id, stage, clientId })
      if ('error' in res && res.error) setError(res.error)
    })
  }

  function setDecision(decision: AppDecision) {
    start(async () => {
      const res = await setApplicationDecision({ applicationId: app.id, decision, clientId })
      if ('error' in res && res.error) setError(res.error)
    })
  }

  return (
    <div style={{ marginTop: 24, paddingTop: 20, borderTop: '1px solid var(--ds-border-soft)', display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
      <label style={{ fontSize: 11, color: 'var(--ds-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700 }}>
        Стадия:
      </label>
      <select
        value={app.stage}
        onChange={(e) => changeStage(e.target.value as AppStage)}
        disabled={pending}
        className="ds-input"
        style={{ padding: '6px 10px', fontSize: 12, minWidth: 220 }}
      >
        {STAGE_ORDER.map(s => <option key={s} value={s}>{STAGE_LABELS[s]}</option>)}
      </select>

      {app.stage === 'decision' && (
        <>
          <label style={{ fontSize: 11, color: 'var(--ds-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700, marginLeft: 8 }}>
            Решение:
          </label>
          <select
            value={app.decision || ''}
            onChange={(e) => e.target.value && setDecision(e.target.value as AppDecision)}
            disabled={pending}
            className="ds-input"
            style={{ padding: '6px 10px', fontSize: 12, minWidth: 200 }}
          >
            <option value="">— Выбрать —</option>
            {(Object.keys(DECISION_LABELS) as AppDecision[]).map(d => (
              <option key={d} value={d}>{DECISION_LABELS[d]}</option>
            ))}
          </select>
        </>
      )}

      {error && <span style={{ fontSize: 12, color: 'var(--ds-error-ink)' }}>{error}</span>}
    </div>
  )
}

function GlobalDocsSummary({
  globalDocs, essays, previewQuery,
}: {
  globalDocs: any[]
  essays: any[]
  previewQuery: string
}) {
  const uploadedByType = new Map(globalDocs.map(d => [d.doc_type, d]))
  const resume = essays.find(e => e.type === 'resume')
  const motivation = essays.find(e => e.type === 'motivation')

  // Стандартные общие документы клиента
  const items: { key: string; label: string; status: AppDocStatus; meta?: string }[] = []
  for (const [key, label] of Object.entries(GLOBAL_DOC_LABELS)) {
    const d = uploadedByType.get(key)
    items.push({
      key,
      label,
      status: d?.storage_path ? 'approved' : 'pending',
      meta: d?.file_name || undefined,
    })
  }
  items.push({
    key: 'resume',
    label: 'Резюме',
    status: resume?.status ? ESSAY_STATUS_TO_DOC_STATUS[resume.status] || 'pending' : 'pending',
  })
  items.push({
    key: 'motivation',
    label: 'Мотивационное письмо',
    status: motivation?.status ? ESSAY_STATUS_TO_DOC_STATUS[motivation.status] || 'pending' : 'pending',
  })

  const ready = items.filter(i => i.status === 'approved').length

  return (
    <div>
      <header style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--ds-purple)' }}>
            Общие документы
          </div>
          <h2 style={{ fontFamily: 'var(--ds-font-display-stack)', fontWeight: 700, fontSize: 22, textTransform: 'uppercase', letterSpacing: '0.04em', margin: '6px 0 0', lineHeight: 1.1 }}>
            Готово · {ready} из {items.length}
          </h2>
          <p style={{ fontSize: 12, color: 'var(--ds-muted)', margin: '6px 0 0', maxWidth: 560, lineHeight: 1.5 }}>
            Загружаются один раз в кабинете и автоматически подтягиваются в каждую заявку. Чтобы изменить — иди в «Документы».
          </p>
        </div>
        <Link href={`/client/documents${previewQuery}`} className="ds-btn ds-btn-ghost" style={{ fontSize: 12 }}>
          Открыть раздел →
        </Link>
      </header>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 8 }}>
        {items.map(item => (
          <div
            key={item.key}
            style={{
              padding: '10px 12px',
              background: item.status === 'approved' ? 'rgba(52,199,89,0.10)' : 'var(--ds-bg)',
              border: `1px solid ${item.status === 'approved' ? 'rgba(52,199,89,0.32)' : 'var(--ds-border)'}`,
              borderRadius: 'var(--ds-r-md)',
              display: 'flex',
              alignItems: 'center',
              gap: 10,
            }}
          >
            <span style={{ fontSize: 16, lineHeight: 1 }}>
              {item.status === 'approved' ? '✓' : item.status === 'in_review' ? '◷' : '○'}
            </span>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--ds-ink)' }}>{item.label}</div>
              {item.meta && (
                <div style={{ fontSize: 10, color: 'var(--ds-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.meta}</div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function ExtraDocsSection({
  applicationId, clientId, documents, isCurator,
}: {
  applicationId: string
  clientId: number
  documents: any[]
  isCurator: boolean
}) {
  const [adding, setAdding] = useState(false)
  const [docType, setDocType] = useState('')
  const [title, setTitle] = useState('')
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function addDoc() {
    if (!docType.trim()) return
    start(async () => {
      const res = await addApplicationDocument({
        applicationId,
        docType,
        title: title || undefined,
        clientId,
      })
      if ('error' in res && res.error) setError(res.error)
      else {
        setDocType('')
        setTitle('')
        setAdding(false)
      }
    })
  }

  return (
    <div>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 16, gap: 16, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--ds-purple)' }}>
            Доп. документы для этой программы
          </div>
          <h2 style={{ fontFamily: 'var(--ds-font-display-stack)', fontWeight: 700, fontSize: 22, textTransform: 'uppercase', letterSpacing: '0.04em', margin: '6px 0 0', lineHeight: 1.1 }}>
            Запрошено · {documents.length}
          </h2>
          <p style={{ fontSize: 12, color: 'var(--ds-muted)', margin: '6px 0 0', maxWidth: 560, lineHeight: 1.5 }}>
            Только то, что специфично для этого вуза или программы (GTE statement, mortgage form, deposit receipt). Куратор скажет что нужно — подгрузишь сюда.
          </p>
        </div>
        {isCurator && !adding && (
          <button type="button" className="ds-btn ds-btn-ghost" onClick={() => setAdding(true)} title="Действие куратора — клиент это не видит">
            + Запросить у клиента
          </button>
        )}
      </header>

      {isCurator && adding && (
        <div style={{ padding: 14, background: 'var(--ds-purple-soft, rgba(181,127,207,0.08))', border: '1px solid var(--ds-purple)', borderRadius: 'var(--ds-r-md)', marginBottom: 14 }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--ds-purple-deep)', marginBottom: 10 }}>
            Куратор · запрос клиенту
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 160 }}>
              <label style={smallLabel}>Внутренний код *</label>
              <input
                type="text"
                value={docType}
                onChange={(e) => setDocType(e.target.value)}
                placeholder="gte_form / deposit_receipt / ..."
                className="ds-input"
                style={{ padding: '8px 12px', fontSize: 13, width: '100%' }}
              />
            </div>
            <div style={{ flex: 1, minWidth: 160 }}>
              <label style={smallLabel}>Название для клиента</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="GTE statement"
                className="ds-input"
                style={{ padding: '8px 12px', fontSize: 13, width: '100%' }}
              />
            </div>
            <button type="button" className="ds-btn ds-btn-primary" onClick={addDoc} disabled={pending}>
              {pending ? '...' : 'Запросить'}
            </button>
            <button type="button" className="ds-btn ds-btn-ghost" onClick={() => { setAdding(false); setError(null) }}>
              Отмена
            </button>
          </div>
        </div>
      )}

      {error && <div style={{ fontSize: 12, color: 'var(--ds-error-ink)', marginBottom: 10 }}>{error}</div>}

      {documents.length === 0 ? (
        <div style={{ padding: 24, textAlign: 'center', background: 'var(--ds-bg-alt)', border: '1px dashed var(--ds-border)', borderRadius: 'var(--ds-r-md)', color: 'var(--ds-muted)', fontSize: 13 }}>
          {isCurator
            ? 'Запросов пока нет. Жми «+ Запросить у клиента» если для этого вуза нужны специфичные документы (GTE, deposit receipt и т.п.).'
            : 'Куратор пока не запросил доп. документы. Когда что-то понадобится — появится здесь, и ты сможешь загрузить.'}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {documents.map(doc => (
            <DocRow key={doc.id} doc={doc} applicationId={applicationId} clientId={clientId} isCurator={isCurator} />
          ))}
        </div>
      )}
    </div>
  )
}

function DocRow({ doc, applicationId, clientId, isCurator }: { doc: any; applicationId: string; clientId: number; isCurator: boolean }) {
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function changeStatus(status: AppDocStatus) {
    start(async () => {
      const res = await updateApplicationDocumentStatus({ documentId: doc.id, status, applicationId, clientId })
      if ('error' in res && res.error) setError(res.error)
    })
  }

  async function download() {
    const res = await getApplicationDocumentDownloadUrl({ documentId: doc.id, applicationId, clientId })
    if ('error' in res && res.error) { setError(res.error); return }
    if ('url' in res && res.url) window.open(res.url, '_blank')
  }

  function remove() {
    if (!confirm(`Удалить документ "${doc.title || doc.doc_type}"?`)) return
    start(async () => {
      const res = await deleteApplicationDocument({ documentId: doc.id, applicationId, clientId })
      if ('error' in res && res.error) setError(res.error)
    })
  }

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const fd = new FormData()
    fd.set('application_id', applicationId)
    fd.set('document_id', doc.id)
    fd.set('client_id', String(clientId))
    fd.set('doc_type', doc.doc_type)
    fd.set('file', file)
    start(async () => {
      const res = await uploadApplicationDocument(fd)
      if ('error' in res && res.error) setError(res.error)
      e.target.value = ''
    })
  }

  const hasFile = !!doc.storage_path || !!doc.global_doc_id
  const status = (doc.status || 'pending') as AppDocStatus

  return (
    <div style={{ padding: '12px 14px', background: 'var(--ds-bg)', border: '1px solid var(--ds-border-soft)', borderRadius: 'var(--ds-r-md)', display: 'grid', gridTemplateColumns: '1fr auto auto', alignItems: 'center', gap: 12 }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ds-ink)' }}>
          {doc.title || doc.doc_type}
        </div>
        {doc.file_name && (
          <div style={{ fontSize: 11, color: 'var(--ds-muted)', marginTop: 2 }}>{doc.file_name}</div>
        )}
        {error && <div style={{ fontSize: 11, color: '#c33', marginTop: 4 }}>{error}</div>}
      </div>

      {isCurator ? (
        <select
          value={status}
          onChange={(e) => changeStatus(e.target.value as AppDocStatus)}
          disabled={pending}
          className="ds-input"
          style={{ padding: '4px 8px', fontSize: 11, minWidth: 130 }}
        >
          {(Object.keys(DOC_STATUS_LABELS) as AppDocStatus[]).map(s => (
            <option key={s} value={s}>{DOC_STATUS_LABELS[s]}</option>
          ))}
        </select>
      ) : (
        <span className={`ds-chip ${DOC_STATUS_CHIP[status]}`} style={{ textTransform: 'uppercase', fontSize: 10, fontWeight: 700, letterSpacing: '0.04em' }}>
          {DOC_STATUS_LABELS[status]}
        </span>
      )}

      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        {hasFile && (
          <button type="button" className="ds-btn ds-btn-ghost" onClick={download} style={{ fontSize: 11, padding: '4px 10px' }}>
            ↓ Скачать
          </button>
        )}
        {!isCurator && (
          <label className="ds-btn ds-btn-ghost" style={{ fontSize: 11, padding: '4px 10px', cursor: 'pointer' }}>
            {hasFile ? 'Заменить' : 'Загрузить'}
            <input type="file" hidden onChange={onFileChange} accept=".pdf,.jpg,.jpeg,.png" />
          </label>
        )}
        {!isCurator && !hasFile && (
          <span style={{ fontSize: 10, color: 'var(--ds-muted)', fontStyle: 'italic' }}>
            до 15 МБ · PDF/JPG/PNG
          </span>
        )}
        {isCurator && !hasFile && (
          <span style={{ fontSize: 11, color: 'var(--ds-muted)', fontStyle: 'italic' }}>
            ждём от клиента
          </span>
        )}
        {isCurator && (
          <button type="button" onClick={remove} disabled={pending} title="Убрать из чек-листа" style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--ds-muted)', fontSize: 14, padding: '0 4px' }}>×</button>
        )}
      </div>
    </div>
  )
}

function EventsSection({
  applicationId, clientId, events, isCurator,
}: {
  applicationId: string
  clientId: number
  events: any[]
  isCurator: boolean
}) {
  const [text, setText] = useState('')
  const [isSchool, setIsSchool] = useState(false)
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function add() {
    if (!text.trim()) return
    start(async () => {
      const res = await addApplicationNote({ applicationId, content: text, clientId, isSchoolMessage: isSchool })
      if ('error' in res && res.error) setError(res.error)
      else { setText(''); setIsSchool(false) }
    })
  }

  return (
    <div>
      <header style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--ds-purple)' }}>
          Лента событий
        </div>
        <h2 style={{ fontFamily: 'var(--ds-font-display-stack)', fontWeight: 700, fontSize: 22, textTransform: 'uppercase', letterSpacing: '0.04em', margin: '6px 0 0', lineHeight: 1.1 }}>
          История · {events.length}
        </h2>
      </header>

      {isCurator && (
        <div style={{ padding: 14, background: 'var(--ds-bg)', border: '1px solid var(--ds-border)', borderRadius: 'var(--ds-r-md)', marginBottom: 16 }}>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={isSchool ? 'Текст письма от вуза...' : 'Заметка по заявке...'}
            className="ds-input"
            rows={3}
            style={{ width: '100%', padding: '10px 12px', fontSize: 13, resize: 'vertical', boxSizing: 'border-box' }}
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 10, flexWrap: 'wrap', gap: 8 }}>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--ds-muted)' }}>
              <input type="checkbox" checked={isSchool} onChange={(e) => setIsSchool(e.target.checked)} />
              Это письмо от вуза
            </label>
            <button type="button" className="ds-btn ds-btn-primary" onClick={add} disabled={pending || !text.trim()}>
              {pending ? '...' : 'Добавить'}
            </button>
          </div>
          {error && <div style={{ fontSize: 12, color: '#c33', marginTop: 6 }}>{error}</div>}
        </div>
      )}

      {events.length === 0 ? (
        <div style={{ padding: 24, textAlign: 'center', background: 'var(--ds-bg)', border: '1px dashed var(--ds-border)', borderRadius: 'var(--ds-r-md)', color: 'var(--ds-muted)', fontSize: 13 }}>
          Событий пока нет.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {events.map(ev => (
            <EventRow key={ev.id} ev={ev} applicationId={applicationId} clientId={clientId} />
          ))}
        </div>
      )}
    </div>
  )
}

function EventRow({ ev, applicationId, clientId }: { ev: any; applicationId: string; clientId: number }) {
  const [downloadError, setDownloadError] = useState<string | null>(null)

  const docId = ev.payload?.document_id as string | undefined
  const fileName = ev.payload?.file_name as string | undefined
  const fileSize = ev.payload?.file_size_bytes as number | undefined

  async function download() {
    if (!docId) return
    setDownloadError(null)
    const res = await getApplicationDocumentDownloadUrl({ documentId: docId, applicationId, clientId })
    if ('error' in res && res.error) { setDownloadError(res.error); return }
    if ('url' in res && res.url) window.open(res.url, '_blank')
  }

  function fmtBytes(b?: number): string {
    if (!b) return ''
    if (b < 1024) return `${b} Б`
    if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} КБ`
    return `${(b / 1024 / 1024).toFixed(1)} МБ`
  }

  return (
    <div style={{ padding: 14, background: 'var(--ds-bg)', border: '1px solid var(--ds-border)', borderRadius: 'var(--ds-r-md)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center', marginBottom: 6 }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--ds-purple)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          {EVENT_LABELS[ev.event_type] || ev.event_type}
        </span>
        <span style={{ fontSize: 11, color: 'var(--ds-muted)' }}>
          {new Date(ev.created_at).toLocaleString('ru', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
        </span>
      </div>
      {ev.content && (
        <div style={{ fontSize: 13, color: 'var(--ds-ink)', whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>
          {ev.content}
        </div>
      )}
      {ev.event_type === 'doc_uploaded' && docId && (
        <div style={{ marginTop: 10, padding: '8px 12px', background: 'var(--ds-bg-alt)', border: '1px solid var(--ds-border-soft)', borderRadius: 8, display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 16, lineHeight: 1 }}>📎</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--ds-ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {fileName || ev.content || 'Файл'}
            </div>
            {fileSize && (
              <div style={{ fontSize: 11, color: 'var(--ds-muted)' }}>{fmtBytes(fileSize)}</div>
            )}
          </div>
          <button type="button" className="ds-btn ds-btn-ghost" onClick={download} style={{ fontSize: 11, padding: '4px 10px' }}>
            ↓ Скачать
          </button>
        </div>
      )}
      {downloadError && (
        <div style={{ fontSize: 11, color: 'var(--ds-error-ink)', marginTop: 6 }}>{downloadError}</div>
      )}
    </div>
  )
}

const smallLabel: React.CSSProperties = {
  display: 'block',
  fontSize: 10,
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
  color: 'var(--ds-muted)',
  marginBottom: 4,
}
