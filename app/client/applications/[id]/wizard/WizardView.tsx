'use client'

import Link from 'next/link'
import { useState, useTransition, useRef } from 'react'
import {
  saveApplicationProfileData,
  markApplicationReadyForCurator,
  linkGlobalDocToApplication,
} from './actions'
import {
  uploadApplicationDocument,
  deleteApplicationDocument,
  getApplicationDocumentDownloadUrl,
} from '@/app/curator/applications/actions'
import type {
  ApplicationRow,
  ApplicationDocumentRow,
  ClientDocumentRow,
  SchoolApplicationProfileRow,
  ProfileFieldDef,
  DocumentReqDef,
} from '@/lib/client-data'

type EssayRow = {
  id: string
  type: 'motivation' | 'resume' | 'essay' | string
  status: string
}

type Props = {
  app: ApplicationRow
  profile: SchoolApplicationProfileRow
  profileData: Record<string, string>
  documents: ApplicationDocumentRow[]
  globalDocs: ClientDocumentRow[]
  essays: EssayRow[]
  clientName: string
  clientEmail: string
  isPreview: boolean
}

const STEPS = [
  { key: 'profile', label: 'Профиль' },
  { key: 'documents', label: 'Документы' },
  { key: 'essays', label: 'Эссе' },
  { key: 'review', label: 'Финал' },
]

const GROUP_LABELS: Record<string, string> = {
  identity: 'Личные данные',
  passport: 'Паспорт',
  contact: 'Контакты',
  education: 'Школа',
  english: 'Английский язык',
  standardized: 'SAT (опционально)',
  program: 'Программа',
}

export function WizardView(props: Props) {
  const [step, setStep] = useState(0)
  const [data, setData] = useState<Record<string, string>>(props.profileData)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [submitted, setSubmitted] = useState(props.app.stage === 'submitted')

  const updateField = (key: string, value: string) => {
    setData(prev => ({ ...prev, [key]: value }))
  }

  const persist = () => {
    startTransition(async () => {
      const r = await saveApplicationProfileData({ applicationId: props.app.id, data })
      if (!r.ok) setError(r.error)
      else setError(null)
    })
  }

  // Прогресс по шагам
  const profileFilled = props.profile.profile_fields_required
    .filter(f => f.required)
    .every(f => (data[f.key] || '').trim().length > 0)

  const docsByKey = new Map(props.documents.map(d => [d.doc_type, d]))
  const docsFilled = props.profile.documents_required
    .filter(d => d.required)
    .every(d => docsByKey.get(d.key))

  const motivationEssay = props.essays.find(e => e.type === 'motivation')
  const essaysFilled: boolean = props.profile.essays_required.length === 0
    || !!(motivationEssay && motivationEssay.status !== 'draft')

  const allReady = profileFilled && docsFilled && essaysFilled

  if (submitted) {
    return <SubmittedScreen profile={props.profile} app={props.app} />
  }

  return (
    <div>
      {/* Hero */}
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 28, fontWeight: 700, margin: '0 0 6px', color: 'var(--ds-text)' }}>
          Подача в {props.profile.school_name}
        </h1>
        <p style={{ fontSize: 14, color: 'var(--ds-muted)', margin: 0 }}>
          Заполни всё на нашей платформе. Когда будет готово — нажми «Подать заявку», дальше мы готовим её к отправке.
        </p>
      </div>

      {/* Stepper */}
      <Stepper
        steps={STEPS}
        current={step}
        onStep={setStep}
        completed={[profileFilled, docsFilled, !!essaysFilled, false]}
      />

      {error && (
        <div style={{
          marginTop: 16,
          padding: '10px 14px',
          background: '#FEE2E2',
          color: '#B91C1C',
          borderRadius: 8,
          fontSize: 13,
        }}>
          {error}
        </div>
      )}

      <div style={{ marginTop: 24 }}>
        {step === 0 && (
          <StepProfile
            fields={props.profile.profile_fields_required}
            data={data}
            updateField={updateField}
            onBlur={persist}
            disabled={props.isPreview || pending}
          />
        )}
        {step === 1 && (
          <StepDocuments
            applicationId={props.app.id}
            clientId={props.app.client_id}
            requirements={props.profile.documents_required}
            documents={props.documents}
            globalDocs={props.globalDocs}
            disabled={props.isPreview}
          />
        )}
        {step === 2 && (
          <StepEssays
            essays={props.essays}
            requirements={props.profile.essays_required}
            isPreview={props.isPreview}
          />
        )}
        {step === 3 && (
          <StepReview
            app={props.app}
            profile={props.profile}
            profileFilled={profileFilled}
            docsFilled={docsFilled}
            essaysFilled={!!essaysFilled}
            allReady={allReady}
            isPreview={props.isPreview}
            onSubmit={() => {
              startTransition(async () => {
                const r = await markApplicationReadyForCurator({ applicationId: props.app.id })
                if (!r.ok) setError(r.error)
                else { setError(null); setSubmitted(true) }
              })
            }}
            pending={pending}
          />
        )}
      </div>

      {/* Nav */}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 32 }}>
        <button
          className="ds-btn-ghost"
          onClick={() => setStep(s => Math.max(0, s - 1))}
          disabled={step === 0}
        >
          ← Назад
        </button>
        {step < STEPS.length - 1 ? (
          <button
            className="ds-btn-primary"
            onClick={() => setStep(s => Math.min(STEPS.length - 1, s + 1))}
          >
            Далее →
          </button>
        ) : null}
      </div>
    </div>
  )
}

