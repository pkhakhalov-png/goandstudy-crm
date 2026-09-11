'use client'
import { useState, useTransition } from 'react'
import { confirmFact } from '../actions'

type Issue = { level: string; kind: string; statement: string; why: string; claimId?: number }

const KIND_RU: Record<string, string> = {
  tuition_fee: 'стоимость', deadline: 'дедлайн', language_req: 'язык',
  visa_requirement: 'виза', eligibility: 'кого берут', document_req: 'документы',
  scholarship: 'стипендия', practice_vs_official: 'практика', system_basics: 'устройство',
  practical_timeline: 'сроки', internal_stat: 'наша статистика',
}

export function FactGate({ blocking, warnings, checked }: { blocking: Issue[]; warnings: Issue[]; checked: number }) {
  const [pending, start] = useTransition()
  const [done, setDone] = useState<Set<number>>(new Set())
  const [note, setNote] = useState<string | null>(null)

  if (!checked) return null

  const left = blocking.filter((b) => !b.claimId || !done.has(b.claimId))

  return (
    <div style={{ border: `1px solid ${left.length ? 'var(--red)' : 'var(--bor)'}`, borderRadius: 12, overflow: 'hidden', marginTop: 14 }}>
      <div style={{ padding: '10px 14px', background: 'var(--surf2)' }}>
        <div style={{ fontSize: 13, fontWeight: 700 }}>Существенные утверждения · проверено {checked}</div>
        <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 3, lineHeight: 1.5 }}>
          {left.length
            ? `${left.length} мешают согласованию: ошибка в стоимости, дедлайне или требованиях стоит читателю денег или года. Подтвердите то, за что ручаетесь, либо уберите из текста.`
            : 'Всё существенное подтверждено — согласование возможно.'}
        </div>
      </div>

      <div style={{ padding: '8px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {[...blocking, ...warnings].map((issue, i) => {
          const confirmed = issue.claimId ? done.has(issue.claimId) : false
          return (
            <div key={i} style={{ fontSize: 12, opacity: confirmed ? 0.5 : 1 }}>
              <div>
                <span style={{
                  fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.4, fontWeight: 700,
                  color: issue.level === 'blocking' ? 'var(--red)' : 'var(--muted)',
                }}>
                  {KIND_RU[issue.kind] ?? issue.kind}
                </span>
                <span style={{ marginLeft: 8 }}>{issue.statement}</span>
              </div>
              <div style={{ color: 'var(--muted)', fontSize: 11 }}>
                {confirmed ? 'подтверждено вами' : issue.why}
              </div>
              {issue.claimId && !confirmed && (
                <button className="btn-s" disabled={pending} style={{ fontSize: 11, padding: '2px 8px', marginTop: 4 }}
                  onClick={() => start(async () => {
                    const reason = prompt('Чем подтверждаете? Источник, разговор с вузом, опыт куратора — запишется в историю.')
                    if (reason === null) return
                    const r = await confirmFact(issue.claimId!, reason)
                    if (r.error) setNote(r.error)
                    else { setDone((p) => new Set(p).add(issue.claimId!)); setNote(r.note ?? null) }
                  })}>
                  Подтверждаю
                </button>
              )}
            </div>
          )
        })}
      </div>

      {note && <div style={{ padding: '0 14px 10px', fontSize: 11, color: 'var(--muted)' }}>{note}</div>}
    </div>
  )
}
