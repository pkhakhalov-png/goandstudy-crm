'use client'

import type { Resume } from './mock'

/* Минимальный read-only превью — одна колонка Details + основная
   колонка с крупными секциями. Повторяет вид из скриншотов resume.io. */

interface Props {
  resume: Resume
}

const LANG_LEVEL_BAR: Record<string, number> = {
  'Beginner': 0.2,
  'Intermediate': 0.45,
  'Good command': 0.6,
  'Very good command': 0.75,
  'Highly proficient': 0.9,
  'Native speaker': 1,
}

export function ResumePreview({ resume }: Props) {
  const fullName = [resume.personal.firstName, resume.personal.lastName].filter(Boolean).join(' ') || 'Ваше имя'

  return (
    <div
      style={{
        background: '#FFFFFF',
        border: '1px solid var(--ds-border)',
        borderRadius: 'var(--ds-r-lg)',
        overflow: 'hidden',
        boxShadow: 'var(--ds-sh-md)',
        fontFamily: 'var(--ds-font)',
        color: '#1D1D1F',
        height: 'fit-content',
      }}
    >
      {/* A4-like proportions, letterpress feel */}
      <div style={{ padding: '48px 40px 40px' }}>
        {/* Name — huge display */}
        <h1
          style={{
            fontFamily: 'var(--ds-font-display-stack)',
            fontWeight: 700,
            fontSize: 'clamp(28px, 3vw, 40px)',
            letterSpacing: '0.02em',
            textTransform: 'uppercase',
            lineHeight: 0.95,
            margin: '0 0 20px 0',
            color: '#0A0A0F',
          }}
        >
          {fullName}
        </h1>
        {resume.personal.profileSummary && (
          <p style={{ fontSize: 12, lineHeight: 1.6, color: '#1D1D1F', margin: '0 0 16px 0', whiteSpace: 'pre-wrap' }}>
            {resume.personal.profileSummary}
          </p>
        )}
        <div style={{ height: 1, background: '#111', marginBottom: 24 }} />

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '180px 1fr',
            gap: 28,
          }}
        >
          {/* LEFT column */}
          <aside style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <PreviewHeading>Details</PreviewHeading>

            {resume.personal.phone && (
              <PreviewField label="Phone" value={resume.personal.phone} />
            )}
            {resume.personal.email && (
              <PreviewField label="Email" value={resume.personal.email} />
            )}
            {resume.personal.city && (
              <PreviewField label="City" value={resume.personal.city} />
            )}

            {resume.links.length > 0 && (
              <div style={{ marginTop: 8 }}>
                <PreviewHeading>Links</PreviewHeading>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 6 }}>
                  {resume.links.map(l => (
                    <a key={l.id} href={l.url} target="_blank" rel="noopener" style={{ fontSize: 11, color: '#1D1D1F', textDecoration: 'underline' }}>
                      {l.title}
                    </a>
                  ))}
                </div>
              </div>
            )}

            {resume.skills.length > 0 && (
              <div style={{ marginTop: 8 }}>
                <PreviewHeading>Skills</PreviewHeading>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 10 }}>
                  {resume.skills.map(s => (
                    <div key={s.id}>
                      <div style={{ fontSize: 11, marginBottom: 4 }}>{s.name}</div>
                      {resume.skillsShowLevel && (
                        <div style={{ height: 1, background: '#111', width: '100%', position: 'relative' }}>
                          <div style={{ position: 'absolute', right: '15%', top: 0, bottom: 0, width: 1, background: '#111' }} />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {resume.hobbies && (
              <div style={{ marginTop: 8 }}>
                <PreviewHeading>Hobbies</PreviewHeading>
                <div style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', wordBreak: 'break-word', fontSize: 10.5, lineHeight: 1.55, marginTop: 6 }}>
                  {resume.hobbies}
                </div>
              </div>
            )}

            {resume.languages.length > 0 && (
              <div style={{ marginTop: 8 }}>
                <PreviewHeading>Languages</PreviewHeading>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 10 }}>
                  {resume.languages.map(l => {
                    const pct = Math.round((LANG_LEVEL_BAR[l.level] ?? 0.7) * 100)
                    return (
                      <div key={l.id}>
                        <div style={{ fontSize: 11, marginBottom: 4 }}>{l.name}</div>
                        <div style={{ height: 3, background: '#E5E5E7' }}>
                          <div style={{ width: `${pct}%`, height: '100%', background: '#111' }} />
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </aside>

          {/* RIGHT column */}
          <main style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
            {resume.workExperience.length > 0 && (
              <PreviewSection title="Work Experience">
                {resume.workExperience.map(w => (
                  <PreviewEntry
                    key={w.id}
                    title={[w.jobTitle, w.company].filter(Boolean).join(' at ') || w.jobTitle || w.company}
                    meta={w.city}
                    subtitle={[w.startDate, w.endDate].filter(Boolean).join(' — ')}
                    body={w.description}
                  />
                ))}
              </PreviewSection>
            )}

            {resume.education.length > 0 && (
              <PreviewSection title="Education">
                {resume.education.map(e => (
                  <PreviewEntry
                    key={e.id}
                    title={[e.degree, e.school].filter(Boolean).join(', ') || e.school}
                    meta={e.city}
                    subtitle={[e.startDate, e.endDate].filter(Boolean).join(' — ')}
                    body={e.description}
                  />
                ))}
              </PreviewSection>
            )}

            {resume.courses.length > 0 && (
              <PreviewSection title="Courses">
                {resume.courses.map(c => (
                  <PreviewEntry
                    key={c.id}
                    title={c.title}
                    meta={c.city}
                    subtitle={c.year}
                    body={c.description}
                  />
                ))}
              </PreviewSection>
            )}

            {resume.conferences.length > 0 && (
              <PreviewSection title="Conferences">
                {resume.conferences.map(c => (
                  <PreviewEntry
                    key={c.id}
                    title={c.title}
                    meta={c.city}
                    subtitle={c.date}
                    body={c.description}
                  />
                ))}
              </PreviewSection>
            )}

            {resume.customSections.map(cs => (
              <PreviewSection key={cs.id} title={cs.title}>
                {cs.items.map(item => (
                  <PreviewEntry
                    key={item.id}
                    title={item.title}
                    subtitle={item.date}
                    body={item.description}
                  />
                ))}
              </PreviewSection>
            ))}

            {resume.awards.length > 0 && (
              <PreviewSection title="Awards">
                <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {resume.awards.map(a => (
                    <li key={a.id} style={{ fontSize: 11, lineHeight: 1.5, position: 'relative', paddingLeft: 16 }}>
                      <span style={{ position: 'absolute', left: 0, top: 8, width: 4, height: 4, background: '#111', borderRadius: '50%' }} />
                      {a.title}{a.year ? ` (${a.year})` : ''}
                    </li>
                  ))}
                </ul>
              </PreviewSection>
            )}

            {resume.volunteering.length > 0 && (
              <PreviewSection title="Volunteering">
                {resume.volunteering.map(v => (
                  <PreviewEntry
                    key={v.id}
                    title={v.title}
                    meta={v.city}
                    subtitle={[v.startDate, v.endDate].filter(Boolean).join(' — ')}
                    body={v.description}
                  />
                ))}
              </PreviewSection>
            )}

            {resume.olympiads.length > 0 && (
              <PreviewSection title="Olympiads">
                {resume.olympiads.map(o => (
                  <div key={o.id} style={{ marginBottom: 8 }}>
                    <div style={{ fontSize: 11, fontWeight: 500, lineHeight: 1.4 }}>{o.title}</div>
                    {o.year && <div style={{ fontSize: 10.5, color: '#555', marginTop: 2 }}>{o.year}</div>}
                  </div>
                ))}
              </PreviewSection>
            )}
          </main>
        </div>
      </div>
    </div>
  )
}

function PreviewHeading({ children }: { children: React.ReactNode }) {
  return (
    <div>
      <div
        style={{
          fontFamily: 'var(--ds-font-display-stack)',
          fontWeight: 700,
          fontSize: 13,
          letterSpacing: '0.12em',
          textTransform: 'uppercase',
          color: '#0A0A0F',
        }}
      >
        {children}
      </div>
      <div style={{ height: 2, width: 24, background: '#111', marginTop: 4 }} />
    </div>
  )
}

function PreviewField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontSize: 10, fontWeight: 700, color: '#0A0A0F', marginBottom: 2 }}>
        {label.toUpperCase()}
      </div>
      <div style={{ fontSize: 11, color: '#1D1D1F' }}>{value}</div>
    </div>
  )
}

function PreviewSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <PreviewHeading>{title}</PreviewHeading>
      <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
        {children}
      </div>
    </div>
  )
}

function PreviewEntry({ title, meta, subtitle, body }: { title: string; meta?: string; subtitle?: string; body?: string }) {
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'baseline' }}>
        <div style={{ fontSize: 12, fontWeight: 600, lineHeight: 1.3 }}>{title}</div>
        {meta && <div style={{ fontSize: 10.5, color: '#555', whiteSpace: 'nowrap' }}>{meta}</div>}
      </div>
      {subtitle && <div style={{ fontSize: 10.5, color: '#555', marginTop: 2 }}>{subtitle}</div>}
      {body && (
        <div style={{ fontSize: 11, lineHeight: 1.55, marginTop: 6, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', wordBreak: 'break-word' }}>
          {body}
        </div>
      )}
    </div>
  )
}
