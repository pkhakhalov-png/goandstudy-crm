'use client'

import { useState, useTransition } from 'react'
import {
  createApplication,
  updateApplicationStage,
  setApplicationDecision,
  deleteApplication,
  type AppStage,
  type AppDecision,
} from '@/app/curator/applications/actions'

const STAGE_LABELS: Record<AppStage, string> = {
  created: 'Заявка создана',
  docs_collected: 'Документы загружены',
  fee_paid: 'Application fee оплачен',
  submitted: 'Подано в вуз',
  decision: 'Решение получено',
}

const STAGE_ORDER: AppStage[] = ['created', 'docs_collected', 'fee_paid', 'submitted', 'decision']

const DECISION_LABELS: Record<AppDecision, string> = {
  offer: 'Оффер',
  conditional_offer: 'Условный оффер',
  rejected: 'Отказ',
  waitlisted: 'Лист ожидания',
  withdrawn: 'Отозвано',
}

const DECISION_CHIP: Record<AppDecision, string> = {
  offer: 'ds-chip-success',
  conditional_offer: 'ds-chip-info',
  rejected: 'ds-chip-error',
  waitlisted: 'ds-chip-warning',
  withdrawn: 'ds-chip-neutral',
}

export function ApplicationsTab({
  clientId,
  applications,
  shortlist,
}: {
  clientId: number
  applications: any[]
  shortlist: any[]
}) {
  const [isCreating, setIsCreating] = useState(false)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{
        padding: 28,
        background: '#fff',
        borderRadius: 'var(--ds-r-lg)',
        border: '1px solid var(--ds-border-soft)',
        boxShadow: '0 8px 32px -8px rgba(29,29,31,0.12), 0 2px 8px -2px rgba(29,29,31,0.06)',
      }}>
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 20 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--ds-purple)', marginBottom: 6 }}>
              Заявки в вузы
            </div>
            <h2 style={{ fontFamily: 'var(--ds-font-display-stack)', fontWeight: 700, fontSize: 22, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--ds-ink)', margin: 0, lineHeight: 1.1 }}>
              Подано · {applications.length}
            </h2>
            <p style={{ fontSize: 13, color: 'var(--ds-muted)', margin: '6px 0 0', lineHeight: 1.5, maxWidth: 640 }}>
              5 стадий: создана → документы → fee → подано → решение. Управляй стадиями по мере работы — клиент видит прогресс в кабинете.
            </p>
          </div>
          <button type="button" className="ds-btn ds-btn-primary" onClick={() => setIsCreating(true)}>
            + Создать заявку
          </button>
        </header>

        {isCreating && (
          <CreateApplicationForm
            clientId={clientId}
            shortlist={shortlist}
            onClose={() => setIsCreating(false)}
          />
        )}

        {applications.length === 0 && !isCreating && (
          <div style={{ marginTop: 20, padding: '48px 24px', textAlign: 'center', background: 'var(--ds-bg-alt)', border: '1px dashed var(--ds-border)', borderRadius: 'var(--ds-r-md)', color: 'var(--ds-muted)', fontSize: 14 }}>
            Заявок пока нет. Жми «+ Создать заявку» — выбери из shortlist или введи вуз вручную.
          </div>
        )}

        {applications.length > 0 && (
          <div style={{ marginTop: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
            {applications.map(app => (
              <ApplicationCard key={app.id} app={app} clientId={clientId} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function CreateApplicationForm({
  clientId,
  shortlist,
  onClose,
}: {
  clientId: number
  shortlist: any[]
  onClose: () => void
}) {
  const [uni, setUni] = useState('')
  const [program, setProgram] = useState('')
  const [country, setCountry] = useState('')
  const [intake, setIntake] = useState('')
  const [shortlistId, setShortlistId] = useState<string>('')
  const [feeAmount, setFeeAmount] = useState('')
  const [feeCurrency, setFeeCurrency] = useState('')
  const [appDeadline, setAppDeadline] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  function pickShortlist(id: string) {
    setShortlistId(id)
    if (!id) return
    const row = shortlist.find(s => s.id === id)
    if (row) {
      setUni(row.university_name || '')
      setProgram(row.program_name || '')
      setCountry(row.country || '')
      setIntake(row.start_date ? row.start_date.slice(0, 7) : '')
    }
  }

  function submit() {
    setError(null)
    if (!uni.trim()) { setError('Укажи вуз'); return }
    start(async () => {
      const res = await createApplication({
        clientId,
        shortlistId: shortlistId || null,
        universityName: uni,
        programName: program || null,
        country: country || null,
        intake: intake || null,
        feeAmount: feeAmount ? Number(feeAmount) : null,
        feeCurrency: feeCurrency || null,
        appDeadline: appDeadline || null,
      })
      if ('error' in res && res.error) setError(res.error)
      else onClose()
    })
  }

  return (
    <div style={{
      marginTop: 20,
      padding: 20,
      background: 'var(--ds-purple-soft)',
      border: '1px solid var(--ds-purple)',
      borderRadius: 'var(--ds-r-md)',
    }}>
      <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 14, color: 'var(--ds-ink)' }}>Новая заявка</div>

      {shortlist.length > 0 && (
        <div style={{ marginBottom: 14 }}>
          <label style={fieldLabel}>Из shortlist (опционально)</label>
          <select
            value={shortlistId}
            onChange={(e) => pickShortlist(e.target.value)}
            className="ds-input"
            style={{ width: '100%', padding: '8px 12px', fontSize: 13 }}
          >
            <option value="">— Заполнить вручную —</option>
            {shortlist.map(s => (
              <option key={s.id} value={s.id}>
                {s.university_name}{s.program_name ? ` · ${s.program_name}` : ''}
              </option>
            ))}
          </select>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
        <Field label="Вуз *" value={uni} onChange={setUni} placeholder="University of ..." />
        <Field label="Программа" value={program} onChange={setProgram} placeholder="MSc / BA / ..." />
        <Field label="Страна" value={country} onChange={setCountry} placeholder="UK / Canada / ..." />
        <Field label="Intake" value={intake} onChange={setIntake} placeholder="Fall 2025" />
        <Field label="Application fee, сумма" value={feeAmount} onChange={setFeeAmount} placeholder="100" />
        <Field label="Валюта" value={feeCurrency} onChange={setFeeCurrency} placeholder="USD" />
        <Field label="Дедлайн заявки" value={appDeadline} onChange={setAppDeadline} placeholder="2025-12-15" type="date" />
      </div>

      {error && (
        <div style={{ fontSize: 12, color: 'var(--ds-red, #c33)', marginBottom: 10 }}>{error}</div>
      )}

      <div style={{ display: 'flex', gap: 8 }}>
        <button type="button" className="ds-btn ds-btn-primary" onClick={submit} disabled={pending}>
          {pending ? 'Создаём...' : 'Создать'}
        </button>
        <button type="button" className="ds-btn ds-btn-ghost" onClick={onClose} disabled={pending}>
          Отмена
        </button>
      </div>
    </div>
  )
}

function ApplicationCard({ app, clientId }: { app: any; clientId: number }) {
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const stageIdx = STAGE_ORDER.indexOf(app.stage)

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

  function remove() {
    if (!confirm(`Удалить заявку в "${app.university_name}"? Все документы и события заявки тоже будут удалены.`)) return
    start(async () => {
      const res = await deleteApplication({ applicationId: app.id, clientId })
      if ('error' in res && res.error) setError(res.error)
    })
  }

  return (
    <div style={{
      padding: 16,
      background: 'var(--ds-bg-alt)',
      border: '1px solid var(--ds-border-soft)',
      borderRadius: 'var(--ds-r-md)',
      boxShadow: 'inset 0 1px 2px rgba(29,29,31,0.04)',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'flex-start' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--ds-ink)' }}>{app.university_name}</div>
          {(app.program_name || app.country || app.intake) && (
            <div style={{ fontSize: 12, color: 'var(--ds-muted)', marginTop: 4 }}>
              {[app.program_name, app.country, app.intake].filter(Boolean).join(' · ')}
            </div>
          )}
          {app.app_deadline && (
            <div style={{ fontSize: 11, color: 'var(--ds-muted)', marginTop: 4 }}>
              Дедлайн: <b style={{ color: 'var(--ds-ink)' }}>{new Date(app.app_deadline).toLocaleDateString('ru')}</b>
            </div>
          )}
        </div>

        {app.decision && (
          <span className={`ds-chip ${DECISION_CHIP[app.decision as AppDecision]}`} style={{ textTransform: 'uppercase', letterSpacing: '0.06em', fontSize: 10, fontWeight: 700, whiteSpace: 'nowrap' }}>
            {DECISION_LABELS[app.decision as AppDecision]}
          </span>
        )}

        <button
          type="button"
          onClick={remove}
          disabled={pending}
          title="Удалить заявку"
          style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--ds-muted)', fontSize: 18, padding: 4 }}
        >
          ×
        </button>
      </div>

      {/* Stepper */}
      <div style={{ marginTop: 14, display: 'flex', gap: 6, alignItems: 'center' }}>
        {STAGE_ORDER.map((s, i) => {
          const done = i <= stageIdx
          const current = i === stageIdx
          return (
            <div key={s} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
              <div style={{
                width: '100%',
                height: 4,
                borderRadius: 2,
                background: done ? 'var(--ds-purple)' : 'var(--ds-border)',
                transition: 'background 200ms',
              }} />
              <div style={{
                fontSize: 9,
                fontWeight: current ? 700 : 500,
                color: done ? 'var(--ds-ink)' : 'var(--ds-muted)',
                textAlign: 'center',
                lineHeight: 1.2,
              }}>
                {STAGE_LABELS[s].split(' ').slice(0, 2).join(' ')}
              </div>
            </div>
          )
        })}
      </div>

      <div style={{ marginTop: 14, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <label style={{ fontSize: 11, color: 'var(--ds-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700 }}>
          Стадия:
        </label>
        <select
          value={app.stage}
          onChange={(e) => changeStage(e.target.value as AppStage)}
          disabled={pending}
          className="ds-input"
          style={{ padding: '6px 10px', fontSize: 12, minWidth: 200 }}
        >
          {STAGE_ORDER.map(s => (
            <option key={s} value={s}>{STAGE_LABELS[s]}</option>
          ))}
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
              style={{ padding: '6px 10px', fontSize: 12, minWidth: 180 }}
            >
              <option value="">— Выбрать —</option>
              {(Object.keys(DECISION_LABELS) as AppDecision[]).map(d => (
                <option key={d} value={d}>{DECISION_LABELS[d]}</option>
              ))}
            </select>
          </>
        )}
      </div>

      {error && (
        <div style={{ fontSize: 12, color: 'var(--ds-red, #c33)', marginTop: 8 }}>{error}</div>
      )}
    </div>
  )
}

const fieldLabel: React.CSSProperties = {
  display: 'block',
  fontSize: 10,
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
  color: 'var(--ds-muted)',
  marginBottom: 4,
}

function Field({
  label, value, onChange, placeholder, type = 'text',
}: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  type?: string
}) {
  return (
    <div>
      <label style={fieldLabel}>{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="ds-input"
        style={{ width: '100%', padding: '8px 12px', fontSize: 13 }}
      />
    </div>
  )
}
