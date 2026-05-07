import type { TimelineStage, RequiredDoc, Essay } from './mock-data'

interface Props {
  timeline: TimelineStage[]
  universities: { length: number }
  documents: RequiredDoc[]
  essays: Essay[]
}

/** Подсчёт общего прогресса по 4 направлениям + общий процент. */
export function ProgressBlock({ timeline, universities, documents, essays }: Props) {
  const stagesDone = timeline.filter(s => s.state === 'done').length
  const stagesTotal = timeline.length
  const stagesPct = stagesTotal > 0 ? Math.round((stagesDone / stagesTotal) * 100) : 0

  const docsDone = documents.filter(d => d.status === 'uploaded').length
  const docsTotal = documents.length
  const docsPct = docsTotal > 0 ? Math.round((docsDone / docsTotal) * 100) : 0

  const essaysDone = essays.filter(e => e.state === 'ready' || e.state === 'sent').length
  const essaysTotal = essays.length
  const essaysPct = essaysTotal > 0 ? Math.round((essaysDone / essaysTotal) * 100) : 0

  const shortlistOk = universities.length >= 3 ? 100 : Math.round((universities.length / 3) * 100)

  // Общий процент — среднее по 4 категориям
  const overall = Math.round((stagesPct + docsPct + essaysPct + shortlistOk) / 4)

  return (
    <section className="ds-card" style={{ padding: '32px 40px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: 16, marginBottom: 24 }}>
        <div>
          <div style={{
            fontSize: 11, fontWeight: 800, letterSpacing: '0.12em',
            textTransform: 'uppercase', color: 'var(--ds-purple)', marginBottom: 6,
          }}>
            Прогресс поступления
          </div>
          <h2 style={{
            fontFamily: 'var(--ds-font-display-stack)',
            fontWeight: 700, fontSize: 'clamp(22px, 2.6vw, 30px)',
            textTransform: 'uppercase', letterSpacing: '0.04em',
            margin: 0, lineHeight: 1.05,
          }}>
            {overall < 30 ? 'Только начали' : overall < 70 ? 'В процессе' : overall < 95 ? 'Финишная прямая' : 'Почти готово'}
          </h2>
          <p style={{ fontSize: 14, color: 'var(--ds-muted)', margin: '6px 0 0' }}>
            Общая готовность по 4 ключевым направлениям
          </p>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{
            fontFamily: 'var(--ds-font-display-stack)',
            fontWeight: 800, fontSize: 56, lineHeight: 1,
            color: 'var(--ds-purple-deep)', fontVariantNumeric: 'tabular-nums',
            letterSpacing: '-0.02em',
          }}>
            {overall}<span style={{ fontSize: 28, marginLeft: 2 }}>%</span>
          </div>
        </div>
      </div>

      {/* Большой бар */}
      <div style={{ height: 10, background: 'var(--ds-bg-alt)', borderRadius: 100, overflow: 'hidden', marginBottom: 24 }}>
        <div style={{
          width: `${overall}%`, height: '100%',
          background: 'linear-gradient(90deg, var(--ds-purple) 0%, var(--ds-purple-deep) 100%)',
          transition: 'width 600ms cubic-bezier(0.16, 1, 0.3, 1)',
        }} />
      </div>

      {/* 4 категории */}
      <div style={{
        display: 'grid', gap: 12,
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
      }}>
        <Mini label="Этапы программы" done={stagesDone} total={stagesTotal} pct={stagesPct} icon="🛣" />
        <Mini label="Подборка вузов" done={Math.min(universities.length, 3)} total={3} pct={shortlistOk} icon="🎓" />
        <Mini label="Эссе и резюме" done={essaysDone} total={essaysTotal} pct={essaysPct} icon="📝" />
        <Mini label="Документы" done={docsDone} total={docsTotal} pct={docsPct} icon="📄" />
      </div>
    </section>
  )
}

function Mini({ label, done, total, pct, icon }: { label: string; done: number; total: number; pct: number; icon: string }) {
  return (
    <div style={{
      padding: '14px 16px',
      background: 'var(--ds-bg-alt)',
      borderRadius: 'var(--ds-r-md)',
      display: 'flex', flexDirection: 'column', gap: 8,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 18 }}>{icon}</span>
        <span style={{
          fontSize: 11, fontWeight: 700, letterSpacing: '0.06em',
          textTransform: 'uppercase', color: 'var(--ds-muted)',
        }}>
          {label}
        </span>
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
        <span style={{
          fontFamily: 'var(--ds-font-display-stack)',
          fontWeight: 700, fontSize: 20,
          color: 'var(--ds-ink)', fontVariantNumeric: 'tabular-nums',
        }}>
          {done}<span style={{ color: 'var(--ds-muted)', fontWeight: 500 }}> / {total}</span>
        </span>
        <span style={{ fontSize: 12, color: 'var(--ds-muted)', fontVariantNumeric: 'tabular-nums' }}>
          {pct}%
        </span>
      </div>
      <div style={{ height: 4, background: 'var(--ds-bg)', borderRadius: 100, overflow: 'hidden' }}>
        <div style={{
          width: `${pct}%`, height: '100%',
          background: pct === 100 ? 'var(--ds-success)' : 'var(--ds-purple)',
          transition: 'width 600ms cubic-bezier(0.16, 1, 0.3, 1)',
        }} />
      </div>
    </div>
  )
}
