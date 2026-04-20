'use client'

import { useState } from 'react'

interface Props {
  stages: any[]
  checklist: any[]
}

const badgeColors: Record<string, { bg: string; color: string; border: string }> = {
  'СТАРТ': { bg: 'rgba(177,94,204,.08)', color: 'var(--purple)', border: 'rgba(177,94,204,.25)' },
  'КЛЮЧЕВОЙ': { bg: 'rgba(201,125,0,.08)', color: 'var(--gold)', border: 'rgba(201,125,0,.25)' },
  'СОЗВОН': { bg: 'rgba(0,136,204,.08)', color: '#0088cc', border: 'rgba(0,136,204,.25)' },
  'ЕСЛИ НУЖНО': { bg: 'rgba(142,142,147,.06)', color: 'var(--muted)', border: 'rgba(142,142,147,.2)' },
  'ЗАВЕРШЁН': { bg: 'rgba(22,163,97,.08)', color: 'var(--green)', border: 'rgba(22,163,97,.25)' },
  'ФИНАЛ': { bg: 'rgba(22,163,97,.08)', color: 'var(--green)', border: 'rgba(22,163,97,.25)' },
  'РАБОТА КУРАТОРА': { bg: 'rgba(177,94,204,.06)', color: 'var(--purple)', border: 'rgba(177,94,204,.2)' },
  'ДОКУМЕНТЫ': { bg: 'rgba(201,125,0,.06)', color: 'var(--gold)', border: 'rgba(201,125,0,.2)' },
  'ПОДАЧИ': { bg: 'rgba(0,136,204,.06)', color: '#0088cc', border: 'rgba(0,136,204,.2)' },
  'ЛЕГАЛИЗАЦИЯ': { bg: 'rgba(22,163,97,.06)', color: 'var(--green)', border: 'rgba(22,163,97,.2)' },
}

// Warning/template notes per stage (from screenshots)
const stageNotes: Record<string, { type: 'warning' | 'template'; text: string }[]> = {
  strategy_session: [
    { type: 'template', text: '[Имя], хочу подвести итог нашей стратегической сессии.\n\nНа основе обсуждённых данных я разработаю стратегию и дорожную карту, подберу вузы и программы, подготовлю презентацию.\n\nДедлайн отправки: [дата]. Пожалуйста, подтвердите актуальность данных.' },
  ],
  roadmap_presentation: [
    { type: 'warning', text: 'Дедлайн для клиента ставить с запасом 2–3 дня на проверку КК.' },
  ],
  uni_applications: [
    { type: 'template', text: '[Имя], все личные кабинеты созданы, документы загружены.\nОжидаем ответ от вузов 3–4 недели, то есть примерно до [дата].' },
  ],
}

export function GuideContent({ stages, checklist }: Props) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())

  function toggle(id: string) {
    setExpandedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  // Group checklist by stage
  const checklistByStage: Record<string, any[]> = {}
  checklist.forEach(c => {
    if (!checklistByStage[c.stage_id]) checklistByStage[c.stage_id] = []
    checklistByStage[c.stage_id].push(c)
  })

  return (
    <div style={{ padding: '20px 24px', maxWidth: 800 }}>
      <div style={{
        fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em',
        color: 'var(--purple)', marginBottom: 20,
      }}>
        ПОШАГОВЫЙ РЕГЛАМЕНТ
      </div>

      {stages.map((s: any, i: number) => {
        const colors = badgeColors[s.badge] || badgeColors['СТАРТ']
        const items = checklistByStage[s.id] || []
        const isExpanded = expandedIds.has(s.id)
        const notes = stageNotes[s.code] || []

        // Group items by section
        const sections: Record<string, any[]> = {}
        items.forEach(item => {
          const sec = item.section || '_default'
          if (!sections[sec]) sections[sec] = []
          sections[sec].push(item)
        })

        return (
          <div key={s.id} style={{
            background: 'var(--surf)', border: '1px solid var(--bor2)', borderRadius: 14,
            marginBottom: 16, overflow: 'hidden',
          }}>
            {/* Header */}
            <div
              onClick={() => toggle(s.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: 14, padding: '16px 20px',
                cursor: 'pointer',
              }}>
              <div style={{
                width: 40, height: 40, borderRadius: '50%', flexShrink: 0,
                background: 'rgba(177,94,204,.08)', color: 'var(--purple)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 16, fontWeight: 700,
              }}>
                {i + 1}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>{s.title}</div>
                {s.subtitle && <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>{s.subtitle}</div>}
              </div>
              <span style={{
                padding: '4px 14px', borderRadius: 20, fontSize: 10, fontWeight: 700,
                background: colors.bg, color: colors.color, border: `1px solid ${colors.border}`,
                textTransform: 'uppercase', letterSpacing: '0.03em',
              }}>
                {s.badge}
              </span>
              <svg viewBox="0 0 12 12" fill="none" stroke="var(--muted)" strokeWidth="1.5" width="14" height="14"
                style={{ transform: isExpanded ? 'rotate(180deg)' : 'none', transition: 'transform .2s', flexShrink: 0 }}>
                <path d="M2 4l4 4 4-4" />
              </svg>
            </div>

            {/* Body — collapsible */}
            {isExpanded && (
              <div style={{ padding: '0 20px 20px' }}>
                {/* Description */}
                {s.description && (
                  <div style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.6, marginBottom: 16 }}>
                    {s.description}
                  </div>
                )}

                {/* Checklist items grouped by section */}
                {Object.entries(sections).map(([secName, secItems]) => (
                  <div key={secName}>
                    {secName !== '_default' && (
                      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', marginTop: 12, marginBottom: 10 }}>
                        {secName}:
                      </div>
                    )}
                    <div style={{ display: 'grid', gap: 8, marginBottom: 12 }}>
                      {secItems.map((item: any) => (
                        <div key={item.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                          <div style={{
                            width: 7, height: 7, borderRadius: '50%', flexShrink: 0,
                            background: 'var(--purple)', marginTop: 6, opacity: 0.5,
                          }} />
                          <span style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.5 }}>
                            {item.text}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}

                {/* Warning / Template notes */}
                {notes.map((note, ni) => (
                  <div key={ni} style={{
                    marginTop: 12, padding: '12px 16px',
                    background: note.type === 'warning' ? 'rgba(255,243,205,.6)' : 'rgba(255,243,205,.4)',
                    borderLeft: `3px solid ${note.type === 'warning' ? 'var(--gold)' : 'var(--purple)'}`,
                    borderRadius: '0 10px 10px 0',
                    fontSize: 13, lineHeight: 1.6,
                    color: note.type === 'warning' ? 'var(--gold)' : 'var(--muted)',
                    fontStyle: note.type === 'template' ? 'italic' : 'normal',
                    whiteSpace: 'pre-wrap',
                  }}>
                    {note.text}
                  </div>
                ))}

                {items.length === 0 && !s.description && (
                  <div style={{ fontSize: 12, color: 'var(--muted)', fontStyle: 'italic' }}>
                    Чеклист не заполнен
                  </div>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
