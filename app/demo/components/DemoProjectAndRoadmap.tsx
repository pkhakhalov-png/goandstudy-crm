'use client'

import { useState } from 'react'
import { DEMO_PROJECT, DEMO_ROADMAP } from '../data'

export function DemoProjectAndRoadmap() {
  return (
    <div
      className="project-roadmap-grid"
      style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, alignItems: 'start' }}
    >
      <style>{`
        @media (max-width: 980px) {
          .project-roadmap-grid { grid-template-columns: 1fr !important; }
        }
        .project-roadmap-grid > * { min-width: 0; }
      `}</style>

      <ProjectCard />
      <RoadmapCard />
    </div>
  )
}

function ProjectCard() {
  const [open, setOpen] = useState(false)
  const p = DEMO_PROJECT as Record<string, string>
  const fields = [
    ['child_name', 'Имя ребёнка'],
    ['child_age', 'Возраст'],
    ['current_grade', 'Класс'],
    ['target_country', 'Страна'],
    ['target_specialty', 'Специальность'],
    ['budget_per_year', 'Бюджет'],
    ['language_level', 'Языки'],
    ['ielts_score', 'IELTS'],
    ['gpa', 'GPA'],
    ['motivation', 'Мотивация'],
    ['extracurricular', 'Внеучебка'],
    ['parent_concerns', 'Запрос родителей'],
    ['decision_makers', 'Кто решает'],
  ] as const

  return (
    <div className="ds-card" style={{ padding: 24 }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--ds-purple)', marginBottom: 6 }}>
            Стратегическая сессия
          </div>
          <h3 style={{ fontFamily: 'var(--ds-font-display-stack)', fontWeight: 700, fontSize: 22, textTransform: 'uppercase', letterSpacing: '0.04em', margin: 0 }}>
            Проект студента
          </h3>
          <div style={{ marginTop: 8, fontSize: 13, color: 'var(--ds-muted)' }}>
            Зафиксировано 27 апреля · Куратор Анна
          </div>
        </div>
        <span style={{
          fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
          background: 'var(--ds-success-soft)', color: 'var(--ds-success-ink)',
          padding: '4px 10px', borderRadius: 999, whiteSpace: 'nowrap',
        }}>
          ✓ Зафиксировано
        </span>
      </header>

      <button onClick={() => setOpen(o => !o)} style={{
        marginTop: 14, background: 'transparent', border: 'none', padding: 0,
        fontSize: 12, fontWeight: 700, color: 'var(--ds-purple)',
        letterSpacing: '0.06em', textTransform: 'uppercase', cursor: 'pointer',
      }}>
        {open ? 'Свернуть ↑' : 'Показать профиль ↓'}
      </button>

      {open && (
        <div style={{ marginTop: 18, display: 'flex', flexDirection: 'column', gap: 14 }}>
          {fields.map(([key, label]) => {
            const value = p[key]
            if (!value) return null
            return (
              <div key={key}>
                <div style={{ fontSize: 10, color: 'var(--ds-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 4 }}>
                  {label}
                </div>
                <div style={{ fontSize: 13, color: 'var(--ds-ink)', lineHeight: 1.5 }}>
                  {value}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function RoadmapCard() {
  const stages = (DEMO_ROADMAP.data as any).stages as Array<{
    stageKey: string; stageName: string;
    items: Array<{ key: string; title: string; date: string; done: boolean; current?: boolean }>
  }>
  const totalItems = stages.reduce((sum, s) => sum + s.items.length, 0)
  const doneItems = stages.reduce((sum, s) => sum + s.items.filter(i => i.done).length, 0)
  const progress = totalItems > 0 ? Math.round((doneItems / totalItems) * 100) : 0

  return (
    <div className="ds-card" style={{ padding: 24 }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--ds-purple)', marginBottom: 6 }}>
            План работы
          </div>
          <h3 style={{ fontFamily: 'var(--ds-font-display-stack)', fontWeight: 700, fontSize: 22, textTransform: 'uppercase', letterSpacing: '0.04em', margin: 0 }}>
            Дорожная карта
          </h3>
          <div style={{ marginTop: 8, fontSize: 13, color: 'var(--ds-muted)' }}>
            Утверждено · {doneItems} из {totalItems} задач выполнено
          </div>
        </div>
        <span style={{
          fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
          background: 'var(--ds-success-soft)', color: 'var(--ds-success-ink)',
          padding: '4px 10px', borderRadius: 999, whiteSpace: 'nowrap',
        }}>
          ✓ Утверждено
        </span>
      </header>

      {/* Progress bar */}
      <div style={{ marginTop: 18, height: 8, borderRadius: 4, background: 'var(--ds-bg-alt)', overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${progress}%`, background: 'var(--ds-purple)', transition: 'width .3s' }} />
      </div>

      <div style={{ marginTop: 20, display: 'flex', flexDirection: 'column', gap: 18 }}>
        {stages.map(stage => (
          <div key={stage.stageKey}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ds-ink-dim)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 8 }}>
              {stage.stageName}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {stage.items.map(item => (
                <div key={item.key} style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '6px 10px', borderRadius: 8,
                  background: item.current ? 'var(--ds-purple-soft)' : 'transparent',
                }}>
                  <div style={{
                    width: 16, height: 16, borderRadius: '50%',
                    background: item.done ? 'var(--ds-success)' : item.current ? 'var(--ds-purple)' : 'transparent',
                    border: item.done || item.current ? 'none' : '1.5px solid var(--ds-border)',
                    flexShrink: 0,
                    display: 'grid', placeItems: 'center',
                    color: '#fff', fontSize: 10, fontWeight: 700,
                  }}>
                    {item.done ? '✓' : ''}
                  </div>
                  <div style={{ flex: 1, fontSize: 13, color: 'var(--ds-ink)', textDecoration: item.done ? 'line-through' : 'none', opacity: item.done ? 0.6 : 1 }}>
                    {item.title}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--ds-muted)', whiteSpace: 'nowrap' }}>
                    {item.date}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
