'use client'

import { useState, useTransition, useEffect, useRef } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import {
  advanceStage,
  addActivity,
  toggleChecklist,
  updateClientField,
  addUniversity,
  updateUniversityStatus,
  removeUniversity,
  publishShortlist,
} from './actions'
import {
  removeFromShortlist,
  updateShortlistNote,
  updateShortlistStatus,
} from '@/app/curator/shortlist/actions'
import {
  addScholarshipToClient,
  setClientScholarshipsVisibility,
} from '@/app/curator/scholarships/actions'
import { createApplication } from '@/app/curator/applications/actions'
import { UniversityFilters } from '@/app/curator/universities/UniversityFilters'
import { ProgramCardInteractive } from '@/app/curator/universities/ProgramCard'
import { ApplicationsTab } from './ApplicationsTab'
import { StudentProjectBlock } from '@/app/_shared/StudentProjectBlock'
import { RoadmapBlock } from '@/app/_shared/RoadmapBlock'

/* ═══════════════════════════════════════════════════════════════
   PROPS + ШЛЯПА — props структуры из Supabase (пока any, чтобы
   не тащить типы; когда схема стабилизируется — перейдём на
   Database['public']['Tables']['clients']['Row']).
   ═══════════════════════════════════════════════════════════════ */

interface CatalogData {
  programs: any[]
  schools: any[]
  countryCodes: string[]
  countryCounts?: Record<string, number>
  specialtyOptions?: string[]
  total: number
  page: number
  pageSize: number
  filters: { q?: string; country?: string; school?: string; levels?: string; intakes?: string; sort?: string; specialty?: string; uniType?: string; budget?: string }
}

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
  curatorId: string
  initialTab?: string
  catalog?: CatalogData | null
  enrichmentByProgram?: Record<number, any>
  logoBySchool?: Record<number, string | null>
  essays?: any[]
  scholarships?: any[]
  suggestedScholarships?: any[]
  applications?: any[]
}

type TabKey = 'project' | 'roadmap' | 'shortlist' | 'applications' | 'documents' | 'essays' | 'notes'

const TABS: Array<{ key: TabKey; label: string; hint?: string }> = [
  { key: 'project',      label: 'Проект' },
  { key: 'roadmap',      label: 'Дорожная карта' },
  { key: 'shortlist',    label: 'Подборка' },
  { key: 'applications', label: 'Заявки' },
  { key: 'documents',    label: 'Документы' },
  { key: 'essays',       label: 'Эссе' },
  { key: 'notes',        label: 'Заметки' },
]

const DOC_STATUS: Record<string, { label: string; chipClass: string }> = {
  missing: { label: 'Не получен', chipClass: 'ds-chip-error' },
  received: { label: 'Получен', chipClass: 'ds-chip-info' },
  translating: { label: 'На переводе', chipClass: 'ds-chip-warning' },
  translated: { label: 'Переведён', chipClass: 'ds-chip-info' },
  notarized: { label: 'Заверен', chipClass: 'ds-chip-success' },
  uploaded_to_uni: { label: 'Загружен в вуз', chipClass: 'ds-chip-purple' },
}

const UNI_STATUS: Record<string, { label: string; chipClass: string }> = {
  planned: { label: 'Планируется', chipClass: 'ds-chip-neutral' },
  applied: { label: 'Подано', chipClass: 'ds-chip-info' },
  offer_received: { label: 'Оффер', chipClass: 'ds-chip-warning' },
  rejected: { label: 'Отказ', chipClass: 'ds-chip-error' },
  accepted: { label: 'Принят', chipClass: 'ds-chip-success' },
}

export function ClientWorkspace(props: Props) {
  const { client, stages, clientStages, universities, documents, activities, checklist, checklistProgress, catalog, enrichmentByProgram = {}, logoBySchool = {} } = props
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const initialTab = (TABS.find(t => t.key === props.initialTab)?.key || 'project') as TabKey
  const [tab, setTabState] = useState<TabKey>(initialTab)

  function setTab(newTab: TabKey) {
    setTabState(newTab)
    const params = new URLSearchParams(searchParams.toString())
    if (newTab === 'project') params.delete('tab')
    else params.set('tab', newTab)
    // Reset catalog filters when leaving shortlist tab
    if (newTab !== 'shortlist') {
      ;['q', 'country', 'school', 'levels', 'intakes', 'sort', 'page'].forEach(k => params.delete(k))
    }
    const qs = params.toString()
    router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
  }

  const initials = (client.name || 'К').split(' ').map((w: string) => w[0]).join('').toUpperCase().slice(0, 2)
  const currentStage = stages.find(s => s.code === client.current_stage_code)
  const currentStageIdx = stages.findIndex(s => s.code === client.current_stage_code)
  const totalStages = stages.length || 1
  const completedCount = stages.filter((s, i) => i < currentStageIdx).length
  const progressPct = Math.round((completedCount / totalStages) * 100)

  return (
    <div className="main" style={{ background: 'var(--ds-bg)' }}>
      {/* ═══ HERO ═══ */}
      <Hero
        client={client}
        initials={initials}
        currentStage={currentStage}
        progressPct={progressPct}
        counts={{
          universities: universities.length,
          documents: documents.length,
          activities: activities.length,
        }}
      />

      {/* ═══ TABS ═══ */}
      <TabBar tab={tab} setTab={setTab} counts={{
        project: 0,
        roadmap: checklist.length,
        shortlist: universities.length,
        applications: (props.applications || []).length,
        documents: documents.length,
        essays: 0,
        notes: activities.length,
      }} />

      {/* ═══ CONTENT ═══ */}
      <main style={{ maxWidth: 1200, margin: '0 auto', padding: '32px 32px 80px' }}>
        {tab === 'project' && <ProjectTab client={client} />}
        {tab === 'roadmap' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
            {/* Переключатель текущего этапа клиента (gradient stepper) */}
            <div className="ds-card" style={{ padding: 28 }}>
              <SectionHead
                eyebrow="Этапы работы"
                title="Текущий этап клиента"
                description="Нажми на этап чтобы переключить статус клиента. Клиент увидит изменение в таймлайне."
              />
              <ClientStageStepper client={client} stages={stages} />
            </div>

            {/* Кастомная дорожная карта — план с пунктами и датами */}
            <div className="ds-card" style={{ padding: 28 }}>
              <SectionHead
                eyebrow="План работы"
                title="Дорожная карта"
                description="Добавляй пункты по этапам, проставляй месяц, опционально комментарии. После «Утвердить» клиент увидит план. Дальше отмечай галочками что выполнено."
              />
              <div style={{ marginTop: 20 }}>
                <RoadmapBlock
                  clientId={client.id}
                  initial={(() => {
                    const raw = client.roadmap_data as any
                    if (Array.isArray(raw)) return { stages: [] }
                    return raw || { stages: [] }
                  })()}
                  approvedAt={(client.roadmap_approved_at as string | null) ?? null}
                  approvedBy={(client.roadmap_approved_by_name as string | null) ?? null}
                  canEdit
                />
              </div>
            </div>
          </div>
        )}
        {tab === 'shortlist' && (
          <ShortlistTab
            client={client}
            universities={universities}
            catalog={catalog || null}
            enrichmentByProgram={enrichmentByProgram}
            logoBySchool={logoBySchool}
            scholarships={props.scholarships || []}
            suggestedScholarships={props.suggestedScholarships || []}
            applications={props.applications || []}
          />
        )}
        {tab === 'applications' && (
          <ApplicationsTab
            clientId={client.id}
            applications={props.applications || []}
            shortlist={universities}
          />
        )}
        {tab === 'documents' && <DocumentsTab documents={documents} />}
        {tab === 'essays' && <EssaysTab client={client} essays={props.essays || []} />}
        {tab === 'notes' && <NotesTab client={client} activities={activities} />}
      </main>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════
   HERO
   ═══════════════════════════════════════════════════════════════ */

function Hero({
  client, initials, currentStage, progressPct, counts,
}: {
  client: any
  initials: string
  currentStage: any
  progressPct: number
  counts: Record<string, number>
}) {
  return (
    <section
      style={{
        position: 'relative',
        overflow: 'hidden',
        borderBottom: '1px solid var(--ds-border-soft)',
        background: 'var(--ds-bg)',
      }}
    >
      <div
        aria-hidden
        style={{
          position: 'absolute',
          top: '-30%',
          left: '-10%',
          width: 900,
          height: 600,
          background: 'radial-gradient(ellipse at center, rgba(181,127,207,0.16) 0%, transparent 60%)',
          pointerEvents: 'none',
        }}
      />
      <div
        aria-hidden
        style={{
          position: 'absolute',
          top: '-20%',
          right: '-10%',
          width: 700,
          height: 400,
          background: 'radial-gradient(ellipse at center, rgba(232,184,68,0.10) 0%, transparent 65%)',
          pointerEvents: 'none',
        }}
      />

      <div style={{ position: 'relative', maxWidth: 1200, margin: '0 auto', padding: '32px 32px 28px' }}>
        <Link
          href="/curator/clients"
          style={{
            fontSize: 12,
            color: 'var(--ds-purple)',
            fontWeight: 700,
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            textDecoration: 'none',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            marginBottom: 16,
          }}
        >
          ← Все клиенты
        </Link>

        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 20, flexWrap: 'wrap' }}>
          {/* Avatar */}
          <div
            style={{
              width: 72,
              height: 72,
              borderRadius: '50%',
              background: 'linear-gradient(135deg, var(--ds-purple), var(--ds-purple-deep))',
              color: '#fff',
              display: 'grid',
              placeItems: 'center',
              fontFamily: 'var(--ds-font-display-stack)',
              fontWeight: 700,
              fontSize: 26,
              letterSpacing: '-0.02em',
              flexShrink: 0,
            }}
          >
            {initials}
          </div>

          {/* Name + contacts */}
          <div style={{ flex: 1, minWidth: 280 }}>
            <h1
              style={{
                fontFamily: 'var(--ds-font-display-stack)',
                fontWeight: 700,
                fontSize: 'clamp(28px, 3.5vw, 44px)',
                letterSpacing: '0.02em',
                lineHeight: 1,
                margin: '0 0 10px 0',
                textTransform: 'uppercase',
              }}
            >
              {client.name || 'Без имени'}
            </h1>
            <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
              <a
                href={`/client?clientId=${client.id}`}
                target="_blank"
                rel="noreferrer"
                className="ds-btn ds-btn-secondary ds-btn-sm"
                style={{ textDecoration: 'none' }}
              >
                Смотреть как клиент ↗
              </a>
            </div>
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: 14,
                alignItems: 'center',
                fontSize: 13,
                color: 'var(--ds-ink-dim)',
              }}
            >
              {client.email && <span>{client.email}</span>}
              {client.phone && <span>·</span>}
              {client.phone && <span className="ds-mono">{client.phone}</span>}
              {client.telegram && <span>·</span>}
              {client.telegram && <span>{client.telegram}</span>}
              {client.country && <span>·</span>}
              {client.country && (
                <span
                  className="ds-chip ds-chip-purple"
                  style={{ textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700, fontSize: 10 }}
                >
                  {client.country}
                </span>
              )}
            </div>
          </div>

          {/* Stage + progress card */}
          <div
            className="ds-card"
            style={{
              padding: '16px 20px',
              minWidth: 280,
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
            }}
          >
            <div
              style={{
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: '0.14em',
                textTransform: 'uppercase',
                color: 'var(--ds-muted)',
              }}
            >
              Текущий этап
            </div>
            <div
              style={{
                fontFamily: 'var(--ds-font-display-stack)',
                fontWeight: 700,
                fontSize: 18,
                textTransform: 'uppercase',
                letterSpacing: '0.03em',
                color: 'var(--ds-ink)',
              }}
            >
              {currentStage?.title || 'не задан'}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div
                style={{
                  fontFamily: 'var(--ds-font-display-stack)',
                  fontWeight: 700,
                  fontSize: 22,
                  color: 'var(--ds-purple-deep)',
                  fontVariantNumeric: 'tabular-nums',
                  lineHeight: 1,
                }}
              >
                {progressPct}%
              </div>
              <div style={{ flex: 1, height: 4, background: 'var(--ds-bg-alt)', borderRadius: 2, overflow: 'hidden' }}>
                <div
                  style={{
                    width: `${progressPct}%`,
                    height: '100%',
                    background: 'var(--ds-purple)',
                    transition: 'width 300ms',
                  }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Quick stats */}
        <div style={{ marginTop: 20, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12 }}>
          <QuickStat label="Вузов в работе" value={counts.universities} />
          <QuickStat label="Документов" value={counts.documents} />
          <QuickStat label="Активностей" value={counts.activities} />
        </div>
      </div>
    </section>
  )
}

