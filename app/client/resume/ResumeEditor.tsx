'use client'

import { useMemo, useState, useEffect, useRef, useTransition } from 'react'
import {
  INITIAL_RESUME,
  SECTION_TEMPLATES,
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
} from './mock'
import { AccordionSection, SubItem, AddMoreButton, Field, SelectField } from './AccordionSection'
import { ResumePreview } from './ResumePreview'
import { saveClientDraft, submitToCurator } from '@/app/client/essays/actions'

const SKILL_LEVELS: SkillLevel[] = ['Beginner', 'Intermediate', 'Advanced', 'Expert']
const LANG_LEVELS: LanguageLevel[] = ['Beginner', 'Intermediate', 'Good command', 'Very good command', 'Highly proficient', 'Native speaker']

const uid = () => Math.random().toString(36).slice(2, 10)

interface ResumeEditorProps {
  initialResume?: Resume
  clientId?: number
  status?: 'draft' | 'sent' | 'editing' | 'approved'
}

export function ResumeEditor({ initialResume, clientId, status = 'draft' }: ResumeEditorProps = {}) {
  const [resume, setResume] = useState<Resume>(initialResume || INITIAL_RESUME)
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [pending, startTransition] = useTransition()
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isLocked = status === 'approved'

  const [saveErrMsg, setSaveErrMsg] = useState<string | null>(null)

  // Debounced auto-save — always on when editor is mounted
  useEffect(() => {
    if (isLocked) return
    if (saveTimer.current) clearTimeout(saveTimer.current)
    setSaveState('saving')
    saveTimer.current = setTimeout(async () => {
      const res = await saveClientDraft({ clientId, type: 'resume', content: resume })
      if (res && (res as any).error) {
        setSaveState('error')
        setSaveErrMsg((res as any).error)
      } else {
        setSaveState('saved')
        setSaveErrMsg(null)
      }
    }, 1000)
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current) }
  }, [resume, clientId, isLocked])

  function handleSubmit() {
    if (pending) return
    startTransition(async () => {
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

  /* ── helpers to update immutably ── */
  function updatePersonal<K extends keyof Resume['personal']>(key: K, value: Resume['personal'][K]) {
    setResume(r => ({ ...r, personal: { ...r.personal, [key]: value } }))
  }
  function updateList<K extends keyof Resume>(key: K, updater: (list: Resume[K]) => Resume[K]) {
    setResume(r => ({ ...r, [key]: updater(r[key]) }))
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
          isLocked={isLocked}
        />
        <ProgressCard completeness={completeness} />

        {/* ═══ Personal details ═══ */}
        <AccordionSection title="Personal details" defaultOpen>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <Field
              label="Job title"
              value={resume.personal.jobTitle}
              onChange={(v) => updatePersonal('jobTitle', v)}
              placeholder="The role you want"
              width="half"
              hint={<span style={{ fontSize: 11, fontWeight: 700, color: 'var(--ds-success-ink)', background: 'var(--ds-success-soft)', padding: '2px 8px', borderRadius: 100 }}>+10%</span>}
            />
            <div style={{ gridColumn: 'auto', display: 'flex', alignItems: 'center', gap: 12, padding: '22px 0 0 12px' }}>
              <div style={{ width: 56, height: 56, borderRadius: 'var(--ds-r-md)', background: 'var(--ds-bg-alt)', color: 'var(--ds-muted)', display: 'grid', placeItems: 'center', fontSize: 20, flexShrink: 0 }}>🔒</div>
              <div style={{ fontSize: 12, color: 'var(--ds-muted)', lineHeight: 1.4 }}>
                Этот шаблон не поддерживает загрузку фото
              </div>
            </div>
            <Field label="First name" value={resume.personal.firstName} onChange={(v) => updatePersonal('firstName', v)} width="half" />
            <Field label="Surname" value={resume.personal.lastName} onChange={(v) => updatePersonal('lastName', v)} width="half" />
            <Field label="Email" value={resume.personal.email} onChange={(v) => updatePersonal('email', v)} width="half" />
            <Field label="Phone" value={resume.personal.phone} onChange={(v) => updatePersonal('phone', v)} width="half" />
            <Field label="Date of birth" value={resume.personal.dateOfBirth} onChange={(v) => updatePersonal('dateOfBirth', v)} placeholder="DD.MM.YYYY" width="half" />
            <Field label="LinkedIn URL" value={resume.personal.linkedIn} onChange={(v) => updatePersonal('linkedIn', v)} placeholder="linkedin.com/in/yourprofile" width="half" />
            <Field label="Postcode" value={resume.personal.postcode} onChange={(v) => updatePersonal('postcode', v)} width="half" />
            <Field label="City, county" value={resume.personal.city} onChange={(v) => updatePersonal('city', v)} width="half" />
            <Field label="Country" value={resume.personal.country} onChange={(v) => updatePersonal('country', v)} width="half" />
          </div>
          <div style={{ marginTop: 20 }}>
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
        </AccordionSection>

        {/* ═══ Websites & Social Links ═══ */}
        <AccordionSection
          title="Websites & Social Links"
          description="Ссылки на портфолио, LinkedIn, YouTube или личный сайт — всё что стоит увидеть приёмной комиссии."
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

        {/* ═══ Education ═══ */}
        <AccordionSection
          title="Education"
          description="Школы, колледжи, гимназии и любые учебные заведения которые добавляют вес заявке."
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
                  <Field label="Start date" value={e.startDate} onChange={(v) => updateList('education', list => list.map((x, i) => i === idx ? { ...x, startDate: v } : x))} width="half" />
                  <Field label="End date" value={e.endDate} onChange={(v) => updateList('education', list => list.map((x, i) => i === idx ? { ...x, endDate: v } : x))} placeholder="Present" width="half" />
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

        {/* ═══ Courses ═══ */}
        <AccordionSection title="Courses">
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

        {/* ═══ Areas of Expertise (Skills) ═══ */}
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

        {/* ═══ Conferences ═══ */}
        <AccordionSection title="Conferences">
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

        {/* ═══ Hobbies ═══ */}
        <AccordionSection title="Hobbies">
          <Field
            label="What do you like?"
            value={resume.hobbies}
            onChange={(v) => setResume(r => ({ ...r, hobbies: v }))}
            placeholder="Ballet, running, photography..."
            multiline
            rows={4}
          />
        </AccordionSection>

        {/* ═══ Languages ═══ */}
        <AccordionSection title="Languages">
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

        {/* ═══ Awards ═══ */}
        <AccordionSection title="Awards">
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

        {/* ═══ Volunteering ═══ */}
        <AccordionSection title="Volunteering">
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
                  <Field label="Start date" value={v.startDate} onChange={(x) => updateList('volunteering', list => list.map((r, i) => i === idx ? { ...r, startDate: x } : r))} width="half" />
                  <Field label="End date" value={v.endDate} onChange={(x) => updateList('volunteering', list => list.map((r, i) => i === idx ? { ...r, endDate: x } : r))} width="half" />
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

        {/* ═══ Olympiads ═══ */}
        <AccordionSection title="Olympiads">
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

        {/* ═══ Add Section ═══ */}
        <AddSectionGrid
          onAdd={(templateKey) => {
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
  status, saveState, pending, onSubmit, isLocked,
}: {
  status: 'draft' | 'sent' | 'editing' | 'approved'
  saveState: 'idle' | 'saving' | 'saved' | 'error'
  pending: boolean
  onSubmit: () => void
  isLocked: boolean
}) {
  const statusInfo: Record<string, { label: string; chip: string }> = {
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
        <span className={`ds-chip ${s.chip}`} style={{ textTransform: 'uppercase', letterSpacing: '0.08em', fontSize: 10, fontWeight: 700 }}>
          {s.label}
        </span>
        {saveState === 'error' && (
          <span style={{ fontSize: 12, color: 'var(--ds-error)' }}>Не сохраняется — проверь что таблица client_essays создана</span>
        )}
      </div>
      {!isLocked && (
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
  const scores = [
    { key: 'jobTitle', weight: 10, ok: resume.personal.jobTitle.trim().length > 0, label: 'Add job title' },
    { key: 'profileSummary', weight: 15, ok: resume.personal.profileSummary.trim().length > 20, label: 'Add profile summary' },
    { key: 'country', weight: 2, ok: resume.personal.country.trim().length > 0, label: 'Add a country name' },
    { key: 'city', weight: 5, ok: resume.personal.city.trim().length > 0, label: 'Add a city name' },
    { key: 'summary', weight: 15, ok: resume.personal.profileSummary.trim().length > 20, label: 'Write a profile summary' },
    { key: 'experience', weight: 15, ok: resume.courses.length > 0 || resume.conferences.length > 0 || resume.customSections.length > 0, label: 'Add courses / conferences / custom experience' },
    { key: 'volunteering', weight: 5, ok: resume.volunteering.length > 0, label: 'Add volunteering' },
    { key: 'education', weight: 15, ok: resume.education.length > 0, label: 'Add education' },
    { key: 'skills', weight: 10, ok: resume.skills.length > 0, label: 'Add skills' },
    { key: 'languages', weight: 5, ok: resume.languages.length > 0, label: 'Add languages' },
    { key: 'email', weight: 5, ok: resume.personal.email.trim().length > 0, label: 'Add email' },
    { key: 'phone', weight: 5, ok: resume.personal.phone.trim().length > 0, label: 'Add phone' },
    { key: 'firstName', weight: 5, ok: resume.personal.firstName.trim().length > 0, label: 'Add first name' },
    { key: 'lastName', weight: 5, ok: resume.personal.lastName.trim().length > 0, label: 'Add last name' },
    { key: 'jobTitle', weight: 5, ok: resume.personal.jobTitle.trim().length > 0, label: 'Add a job title' },
  ]
  const total = scores.reduce((a, s) => a + s.weight, 0)
  const gained = scores.reduce((a, s) => a + (s.ok ? s.weight : 0), 0)
  const percent = Math.min(100, Math.round((gained / total) * 100))

  const suggestions: Array<{ key: string; label: string; points?: number; type?: 'points' | 'ai' }> = []
  if (!resume.personal.profileSummary.trim()) suggestions.push({ key: 'ai-summary', label: 'Write your profile summary', type: 'ai' })
  for (const s of scores) {
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