function Stepper({
  steps,
  current,
  onStep,
  completed,
}: {
  steps: typeof STEPS
  current: number
  onStep: (n: number) => void
  completed: boolean[]
}) {
  return (
    <div style={{ display: 'flex', gap: 8 }}>
      {steps.map((s, i) => {
        const isActive = i === current
        const isDone = completed[i]
        return (
          <button
            key={s.key}
            onClick={() => onStep(i)}
            style={{
              flex: 1,
              padding: '12px 16px',
              border: '1px solid',
              borderColor: isActive ? 'var(--ds-purple)' : 'var(--ds-border)',
              borderRadius: 10,
              background: isActive ? 'var(--ds-purple-soft, #F3EAFB)' : 'var(--ds-surface)',
              color: isActive ? 'var(--ds-purple)' : 'var(--ds-text)',
              cursor: 'pointer',
              textAlign: 'left',
              fontSize: 13,
              fontWeight: 600,
            }}
          >
            <div style={{ fontSize: 11, color: 'var(--ds-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 4 }}>
              Шаг {i + 1} {isDone ? '✓' : ''}
            </div>
            {s.label}
          </button>
        )
      })}
    </div>
  )
}

function StepProfile({
  fields,
  data,
  updateField,
  onBlur,
  disabled,
}: {
  fields: ProfileFieldDef[]
  data: Record<string, string>
  updateField: (k: string, v: string) => void
  onBlur: () => void
  disabled: boolean
}) {
  // Группируем
  const groups = new Map<string, ProfileFieldDef[]>()
  for (const f of fields) {
    const g = f.group || 'other'
    if (!groups.has(g)) groups.set(g, [])
    groups.get(g)!.push(f)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {Array.from(groups.entries()).map(([group, fs]) => (
        <div key={group} className="ds-card" style={{ padding: 24 }}>
          <h3 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 16px', color: 'var(--ds-text)' }}>
            {GROUP_LABELS[group] || group}
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 14 }}>
            {fs.map(f => (
              <FieldInput
                key={f.key}
                field={f}
                value={data[f.key] || ''}
                onChange={v => updateField(f.key, v)}
                onBlur={onBlur}
                disabled={disabled}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

function FieldInput({
  field,
  value,
  onChange,
  onBlur,
  disabled,
}: {
  field: ProfileFieldDef
  value: string
  onChange: (v: string) => void
  onBlur: () => void
  disabled: boolean
}) {
  const fullWidth = field.type === 'textarea' || field.notes
  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '10px 12px',
    border: '1px solid var(--ds-border)',
    borderRadius: 8,
    fontSize: 13,
    color: 'var(--ds-text)',
    background: 'var(--ds-surface)',
    fontFamily: 'inherit',
  }

  return (
    <label style={{ gridColumn: fullWidth ? 'span 2' : 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
      <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--ds-text)' }}>
        {field.label} {field.required && <span style={{ color: '#DC2626' }}>*</span>}
      </span>
      {field.type === 'select' ? (
        <select
          value={value}
          onChange={e => onChange(e.target.value)}
          onBlur={onBlur}
          disabled={disabled}
          style={inputStyle}
        >
          <option value="">— выбери —</option>
          {field.options?.map(opt => <option key={opt} value={opt}>{opt}</option>)}
        </select>
      ) : field.type === 'textarea' ? (
        <textarea
          value={value}
          onChange={e => onChange(e.target.value)}
          onBlur={onBlur}
          disabled={disabled}
          rows={2}
          style={inputStyle}
        />
      ) : (
        <input
          type={field.type === 'date' ? 'date' : field.type === 'number' ? 'number' : field.type === 'phone' ? 'tel' : 'text'}
          value={value}
          onChange={e => onChange(e.target.value)}
          onBlur={onBlur}
          disabled={disabled}
          style={inputStyle}
        />
      )}
      {field.notes && (
        <span style={{ fontSize: 11, color: 'var(--ds-muted)' }}>{field.notes}</span>
      )}
    </label>
  )
}

function StepDocuments({
  applicationId,
  clientId,
  requirements,
  documents,
  globalDocs,
  disabled,
}: {
  applicationId: string
  clientId: number
  requirements: DocumentReqDef[]
  documents: ApplicationDocumentRow[]
  globalDocs: ClientDocumentRow[]
  disabled: boolean
}) {
  const docsByKey = new Map(documents.map(d => [d.doc_type, d]))
  const globalByKey = new Map(globalDocs.filter(g => g.storage_path).map(g => [g.doc_type, g]))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ fontSize: 13, color: 'var(--ds-muted)', marginBottom: 4 }}>
        Документы из раздела «Документы» уже отмечены ✓ — загружать заново не нужно. Уникальные требования вуза грузим здесь.
      </div>
      {requirements.map(req => (
        <DocRow
          key={req.key}
          req={req}
          existing={docsByKey.get(req.key)}
          globalDoc={globalByKey.get(req.key)}
          applicationId={applicationId}
          clientId={clientId}
          disabled={disabled}
        />
      ))}
    </div>
  )
}

function DocRow({
  req,
  existing,
  globalDoc,
  applicationId,
  clientId,
  disabled,
}: {
  req: DocumentReqDef
  existing?: ApplicationDocumentRow
  globalDoc?: ClientDocumentRow
  applicationId: string
  clientId: number
  disabled: boolean
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [pending, startTransition] = useTransition()
  const [err, setErr] = useState<string | null>(null)

  const linkedFromGlobal = !!existing?.global_doc_id
  const status: 'app_uploaded' | 'global_only' | 'missing' =
    existing ? 'app_uploaded' : (globalDoc ? 'global_only' : 'missing')

  const handleFile = (file: File | null) => {
    if (!file) return
    setErr(null)
    const fd = new FormData()
    fd.set('application_id', applicationId)
    fd.set('client_id', String(clientId))
    fd.set('doc_type', req.key)
    fd.set('title', req.label)
    fd.set('file', file)
    if (existing) fd.set('document_id', existing.id)
    startTransition(async () => {
      const r = await uploadApplicationDocument(fd)
      if ('error' in r && r.error) setErr(r.error)
    })
  }

  const handleUseGlobal = () => {
    if (!globalDoc) return
    setErr(null)
    startTransition(async () => {
      const r = await linkGlobalDocToApplication({
        applicationId,
        docType: req.key,
        globalDocId: globalDoc.id,
        title: req.label,
      })
      if (!r.ok) setErr(r.error)
    })
  }

  const handleDelete = () => {
    if (!existing) return
    if (!confirm('Удалить файл из этой заявки?')) return
    startTransition(async () => {
      const r = await deleteApplicationDocument({ documentId: existing.id, applicationId, clientId })
      if ('error' in r && r.error) setErr(r.error)
    })
  }

  const handleDownload = async () => {
    if (!existing) return
    const r = await getApplicationDocumentDownloadUrl({ documentId: existing.id, applicationId, clientId })
    if ('url' in r) window.open(r.url, '_blank')
    else if ('error' in r) setErr(r.error)
  }

  const indicatorColor = status === 'app_uploaded' ? '#16A34A' : status === 'global_only' ? '#F59E0B' : 'var(--ds-muted)'
  const indicatorBg = status === 'app_uploaded' ? '#DCFCE7' : status === 'global_only' ? '#FEF3C7' : 'var(--ds-bg)'

  return (
    <div className="ds-card" style={{ padding: 16, display: 'flex', alignItems: 'center', gap: 14 }}>
      <div style={{
        width: 36, height: 36, borderRadius: 8,
        background: indicatorBg, color: indicatorColor,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0, fontSize: 16, fontWeight: 700,
      }}>
        {status === 'missing' ? '○' : '✓'}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--ds-text)' }}>
          {req.label} {req.required && <span style={{ color: '#DC2626', fontSize: 12 }}>*</span>}
        </div>
        {req.notes && (
          <div style={{ fontSize: 11, color: 'var(--ds-muted)', marginTop: 2 }}>{req.notes}</div>
        )}
        {req.format && status === 'missing' && (
          <div style={{ fontSize: 11, color: 'var(--ds-muted)', marginTop: 2 }}>
            Формат: {req.format}{req.max_mb && ` · до ${req.max_mb} МБ`}
          </div>
        )}
        {status === 'app_uploaded' && existing && (
          <div style={{ fontSize: 11, color: 'var(--ds-purple)', marginTop: 4 }}>
            {linkedFromGlobal && <span style={{ color: 'var(--ds-muted)', marginRight: 6 }}>Из общих:</span>}
            <button onClick={handleDownload} style={{ background: 'none', border: 'none', color: 'var(--ds-purple)', cursor: 'pointer', padding: 0, fontSize: 11, textDecoration: 'underline' }}>
              {existing.file_name}
            </button>
          </div>
        )}
        {status === 'global_only' && globalDoc && (
          <div style={{ fontSize: 11, color: '#92400E', marginTop: 4 }}>
            В общих документах: <b>{globalDoc.file_name}</b> — нажми «Использовать» чтобы прикрепить к заявке
          </div>
        )}
        {err && <div style={{ fontSize: 11, color: '#DC2626', marginTop: 4 }}>{err}</div>}
      </div>
      <input
        ref={inputRef}
        type="file"
        style={{ display: 'none' }}
        onChange={e => handleFile(e.target.files?.[0] || null)}
      />
      <div style={{ display: 'flex', gap: 6 }}>
        {status === 'global_only' && (
          <button
            onClick={handleUseGlobal}
            disabled={disabled || pending}
            className="ds-btn-primary"
            style={{ fontSize: 12, padding: '6px 12px' }}
          >
            {pending ? '...' : 'Использовать'}
          </button>
        )}
        {status === 'app_uploaded' && (
          <button onClick={handleDelete} disabled={disabled || pending} style={{ fontSize: 12, padding: '6px 10px', border: '1px solid var(--ds-border)', borderRadius: 6, background: 'transparent', cursor: 'pointer', color: '#DC2626' }}>
            Удалить
          </button>
        )}
        <button
          onClick={() => inputRef.current?.click()}
          disabled={disabled || pending}
          className={status === 'app_uploaded' ? 'ds-btn-ghost' : status === 'global_only' ? 'ds-btn-ghost' : 'ds-btn-primary'}
          style={{ fontSize: 12, padding: '6px 12px' }}
        >
          {pending ? '...' : status === 'app_uploaded' ? 'Заменить' : status === 'global_only' ? 'Другой файл' : 'Загрузить'}
        </button>
      </div>
    </div>
  )
}

function StepEssays({
  essays,
  requirements,
  isPreview,
}: {
  essays: EssayRow[]
  requirements: { key: string; label: string; prompt: string; min_words?: number; max_words?: number; required: boolean }[]
  isPreview: boolean
}) {
  const motivationEssay = essays.find(e => e.type === 'motivation')

  return (
    <div className="ds-card" style={{ padding: 24 }}>
      <h3 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 16px' }}>Эссе</h3>
      {requirements.map(req => {
        const isFilled = req.key === 'personal_statement' && motivationEssay && motivationEssay.status !== 'draft'
        return (
          <div key={req.key} style={{ padding: 16, border: '1px solid var(--ds-border)', borderRadius: 10, marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
              <span style={{
                width: 24,
                height: 24,
                borderRadius: '50%',
                background: isFilled ? '#DCFCE7' : 'var(--ds-bg)',
                color: isFilled ? '#16A34A' : 'var(--ds-muted)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 14,
              }}>
                {isFilled ? '✓' : '○'}
              </span>
              <strong style={{ fontSize: 14, color: 'var(--ds-text)' }}>{req.label}</strong>
              {req.required && <span style={{ color: '#DC2626', fontSize: 12 }}>*</span>}
            </div>
            <p style={{ fontSize: 13, color: 'var(--ds-muted)', margin: '0 0 8px' }}>{req.prompt}</p>
            {(req.min_words || req.max_words) && (
              <div style={{ fontSize: 11, color: 'var(--ds-muted)', marginBottom: 10 }}>
                Объём: {req.min_words ?? 0}–{req.max_words ?? '∞'} слов
              </div>
            )}
            <Link
              href="/client/motivation"
              className="ds-btn-primary"
              style={{ fontSize: 12, padding: '6px 12px', display: 'inline-block', textDecoration: 'none' }}
            >
              {isFilled ? 'Открыть редактор' : 'Заполнить'}
            </Link>
          </div>
        )
      })}
      {isPreview && (
        <div style={{ fontSize: 12, color: 'var(--ds-muted)', marginTop: 8, fontStyle: 'italic' }}>
          В режиме просмотра редактирование недоступно.
        </div>
      )}
    </div>
  )
}

function StepReview({
  app,
  profile,
  profileFilled,
  docsFilled,
  essaysFilled,
  allReady,
  isPreview,
  onSubmit,
  pending,
}: {
  app: ApplicationRow
  profile: SchoolApplicationProfileRow
  profileFilled: boolean
  docsFilled: boolean
  essaysFilled: boolean
  allReady: boolean
  isPreview: boolean
  onSubmit: () => void
  pending: boolean
}) {
  return (
    <div className="ds-card" style={{ padding: 28 }}>
      <h3 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 8px' }}>Готовность к подаче</h3>
      <p style={{ fontSize: 13, color: 'var(--ds-muted)', margin: '0 0 20px' }}>
        Проверь что всё заполнено. После клика «Подать заявку» мы соберём пакет и передадим куратору — он подаст заявку на портале вуза в течение 1–2 рабочих дней.
      </p>
      <ChecklistRow done={profileFilled} label="Профиль заполнен" />
      <ChecklistRow done={docsFilled} label="Все обязательные документы загружены" />
      <ChecklistRow done={essaysFilled} label="Personal Statement готов" />

      {profile.external_steps.length > 0 && (
        <div style={{ marginTop: 20, padding: 16, background: '#FFF7ED', borderRadius: 10, border: '1px solid #FED7AA' }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#9A3412', marginBottom: 8 }}>
            Внешние шаги (нужно сделать самостоятельно):
          </div>
          {profile.external_steps.map(s => (
            <div key={s.key} style={{ fontSize: 12, color: '#7C2D12', marginBottom: 6 }}>
              <strong>{s.label}</strong>
              {s.notes && <div style={{ marginTop: 2 }}>{s.notes}</div>}
              {s.url && (
                <a href={s.url} target="_blank" rel="noopener noreferrer" style={{ color: '#9A3412' }}>
                  → Перейти
                </a>
              )}
            </div>
          ))}
        </div>
      )}

      <button
        onClick={onSubmit}
        disabled={!allReady || isPreview || pending}
        className="ds-btn-primary"
        style={{
          marginTop: 24,
          width: '100%',
          padding: '14px 24px',
          fontSize: 15,
          opacity: (!allReady || isPreview) ? 0.5 : 1,
        }}
      >
        {pending ? 'Отправляем...' : 'Подать заявку'}
      </button>
      {!allReady && (
        <div style={{ fontSize: 12, color: 'var(--ds-muted)', marginTop: 10, textAlign: 'center' }}>
          Доступно когда все шаги выше отмечены ✓
        </div>
      )}
    </div>
  )
}

function ChecklistRow({ done, label }: { done: boolean; label: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: '1px solid var(--ds-border)' }}>
      <span style={{
        width: 24,
        height: 24,
        borderRadius: '50%',
        background: done ? '#DCFCE7' : 'var(--ds-bg)',
        color: done ? '#16A34A' : 'var(--ds-muted)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 14,
      }}>
        {done ? '✓' : '○'}
      </span>
      <span style={{ fontSize: 14, color: done ? 'var(--ds-text)' : 'var(--ds-muted)' }}>{label}</span>
    </div>
  )
}

function SubmittedScreen({ profile, app }: { profile: SchoolApplicationProfileRow; app: ApplicationRow }) {
  return (
    <div className="ds-card" style={{ padding: 48, textAlign: 'center' }}>
      <div style={{
        width: 64,
        height: 64,
        borderRadius: '50%',
        background: '#DCFCE7',
        color: '#16A34A',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 32,
        margin: '0 auto 20px',
      }}>
        ✓
      </div>
      <h2 style={{ fontSize: 22, fontWeight: 700, margin: '0 0 10px', color: 'var(--ds-text)' }}>
        Заявка отправлена
      </h2>
      <p style={{ fontSize: 14, color: 'var(--ds-muted)', maxWidth: 440, margin: '0 auto 24px', lineHeight: 1.5 }}>
        Мы получили твой пакет документов для {profile.school_name}. Куратор подаст заявку на портале вуза в течение 1–2 рабочих дней. Все письма от вуза будут приходить в твой кабинет.
      </p>
      <Link href={`/client/applications/${app.id}`} className="ds-btn-primary">
        Открыть заявку
      </Link>
    </div>
  )
}
