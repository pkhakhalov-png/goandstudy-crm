'use client'

import Link from 'next/link'
import { DemoTopNav } from '../DemoTopNav'
import { useDemoState } from '../DemoState'
import type { DEMO_INITIAL_RESUME } from '../data'

type Resume = typeof DEMO_INITIAL_RESUME

export default function DemoResumePage() {
  const { state, ready, setResume, setResumeStatus } = useDemoState()
  if (!ready) return null

  const resume = state.resume

  function updatePersonal(field: keyof Resume['personal'], value: string) {
    setResume({ ...resume, personal: { ...resume.personal, [field]: value } })
  }

  function updateWorkItem(id: string, field: string, value: string) {
    setResume({
      ...resume,
      workExperience: resume.workExperience.map(w => w.id === id ? { ...w, [field]: value } : w),
    })
  }

  function addWork() {
    setResume({
      ...resume,
      workExperience: [
        ...resume.workExperience,
        { id: `w${Date.now()}`, jobTitle: '', company: '', city: '', startDate: '', endDate: '', description: '' },
      ],
    })
  }

  function removeWork(id: string) {
    setResume({ ...resume, workExperience: resume.workExperience.filter(w => w.id !== id) })
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--ds-bg)' }}>
      <DemoTopNav activePage="home" />

      <section style={{ position: 'relative', overflow: 'hidden', borderBottom: '1px solid var(--ds-border-soft)', background: 'var(--ds-bg)' }}>
        <div aria-hidden style={{ position: 'absolute', top: '-30%', left: '-10%', width: 900, height: 500, background: 'radial-gradient(ellipse at center, rgba(181,127,207,0.16) 0%, transparent 65%)', pointerEvents: 'none' }} />
        <div style={{ position: 'relative', maxWidth: 1400, margin: '0 auto', padding: '40px 32px 32px' }}>
          <Link href="/demo" style={{
            fontSize: 12, color: 'var(--ds-purple)', fontWeight: 700,
            letterSpacing: '0.12em', textTransform: 'uppercase',
            textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 6, marginBottom: 10,
          }}>
            ← Вернуться в кабинет
          </Link>
          <h1 style={{
            fontFamily: 'var(--ds-font-display-stack)', fontWeight: 700,
            fontSize: 'clamp(32px, 4vw, 52px)', letterSpacing: '0.02em', lineHeight: 1,
            margin: '0 0 10px 0', textTransform: 'uppercase',
          }}>
            Создать <span className="ds-hl">резюме</span>
          </h1>
          <p style={{ fontSize: 15, color: 'var(--ds-ink-dim)', maxWidth: 640, lineHeight: 1.5, margin: 0 }}>
            Заполняй секции — куратор проверит и подготовит финальный PDF.
          </p>
        </div>
      </section>

      <main style={{ maxWidth: 920, margin: '0 auto', padding: '32px 32px 80px' }}>

        {/* Личное */}
        <Card title="Личная информация">
          <Grid2>
            <Input label="Должность / специализация" value={resume.personal.jobTitle} onChange={(v) => updatePersonal('jobTitle', v)} />
            <div />
            <Input label="Имя" value={resume.personal.firstName} onChange={(v) => updatePersonal('firstName', v)} />
            <Input label="Фамилия" value={resume.personal.lastName} onChange={(v) => updatePersonal('lastName', v)} />
            <Input label="Email" value={resume.personal.email} onChange={(v) => updatePersonal('email', v)} />
            <Input label="Телефон" value={resume.personal.phone} onChange={(v) => updatePersonal('phone', v)} />
            <Input label="Город" value={resume.personal.city} onChange={(v) => updatePersonal('city', v)} />
            <Input label="Страна" value={resume.personal.country} onChange={(v) => updatePersonal('country', v)} />
          </Grid2>
          <div style={{ marginTop: 16 }}>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--ds-ink-dim)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>
              Profile Summary
            </label>
            <textarea
              value={resume.personal.profileSummary}
              onChange={(e) => updatePersonal('profileSummary', e.target.value)}
              rows={4}
              style={inputStyle}
            />
          </div>
        </Card>

        {/* Опыт работы */}
        <Card title="Опыт работы">
          {resume.workExperience.map(w => (
            <div key={w.id} style={{
              padding: 18, borderRadius: 10, border: '1px solid var(--ds-border-soft)', marginBottom: 12, background: '#fff',
            }}>
              <Grid2>
                <Input label="Должность" value={w.jobTitle} onChange={(v) => updateWorkItem(w.id, 'jobTitle', v)} />
                <Input label="Компания" value={w.company} onChange={(v) => updateWorkItem(w.id, 'company', v)} />
                <Input label="Город" value={w.city} onChange={(v) => updateWorkItem(w.id, 'city', v)} />
                <Grid2>
                  <Input label="Начало" value={w.startDate} onChange={(v) => updateWorkItem(w.id, 'startDate', v)} placeholder="2024-09" />
                  <Input label="Конец" value={w.endDate} onChange={(v) => updateWorkItem(w.id, 'endDate', v)} placeholder="present" />
                </Grid2>
              </Grid2>
              <div style={{ marginTop: 12 }}>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--ds-ink-dim)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>
                  Что делал
                </label>
                <textarea
                  value={w.description}
                  onChange={(e) => updateWorkItem(w.id, 'description', e.target.value)}
                  rows={3}
                  style={inputStyle}
                />
              </div>
              <button onClick={() => removeWork(w.id)} style={{ marginTop: 10, padding: '6px 12px', borderRadius: 6, border: '1px solid var(--ds-red)', background: '#fff', color: 'var(--ds-red)', cursor: 'pointer', fontSize: 11 }}>
                Удалить
              </button>
            </div>
          ))}
          <button onClick={addWork}
            style={{ padding: '10px 18px', borderRadius: 8, border: '1px dashed var(--ds-purple)', background: '#fff', color: 'var(--ds-purple)', cursor: 'pointer', fontSize: 12, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
            + Добавить опыт
          </button>
        </Card>

        {/* Образование (только просмотр + редактирование первого) */}
        <Card title="Образование">
          {resume.education.map(e => (
            <Grid2 key={e.id}>
              <Input label="Школа / университет" value={e.school} onChange={(v) => setResume({ ...resume, education: resume.education.map(it => it.id === e.id ? { ...it, school: v } : it) })} />
              <Input label="Степень / класс" value={e.degree} onChange={(v) => setResume({ ...resume, education: resume.education.map(it => it.id === e.id ? { ...it, degree: v } : it) })} />
              <Input label="Начало" value={e.startDate} onChange={(v) => setResume({ ...resume, education: resume.education.map(it => it.id === e.id ? { ...it, startDate: v } : it) })} />
              <Input label="Конец" value={e.endDate} onChange={(v) => setResume({ ...resume, education: resume.education.map(it => it.id === e.id ? { ...it, endDate: v } : it) })} />
            </Grid2>
          ))}
        </Card>

        {/* Навыки и языки — только показ */}
        <Card title="Навыки">
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {resume.skills.map(s => (
              <span key={s.id} style={{ padding: '6px 12px', borderRadius: 16, background: 'rgba(177,94,204,.1)', color: 'var(--ds-purple)', fontSize: 12, fontWeight: 600 }}>
                {s.name} · {s.level}
              </span>
            ))}
          </div>
        </Card>

        <Card title="Языки">
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {resume.languages.map(l => (
              <span key={l.id} style={{ padding: '6px 12px', borderRadius: 16, background: 'rgba(22,163,97,.1)', color: 'var(--ds-green)', fontSize: 12, fontWeight: 600 }}>
                {l.name} · {l.level}
              </span>
            ))}
          </div>
        </Card>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 20, borderRadius: 12, background: 'rgba(177,94,204,.06)', border: '1px solid var(--ds-purple)' }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ds-ink)' }}>Резюме готово?</div>
            <div style={{ fontSize: 11, color: 'var(--ds-ink-dim)', marginTop: 2 }}>
              Куратор отформатирует и подготовит финальный PDF
            </div>
          </div>
          <button onClick={() => setResumeStatus('sent')}
            style={{ padding: '12px 24px', borderRadius: 10, border: 'none', background: 'var(--ds-purple)', color: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
            Отправить куратору
          </button>
        </div>

        {state.resumeStatus === 'sent' && (
          <div style={{ marginTop: 20, padding: 16, borderRadius: 'var(--ds-r-md)', background: 'var(--ds-success-soft)', color: 'var(--ds-success-ink)', fontSize: 13, textAlign: 'center', fontWeight: 600 }}>
            ✓ Резюме отправлено куратору.
          </div>
        )}
      </main>
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '8px 12px', borderRadius: 8,
  border: '1px solid var(--ds-border-soft)', fontSize: 13, fontFamily: 'inherit',
  background: '#fff', boxSizing: 'border-box',
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{
      padding: '24px 28px', borderRadius: 16, background: 'var(--ds-surface)',
      border: '1px solid var(--ds-border-soft)', marginBottom: 20,
    }}>
      <h2 style={{ fontFamily: 'var(--ds-font-display-stack)', fontWeight: 700, fontSize: 18, letterSpacing: '0.04em', textTransform: 'uppercase', margin: 0, marginBottom: 16 }}>
        {title}
      </h2>
      {children}
    </section>
  )
}

function Grid2({ children }: { children: React.ReactNode }) {
  return <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>{children}</div>
}

function Input({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div>
      <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--ds-ink-dim)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>
        {label}
      </label>
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} style={inputStyle} />
    </div>
  )
}
