'use client'

import { useMemo, useState, useEffect, useRef, useTransition } from 'react'
import {
  INITIAL_RESUME,
  SECTION_TEMPLATES,
  normalizeResume,
  type Resume,
  type LinkItem,
  type EducationItem,
  type CourseItem,
  type SkillItem,
  type SkillLevel,
  type ConferenceItem,
  type CustomSection,
  type CustomSectionItem,
  type LanguageItem,
  type LanguageLevel,
  type AwardItem,
  type VolunteeringItem,
  type OlympiadItem,
  type WorkExperienceItem,
  type OptionalSectionFlags,
} from './mock'
import { AccordionSection, SubItem, AddMoreButton, Field, SelectField } from './AccordionSection'
import { ResumePreview } from './ResumePreview'
import { ResumeDatePicker } from './ResumeDatePicker'
import { saveClientDraft, submitToCurator, curatorSaveEdit, approveEssay } from '@/app/client/essays/actions'

function DateField({ label, value, onChange, presentToggle, width = 'half' }: {
  label: string; value: string; onChange: (v: string) => void; presentToggle?: boolean; width?: 'full' | 'half'
}) {
  return (
    <div style={{ gridColumn: width === 'full' ? '1 / -1' : undefined }}>
      <label style={{
        display: 'block', fontSize: 11, fontWeight: 600, textTransform: 'uppercase',
        letterSpacing: '0.08em', color: 'var(--ds-muted)', marginBottom: 6,
      }}>{label}</label>
      <ResumeDatePicker value={value} onChange={onChange} presentToggle={presentToggle} />
    </div>
  )
}

const SKILL_LEVELS: SkillLevel[] = ['Beginner', 'Intermediate', 'Advanced', 'Expert']
const LANG_LEVELS: LanguageLevel[] = ['Beginner', 'Intermediate', 'Good command', 'Very good command', 'Highly proficient', 'Native speaker']

const uid = () => Math.random().toString(36).slice(2, 10)

interface ResumeEditorProps {
  initialResume?: Resume
  clientId?: number
  status?: 'draft' | 'sent' | 'editing' | 'approved'
  viewerRole?: string
}