function QuickStat({ label, value }: { label: string; value: number }) {
  return (
    <div
      style={{
        padding: '12px 14px',
        background: 'var(--ds-bg)',
        border: '1px solid var(--ds-border-soft)',
        borderRadius: 'var(--ds-r-md)',
      }}
    >
      <div
        style={{
          fontFamily: 'var(--ds-font-display-stack)',
          fontWeight: 700,
          fontSize: 22,
          color: 'var(--ds-ink)',
          fontVariantNumeric: 'tabular-nums',
          lineHeight: 1,
        }}
      >
        {value}
      </div>
      <div style={{ fontSize: 11, color: 'var(--ds-muted)', marginTop: 4, textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 }}>
        {label}
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════
   TAB BAR
   ═══════════════════════════════════════════════════════════════ */

function TabBar({
  tab, setTab, counts,
}: {
  tab: TabKey
  setTab: (t: TabKey) => void
  counts: Record<TabKey, number>
}) {
  return (
    <div
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 10,
        background: 'rgba(255,255,255,0.9)',
        backdropFilter: 'saturate(180%) blur(20px)',
        borderBottom: '1px solid var(--ds-border-soft)',
      }}
    >
      <div
        style={{
          maxWidth: 1200,
          margin: '0 auto',
          padding: '0 32px',
          display: 'flex',
          gap: 4,
          overflowX: 'auto',
        }}
      >
        {TABS.map(t => {
          const active = t.key === tab
          const count = counts[t.key]
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              style={{
                background: 'transparent',
                border: 'none',
                padding: '18px 18px 14px',
                color: active ? 'var(--ds-ink)' : 'var(--ds-muted)',
                fontSize: 13,
                fontWeight: active ? 700 : 500,
                letterSpacing: '0.04em',
                textTransform: 'uppercase',
                cursor: 'pointer',
                borderBottom: `2px solid ${active ? 'var(--ds-purple)' : 'transparent'}`,
                fontFamily: 'var(--ds-font)',
                whiteSpace: 'nowrap',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                transition: 'color 120ms, border-color 120ms',
              }}
            >
              {t.label}
              {count > 0 && (
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    background: active ? 'var(--ds-purple)' : 'var(--ds-bg-alt)',
                    color: active ? '#fff' : 'var(--ds-muted)',
                    padding: '2px 7px',
                    borderRadius: 100,
                    fontVariantNumeric: 'tabular-nums',
                    letterSpacing: 0,
                  }}
                >
                  {count}
                </span>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════
   TAB · Проект — редактируемые поля клиента
   ═══════════════════════════════════════════════════════════════ */

function ProjectTab({ client }: { client: any }) {
  const contactFields: { key: string; label: string; placeholder?: string }[] = [
    { key: 'email', label: 'Email' },
    { key: 'phone', label: 'Телефон' },
    { key: 'telegram', label: 'Telegram', placeholder: '@username' },
  ]

  const projectData = (client.project_data as Record<string, any>) || {}

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 24, alignItems: 'start' }} className="project-grid">
      <style>{`
        @media (max-width: 980px) { .project-grid { grid-template-columns: 1fr !important; } }
      `}</style>

      {/* Структурированный «Проект студента» — те же 8 полей что и у клиента */}
      <div className="ds-card" style={{ padding: 28 }}>
        <StudentProjectBlock clientId={client.id} initial={projectData} />
      </div>

      {/* Контакты + ключевая инфа в правой колонке */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div className="ds-card" style={{ padding: 24 }}>
          <SectionHead eyebrow="Контакты" title="Связь с клиентом" />
          <div style={{ display: 'flex', flexDirection: 'column', marginTop: 20 }}>
            {contactFields.map((f, idx) => (
              <EditableField
                key={f.key}
                clientId={client.id}
                fieldKey={f.key}
                label={f.label}
                value={client[f.key] ?? ''}
                placeholder={f.placeholder}
                isFirst={idx === 0}
              />
            ))}
          </div>
        </div>

        <div className="ds-card" style={{ padding: 24 }}>
          <SectionHead eyebrow="Статус" title="Ключевая инфа" />
          <dl style={{ display: 'flex', flexDirection: 'column', gap: 10, margin: '18px 0 0' }}>
            <InfoRow label="Статус" value={client.status || '—'} />
            <InfoRow label="Источник" value={client.source || '—'} />
            <InfoRow label="Создан" value={client.created_at ? formatDate(client.created_at) : '—'} />
            <InfoRow label="Обновлён" value={client.updated_at ? formatDate(client.updated_at) : '—'} />
          </dl>
        </div>
      </div>
    </div>
  )
}

function EditableField({
  clientId, fieldKey, label, value, placeholder, isFirst,
}: {
  clientId: number
  fieldKey: string
  label: string
  value: string
  placeholder?: string
  isFirst: boolean
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  const [pending, startTransition] = useTransition()

  function save() {
    const fd = new FormData()
    fd.append('client_id', String(clientId))
    fd.append('field', fieldKey)
    fd.append('value', draft)
    startTransition(async () => {
      await updateClientField(fd)
      setEditing(false)
    })
  }

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '160px 1fr auto',
        gap: 12,
        alignItems: 'flex-start',
        padding: '12px 0',
        borderTop: isFirst ? 'none' : '1px solid var(--ds-border-soft)',
      }}
    >
      <div
        style={{
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          color: 'var(--ds-muted)',
          paddingTop: 2,
        }}
      >
        {label}
      </div>
      {editing ? (
        <>
          <div style={{ gridColumn: '2 / 4' }}>
            <input
              type="text"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') { setEditing(false); setDraft(value) }
                if (e.key === 'Enter') save()
              }}
              placeholder={placeholder}
              className="ds-input"
              autoFocus
            />
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <button type="button" className="ds-btn ds-btn-primary ds-btn-sm" onClick={save} disabled={pending}>
                {pending ? '…' : 'Сохранить'}
              </button>
              <button
                type="button"
                className="ds-btn ds-btn-secondary ds-btn-sm"
                onClick={() => { setEditing(false); setDraft(value) }}
              >
                Отмена
              </button>
            </div>
          </div>
        </>
      ) : (
        <>
          <button
            type="button"
            onClick={() => setEditing(true)}
            style={{
              background: 'transparent',
              border: 'none',
              textAlign: 'left',
              padding: 0,
              cursor: 'text',
              color: 'var(--ds-ink)',
              fontFamily: 'var(--ds-font)',
              fontSize: 14,
              fontWeight: 500,
              letterSpacing: '-0.005em',
              lineHeight: 1.4,
            }}
          >
            {value || <span style={{ color: 'var(--ds-muted)', fontWeight: 400 }}>{placeholder || 'Заполнить…'}</span>}
          </button>
          <button
            type="button"
            onClick={() => setEditing(true)}
            aria-label={`Изменить ${label}`}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--ds-muted)',
              cursor: 'pointer',
              padding: 4,
              fontSize: 12,
              opacity: 0.55,
              transition: 'opacity 120ms, color 120ms',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.color = 'var(--ds-purple)' }}
            onMouseLeave={(e) => { e.currentTarget.style.opacity = '0.55'; e.currentTarget.style.color = 'var(--ds-muted)' }}
          >
            ✎
          </button>
        </>
      )}
    </div>
  )
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10, fontSize: 13 }}>
      <dt style={{ color: 'var(--ds-muted)', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
        {label}
      </dt>
      <dd style={{ margin: 0, color: 'var(--ds-ink)', fontWeight: 500, textAlign: 'right' }}>{value}</dd>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════
   TAB · Дорожная карта — stages + checklist
   ═══════════════════════════════════════════════════════════════ */

function ClientStageStepper({ client, stages }: { client: any; stages: any[] }) {
  const [pending, startTransition] = useTransition()
  const currentIdx = stages.findIndex(s => s.code === client.current_stage_code)

  function setStage(code: string) {
    if (code === client.current_stage_code || pending) return
    const fd = new FormData()
    fd.append('client_id', String(client.id))
    fd.append('stage_code', code)
    startTransition(() => { advanceStage(fd) })
  }

  return (
    <div style={{
      marginTop: 24,
      display: 'grid',
      gridTemplateColumns: `repeat(${Math.max(1, stages.length)}, 1fr)`,
      gap: 4,
    }}>
      {stages.map((stage, idx) => {
        const done = idx < currentIdx
        const current = idx === currentIdx
        // Градиент: чем дальше пройденный этап — тем плотнее purple
        const t = currentIdx > 0 ? Math.max(0, Math.min(1, idx / Math.max(1, currentIdx))) : 0
        const doneBg = done ? `rgba(181, 127, 207, ${0.10 + t * 0.20})` : 'transparent'
        return (
          <button
            key={stage.code}
            type="button"
            onClick={() => setStage(stage.code)}
            disabled={pending}
            style={{
              background: current
                ? 'linear-gradient(135deg, var(--ds-purple) 0%, var(--ds-purple-deep) 100%)'
                : doneBg,
              color: current ? '#fff' : done ? 'var(--ds-ink)' : 'var(--ds-muted)',
              border: `1px solid ${current ? 'var(--ds-purple)' : done ? 'var(--ds-border)' : 'var(--ds-border-soft)'}`,
              borderRadius: 'var(--ds-r-sm)',
              padding: '10px',
              fontSize: 11,
              fontWeight: current ? 700 : 500,
              letterSpacing: '0.04em',
              textTransform: 'uppercase',
              cursor: 'pointer',
              transition: 'all 150ms',
              textAlign: 'center',
              lineHeight: 1.2,
              boxShadow: current ? '0 4px 12px -4px rgba(181,127,207,0.45)' : 'none',
            }}
            title={stage.title}
          >
            {done && '✓ '}
            {stage.title}
          </button>
        )
      })}
    </div>
  )
}

function RoadmapTab({
  client, stages, clientStages, checklist, checklistProgress,
}: {
  client: any
  stages: any[]
  clientStages: any[]
  checklist: any[]
  checklistProgress: any[]
}) {
  const [pending, startTransition] = useTransition()

  const currentIdx = stages.findIndex(s => s.code === client.current_stage_code)
  const progressSet = new Set(checklistProgress.filter(p => p.is_done).map(p => p.checklist_id))
  const checklistByStage: Record<string, any[]> = {}
  checklist.forEach(c => {
    if (!checklistByStage[c.stage_id]) checklistByStage[c.stage_id] = []
    checklistByStage[c.stage_id].push(c)
  })

  function setStage(code: string) {
    if (code === client.current_stage_code || pending) return
    const fd = new FormData()
    fd.append('client_id', String(client.id))
    fd.append('stage_code', code)
    startTransition(() => { advanceStage(fd) })
  }

  function toggle(checklistId: string, isDoneNow: boolean) {
    const fd = new FormData()
    fd.append('client_id', String(client.id))
    fd.append('checklist_id', checklistId)
    fd.append('is_done', String(!isDoneNow))
    startTransition(() => { toggleChecklist(fd) })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* Stage switcher */}
      <div className="ds-card" style={{ padding: 28 }}>
        <SectionHead
          eyebrow="Этапы"
          title="Дорожная карта клиента"
          description="Нажми на этап чтобы переключить текущий статус. Клиент сразу увидит изменение в таймлайне у себя."
        />
        <div
          style={{
            marginTop: 24,
            display: 'grid',
            gridTemplateColumns: `repeat(${Math.max(1, stages.length)}, 1fr)`,
            gap: 4,
          }}
        >
          {stages.map((stage, idx) => {
            const done = idx < currentIdx
            const current = idx === currentIdx
            return (
              <button
                key={stage.code}
                type="button"
                onClick={() => setStage(stage.code)}
                disabled={pending}
                style={{
                  background: current ? 'var(--ds-purple)' : 'transparent',
                  color: current ? '#fff' : done ? 'var(--ds-ink)' : 'var(--ds-muted)',
                  border: `1px solid ${current ? 'var(--ds-purple)' : done ? 'var(--ds-border)' : 'var(--ds-border-soft)'}`,
                  borderRadius: 'var(--ds-r-sm)',
                  padding: '10px 10px',
                  fontFamily: 'var(--ds-font)',
                  fontSize: 11,
                  fontWeight: current ? 700 : 500,
                  letterSpacing: '0.04em',
                  textTransform: 'uppercase',
                  cursor: 'pointer',
                  transition: 'all 150ms',
                  textAlign: 'center',
                  lineHeight: 1.2,
                }}
                title={stage.title}
              >
                {done && '✓ '}
                {stage.title}
              </button>
            )
          })}
        </div>
      </div>

      {/* Checklist per stage */}
      <div className="ds-card" style={{ padding: 28 }}>
        <SectionHead
          eyebrow="Чек-лист"
          title="Задачи по этапам"
          description="Отметь выполненное. Клиент увидит что шаг закрыт в своей дорожной карте."
        />
        <div style={{ marginTop: 20, display: 'flex', flexDirection: 'column', gap: 24 }}>
          {stages.map((stage, idx) => {
            const items = checklistByStage[stage.id] || []
            if (items.length === 0) return null
            const doneInStage = items.filter(i => progressSet.has(i.id)).length
            const isCurrent = idx === currentIdx

            return (
              <div key={stage.id}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginBottom: 10,
                  }}
                >
                  <h4
                    style={{
                      fontFamily: 'var(--ds-font-display-stack)',
                      fontWeight: 700,
                      fontSize: 13,
                      textTransform: 'uppercase',
                      letterSpacing: '0.08em',
                      color: isCurrent ? 'var(--ds-ink)' : 'var(--ds-muted)',
                      margin: 0,
                    }}
                  >
                    {isCurrent && '● '}{stage.title}
                  </h4>
                  <span className="ds-mono" style={{ fontSize: 11, color: 'var(--ds-muted)', fontWeight: 600 }}>
                    {doneInStage}/{items.length}
                  </span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  {items.map((item) => {
                    const isDone = progressSet.has(item.id)
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => toggle(item.id, isDone)}
                        disabled={pending}
                        style={{
                          background: 'transparent',
                          border: 'none',
                          borderBottom: '1px solid var(--ds-border-soft)',
                          padding: '10px 0',
                          display: 'flex',
                          alignItems: 'flex-start',
                          gap: 12,
                          textAlign: 'left',
                          cursor: 'pointer',
                          fontFamily: 'var(--ds-font)',
                        }}
                      >
                        <div
                          style={{
                            width: 20,
                            height: 20,
                            borderRadius: '50%',
                            border: `2px solid ${isDone ? 'var(--ds-success)' : 'var(--ds-border)'}`,
                            background: isDone ? 'var(--ds-success)' : 'transparent',
                            color: '#fff',
                            display: 'grid',
                            placeItems: 'center',
                            fontSize: 11,
                            fontWeight: 700,
                            flexShrink: 0,
                            marginTop: 1,
                          }}
                        >
                          {isDone ? '✓' : ''}
                        </div>
                        <div
                          style={{
                            flex: 1,
                            fontSize: 13,
                            color: isDone ? 'var(--ds-muted)' : 'var(--ds-ink)',
                            textDecoration: isDone ? 'line-through' : 'none',
                            textDecorationColor: 'rgba(134,134,139,0.5)',
                            lineHeight: 1.4,
                            letterSpacing: '-0.005em',
                          }}
                        >
                          {item.text}
                        </div>
                      </button>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════
   TAB · Подборка
   ═══════════════════════════════════════════════════════════════ */

function ShortlistTab({
  client, universities, catalog, enrichmentByProgram, logoBySchool, scholarships, suggestedScholarships, applications,
}: {
  client: any
  universities: any[]
  catalog: CatalogData | null
  enrichmentByProgram: Record<number, any>
  logoBySchool: Record<number, string | null>
  scholarships: any[]
  suggestedScholarships: any[]
  applications: any[]
}) {
  const router = useRouter()
  const appByShortlist = new Map<string, any>()
  for (const a of applications) {
    if (a.shortlist_id) appByShortlist.set(a.shortlist_id, a)
  }
  const [pending, startTransition] = useTransition()
  const [publishToast, setPublishToast] = useState<string | null>(null)

  function setStatus(uniId: string, status: string) {
    const fd = new FormData()
    fd.append('client_id', String(client.id))
    fd.append('uni_id', uniId)
    fd.append('status', status)
    startTransition(() => { updateUniversityStatus(fd) })
  }

  function remove(uniId: string) {
    if (!confirm('Удалить программу из подборки?')) return
    const fd = new FormData()
    fd.append('client_id', String(client.id))
    fd.append('uni_id', uniId)
    startTransition(() => { removeUniversity(fd) })
  }

  function handlePublish() {
    if (universities.length === 0) return
    const fd = new FormData()
    fd.append('client_id', String(client.id))
    startTransition(async () => {
      await publishShortlist(fd)
      setPublishToast('Подборка отправлена клиенту ✓')
      setTimeout(() => setPublishToast(null), 2400)
    })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div className="ds-card" style={{ padding: 28 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
          <SectionHead
            eyebrow="В работе"
            title={`Вузы клиента · ${universities.length}`}
            description="Программы из каталога ниже. Кликни по строке чтобы открыть программу, по статусу — изменить, ✕ — удалить."
          />
          {universities.length > 0 && (
            <button
              type="button"
              className="ds-btn ds-btn-primary ds-btn-sm"
              onClick={handlePublish}
              disabled={pending}
            >
              {pending ? '…' : '↗ Отправить клиенту'}
            </button>
          )}
        </div>

        {publishToast && (
          <div style={{
            marginTop: 12,
            padding: '10px 14px',
            background: 'var(--ds-success-soft)',
            color: 'var(--ds-success-ink)',
            borderRadius: 'var(--ds-r-sm)',
            fontSize: 13,
            fontWeight: 600,
          }}>{publishToast}</div>
        )}

        {universities.length === 0 ? (
          <div
            style={{
              marginTop: 20,
              padding: '32px 24px',
              textAlign: 'center',
              background: 'var(--ds-bg-alt)',
              border: '1px dashed var(--ds-border)',
              borderRadius: 'var(--ds-r-md)',
              color: 'var(--ds-muted)',
              fontSize: 14,
            }}
          >
            Ещё нет добавленных вузов. Выбирай из каталога ниже → кнопка <b style={{ color: 'var(--ds-ink)' }}>+ В подборку</b>.
          </div>
        ) : (
          <div style={{ marginTop: 20, display: 'flex', flexDirection: 'column', gap: 10 }}>
            {universities.map((uni) => {
              let programId: number | null = null
              let schoolId: number | null = null
              try {
                const meta = JSON.parse(uni.notes || '{}')
                programId = meta.program_id || null
                schoolId = meta.school_id || null
              } catch {}
              const existingApp = appByShortlist.get(uni.id)
              return (
                <UniversityRow
                  key={uni.id}
                  uni={uni}
                  pending={pending}
                  programId={programId}
                  schoolId={schoolId}
                  logoUrl={schoolId ? logoBySchool[schoolId] : null}
                  enrichment={programId ? enrichmentByProgram[programId] : null}
                  onStatusChange={(s) => setStatus(uni.id, s)}
                  onRemove={() => remove(uni.id)}
                  existingApp={existingApp}
                  clientId={client.id}
                  onAppCreated={() => router.refresh()}
                />
              )
            })}
          </div>
        )}
      </div>

      {/* Стипендии в подборке клиента */}
      <ScholarshipsBlock scholarships={scholarships} suggestedScholarships={suggestedScholarships} clientId={client.id} />

      {/* Каталог базы вузов — ищем + добавляем в подборку клиента */}
      {catalog && <CatalogPanel client={client} catalog={catalog} />}
    </div>
  )
}

function ScholarshipsBlock({ scholarships, suggestedScholarships, clientId }: {
  scholarships: any[]
  suggestedScholarships: any[]
  clientId: number
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [toast, setToast] = useState<string | null>(null)

  function fmtDate(d: string | null) {
    if (!d) return '—'
    try {
      return new Date(d).toLocaleDateString('ru', { day: 'numeric', month: 'short', year: 'numeric' })
    } catch { return d }
  }
  const STATUS: Record<string, { label: string; chip: string }> = {
    planned: { label: 'Планируется', chip: 'ds-chip-neutral' },
    applying: { label: 'Подаём', chip: 'ds-chip-info' },
    submitted: { label: 'Подано', chip: 'ds-chip-warning' },
    awarded: { label: 'Получили', chip: 'ds-chip-success' },
    rejected: { label: 'Отказ', chip: 'ds-chip-error' },
  }

  const totalUnlocked = scholarships.filter(s => s.unlocked_for_client).length
  const allUnlocked = scholarships.length > 0 && totalUnlocked === scholarships.length

  // Скрываем подсказки которые уже в подборке (по kind+id)
  const inShortlistKey = new Set(scholarships.map(s => `${s.kind || 'private'}:${s.scholarship_id}`))
  const suggestionsFiltered = (suggestedScholarships || []).filter(s => {
    const id = s.kind === 'idp' ? s.id : s.kind === 'government' ? s.id : s.scholarship_id
    return !inShortlistKey.has(`${s.kind}:${id}`)
  })

  function handleAdd(s: any) {
    const fd = new FormData()
    fd.append('client_id', String(clientId))
    fd.append('scholarship_id', String(s.kind === 'private' ? s.scholarship_id : s.id))
    fd.append('kind', s.kind)
    startTransition(async () => {
      const res = await addScholarshipToClient(fd)
      if ((res as any)?.error) setToast(`Ошибка: ${(res as any).error}`)
      else setToast('Добавлено в подборку (скрыто от клиента)')
      setTimeout(() => setToast(null), 2400)
      router.refresh()
    })
  }

  function handleBulkVisibility(unlock: boolean) {
    if (scholarships.length === 0) return
    if (unlock && !confirm(`Раскрыть все ${scholarships.length} стипендий клиенту?`)) return
    if (!unlock && !confirm('Скрыть все стипендии от клиента?')) return
    const fd = new FormData()
    fd.append('client_id', String(clientId))
    fd.append('unlocked', unlock ? '1' : '0')
    startTransition(async () => {
      const res = await setClientScholarshipsVisibility(fd)
      if ((res as any)?.error) setToast(`Ошибка: ${(res as any).error}`)
      else setToast(unlock ? 'Раскрыто клиенту ✓' : 'Скрыто от клиента ✓')
      setTimeout(() => setToast(null), 2400)
      router.refresh()
    })
  }

  return (
    <div className="ds-card" style={{ padding: 28 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <SectionHead
          eyebrow="Финансы"
          title={`Стипендии · ${scholarships.length}`}
          description={
            scholarships.length === 0
              ? 'Куратор подбирает стипендии. Клиент не видит их пока куратор не раскроет (после оплаты доп.услуги).'
              : allUnlocked
                ? '👁 Раскрыто клиенту — он видит все стипендии в кабинете.'
                : totalUnlocked > 0
                  ? `Частично раскрыто (${totalUnlocked} / ${scholarships.length}). Используй кнопки чтобы синхронизировать.`
                  : '🔒 Скрыто от клиента. После оплаты доп.услуги нажми «Раскрыть всё клиенту».'
          }
        />
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {scholarships.length > 0 && (
            allUnlocked ? (
              <button
                type="button"
                disabled={pending}
                onClick={() => handleBulkVisibility(false)}
                className="ds-btn ds-btn-secondary ds-btn-sm"
              >
                🔒 Скрыть от клиента
              </button>
            ) : (
              <button
                type="button"
                disabled={pending}
                onClick={() => handleBulkVisibility(true)}
                className="ds-btn ds-btn-primary ds-btn-sm"
              >
                👁 Раскрыть всё клиенту
              </button>
            )
          )}
          <Link
            href="/curator/scholarships"
            className="ds-btn ds-btn-secondary ds-btn-sm"
            style={{ textDecoration: 'none' }}
          >
            Каталог →
          </Link>
        </div>
      </div>

      {toast && (
        <div style={{
          marginTop: 12, padding: '10px 14px',
          background: 'var(--ds-success-soft)', color: 'var(--ds-success-ink)',
          borderRadius: 'var(--ds-r-sm)', fontSize: 13, fontWeight: 600,
        }}>{toast}</div>
      )}

      {/* Suggestions от matcher'а */}
      {suggestionsFiltered.length > 0 && (
        <div style={{ marginTop: 20 }}>
          <div style={{
            fontSize: 11, fontWeight: 700, letterSpacing: '0.08em',
            textTransform: 'uppercase', color: 'var(--ds-muted)', marginBottom: 8,
            display: 'flex', alignItems: 'center', gap: 8,
          }}>
            💡 Доступные по вузам клиента · {suggestionsFiltered.length}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {suggestionsFiltered.slice(0, 12).map((s, idx) => {
              const id = s.kind === 'private' ? s.scholarship_id : s.id
              const title = s.kind === 'private' ? s.title : s.name
              const kindBadge = s.kind === 'idp'
                ? { label: 'IDP', color: '#0088cc', bg: 'rgba(0,136,204,.10)' }
                : s.kind === 'government'
                  ? { label: 'Гос.', color: 'var(--ds-purple-deep)', bg: 'var(--ds-purple-soft)' }
                  : { label: 'QS', color: 'var(--ds-purple-deep)', bg: 'var(--ds-purple-soft)' }
              const detailHref = s.kind === 'idp'
                ? `/curator/scholarships/idp/${id}`
                : `/curator/scholarships/${id}`
              const value = s.kind === 'private'
                ? s.amount_text
                : s.kind === 'idp'
                  ? (s.value_amount ? `${Number(s.value_amount).toLocaleString('ru')} ${s.value_currency || ''}`.trim() : s.value_text)
                  : (s.monthly_stipend ? `${Number(s.monthly_stipend).toLocaleString('ru')} ${s.monthly_stipend_currency || ''}/мес` : null)
              const deadline = s.kind === 'private' ? s.deadline : s.application_deadline
              return (
                <div key={`${s.kind}:${id}:${idx}`} style={{
                  padding: '12px 14px', display: 'grid',
                  gridTemplateColumns: '1fr auto', gap: 12, alignItems: 'center',
                  background: 'var(--ds-bg-alt)',
                  border: '1px solid var(--ds-border-soft)',
                  borderRadius: 'var(--ds-r-md)',
                }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <Link href={detailHref} style={{ fontSize: 13, fontWeight: 600, color: 'var(--ds-ink)', textDecoration: 'none' }}>
                        {title}
                      </Link>
                      <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: kindBadge.color, background: kindBadge.bg, padding: '2px 6px', borderRadius: 4 }}>
                        {kindBadge.label}
                      </span>
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--ds-muted)', marginTop: 2 }}>
                      по вузу <b>{s.matched_school?.name || '—'}</b>
                      {value ? ` · ${value}` : ''}
                      {deadline ? ` · до ${fmtDate(deadline)}` : ''}
                    </div>
                  </div>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => handleAdd(s)}
                    className="ds-btn ds-btn-secondary ds-btn-sm"
                  >
                    + В подборку
                  </button>
                </div>
              )
            })}
            {suggestionsFiltered.length > 12 && (
              <div style={{ fontSize: 11, color: 'var(--ds-muted)', textAlign: 'center', padding: 6 }}>
                ещё {suggestionsFiltered.length - 12} — открой <Link href="/curator/scholarships" style={{ color: 'var(--ds-purple-deep)' }}>каталог</Link>
              </div>
            )}
          </div>
        </div>
      )}

      {scholarships.length === 0 ? (
        <div
          style={{
            marginTop: 20,
            padding: '24px 20px',
            textAlign: 'center',
            background: 'var(--ds-bg-alt)',
            border: '1px dashed var(--ds-border)',
            borderRadius: 'var(--ds-r-md)',
            color: 'var(--ds-muted)',
            fontSize: 13,
          }}
        >
          Подобранных стипендий пока нет. Открой каталог и добавь нужные клиенту.
        </div>
      ) : (
        <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {scholarships.map(s => {
            const meta = STATUS[s.status] || STATUS.planned
            const kind = (s.kind as 'private' | 'government' | 'idp' | undefined) || 'private'
            const kindHref = kind === 'idp'
              ? `/curator/scholarships/idp/${s.scholarship_id}`
              : `/curator/scholarships/${s.scholarship_id}`
            const kindBadge = kind === 'idp'
              ? { label: 'IDP', color: '#0088cc', bg: 'rgba(0,136,204,.10)' }
              : kind === 'government'
                ? { label: 'Гос.', color: 'var(--ds-purple-deep)', bg: 'var(--ds-purple-soft)' }
                : null
            return (
              <div
                key={s.id}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr auto',
                  gap: 12,
                  padding: '14px 16px',
                  background: 'var(--ds-bg-alt)',
                  border: '1px solid var(--ds-border-soft)',
                  borderRadius: 'var(--ds-r-md)',
                  alignItems: 'center',
                  borderLeft: kind === 'idp' ? '3px solid #0088cc' : kind === 'government' ? '3px solid var(--ds-purple-deep)' : undefined,
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <Link
                      href={kindHref}
                      style={{ fontSize: 14, fontWeight: 600, color: 'var(--ds-ink)', textDecoration: 'none' }}
                    >
                      {s.scholarship_title}
                    </Link>
                    {kindBadge && (
                      <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: kindBadge.color, background: kindBadge.bg, padding: '2px 6px', borderRadius: 4 }}>
                        {kindBadge.label}
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--ds-muted)', marginTop: 2 }}>
                    {s.institution_title || '—'}
                    {s.amount_text ? ` · ${s.amount_text}` : ''}
                    {s.deadline ? ` · до ${fmtDate(s.deadline)}` : ''}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <span
                    title={s.unlocked_for_client ? 'Клиент видит' : 'Скрыто от клиента'}
                    style={{
                      fontSize: 11, fontWeight: 700,
                      padding: '3px 7px', borderRadius: 999,
                      background: s.unlocked_for_client ? 'rgba(22,163,97,.12)' : 'rgba(138,135,150,.12)',
                      color: s.unlocked_for_client ? 'var(--ds-success-ink)' : 'var(--ds-muted)',
                    }}
                  >
                    {s.unlocked_for_client ? '👁' : '🔒'}
                  </span>
                  <span className={`ds-chip ${meta.chip}`} style={{ textTransform: 'uppercase', letterSpacing: '0.06em', fontSize: 10, fontWeight: 700 }}>
                    {meta.label}
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

const CATALOG_COUNTRY_LABELS: Record<string, string> = {
  us: 'США', gb: 'Великобритания', ca: 'Канада', au: 'Австралия',
  de: 'Германия', fr: 'Франция', it: 'Италия', es: 'Испания',
  nl: 'Нидерланды', at: 'Австрия', ie: 'Ирландия', ae: 'ОАЭ', hu: 'Венгрия',
}

function UniLogo({ logoUrl, name, size = 40 }: { logoUrl: string | null | undefined; name: string; size?: number }) {
  if (logoUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={logoUrl}
        alt={name}
        style={{
          width: size, height: size, borderRadius: 10,
          objectFit: 'contain', background: '#fff',
          border: '1px solid var(--ds-border-soft)', flexShrink: 0,
        }}
      />
    )
  }
  const letter = (name || '?').trim()[0]?.toUpperCase() || '?'
  return (
    <div
      style={{
        width: size, height: size, borderRadius: 10, flexShrink: 0,
        background: 'var(--ds-purple-soft)', color: 'var(--ds-purple-deep)',
        display: 'grid', placeItems: 'center',
        fontFamily: 'var(--ds-font-display-stack)',
        fontSize: Math.round(size * 0.4), fontWeight: 700,
        border: '1px solid var(--ds-border-soft)',
      }}
    >
      {letter}
    </div>
  )
}

function UniversityRow({
  uni, pending, programId, schoolId, logoUrl, enrichment, onStatusChange, onRemove,
  existingApp, clientId, onAppCreated,
}: {
  uni: any
  pending: boolean
  programId: number | null
  schoolId: number | null
  logoUrl: string | null | undefined
  enrichment: any | null
  onStatusChange: (s: string) => void
  onRemove: () => void
  existingApp: any | undefined
  clientId: number
  onAppCreated: () => void
}) {
  const [appPending, startApp] = useTransition()
  const [appError, setAppError] = useState<string | null>(null)

  function createApp() {
    setAppError(null)
    let intake: string | null = null
    try {
      const meta = JSON.parse(uni.notes || '{}')
      if (meta.intake) intake = meta.intake
    } catch {}
    startApp(async () => {
      const res = await createApplication({
        clientId,
        shortlistId: uni.id,
        universityName: uni.university_name,
        programName: uni.program_name || null,
        country: uni.country || null,
        intake,
        schoolId: schoolId || null,
      })
      if ('error' in res && res.error) setAppError(res.error)
      else onAppCreated()
    })
  }

  const [statusOpen, setStatusOpen] = useState(false)
  const [aiLoading, setAiLoading] = useState(false)
  const [aiError, setAiError] = useState<string | null>(null)
  const statusRef = useRef<HTMLDivElement>(null)
  const status = UNI_STATUS[uni.status] || UNI_STATUS.planned
  const programHref = programId ? `/curator/programs/${programId}` : null
  const schoolHref = schoolId ? `/curator/universities/${schoolId}` : null

  async function triggerAI() {
    if (!programId || aiLoading) return
    setAiLoading(true)
    setAiError(null)
    try {
      const res = await fetch('/api/ai/fill-program', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ programId }),
      })
      const json = await res.json()
      if (!json.ok) {
        setAiError(json.error || 'Ошибка ИИ')
      } else {
        // Reload page to fetch fresh enrichment
        window.location.reload()
      }
    } catch (e: any) {
      setAiError(e?.message || 'Ошибка сети')
    } finally {
      setAiLoading(false)
    }
  }

  useEffect(() => {
    if (!statusOpen) return
    function handle(e: MouseEvent) {
      if (statusRef.current && !statusRef.current.contains(e.target as Node)) setStatusOpen(false)
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [statusOpen])

  const aiFacts: string[] = []
  if (enrichment) {
    if (enrichment.earliest_intake_label) aiFacts.push(`🗓 ${enrichment.earliest_intake_label}`)
    if (enrichment.deadline_label) aiFacts.push(`⏱ ${enrichment.deadline_label}`)
    if (enrichment.gross_tuition_label) aiFacts.push(`💵 ${enrichment.gross_tuition_label}`)
    if (enrichment.ielts_min) aiFacts.push(`IELTS ≥ ${enrichment.ielts_min}`)
    if (enrichment.min_gpa_percent) aiFacts.push(`GPA ≥ ${enrichment.min_gpa_percent}%`)
    if (enrichment.pgwp_eligible) aiFacts.push('PGWP')
    if (enrichment.coop_available) aiFacts.push('Co-op')
    if (enrichment.conditional_offer_available) aiFacts.push('Conditional')
  }

  // Для BD-импортированных программ name=specialty_group (одна из 16). Если так — школа в заголовке.
  const SPECIALTY_GROUPS = new Set([
    'Бизнес и управление', 'IT и технологии', 'Экономика и финансы', 'Инженерия',
    'Медицина и здоровье', 'Право', 'Дизайн и искусство', 'Гуманитарные науки',
    'Естественные науки', 'Социальные науки', 'Образование', 'Медиа и коммуникации',
    'Туризм и гостиничный', 'Архитектура', 'Языковые курсы', 'Другое',
  ])
  const isPlaceholderProgramName = !!uni.program_name && SPECIALTY_GROUPS.has(uni.program_name)
  const titleHref = isPlaceholderProgramName ? schoolHref : (programHref || schoolHref)
  const titleText = isPlaceholderProgramName
    ? uni.university_name
    : (uni.program_name || uni.university_name || 'Программа')
  const subtitleHref = isPlaceholderProgramName ? programHref : schoolHref
  const subtitleText = isPlaceholderProgramName
    ? (uni.program_name || '')
    : uni.university_name

  const titleEl = titleHref ? (
    <Link href={titleHref} style={{ color: 'inherit', textDecoration: 'none' }} className="ds-link-hover">
      {titleText}
    </Link>
  ) : titleText

  const subtitleEl = subtitleHref && subtitleText ? (
    <Link href={subtitleHref} style={{ color: 'inherit', textDecoration: 'none' }} className="ds-link-hover">
      {subtitleText}
    </Link>
  ) : subtitleText

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'auto 1fr auto auto auto auto',
        gap: 12,
        padding: '14px 16px',
        background: 'var(--ds-bg)',
        border: '1px solid var(--ds-border-soft)',
        borderRadius: 'var(--ds-r-md)',
        alignItems: 'center',
      }}
    >
      <UniLogo logoUrl={logoUrl} name={uni.university_name} size={40} />

      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--ds-ink)', letterSpacing: '-0.01em' }}>
          {titleEl}
        </div>
        <div style={{ fontSize: 12, color: 'var(--ds-muted)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {subtitleEl}{[uni.country, uni.city].filter(Boolean).length > 0 && subtitleText ? ' · ' : ''}{[uni.country, uni.city].filter(Boolean).join(' · ')}
        </div>
        {aiFacts.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
            {aiFacts.map((fact, i) => (
              <span
                key={i}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  padding: '2px 8px',
                  fontSize: 10,
                  fontWeight: 600,
                  letterSpacing: '0.02em',
                  background: 'var(--ds-purple-soft)',
                  color: 'var(--ds-purple-deep)',
                  borderRadius: 999,
                }}
              >
                {fact}
              </span>
            ))}
          </div>
        )}
        {aiError && (
          <div style={{ marginTop: 6, fontSize: 11, color: 'var(--ds-error)' }}>
            ИИ: {aiError}
          </div>
        )}
      </div>

      <div ref={statusRef} style={{ position: 'relative' }}>
        <button
          type="button"
          onClick={() => setStatusOpen(v => !v)}
          disabled={pending}
          className={`ds-chip ${status.chipClass}`}
          style={{
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            fontSize: 10,
            fontWeight: 700,
            cursor: 'pointer',
            border: 'none',
            fontFamily: 'inherit',
          }}
        >
          {status.label} ▾
        </button>
        {statusOpen && (
          <div style={{
            position: 'absolute',
            top: 'calc(100% + 6px)',
            right: 0,
            minWidth: 180,
            background: 'var(--ds-bg)',
            border: '1px solid var(--ds-border)',
            borderRadius: 10,
            boxShadow: '0 8px 28px -8px rgba(29,29,31,0.18)',
            zIndex: 40,
            padding: 6,
          }}>
            {Object.entries(UNI_STATUS).map(([key, val]) => (
              <button
                key={key}
                type="button"
                onClick={() => { onStatusChange(key); setStatusOpen(false) }}
                style={{
                  width: '100%',
                  textAlign: 'left',
                  padding: '8px 10px',
                  background: key === uni.status ? 'var(--ds-bg-alt)' : 'transparent',
                  border: 'none',
                  borderRadius: 6,
                  cursor: 'pointer',
                  fontSize: 12,
                  fontFamily: 'inherit',
                  color: 'var(--ds-ink)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                }}
                onMouseEnter={(e) => e.currentTarget.style.background = 'var(--ds-bg-alt)'}
                onMouseLeave={(e) => e.currentTarget.style.background = key === uni.status ? 'var(--ds-bg-alt)' : 'transparent'}
              >
                <span className={`ds-chip ${val.chipClass}`} style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                  {val.label}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      {existingApp ? (
        <Link
          href={`/client/applications/${existingApp.id}?clientId=${clientId}`}
          title={`Заявка · стадия: ${existingApp.stage}`}
          style={{
            padding: '6px 10px',
            background: 'var(--ds-success-soft)',
            border: '1px solid rgba(52, 199, 89, 0.32)',
            borderRadius: 8,
            fontSize: 11,
            fontWeight: 700,
            color: 'var(--ds-success-ink)',
            textDecoration: 'none',
            whiteSpace: 'nowrap',
            letterSpacing: '0.04em',
            textTransform: 'uppercase',
          }}
        >
          ✓ Заявка
        </Link>
      ) : (
        <button
          type="button"
          onClick={createApp}
          disabled={appPending || pending}
          title={appError || 'Создать заявку из этой программы'}
          style={{
            padding: '6px 10px',
            background: 'var(--ds-purple-soft)',
            border: '1px solid var(--ds-purple)',
            borderRadius: 8,
            fontSize: 11,
            fontWeight: 700,
            color: 'var(--ds-purple-deep)',
            cursor: appPending ? 'wait' : 'pointer',
            fontFamily: 'inherit',
            whiteSpace: 'nowrap',
            letterSpacing: '0.04em',
            textTransform: 'uppercase',
          }}
        >
          {appPending ? '⏳' : '→ Заявка'}
        </button>
      )}

      {programId && (
        <button
          type="button"
          onClick={triggerAI}
          disabled={aiLoading || pending}
          title={enrichment ? 'Обновить данные через ИИ' : 'Получить данные через ИИ'}
          style={{
            padding: '6px 10px',
            background: enrichment ? 'var(--ds-bg)' : 'var(--ds-purple-soft)',
            border: `1px solid ${enrichment ? 'var(--ds-border-soft)' : 'var(--ds-purple)'}`,
            borderRadius: 8,
            fontSize: 11,
            fontWeight: 600,
            color: enrichment ? 'var(--ds-ink)' : 'var(--ds-purple-deep)',
            cursor: aiLoading ? 'wait' : 'pointer',
            fontFamily: 'inherit',
            whiteSpace: 'nowrap',
            letterSpacing: '0.04em',
            textTransform: 'uppercase',
          }}
        >
          {aiLoading ? '⏳' : enrichment ? '↻ ИИ' : '✨ ИИ'}
        </button>
      )}

      <button
        type="button"
        onClick={onRemove}
        disabled={pending}
        title="Удалить из подборки"
        style={{
          padding: '6px 10px',
          background: 'transparent',
          border: '1px solid var(--ds-border-soft)',
          borderRadius: 8,
          fontSize: 14,
          color: 'var(--ds-muted)',
          cursor: 'pointer',
          fontFamily: 'inherit',
          lineHeight: 1,
        }}
      >
        ✕
      </button>
    </div>
  )
}

function CatalogPanel({ client, catalog }: { client: any; catalog: CatalogData }) {
  const myClient = [{ id: client.id, name: client.name || 'Клиент', country: client.country }]
  const totalPages = Math.max(1, Math.ceil((catalog.total || 0) / catalog.pageSize))
  const currentPage = catalog.page
  const filters = catalog.filters

  function buildPageHref(p: number) {
    const params = new URLSearchParams()
    params.set('tab', 'shortlist')
    if (filters.q) params.set('q', filters.q)
    if (filters.country) params.set('country', filters.country)
    if (filters.school) params.set('school', filters.school)
    if (filters.levels) params.set('levels', filters.levels)
    if (filters.intakes) params.set('intakes', filters.intakes)
    if (filters.sort && filters.sort !== 'name_asc') params.set('sort', filters.sort)
    if (filters.specialty) params.set('specialty', filters.specialty)
    if (filters.uniType) params.set('uniType', filters.uniType)
    if (filters.budget) params.set('budget', filters.budget)
    if (p > 1) params.set('page', String(p))
    return `?${params.toString()}`
  }

  const pageButtons: number[] = []
  let start = Math.max(1, currentPage - 3)
  const end = Math.min(totalPages, start + 6)
  if (end - start < 6) start = Math.max(1, end - 6)
  for (let i = start; i <= end; i++) pageButtons.push(i)

  return (
    <div className="ds-card" style={{ padding: 28 }}>
      <SectionHead
        eyebrow="Каталог базы вузов"
        title={`Всего программ · ${catalog.total.toLocaleString('ru')}`}
        description="Ищи программу в полной базе и добавляй в подборку этого клиента одним кликом."
      />

      <div style={{ marginTop: 20 }}>
        <UniversityFilters
          countryCodes={catalog.countryCodes}
          countryLabels={CATALOG_COUNTRY_LABELS}
          countryCounts={catalog.countryCounts}
          schools={catalog.schools}
          specialtyOptions={catalog.specialtyOptions}
          basePath={`/curator/clients/${client.id}`}
          stickyParams={{ tab: 'shortlist' }}
          initial={{
            q: filters.q || '',
            country: filters.country || '',
            school: filters.school || '',
            levels: (filters.levels || '').split(',').filter(Boolean),
            intakeYears: (filters.intakes || '').split(',').filter(Boolean),
            sort: (filters.sort as any) || 'name_asc',
            specialty: filters.specialty || '',
            uniType: filters.uniType || '',
            budget: filters.budget || '',
          }}
        />
      </div>

      {catalog.programs.length === 0 ? (
        <div
          style={{
            marginTop: 20,
            padding: '48px 24px',
            textAlign: 'center',
            background: 'var(--ds-bg-alt)',
            border: '1px dashed var(--ds-border)',
            borderRadius: 'var(--ds-r-md)',
            color: 'var(--ds-muted)',
            fontSize: 14,
          }}
        >
          Ничего не найдено — попробуй изменить фильтры.
        </div>
      ) : (
        <>
          <div style={{ marginTop: 20, display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))' }}>
            {catalog.programs.map(prog => (
              <ProgramCardInteractive key={prog.id} program={prog} myClients={myClient} />
            ))}
          </div>

          {totalPages > 1 && (
            <div className="ds-pag" style={{ marginTop: 24, justifyContent: 'center' }}>
              {currentPage > 1 && <Link href={buildPageHref(currentPage - 1)} className="ds-pag-btn" scroll={false}>‹</Link>}
              {pageButtons.map(p => (
                <Link
                  key={p}
                  href={buildPageHref(p)}
                  scroll={false}
                  className={`ds-pag-btn${p === currentPage ? ' active' : ''}`}
                >
                  {p}
                </Link>
              ))}
              {currentPage < totalPages && <Link href={buildPageHref(currentPage + 1)} className="ds-pag-btn" scroll={false}>›</Link>}
            </div>
          )}
        </>
      )}
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════
   TAB · Документы
   ═══════════════════════════════════════════════════════════════ */

function DocumentsTab({ documents }: { documents: any[] }) {
  return (
    <div className="ds-card" style={{ padding: 28 }}>
      <SectionHead
        eyebrow="Документы"
        title={`Загружено · ${documents.length}`}
        description="Всё что клиент загрузил или то что куратор добавил в работу. Статусы меняются по мере работы: получен → перевод → заверен → загружен в вуз."
      />
      {documents.length === 0 ? (
        <div
          style={{
            marginTop: 20,
            padding: '48px 24px',
            textAlign: 'center',
            background: 'var(--ds-bg-alt)',
            border: '1px dashed var(--ds-border)',
            borderRadius: 'var(--ds-r-md)',
            color: 'var(--ds-muted)',
            fontSize: 14,
          }}
        >
          Документы пока не добавлены. Клиент загрузит их через <b style={{ color: 'var(--ds-ink)' }}>/client/documents</b> или свою главную страницу.
        </div>
      ) : (
        <div style={{ marginTop: 20, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {documents.map((doc) => {
            const status = DOC_STATUS[doc.status] || { label: doc.status, chipClass: 'ds-chip-neutral' }
            return (
              <div
                key={doc.id}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr auto auto',
                  alignItems: 'center',
                  gap: 12,
                  padding: '14px 16px',
                  background: 'var(--ds-bg)',
                  border: '1px solid var(--ds-border-soft)',
                  borderRadius: 'var(--ds-r-md)',
                }}
              >
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--ds-ink)' }}>
                    {doc.name || doc.document_type || 'Без названия'}
                  </div>
                  {doc.notes && (
                    <div style={{ fontSize: 12, color: 'var(--ds-muted)', marginTop: 2 }}>{doc.notes}</div>
                  )}
                </div>
                <span className="ds-mono" style={{ fontSize: 11, color: 'var(--ds-muted)' }}>
                  {doc.created_at ? formatDate(doc.created_at) : '—'}
                </span>
                <span className={`ds-chip ${status.chipClass}`} style={{ textTransform: 'uppercase', letterSpacing: '0.06em', fontSize: 10, fontWeight: 700 }}>
                  {status.label}
                </span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════
   TAB · Эссе
   ═══════════════════════════════════════════════════════════════ */

function EssaysTab({ client, essays }: { client: any; essays: any[] }) {
  const resume = essays.find(e => e.type === 'resume')
  const motivation = essays.find(e => e.type === 'motivation')
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }} className="essays-grid">
      <style>{`
        @media (max-width: 820px) { .essays-grid { grid-template-columns: 1fr !important; } }
      `}</style>

      <EssayCard
        client={client}
        essay={resume}
        type="resume"
        emoji="📋"
        title="Резюме"
        editHref={`/curator/clients/${client.id}/resume`}
      />
      <EssayCard
        client={client}
        essay={motivation}
        type="motivation"
        emoji="✍️"
        title="Мотивационное письмо"
        editHref={`/curator/clients/${client.id}/motivation`}
      />
    </div>
  )
}

const ESSAY_STATUS_MAP: Record<string, { label: string; chip: string }> = {
  not_started: { label: 'Нужно сделать', chip: 'ds-chip-warning' },
  draft: { label: 'Клиент заполняет', chip: 'ds-chip-neutral' },
  sent: { label: 'Отправлено — ждёт ревью', chip: 'ds-chip-info' },
  editing: { label: 'Куратор дорабатывает', chip: 'ds-chip-warning' },
  approved: { label: 'Готово ✓', chip: 'ds-chip-success' },
}

function EssayCard({
  client, essay, type, emoji, title, editHref,
}: {
  client: any
  essay: any | undefined
  type: 'resume' | 'motivation'
  emoji: string
  title: string
  editHref: string
}) {
  const [pending, startTransition] = useTransition()
  const status = essay?.status || 'not_started'
  const info = ESSAY_STATUS_MAP[status] || { label: 'Нужно сделать', chip: 'ds-chip-warning' }
  const hasDraft = Boolean(essay && (essay.content || essay.curator_content))

  async function approve() {
    if (!client.id || pending) return
    const { approveEssay } = await import('@/app/client/essays/actions')
    startTransition(async () => {
      const res = await approveEssay({ clientId: client.id, type })
      if (res && (res as any).error) alert((res as any).error)
    })
  }

  return (
    <div
      className="ds-card"
      style={{
        padding: 28,
        display: 'flex',
        flexDirection: 'column',
        gap: 14,
        minHeight: 240,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
        <div style={{ fontSize: 40, lineHeight: 1, filter: 'grayscale(1) contrast(1.15)' }}>
          {emoji}
        </div>
        <div style={{ flex: 1 }}>
          <h3 style={{ fontFamily: 'var(--ds-font-display-stack)', fontWeight: 700, fontSize: 20, textTransform: 'uppercase', letterSpacing: '0.04em', margin: 0, lineHeight: 1.1 }}>
            {title}
          </h3>
          <div style={{ marginTop: 8 }}>
            <span className={`ds-chip ${info.chip}`} style={{ textTransform: 'uppercase', letterSpacing: '0.08em', fontSize: 10, fontWeight: 700 }}>
              {info.label}
            </span>
          </div>
          {essay?.submitted_at && (
            <div style={{ marginTop: 6, fontSize: 11, color: 'var(--ds-muted)' }}>
              Отправлено: {formatDate(essay.submitted_at)}
            </div>
          )}
          {essay?.approved_at && (
            <div style={{ marginTop: 4, fontSize: 11, color: 'var(--ds-muted)' }}>
              Утверждено: {formatDate(essay.approved_at)}
            </div>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 'auto' }}>
        <Link
          href={editHref}
          className="ds-btn ds-btn-secondary ds-btn-sm"
          style={{ textDecoration: 'none' }}
        >
          {hasDraft ? 'Редактировать' : 'Заполнить / редактировать'}
        </Link>
        {status === 'sent' || status === 'editing' ? (
          <button
            type="button"
            onClick={approve}
            disabled={pending}
            className="ds-btn ds-btn-primary ds-btn-sm"
          >
            {pending ? '…' : '✓ Готово'}
          </button>
        ) : null}
      </div>
    </div>
  )
}

function EssayPlaceholder({ emoji, title, subtitle, status }: { emoji: string; title: string; subtitle: string; status: string }) {
  return (
    <div
      className="ds-card"
      style={{
        padding: 32,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        textAlign: 'center',
        gap: 18,
        minHeight: 280,
      }}
    >
      <div style={{ fontSize: 64, lineHeight: 1, filter: 'grayscale(1) contrast(1.15)', opacity: 0.85, marginTop: 8 }}>
        {emoji}
      </div>
      <div>
        <h3
          style={{
            fontFamily: 'var(--ds-font-display-stack)',
            fontWeight: 700,
            fontSize: 20,
            textTransform: 'uppercase',
            letterSpacing: '0.04em',
            color: 'var(--ds-ink)',
            margin: '0 0 8px 0',
            lineHeight: 1.1,
          }}
        >
          {title}
        </h3>
        <p style={{ fontSize: 13, color: 'var(--ds-muted)', margin: 0, lineHeight: 1.5, maxWidth: 360 }}>
          {subtitle}
        </p>
      </div>
      <div
        style={{
          marginTop: 'auto',
          fontSize: 11,
          fontWeight: 700,
          color: 'var(--ds-muted)',
          background: 'var(--ds-bg-alt)',
          padding: '4px 12px',
          borderRadius: 100,
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
        }}
      >
        {status}
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════
   TAB · Заметки
   ═══════════════════════════════════════════════════════════════ */

function NotesTab({ client, activities }: { client: any; activities: any[] }) {
  const [note, setNote] = useState('')
  const [pending, startTransition] = useTransition()

  function submit() {
    if (!note.trim() || pending) return
    const fd = new FormData()
    fd.append('client_id', String(client.id))
    fd.append('content', note)
    startTransition(async () => {
      await addActivity(fd)
      setNote('')
    })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* Add note */}
      <div className="ds-card" style={{ padding: 24 }}>
        <SectionHead eyebrow="Новая запись" title="Заметка куратора" />
        <div style={{ marginTop: 16 }}>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={4}
            className="ds-input"
            placeholder="Короткая заметка — что обсудили, что сделали, что дальше…"
            style={{ resize: 'vertical', lineHeight: 1.5 }}
          />
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10 }}>
            <button
              type="button"
              className="ds-btn ds-btn-primary ds-btn-sm"
              onClick={submit}
              disabled={pending || !note.trim()}
            >
              {pending ? 'Сохраняем…' : 'Сохранить'}
            </button>
          </div>
        </div>
      </div>

      {/* Timeline */}
      <div className="ds-card" style={{ padding: 24 }}>
        <SectionHead
          eyebrow="Лента"
          title={`История · ${activities.length}`}
          description="Все заметки, смены этапа и системные события по этому клиенту."
        />
        {activities.length === 0 ? (
          <div
            style={{
              marginTop: 16,
              padding: '40px 20px',
              textAlign: 'center',
              color: 'var(--ds-muted)',
              fontSize: 13,
              background: 'var(--ds-bg-alt)',
              borderRadius: 'var(--ds-r-md)',
            }}
          >
            Пока пусто.
          </div>
        ) : (
          <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column' }}>
            {activities.map((a, idx) => (
              <div
                key={a.id}
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'auto 1fr auto',
                  gap: 14,
                  padding: '14px 0',
                  borderBottom: idx === activities.length - 1 ? 'none' : '1px solid var(--ds-border-soft)',
                  alignItems: 'flex-start',
                }}
              >
                <div
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: '50%',
                    background: activityColor(a.activity_type).bg,
                    color: activityColor(a.activity_type).color,
                    display: 'grid',
                    placeItems: 'center',
                    fontSize: 13,
                    fontWeight: 700,
                    flexShrink: 0,
                  }}
                >
                  {activityIcon(a.activity_type)}
                </div>
                <div style={{ fontSize: 13, color: 'var(--ds-ink)', lineHeight: 1.5, letterSpacing: '-0.005em', whiteSpace: 'pre-wrap' }}>
                  {a.content}
                </div>
                <span className="ds-mono" style={{ fontSize: 11, color: 'var(--ds-muted)', whiteSpace: 'nowrap' }}>
                  {formatDate(a.created_at)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function activityIcon(type: string): string {
  switch (type) {
    case 'note': return '✎'
    case 'stage_change': return '→'
    case 'system': return '·'
    case 'call': return '☎'
    case 'message': return '✉'
    case 'file_upload': return '📎'
    case 'task_done': return '✓'
    case 'checklist': return '☑'
    default: return '•'
  }
}

function activityColor(type: string): { bg: string; color: string } {
  switch (type) {
    case 'stage_change': return { bg: 'var(--ds-purple-soft)', color: 'var(--ds-purple-deep)' }
    case 'task_done':
    case 'checklist': return { bg: 'var(--ds-success-soft)', color: 'var(--ds-success-ink)' }
    case 'note': return { bg: 'var(--ds-amber-soft)', color: '#8A6D1E' }
    default: return { bg: 'var(--ds-bg-alt)', color: 'var(--ds-muted)' }
  }
}

/* ═══════════════════════════════════════════════════════════════
   Helpers
   ═══════════════════════════════════════════════════════════════ */

function SectionHead({
  eyebrow, title, description,
}: {
  eyebrow: string
  title: string
  description?: string
}) {
  return (
    <header>
      <div
        style={{
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: '0.12em',
          textTransform: 'uppercase',
          color: 'var(--ds-purple)',
          marginBottom: 6,
        }}
      >
        {eyebrow}
      </div>
      <h2
        style={{
          fontFamily: 'var(--ds-font-display-stack)',
          fontWeight: 700,
          fontSize: 22,
          textTransform: 'uppercase',
          letterSpacing: '0.04em',
          color: 'var(--ds-ink)',
          margin: 0,
          lineHeight: 1.1,
        }}
      >
        {title}
      </h2>
      {description && (
        <p style={{ fontSize: 13, color: 'var(--ds-muted)', margin: '6px 0 0', lineHeight: 1.5, maxWidth: 640 }}>
          {description}
        </p>
      )}
    </header>
  )
}

function InputWithLabel({
  label, value, onChange, placeholder,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
}) {
  return (
    <div>
      <label
        style={{
          display: 'block',
          fontSize: 10,
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          color: 'var(--ds-muted)',
          marginBottom: 4,
        }}
      >
        {label}
      </label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="ds-input"
        style={{ padding: '8px 12px', fontSize: 13 }}
      />
    </div>
  )
}

function formatDate(s: string): string {
  if (!s) return '—'
  try {
    const d = new Date(s)
    return d.toLocaleDateString('ru', { day: '2-digit', month: 'short', year: 'numeric' })
  } catch { return s }
}
