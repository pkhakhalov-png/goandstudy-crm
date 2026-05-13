'use client'

import { CollapsibleCard } from './CollapsibleCard'
import { DEMO_PROJECT, DEMO_ROADMAP } from '../data'

export function DemoProjectAndRoadmap() {
  return (
    <div className="project-roadmap-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, alignItems: 'start' }}>
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
  return (
    <CollapsibleCard
      eyebrow="Стратегическая сессия"
      title="Проект студента"
      summary="Зафиксировано 27 апреля · Куратор Анна"
      chip={
        <span className="ds-chip ds-chip-success" style={{ textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700, fontSize: 10 }}>
          ✓ Зафиксировано
        </span>
      }
    >
      <ProjectContent />
    </CollapsibleCard>
  )
}

function ProjectContent() {
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
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
    <CollapsibleCard
      eyebrow="Детально по шагам"
      title="Дорожная карта"
      summary={`План работ от куратора · ${doneItems} из ${totalItems} выполнено`}
      chip={
        <span className="ds-chip ds-chip-success" style={{ textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700, fontSize: 10 }}>
          ✓ утверждено
        </span>
      }
    >
      <div>
        <div style={{ height: 8, borderRadius: 4, background: 'var(--ds-bg-alt)', overflow: 'hidden', marginBottom: 24 }}>
          <div style={{ height: '100%', width: `${progress}%`, background: 'var(--ds-purple)', transition: 'width .3s' }} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
          {stages.map(stage => (
            <div key={stage.stageKey}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ds-ink-dim)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 10 }}>
                {stage.stageName}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {stage.items.map(item => (
                  <div key={item.key} style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    padding: '8px 12px', borderRadius: 8,
                    background: item.current ? 'var(--ds-purple-soft)' : 'transparent',
                  }}>
                    <div style={{
                      width: 18, height: 18, borderRadius: '50%',
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
    </CollapsibleCard>
  )
}