export function ResumeEditor({ initialResume, clientId, status = 'draft', viewerRole }: ResumeEditorProps = {}) {
  const isCurator = viewerRole === 'curator' || viewerRole === 'admin' || viewerRole === 'rop'
  const [resume, setResume] = useState<Resume>(() => normalizeResume(initialResume || INITIAL_RESUME))
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [pending, startTransition] = useTransition()
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Locked = approved AND viewer is the client. Curator can re-edit even after approval.
  const isLocked = status === 'approved' && !isCurator

  const [saveErrMsg, setSaveErrMsg] = useState<string | null>(null)

  // Debounced auto-save — always on when editor is mounted
  useEffect(() => {
    if (isLocked) return
    if (saveTimer.current) clearTimeout(saveTimer.current)
    setSaveState('saving')
    saveTimer.current = setTimeout(async () => {
      const res = isCurator && clientId
        ? await curatorSaveEdit({ clientId, type: 'resume', curatorContent: resume })
        : await saveClientDraft({ clientId, type: 'resume', content: resume })
      if (res && (res as any).error) {
        setSaveState('error')
        setSaveErrMsg((res as any).error)
      } else {
        setSaveState('saved')
        setSaveErrMsg(null)
      }
    }, 1000)
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current) }
  }, [resume, clientId, isLocked, isCurator])

  function handleReset() {
    if (!confirm('Сбросить резюме к образцу? Все введённые данные пропадут.')) return
    setResume(normalizeResume(INITIAL_RESUME))
  }

  function handleSubmit() {
    if (pending) return
    startTransition(async () => {
      if (isCurator && clientId) {
        const saved = await curatorSaveEdit({ clientId, type: 'resume', curatorContent: resume })
        if (saved && (saved as any).error) { alert('Сохранение не удалось: ' + (saved as any).error); return }
        const res = await approveEssay({ clientId, type: 'resume' })
        if (res && (res as any).error) alert('Не утвердилось: ' + (res as any).error)
        else alert('Резюме утверждено ✓ Клиент увидит финальную версию.')
        return
      }
      const saved = await saveClientDraft({ clientId, type: 'resume', content: resume })
      if (saved && (saved as any).error) {
        alert('Сохранение не удалось: ' + (saved as any).error)
        return
      }
      const res = await submitToCurator({ type: 'resume', clientId })
      if (res && (res as any).error) alert('Не отправилось: ' + (res as any).error)
      else alert('Резюме отправлено куратору ✓')
    })
  }

  function handleDownloadPdf() {
    if (!clientId) { window.print(); return }
    const url = `/client/resume/print?clientId=${clientId}`
    window.open(url, '_blank', 'noopener')
  }

  /* ── helpers to update immutably ── */
  function updatePersonal<K extends keyof Resume['personal']>(key: K, value: Resume['personal'][K]) {
    setResume(r => ({ ...r, personal: { ...r.personal, [key]: value } }))
  }
  function updateList<K extends keyof Resume>(key: K, updater: (list: Resume[K]) => Resume[K]) {
    setResume(r => ({ ...r, [key]: updater(r[key]) }))
  }

  function isOptionalShown(key: keyof OptionalSectionFlags): boolean {
    const flag = resume.optional?.[key]
    if (typeof flag === 'boolean') return flag
    // Backwards compat: derive from data
    if (key === 'hobbies') return resume.hobbies.trim().length > 0
    if (key === 'links') return resume.links.length > 0
    if (key === 'conferences') return resume.conferences.length > 0
    if (key === 'volunteering') return resume.volunteering.length > 0
    if (key === 'olympiads') return resume.olympiads.length > 0
    if (key === 'awards') return resume.awards.length > 0
    // Core sections — shown by default unless explicitly removed
    if (key === 'workExperience') return resume.workExperience.length > 0
    if (key === 'education') return resume.education.length > 0
    if (key === 'courses') return resume.courses.length > 0
    if (key === 'skills') return resume.skills.length > 0
    if (key === 'languages') return resume.languages.length > 0
    return false
  }

  function setOptional(key: keyof OptionalSectionFlags, value: boolean) {
    setResume(r => ({ ...r, optional: { ...(r.optional || {}), [key]: value } }))
  }

  function removeOptionalSection(key: keyof OptionalSectionFlags) {
    if (!confirm('Удалить эту секцию из резюме? Данные внутри будут очищены.')) return
    setResume(r => {
      const next = { ...r, optional: { ...(r.optional || {}), [key]: false } }
      if (key === 'hobbies') next.hobbies = ''
      if (key === 'links') next.links = []
      if (key === 'conferences') next.conferences = []
      if (key === 'volunteering') next.volunteering = []
      if (key === 'olympiads') next.olympiads = []
      if (key === 'awards') next.awards = []
      if (key === 'workExperience') next.workExperience = []
      if (key === 'education') next.education = []
      if (key === 'courses') next.courses = []
      if (key === 'skills') next.skills = []
      if (key === 'languages') next.languages = []
      return next
    })
  }

  function RemoveSectionBtn({ onClick }: { onClick: () => void }) {
    return (
      <button
        type="button"
        onClick={onClick}
        title="Удалить секцию"
        style={{ background: 'transparent', border: 'none', color: 'var(--ds-muted)', fontSize: 12, cursor: 'pointer', padding: '4px 8px', borderRadius: 'var(--ds-r-sm)' }}
      >
        × удалить
      </button>
    )
  }

  const completeness = useMemo(() => calcCompleteness(resume), [resume])

  return (
    <div
      className="resume-editor-grid"
      style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 1fr) minmax(360px, 540px)',
        gap: 32,
        alignItems: 'start',
      }}
    >
      <style>{`
        @media (max-width: 1120px) {
          .resume-editor-grid { grid-template-columns: 1fr !important; }
          .resume-preview-sticky { position: static !important; }
        }
      `}</style>

      {/* ─── Editor column ─── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <EssayStatusBar
          status={status}
          saveState={saveState}
          pending={pending}
          onSubmit={handleSubmit}
          onReset={handleReset}
          onDownloadPdf={handleDownloadPdf}
          isLocked={isLocked}
          isCurator={isCurator}
        />
        <ProgressCard completeness={completeness} />

        {/* ═══ Personal details ═══ */}
        <AccordionSection title="Personal details" defaultOpen>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <Field label="First name" value={resume.personal.firstName} onChange={(v) => updatePersonal('firstName', v)} width="half" placeholder="Name" />
            <Field label="Surname" value={resume.personal.lastName} onChange={(v) => updatePersonal('lastName', v)} width="half" placeholder="Lastname" />
          </div>
          <div style={{ marginTop: 16 }}>
            <Field
              label="Profile summary"
              value={resume.personal.profileSummary}
              onChange={(v) => updatePersonal('profileSummary', v)}
              placeholder="2–4 предложения о ваших целях и сильных сторонах"
              multiline
              rows={4}
              hint={<span style={{ fontSize: 11, fontWeight: 700, color: 'var(--ds-success-ink)', background: 'var(--ds-success-soft)', padding: '2px 8px', borderRadius: 100 }}>+15%</span>}
            />
          </div>
          <div style={{ marginTop: 16, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <Field label="Email" value={resume.personal.email} onChange={(v) => updatePersonal('email', v)} width="half" />
            <Field label="Phone" value={resume.personal.phone} onChange={(v) => updatePersonal('phone', v)} width="half" />
            <Field label="LinkedIn URL" value={resume.personal.linkedIn} onChange={(v) => updatePersonal('linkedIn', v)} placeholder="linkedin.com/in/yourprofile" width="half" />
            <Field label="City" value={resume.personal.city} onChange={(v) => updatePersonal('city', v)} width="half" />
          </div>
        </AccordionSection>

        {/* ═══ Work Experience ═══ */}
        {isOptionalShown('workExperience') && (
        <AccordionSection
          title="Work Experience"
          description="Стажировки, подработки, волонтёрские должности с обязанностями. Помогает приёмной комиссии увидеть твою ответственность."
          right={<RemoveSectionBtn onClick={() => removeOptionalSection('workExperience')} />}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {resume.workExperience.map((w, idx) => (
              <SubItem
                key={w.id}
                title={[w.jobTitle, w.company].filter(Boolean).join(' at ') || 'Новая запись'}
                subtitle={[w.city, [w.startDate, w.endDate].filter(Boolean).join(' – ')].filter(Boolean).join(' · ')}
                onRemove={() => updateList('workExperience', list => list.filter((_, i) => i !== idx))}
              >
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                  <Field label="Job title" value={w.jobTitle} onChange={(v) => updateList('workExperience', list => list.map((x, i) => i === idx ? { ...x, jobTitle: v } : x))} placeholder="The role you want" width="half" />
                  <Field label="Company" value={w.company} onChange={(v) => updateList('workExperience', list => list.map((x, i) => i === idx ? { ...x, company: v } : x))} width="half" />
                  <Field label="City" value={w.city} onChange={(v) => updateList('workExperience', list => list.map((x, i) => i === idx ? { ...x, city: v } : x))} width="half" />
                  <DateField label="Start date" value={w.startDate} onChange={(v) => updateList('workExperience', list => list.map((x, i) => i === idx ? { ...x, startDate: v } : x))} />
                  <DateField label="End date" value={w.endDate} onChange={(v) => updateList('workExperience', list => list.map((x, i) => i === idx ? { ...x, endDate: v } : x))} presentToggle />
                  <Field label="Description" value={w.description} onChange={(v) => updateList('workExperience', list => list.map((x, i) => i === idx ? { ...x, description: v } : x))} multiline rows={4} />
                </div>
              </SubItem>
            ))}
          </div>
          <AddMoreButton
            label="Добавить опыт работы"
            onClick={() => updateList<'workExperience'>('workExperience', list => [...list, { id: uid(), jobTitle: '', company: '', city: '', startDate: '', endDate: '', description: '' } as WorkExperienceItem])}
          />
        </AccordionSection>
        )}

        {/* ═══ Websites & Social Links — optional ═══ */}
        {isOptionalShown('links') && (
          <AccordionSection
            title="Websites & Social Links"
            description="Ссылки на портфолио, LinkedIn, YouTube или личный сайт — всё что стоит увидеть приёмной комиссии."
            right={<RemoveSectionBtn onClick={() => removeOptionalSection('links')} />}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {resume.links.map((link, idx) => (
                <SubItem
                  key={link.id}
                  title={link.title || 'Новая ссылка'}
                  subtitle={link.url}
                  onRemove={() => updateList('links', l => l.filter((_, i) => i !== idx))}
                >
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 12 }}>
                    <Field label="Название" value={link.title} onChange={(v) => updateList('links', l => l.map((x, i) => i === idx ? { ...x, title: v } : x))} />
                    <Field label="URL" value={link.url} onChange={(v) => updateList('links', l => l.map((x, i) => i === idx ? { ...x, url: v } : x))} placeholder="https://..." />
                  </div>
                </SubItem>
              ))}
            </div>
            <AddMoreButton
              label="Добавить ссылку"
              onClick={() => updateList<'links'>('links', l => [...l, { id: uid(), title: '', url: '' } as LinkItem])}
            />
          </AccordionSection>
        )}

        {/* ═══ Education ═══ */}
        {isOptionalShown('education') && (
        <AccordionSection
          title="Education"
          description="Школы, колледжи, гимназии и любые учебные заведения которые добавляют вес заявке."
          right={<RemoveSectionBtn onClick={() => removeOptionalSection('education')} />}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {resume.education.map((e, idx) => (
              <SubItem
                key={e.id}
                title={[e.degree, e.school].filter(Boolean).join(' at ') || 'Новая запись'}
                subtitle={[e.startDate, e.endDate].filter(Boolean).join(' — ')}
                onRemove={() => updateList('education', list => list.filter((_, i) => i !== idx))}
              >
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                  <Field label="School" value={e.school} onChange={(v) => updateList('education', list => list.map((x, i) => i === idx ? { ...x, school: v } : x))} width="half" />
                  <Field label="Degree" value={e.degree} onChange={(v) => updateList('education', list => list.map((x, i) => i === idx ? { ...x, degree: v } : x))} width="half" />
                  <DateField label="Start date" value={e.startDate} onChange={(v) => updateList('education', list => list.map((x, i) => i === idx ? { ...x, startDate: v } : x))} />
                  <DateField label="End date" value={e.endDate} onChange={(v) => updateList('education', list => list.map((x, i) => i === idx ? { ...x, endDate: v } : x))} presentToggle />
                  <Field label="City" value={e.city} onChange={(v) => updateList('education', list => list.map((x, i) => i === idx ? { ...x, city: v } : x))} width="full" />
                  <Field
                    label="Description"
                    value={e.description}
                    onChange={(v) => updateList('education', list => list.map((x, i) => i === idx ? { ...x, description: v } : x))}
                    multiline
                    rows={5}
                  />
                </div>
              </SubItem>
            ))}
          </div>
          <AddMoreButton
            label="Добавить учебное заведение"
            onClick={() => updateList<'education'>('education', list => [...list, { id: uid(), school: '', degree: '', startDate: '', endDate: '', city: '', description: '' } as EducationItem])}
          />
        </AccordionSection>
        )}

        {/* ═══ Courses ═══ */}
        {isOptionalShown('courses') && (
        <AccordionSection title="Courses" right={<RemoveSectionBtn onClick={() => removeOptionalSection('courses')} />}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {resume.courses.map((c, idx) => (
              <SubItem
                key={c.id}
                title={c.title || 'Новая запись'}
                subtitle={[c.city, c.year].filter(Boolean).join(' · ')}
                onRemove={() => updateList('courses', list => list.filter((_, i) => i !== idx))}
              >
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                  <Field label="Title" value={c.title} onChange={(v) => updateList('courses', list => list.map((x, i) => i === idx ? { ...x, title: v } : x))} />
                  <Field label="City" value={c.city ?? ''} onChange={(v) => updateList('courses', list => list.map((x, i) => i === idx ? { ...x, city: v } : x))} width="half" />
                  <Field label="Year" value={c.year ?? ''} onChange={(v) => updateList('courses', list => list.map((x, i) => i === idx ? { ...x, year: v } : x))} width="half" />
                  <Field label="Description" value={c.description ?? ''} onChange={(v) => updateList('courses', list => list.map((x, i) => i === idx ? { ...x, description: v } : x))} multiline rows={3} />
                </div>
              </SubItem>
            ))}
          </div>
          <AddMoreButton
            label="Добавить курс"
            onClick={() => updateList<'courses'>('courses', list => [...list, { id: uid(), title: '' } as CourseItem])}
          />
        </AccordionSection>
        )}

        {/* ═══ Areas of Expertise (Skills) ═══ */}
        {isOptionalShown('skills') && (
        <AccordionSection
          title="Areas of Expertise"
          description="5 ключевых навыков. Покажите уровень — или скройте через тумблер ниже."
          right={
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12, color: 'var(--ds-muted)' }}>
              <span>Показывать уровень</span>
              <Toggle
                value={resume.skillsShowLevel}
                onChange={(v) => setResume(r => ({ ...r, skillsShowLevel: v }))}
              />
              <RemoveSectionBtn onClick={() => removeOptionalSection('skills')} />
            </div>
          }
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {resume.skills.map((s, idx) => (
              <SubItem
                key={s.id}
                title={s.name || 'Новый навык'}
                subtitle={resume.skillsShowLevel ? s.level : undefined}
                onRemove={() => updateList('skills', list => list.filter((_, i) => i !== idx))}
              >
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                  <Field label="Skill" value={s.name} onChange={(v) => updateList('skills', list => list.map((x, i) => i === idx ? { ...x, name: v } : x))} width="half" />
                  <SelectField
                    label="Level"
                    value={s.level}
                    onChange={(v) => updateList('skills', list => list.map((x, i) => i === idx ? { ...x, level: v as SkillLevel } : x))}
                    options={SKILL_LEVELS}
                    width="half"
                  />
                </div>
              </SubItem>
            ))}
          </div>
          <AddMoreButton
            label="Добавить навык"
            onClick={() => updateList<'skills'>('skills', list => [...list, { id: uid(), name: '', level: 'Intermediate' } as SkillItem])}
          />
        </AccordionSection>
        )}

        {/* ═══ Conferences — optional ═══ */}
        {isOptionalShown('conferences') && (
          <AccordionSection title="Conferences" right={<RemoveSectionBtn onClick={() => removeOptionalSection('conferences')} />}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {resume.conferences.map((c, idx) => (
                <SubItem
                  key={c.id}
                  title={c.title || 'Новая конференция'}
                  subtitle={[c.city, c.date].filter(Boolean).join(' · ')}
                  onRemove={() => updateList('conferences', list => list.filter((_, i) => i !== idx))}
                >
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                    <Field label="Title" value={c.title} onChange={(v) => updateList('conferences', list => list.map((x, i) => i === idx ? { ...x, title: v } : x))} />
                    <Field label="City" value={c.city ?? ''} onChange={(v) => updateList('conferences', list => list.map((x, i) => i === idx ? { ...x, city: v } : x))} width="half" />
                    <Field label="Date" value={c.date} onChange={(v) => updateList('conferences', list => list.map((x, i) => i === idx ? { ...x, date: v } : x))} placeholder="Mar 2023" width="half" />
                    <Field label="Description" value={c.description} onChange={(v) => updateList('conferences', list => list.map((x, i) => i === idx ? { ...x, description: v } : x))} multiline rows={4} />
                  </div>
                </SubItem>
              ))}
            </div>
            <AddMoreButton
              label="Добавить конференцию"
              onClick={() => updateList<'conferences'>('conferences', list => [...list, { id: uid(), title: '', date: '', description: '' } as ConferenceItem])}
            />
          </AccordionSection>
        )}

        {/* ═══ Custom sections (TED Ed Student Talks и др.) ═══ */}
        {resume.customSections.map((cs, csIdx) => (
          <AccordionSection
            key={cs.id}
            title={cs.title}
            right={
              <button
                type="button"
                onClick={() => updateList('customSections', list => list.filter((_, i) => i !== csIdx))}
                style={{ background: 'transparent', border: 'none', color: 'var(--ds-muted)', fontSize: 12, cursor: 'pointer' }}
              >
                удалить секцию
              </button>
            }
          >
            <div style={{ marginBottom: 12 }}>
              <Field
                label="Section title"
                value={cs.title}
                onChange={(v) => updateList('customSections', list => list.map((x, i) => i === csIdx ? { ...x, title: v } : x))}
              />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {cs.items.map((item, iIdx) => (
                <SubItem
                  key={item.id}
                  title={item.title || 'Новая запись'}
                  subtitle={item.date}
                  onRemove={() => updateList('customSections', list => list.map((x, i) => i === csIdx ? { ...x, items: x.items.filter((_, j) => j !== iIdx) } : x))}
                >
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                    <Field label="Title" value={item.title} onChange={(v) => updateList('customSections', list => list.map((x, i) => i === csIdx ? { ...x, items: x.items.map((y, j) => j === iIdx ? { ...y, title: v } : y) } : x))} />
                    <Field label="Date" value={item.date ?? ''} onChange={(v) => updateList('customSections', list => list.map((x, i) => i === csIdx ? { ...x, items: x.items.map((y, j) => j === iIdx ? { ...y, date: v } : y) } : x))} width="half" />
                    <Field label="Description" value={item.description ?? ''} onChange={(v) => updateList('customSections', list => list.map((x, i) => i === csIdx ? { ...x, items: x.items.map((y, j) => j === iIdx ? { ...y, description: v } : y) } : x))} multiline rows={3} />
                  </div>
                </SubItem>
              ))}
            </div>
            <AddMoreButton
              label="Добавить запись"
              onClick={() => updateList('customSections', list => list.map((x, i) => i === csIdx ? { ...x, items: [...x.items, { id: uid(), title: '' } as CustomSectionItem] } : x))}
            />
          </AccordionSection>
        ))}

        {/* ═══ Hobbies — optional ═══ */}
        {isOptionalShown('hobbies') && (
          <AccordionSection title="Hobbies" right={<RemoveSectionBtn onClick={() => removeOptionalSection('hobbies')} />}>
            <Field
              label="What do you like?"
              value={resume.hobbies}
              onChange={(v) => setResume(r => ({ ...r, hobbies: v }))}
              placeholder="Ballet, running, photography..."
              multiline
              rows={4}
            />
          </AccordionSection>
        )}

        {/* ═══ Languages ═══ */}
        {isOptionalShown('languages') && (
        <AccordionSection title="Languages" right={<RemoveSectionBtn onClick={() => removeOptionalSection('languages')} />}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {resume.languages.map((l, idx) => (
              <SubItem
                key={l.id}
                title={l.name || 'Новый язык'}
                subtitle={l.level}
                onRemove={() => updateList('languages', list => list.filter((_, i) => i !== idx))}
              >
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                  <Field label="Language" value={l.name} onChange={(v) => updateList('languages', list => list.map((x, i) => i === idx ? { ...x, name: v } : x))} width="half" />
                  <SelectField
                    label="Level"
                    value={l.level}
                    onChange={(v) => updateList('languages', list => list.map((x, i) => i === idx ? { ...x, level: v as LanguageLevel } : x))}
                    options={LANG_LEVELS}
                    width="half"
                  />
                </div>
              </SubItem>
            ))}
          </div>
          <AddMoreButton
            label="Добавить язык"
            onClick={() => updateList<'languages'>('languages', list => [...list, { id: uid(), name: '', level: 'Intermediate' } as LanguageItem])}
          />
        </AccordionSection>
        )}

        {/* ═══ Awards — optional ═══ */}
        {isOptionalShown('awards') && (
          <AccordionSection title="Awards" right={<RemoveSectionBtn onClick={() => removeOptionalSection('awards')} />}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {resume.awards.map((a, idx) => (
                <SubItem
                  key={a.id}
                  title={a.title || 'Новая награда'}
                  subtitle={a.year}
                  onRemove={() => updateList('awards', list => list.filter((_, i) => i !== idx))}
                >
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                    <Field label="Title" value={a.title} onChange={(v) => updateList('awards', list => list.map((x, i) => i === idx ? { ...x, title: v } : x))} />
                    <Field label="Year" value={a.year ?? ''} onChange={(v) => updateList('awards', list => list.map((x, i) => i === idx ? { ...x, year: v } : x))} width="half" />
                    <Field label="Description" value={a.description ?? ''} onChange={(v) => updateList('awards', list => list.map((x, i) => i === idx ? { ...x, description: v } : x))} multiline rows={2} />
                  </div>
                </SubItem>
              ))}
            </div>
            <AddMoreButton
              label="Добавить награду"
              onClick={() => updateList<'awards'>('awards', list => [...list, { id: uid(), title: '' } as AwardItem])}
            />
          </AccordionSection>
        )}

        {/* ═══ Volunteering — optional ═══ */}
        {isOptionalShown('volunteering') && (
          <AccordionSection title="Volunteering" right={<RemoveSectionBtn onClick={() => removeOptionalSection('volunteering')} />}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {resume.volunteering.map((v, idx) => (
                <SubItem
                  key={v.id}
                  title={v.title || 'Новая запись'}
                  subtitle={[v.city, [v.startDate, v.endDate].filter(Boolean).join(' – ')].filter(Boolean).join(' · ')}
                  onRemove={() => updateList('volunteering', list => list.filter((_, i) => i !== idx))}
                >
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                    <Field label="Title" value={v.title} onChange={(x) => updateList('volunteering', list => list.map((r, i) => i === idx ? { ...r, title: x } : r))} />
                    <Field label="City" value={v.city} onChange={(x) => updateList('volunteering', list => list.map((r, i) => i === idx ? { ...r, city: x } : r))} width="half" />
                    <DateField label="Start date" value={v.startDate} onChange={(x) => updateList('volunteering', list => list.map((r, i) => i === idx ? { ...r, startDate: x } : r))} />
                    <DateField label="End date" value={v.endDate} onChange={(x) => updateList('volunteering', list => list.map((r, i) => i === idx ? { ...r, endDate: x } : r))} presentToggle />
                    <Field label="Description" value={v.description} onChange={(x) => updateList('volunteering', list => list.map((r, i) => i === idx ? { ...r, description: x } : r))} multiline rows={4} />
                  </div>
                </SubItem>
              ))}
            </div>
            <AddMoreButton
              label="Добавить волонтёрский опыт"
              onClick={() => updateList<'volunteering'>('volunteering', list => [...list, { id: uid(), title: '', city: '', startDate: '', endDate: '', description: '' } as VolunteeringItem])}
            />
          </AccordionSection>
        )}

        {/* ═══ Olympiads — optional ═══ */}
        {isOptionalShown('olympiads') && (
          <AccordionSection title="Olympiads" right={<RemoveSectionBtn onClick={() => removeOptionalSection('olympiads')} />}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {resume.olympiads.map((o, idx) => (
                <SubItem
                  key={o.id}
                  title={o.title || 'Новая олимпиада'}
                  subtitle={o.year}
                  onRemove={() => updateList('olympiads', list => list.filter((_, i) => i !== idx))}
                >
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                    <Field label="Title" value={o.title} onChange={(v) => updateList('olympiads', list => list.map((x, i) => i === idx ? { ...x, title: v } : x))} />
                    <Field label="Year" value={o.year} onChange={(v) => updateList('olympiads', list => list.map((x, i) => i === idx ? { ...x, year: v } : x))} width="half" />
                    <Field label="Description" value={o.description ?? ''} onChange={(v) => updateList('olympiads', list => list.map((x, i) => i === idx ? { ...x, description: v } : x))} multiline rows={2} />
                  </div>
                </SubItem>
              ))}
            </div>
            <AddMoreButton
              label="Добавить олимпиаду"
              onClick={() => updateList<'olympiads'>('olympiads', list => [...list, { id: uid(), title: '', year: '' } as OlympiadItem])}
            />
          </AccordionSection>
        )}

        {/* ═══ Add Section ═══ */}
        <AddSectionGrid
          onAdd={(templateKey) => {
            // Optional typed sections — toggle visible + seed empty item if needed
            if (templateKey === 'links') {
              setOptional('links', true)
              if (resume.links.length === 0) {
                updateList<'links'>('links', l => [...l, { id: uid(), title: '', url: '' } as LinkItem])
              }
              return
            }
            if (templateKey === 'conferences') {
              setOptional('conferences', true)
              if (resume.conferences.length === 0) {
                updateList<'conferences'>('conferences', l => [...l, { id: uid(), title: '', date: '', description: '' } as ConferenceItem])
              }
              return
            }
            if (templateKey === 'volunteering') {
              setOptional('volunteering', true)
              if (resume.volunteering.length === 0) {
                updateList<'volunteering'>('volunteering', l => [...l, { id: uid(), title: '', city: '', startDate: '', endDate: '', description: '' } as VolunteeringItem])
              }
              return
            }
            if (templateKey === 'olympiads') {
              setOptional('olympiads', true)
              if (resume.olympiads.length === 0) {
                updateList<'olympiads'>('olympiads', l => [...l, { id: uid(), title: '', year: '' } as OlympiadItem])
              }
              return
            }
            if (templateKey === 'hobbies') {
              setOptional('hobbies', true)
              return
            }
            if (templateKey === 'awards') {
              setOptional('awards', true)
              if (resume.awards.length === 0) {
                updateList<'awards'>('awards', l => [...l, { id: uid(), title: '' } as AwardItem])
              }
              return
            }
            if (templateKey === 'workExperience') {
              setOptional('workExperience', true)
              if (resume.workExperience.length === 0) {
                updateList<'workExperience'>('workExperience', l => [...l, { id: uid(), jobTitle: '', company: '', city: '', startDate: '', endDate: '', description: '' } as WorkExperienceItem])
              }
              return
            }
            if (templateKey === 'education') {
              setOptional('education', true)
              if (resume.education.length === 0) {
                updateList<'education'>('education', l => [...l, { id: uid(), school: '', degree: '', startDate: '', endDate: '', city: '', description: '' } as EducationItem])
              }
              return
            }
            if (templateKey === 'courses') {
              setOptional('courses', true)
              if (resume.courses.length === 0) {
                updateList<'courses'>('courses', l => [...l, { id: uid(), title: '' } as CourseItem])
              }
              return
            }
            if (templateKey === 'skills') {
              setOptional('skills', true)
              if (resume.skills.length === 0) {
                updateList<'skills'>('skills', l => [...l, { id: uid(), name: '', level: 'Intermediate' } as SkillItem])
              }
              return
            }
            if (templateKey === 'languages') {
              setOptional('languages', true)
              if (resume.languages.length === 0) {
                updateList<'languages'>('languages', l => [...l, { id: uid(), name: '', level: 'Intermediate' } as LanguageItem])
              }
              return
            }
            if (templateKey === 'ted') {
              updateList<'customSections'>('customSections', list => [
                ...list,
                { id: uid(), title: 'TED Talks', items: [{ id: uid(), title: '' } as CustomSectionItem] } as CustomSection,
              ])
              return
            }
            // Generic custom-section templates
            if (templateKey === 'custom' || templateKey === 'training' || templateKey === 'extracurricular' || templateKey === 'additional' || templateKey === 'references') {
              const titleMap: Record<string, string> = {
                custom: 'Custom Section',
                training: 'Professional Training',
                extracurricular: 'Extracurricular Activities',
                additional: 'Additional Experience',
                references: 'References',
              }
              updateList<'customSections'>('customSections', list => [
                ...list,
                { id: uid(), title: titleMap[templateKey] ?? 'New Section', items: [{ id: uid(), title: '' } as CustomSectionItem] } as CustomSection,
              ])
            }
          }}
        />
      </div>

      {/* ─── Preview column ─── */}
      <aside
        className="resume-preview-sticky"
        style={{
          position: 'sticky',
          top: 80,
          minWidth: 0,
        }}
      >
        <div
          style={{
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
            color: 'var(--ds-muted)',
            marginBottom: 10,
            display: 'flex',
            alignItems: 'baseline',
            justifyContent: 'space-between',
          }}
        >
          <span>Live preview</span>
          <span style={{ fontSize: 10, color: 'var(--ds-muted)', fontWeight: 500 }}>обновляется на лету</span>
        </div>
        <ResumePreview resume={resume} />
      </aside>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════
   Progress card — верхний блок с процентом + suggestion-чипами
   ═══════════════════════════════════════════════════════════════ */

function EssayStatusBar({
  status, saveState, pending, onSubmit, onReset, onDownloadPdf, isLocked, isCurator,
}: {
  status: 'draft' | 'sent' | 'editing' | 'approved'
  saveState: 'idle' | 'saving' | 'saved' | 'error'
  pending: boolean
  onSubmit: () => void
  onReset: () => void
  onDownloadPdf: () => void
  isLocked: boolean
  isCurator: boolean
}) {
  const statusInfo: Record<string, { label: string; chip: string }> = isCurator
    ? {
        draft: { label: 'Клиент заполняет', chip: 'ds-chip-neutral' },
        sent: { label: 'Прислано клиентом — на ревью', chip: 'ds-chip-info' },
        editing: { label: 'Дорабатываете', chip: 'ds-chip-warning' },
        approved: { label: 'Утверждено вами ✓', chip: 'ds-chip-success' },
      }
    : {
        draft: { label: 'Черновик — только у тебя', chip: 'ds-chip-neutral' },
        sent: { label: 'Отправлено куратору', chip: 'ds-chip-info' },
        editing: { label: 'Куратор дорабатывает', chip: 'ds-chip-warning' },
        approved: { label: 'Готово ✓ Утверждено куратором', chip: 'ds-chip-success' },
      }
  const s = statusInfo[status]
  return (
    <div
      className="ds-card"
      style={{
        padding: '16px 20px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 16,
        flexWrap: 'wrap',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        {status !== 'draft' && (
          <span className={`ds-chip ${s.chip}`} style={{ textTransform: 'uppercase', letterSpacing: '0.08em', fontSize: 10, fontWeight: 700 }}>
            {s.label}
          </span>
        )}
        {saveState === 'error' && (
          <span style={{ fontSize: 12, color: 'var(--ds-error)' }}>Не сохраняется — проверь что таблица client_essays создана</span>
        )}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <button
          type="button"
          onClick={onDownloadPdf}
          disabled={pending}
          className="ds-btn ds-btn-secondary ds-btn-sm"
          title="Открыть резюме в виде для печати (Cmd+P → Save as PDF)"
        >
          ↓ Скачать PDF
        </button>
        {!isCurator && (
          <button
            type="button"
            onClick={onReset}
            disabled={pending}
            style={{ background: 'transparent', border: '1px solid var(--ds-border)', color: 'var(--ds-muted)', fontSize: 12, padding: '6px 12px', borderRadius: 'var(--ds-r-sm)', cursor: 'pointer' }}
            title="Стереть всё и подгрузить пример Yulia Pozdnukhova"
          >
            ↻ К образцу
          </button>
        )}
        {isCurator && status !== 'approved' && (
          <button
            type="button"
            className="ds-btn ds-btn-primary ds-btn-sm"
            onClick={onSubmit}
            disabled={pending}
          >
            {pending ? '…' : '✓ Утвердить'}
          </button>
        )}
        {!isCurator && !isLocked && (
          <button
            type="button"
            className="ds-btn ds-btn-primary ds-btn-sm"
            onClick={onSubmit}
            disabled={pending}
          >
            {pending ? '…' : status === 'sent' || status === 'editing' ? 'Отправить ещё раз' : '↗ Отправить куратору'}
          </button>
        )}
      </div>
    </div>
  )
}

function ProgressCard({ completeness }: { completeness: ReturnType<typeof calcCompleteness> }) {
  return (
    <div
      className="ds-card"
      style={{
        padding: 24,
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div
          style={{
            fontFamily: 'var(--ds-font-display-stack)',
            fontWeight: 700,
            fontSize: 24,
            color: '#fff',
            background: 'var(--ds-success)',
            padding: '4px 12px',
            borderRadius: 100,
            fontVariantNumeric: 'tabular-nums',
            lineHeight: 1.1,
          }}
        >
          {completeness.percent}%
        </div>
        <div
          style={{
            fontFamily: 'var(--ds-font-display-stack)',
            fontWeight: 700,
            fontSize: 18,
            textTransform: 'uppercase',
            letterSpacing: '0.04em',
            color: 'var(--ds-ink)',
          }}
        >
          Готовность резюме
        </div>
      </div>

      <div style={{ position: 'relative', height: 4, background: 'var(--ds-bg-alt)', borderRadius: 2, overflow: 'hidden' }}>
        <div
          style={{
            position: 'absolute',
            inset: 0,
            width: `${completeness.percent}%`,
            background: 'var(--ds-success)',
            transition: 'width 400ms ease-out',
          }}
        />
      </div>

      {completeness.suggestions.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 8 }}>
          {completeness.suggestions.map(s => (
            <div key={s.key} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13 }}>
              {s.type === 'ai' ? (
                <span style={{ color: 'var(--ds-purple)', fontSize: 14 }}>✨</span>
              ) : (
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    color: 'var(--ds-success-ink)',
                    background: 'var(--ds-success-soft)',
                    padding: '2px 8px',
                    borderRadius: 6,
                    minWidth: 36,
                    textAlign: 'center',
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  +{s.points}
                </span>
              )}
              <span style={{ color: 'var(--ds-ink)', letterSpacing: '-0.005em' }}>{s.label}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function calcCompleteness(resume: Resume) {
  // Динамический подсчёт: учитываем только активные секции. Если клиент
  // удалил секцию (например, Work Experience) — она не должна тянуть
  // процент вниз. То же самое для опциональных языков/наград и т.д.
  function isShown(key: keyof OptionalSectionFlags, hasData: boolean): boolean {
    const flag = resume.optional?.[key]
    if (typeof flag === 'boolean') return flag
    return hasData
  }

  // ok = реально заполнено (хотя бы одно ключевое поле), а не «массив непустой».
  // Иначе пустой шаблон Education даёт +15% при пустом резюме.
  const eduOk = resume.education.some(e => e.school?.trim() || e.degree?.trim())
  const workOk = resume.workExperience.some(w => w.jobTitle?.trim() || w.company?.trim())
  const skillsOk = resume.skills.some(s => s.name?.trim())
  const langsOk = resume.languages.some(l => l.name?.trim())
  const coursesOk = resume.courses.some(c => c.title?.trim())
  const conferencesOk = resume.conferences.some(c => c.title?.trim())
  const customOk = resume.customSections.some(cs => cs.items.some(i => i.title?.trim()))

  const scores: Array<{ key: string; weight: number; ok: boolean; label: string; included: boolean }> = [
    { key: 'firstName',      weight: 5,  ok: resume.personal.firstName.trim().length > 0, label: 'Add first name', included: true },
    { key: 'lastName',       weight: 5,  ok: resume.personal.lastName.trim().length > 0,  label: 'Add last name',  included: true },
    { key: 'profileSummary', weight: 15, ok: resume.personal.profileSummary.trim().length > 20, label: 'Add profile summary', included: true },
    { key: 'email',          weight: 5,  ok: resume.personal.email.trim().length > 0, label: 'Add email', included: true },
    { key: 'phone',          weight: 5,  ok: resume.personal.phone.trim().length > 0, label: 'Add phone', included: true },
    { key: 'city',           weight: 5,  ok: resume.personal.city.trim().length > 0,  label: 'Add a city name', included: true },
    { key: 'workExperience', weight: 15, ok: workOk, label: 'Add work experience', included: isShown('workExperience', resume.workExperience.length > 0) },
    { key: 'education',      weight: 15, ok: eduOk, label: 'Add education', included: isShown('education', resume.education.length > 0) },
    { key: 'skills',         weight: 10, ok: skillsOk, label: 'Add skills', included: isShown('skills', resume.skills.length > 0) },
    { key: 'languages',      weight: 10, ok: langsOk, label: 'Add languages', included: isShown('languages', resume.languages.length > 0) },
    { key: 'experience',     weight: 10, ok: coursesOk || conferencesOk || customOk, label: 'Add courses / conferences / custom experience', included: true },
  ]
  const active = scores.filter(s => s.included)
  const total = active.reduce((a, s) => a + s.weight, 0)
  const gained = active.reduce((a, s) => a + (s.ok ? s.weight : 0), 0)
  const percent = total > 0 ? Math.min(100, Math.round((gained / total) * 100)) : 0

  const suggestions: Array<{ key: string; label: string; points?: number; type?: 'points' | 'ai' }> = []
  if (!resume.personal.profileSummary.trim()) suggestions.push({ key: 'ai-summary', label: 'Write your profile summary', type: 'ai' })
  for (const s of active) {
    if (!s.ok && (s as any).label) suggestions.push({ key: s.key, label: (s as any).label, points: s.weight, type: 'points' })
  }
  return { percent, suggestions: suggestions.slice(0, 6) }
}

/* ═══════════════════════════════════════════════════════════════
   Add section grid — bottom "Add Section" gallery
   ═══════════════════════════════════════════════════════════════ */

function AddSectionGrid({ onAdd }: { onAdd: (key: string) => void }) {
  return (
    <div className="ds-card" style={{ padding: 24 }}>
      <h2
        style={{
          fontFamily: 'var(--ds-font-display-stack)',
          fontWeight: 700,
          fontSize: 18,
          textTransform: 'uppercase',
          letterSpacing: '0.04em',
          color: 'var(--ds-ink)',
          margin: '0 0 16px 0',
        }}
      >
        Add section
      </h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 8 }}>
        {SECTION_TEMPLATES.map(t => (
          <button
            key={t.key}
            type="button"
            disabled={t.locked}
            onClick={() => onAdd(t.key)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '10px 12px',
              background: 'transparent',
              border: 'none',
              borderRadius: 'var(--ds-r-md)',
              color: t.locked ? 'var(--ds-muted)' : 'var(--ds-ink)',
              cursor: t.locked ? 'not-allowed' : 'pointer',
              fontFamily: 'var(--ds-font)',
              fontSize: 14,
              fontWeight: 500,
              letterSpacing: '-0.005em',
              textAlign: 'left',
              transition: 'background 120ms',
              opacity: t.locked ? 0.55 : 1,
            }}
            onMouseEnter={(e) => { if (!t.locked) e.currentTarget.style.background = 'var(--ds-purple-soft)' }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
          >
            <span style={{ fontSize: 18, filter: 'grayscale(1) contrast(1.1)', opacity: 0.8 }}>{t.emoji}</span>
            <span style={{ flex: 1 }}>{t.title}</span>
            {t.locked && <span style={{ fontSize: 12 }}>🔒</span>}
          </button>
        ))}
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════
   Toggle (iOS-style)
   ═══════════════════════════════════════════════════════════════ */

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={value}
      onClick={() => onChange(!value)}
      style={{
        width: 36,
        height: 20,
        background: value ? 'var(--ds-purple)' : 'var(--ds-border)',
        borderRadius: 100,
        border: 'none',
        position: 'relative',
        cursor: 'pointer',
        transition: 'background 160ms',
        padding: 0,
        flexShrink: 0,
      }}
    >
      <span
        style={{
          position: 'absolute',
          top: 2,
          left: value ? 18 : 2,
          width: 16,
          height: 16,
          borderRadius: '50%',
          background: '#fff',
          boxShadow: '0 1px 2px rgba(0,0,0,0.15)',
          transition: 'left 160ms',
        }}
      />
    </button>
  )
}
