'use client'

import { useEffect, useState } from 'react'
import type { RequiredDoc, OptionalDoc } from './mock-data'

interface Props {
  required: RequiredDoc[]
  optional: OptionalDoc[]
}

export function DocumentsSection({ required, optional }: Props) {
  const [modalDoc, setModalDoc] = useState<RequiredDoc | null>(null)

  // ESC закрывает модалку
  useEffect(() => {
    if (!modalDoc) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setModalDoc(null)
    }
    window.addEventListener('keydown', handler)
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', handler)
      document.body.style.overflow = ''
    }
  }, [modalDoc])

  const uploadable = required.filter(d => d.status !== 'locked')
  const uploadedCount = uploadable.filter(d => d.status === 'uploaded').length
  const lockedCount = required.filter(d => d.status === 'locked').length

  return (
    <section id="documents" style={{ scrollMarginTop: 80 }}>
      <header style={{ marginBottom: 24 }}>
        <div
          style={{
            fontSize: 12,
            color: 'var(--ds-purple)',
            fontWeight: 700,
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
            marginBottom: 10,
          }}
        >
          Документы для поступления
        </div>
        <h2
          style={{
            fontFamily: 'var(--ds-font-display-stack)',
            fontWeight: 700,
            fontSize: 'clamp(28px, 3.5vw, 44px)',
            letterSpacing: '0.02em',
            lineHeight: 1,
            margin: '0 0 12px 0',
            textTransform: 'uppercase',
          }}
        >
          Всё что нужно <span className="ds-hl">загрузить</span>
        </h2>
        <p style={{ fontSize: 16, color: 'var(--ds-ink-dim)', lineHeight: 1.5, maxWidth: 720, margin: 0 }}>
          Загружено {uploadedCount} из {uploadable.length}. Кликни по карточке — если есть образец, откроется
          шаблон и форма загрузки. Куратор проверит каждый документ.
          {lockedCount > 0 && (
            <> Резюме и мотивационное письмо загорятся здесь когда вы заполните их через блок выше и куратор подготовит финальную версию.</>
          )}
        </p>
      </header>

      {/* Required grid — строго 3 колонки × 2 ряда */}
      <div
        className="docs-3x2-grid"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: 16,
          marginBottom: 40,
        }}
      >
        <style>{`
          @media (max-width: 880px) {
            .docs-3x2-grid { grid-template-columns: repeat(2, 1fr) !important; }
          }
          @media (max-width: 560px) {
            .docs-3x2-grid { grid-template-columns: 1fr !important; }
          }
        `}</style>
        {required.map(doc => (
          <DocCard
            key={doc.key}
            doc={doc}
            onClick={() => {
              // locked-карточки не открывают модалку
              if (doc.status === 'locked') return
              setModalDoc(doc)
            }}
          />
        ))}
      </div>

      {/* Optional docs */}
      <div>
        <h3
          style={{
            fontFamily: 'var(--ds-font-display-stack)',
            fontWeight: 700,
            fontSize: 18,
            textTransform: 'uppercase',
            letterSpacing: '0.04em',
            color: 'var(--ds-ink)',
            margin: '0 0 4px 0',
          }}
        >
          Доп. документы
        </h3>
        <p style={{ fontSize: 13, color: 'var(--ds-muted)', margin: '0 0 16px' }}>
          Сертификаты, справки, портфолио. Усиливают заявку, но не обязательны.
        </p>

        <div className="ds-card" style={{ padding: 20 }}>
          {optional.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
              {optional.map(d => (
                <div
                  key={d.key}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    padding: '10px 12px',
                    background: 'var(--ds-bg-alt)',
                    border: '1px solid var(--ds-border-soft)',
                    borderRadius: 'var(--ds-r-md)',
                  }}
                >
                  <div
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: 7,
                      background: 'var(--ds-success-soft)',
                      color: 'var(--ds-success-ink)',
                      display: 'grid',
                      placeItems: 'center',
                      fontSize: 13,
                      fontWeight: 700,
                      flexShrink: 0,
                    }}
                  >
                    ✓
                  </div>
                  <div style={{ flex: 1, fontSize: 13, fontWeight: 600, color: 'var(--ds-ink)', letterSpacing: '-0.005em' }}>
                    {d.title}
                  </div>
                  <div className="ds-mono" style={{ fontSize: 11, color: 'var(--ds-muted)' }}>
                    {d.fileSize ?? ''}
                  </div>
                </div>
              ))}
            </div>
          )}
          <button className="ds-btn ds-btn-secondary ds-btn-sm" type="button">
            + Добавить документ
          </button>
        </div>
      </div>

      {modalDoc && (
        <DocumentModal doc={modalDoc} onClose={() => setModalDoc(null)} />
      )}
    </section>
  )
}

/* ─────────────────────────────────────────────────────────────────────
   Карточка документа
   ───────────────────────────────────────────────────────────────────── */

function DocCard({ doc, onClick }: { doc: RequiredDoc; onClick: () => void }) {
  const statusMeta = getStatusMeta(doc.status)
  const locked = doc.status === 'locked'

  function handleClick() {
    if (locked) return
    if (doc.href) {
      window.open(doc.href, '_blank', 'noopener')
      return
    }
    onClick()
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={locked}
      style={{
        background: locked ? 'var(--ds-bg-alt)' : 'var(--ds-bg)',
        border: `1px solid ${locked ? 'var(--ds-border-soft)' : 'var(--ds-border-soft)'}`,
        borderRadius: 'var(--ds-r-xl)',
        padding: 20,
        textAlign: 'left',
        cursor: locked ? 'not-allowed' : 'pointer',
        display: 'flex',
        flexDirection: 'column',
        gap: 14,
        minHeight: 190,
        fontFamily: 'var(--ds-font)',
        transition: 'all 150ms',
        boxShadow: locked ? 'none' : 'var(--ds-sh-sm)',
        opacity: locked ? 0.72 : 1,
      }}
      onMouseEnter={(e) => {
        if (locked) return
        e.currentTarget.style.borderColor = 'var(--ds-purple)'
        e.currentTarget.style.boxShadow = '0 4px 20px -4px rgba(181,127,207,0.25)'
        e.currentTarget.style.transform = 'translateY(-2px)'
      }}
      onMouseLeave={(e) => {
        if (locked) return
        e.currentTarget.style.borderColor = 'var(--ds-border-soft)'
        e.currentTarget.style.boxShadow = 'var(--ds-sh-sm)'
        e.currentTarget.style.transform = 'translateY(0)'
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <div
          style={{
            width: 44,
            height: 44,
            borderRadius: 12,
            background: statusMeta.bg,
            color: statusMeta.fg,
            display: 'grid',
            placeItems: 'center',
            fontSize: 22,
            fontWeight: 700,
            flexShrink: 0,
          }}
        >
          {statusMeta.ch}
        </div>
        <span
          className={`ds-chip ${statusMeta.chipClass}`}
          style={{ textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700, fontSize: 10 }}
        >
          {statusMeta.chipText}
        </span>
      </div>

      <div style={{ flex: 1 }}>
        <h3
          style={{
            fontFamily: 'var(--ds-font-display-stack)',
            fontWeight: 700,
            fontSize: 16,
            textTransform: 'uppercase',
            letterSpacing: '0.03em',
            color: locked ? 'var(--ds-muted)' : 'var(--ds-ink)',
            margin: '0 0 6px 0',
            lineHeight: 1.15,
          }}
        >
          {doc.title}
        </h3>
        {doc.hint && !locked && (
          <p style={{ fontSize: 13, color: 'var(--ds-muted)', margin: 0, lineHeight: 1.4 }}>
            {doc.hint}
          </p>
        )}
        {locked && doc.lockedHint && (
          <p style={{ fontSize: 12, color: 'var(--ds-muted)', margin: 0, lineHeight: 1.45, fontStyle: 'italic' }}>
            {doc.lockedHint}
          </p>
        )}
      </div>

      {locked ? (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            fontSize: 11,
            color: 'var(--ds-muted)',
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
          }}
        >
          <span style={{ fontSize: 13 }}>🔒</span>
          ждёт заполнения выше
        </div>
      ) : doc.fileName ? (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '10px 12px',
            background: 'var(--ds-bg-alt)',
            borderRadius: 'var(--ds-r-md)',
            fontSize: 12,
          }}
        >
          <span style={{ fontSize: 14 }}>📄</span>
          <span style={{ flex: 1, fontWeight: 500, color: 'var(--ds-ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {doc.fileName}
          </span>
          <span className="ds-mono" style={{ fontSize: 11, color: 'var(--ds-muted)' }}>{doc.fileSize}</span>
        </div>
      ) : (
        <div
          style={{
            fontSize: 11,
            color: 'var(--ds-purple)',
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
          }}
        >
          {doc.hasExample ? 'Посмотреть пример и загрузить →' : 'Загрузить файл →'}
        </div>
      )}
    </button>
  )
}

function getStatusMeta(status: RequiredDoc['status']) {
  switch (status) {
    case 'uploaded':
      return { ch: '✓', bg: 'var(--ds-success-soft)', fg: 'var(--ds-success-ink)', chipClass: 'ds-chip-success', chipText: '✓ готово' }
    case 'missing':
      return { ch: '+', bg: 'var(--ds-purple-soft)', fg: 'var(--ds-purple-deep)', chipClass: 'ds-chip-error', chipText: 'нужен' }
    case 'pending':
      return { ch: '•', bg: 'var(--ds-amber-soft)', fg: '#8A6D1E', chipClass: 'ds-chip-warning', chipText: 'в работе' }
    case 'locked':
      return { ch: '🔒', bg: 'var(--ds-bg-alt)', fg: 'var(--ds-muted)', chipClass: 'ds-chip-neutral', chipText: 'не активен' }
    default:
      return { ch: '·', bg: 'var(--ds-bg-alt)', fg: 'var(--ds-muted)', chipClass: 'ds-chip-neutral', chipText: 'опционально' }
  }
}

/* ─────────────────────────────────────────────────────────────────────
   Modal — пример + загрузка
   ───────────────────────────────────────────────────────────────────── */

function DocumentModal({ doc, onClose }: { doc: RequiredDoc; onClose: () => void }) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
        background: 'rgba(15, 17, 24, 0.6)',
        backdropFilter: 'blur(8px)',
        display: 'grid',
        placeItems: 'center',
        padding: 24,
        animation: 'ds-fade-in 180ms ease-out',
      }}
    >
      <style>{`
        @keyframes ds-fade-in {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        @keyframes ds-lift-in {
          from { opacity: 0; transform: translateY(12px) scale(0.98); }
          to   { opacity: 1; transform: translateY(0)    scale(1); }
        }
      `}</style>

      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--ds-bg)',
          borderRadius: 'var(--ds-r-xl)',
          maxWidth: 960,
          width: '100%',
          maxHeight: '90vh',
          overflow: 'auto',
          boxShadow: '0 32px 80px -20px rgba(0,0,0,0.4)',
          animation: 'ds-lift-in 220ms cubic-bezier(0.25, 0.1, 0.25, 1)',
        }}
      >
        {/* Modal header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: 16,
            padding: '28px 32px 20px',
            borderBottom: '1px solid var(--ds-border-soft)',
            position: 'sticky',
            top: 0,
            background: 'var(--ds-bg)',
            zIndex: 2,
          }}
        >
          <div>
            <div
              style={{
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
                color: 'var(--ds-purple)',
                marginBottom: 8,
              }}
            >
              {doc.hasExample ? 'Пример и загрузка' : 'Загрузка документа'}
            </div>
            <h3
              style={{
                fontFamily: 'var(--ds-font-display-stack)',
                fontWeight: 700,
                fontSize: 24,
                textTransform: 'uppercase',
                letterSpacing: '0.03em',
                color: 'var(--ds-ink)',
                margin: 0,
                lineHeight: 1.1,
              }}
            >
              {doc.title}
            </h3>
            {doc.hint && (
              <p style={{ fontSize: 14, color: 'var(--ds-muted)', margin: '8px 0 0', lineHeight: 1.45, maxWidth: 580 }}>
                {doc.hint}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Закрыть"
            style={{
              width: 40,
              height: 40,
              borderRadius: 10,
              border: '1px solid var(--ds-border)',
              background: 'var(--ds-bg)',
              color: 'var(--ds-muted)',
              cursor: 'pointer',
              fontSize: 18,
              lineHeight: 1,
              flexShrink: 0,
              transition: 'all 120ms',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--ds-bg-alt)'; e.currentTarget.style.color = 'var(--ds-ink)' }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--ds-bg)'; e.currentTarget.style.color = 'var(--ds-muted)' }}
          >
            ✕
          </button>
        </div>

        <div style={{ padding: 32 }}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: doc.hasExample ? 'minmax(260px, 1fr) minmax(260px, 1fr)' : '1fr',
              gap: 28,
              alignItems: 'start',
            }}
            className="doc-modal-grid"
          >
            <style>{`
              @media (max-width: 760px) {
                .doc-modal-grid { grid-template-columns: 1fr !important; }
              }
            `}</style>

            {/* Example PDF */}
            {doc.hasExample && (
              <div>
                <SectionLabel>Образец документа</SectionLabel>
                {doc.samplePath ? <SamplePreview src={doc.samplePath} /> : <PdfMock />}
              </div>
            )}

            {/* Upload zone */}
            <div>
              <SectionLabel>Загрузить ваш документ</SectionLabel>
              <UploadZone doc={doc} />
              <div
                style={{
                  marginTop: 14,
                  padding: 14,
                  background: 'var(--ds-bg-alt)',
                  border: '1px solid var(--ds-border-soft)',
                  borderRadius: 'var(--ds-r-md)',
                  fontSize: 12,
                  color: 'var(--ds-ink-dim)',
                  lineHeight: 1.5,
                }}
              >
                <div
                  style={{
                    fontWeight: 700,
                    color: 'var(--ds-ink)',
                    marginBottom: 4,
                    textTransform: 'uppercase',
                    fontSize: 10,
                    letterSpacing: '0.1em',
                  }}
                >
                  Нужна помощь?
                </div>
                Напиши куратору Анне — поможет заполнить шаблон за 5 минут на звонке.
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: '0.14em',
        textTransform: 'uppercase',
        color: 'var(--ds-muted)',
        marginBottom: 12,
      }}
    >
      {children}
    </div>
  )
}

/* ─── Upload zone ─────────────────────────────────────────────────── */

function UploadZone({ doc }: { doc: RequiredDoc }) {
  const [file, setFile] = useState<File | null>(null)
  const [dragOver, setDragOver] = useState(false)

  const hasExisting = Boolean(doc.fileName)

  if (hasExisting && !file) {
    return (
      <div>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            padding: '14px 16px',
            background: 'var(--ds-success-soft)',
            borderRadius: 'var(--ds-r-md)',
            border: '1px solid rgba(52,199,89,0.3)',
          }}
        >
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: 10,
              background: 'var(--ds-success)',
              color: '#fff',
              display: 'grid',
              placeItems: 'center',
              fontSize: 16,
              fontWeight: 700,
              flexShrink: 0,
            }}
          >
            ✓
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ds-ink)', letterSpacing: '-0.005em' }}>
              Уже загружено
            </div>
            <div style={{ fontSize: 12, color: 'var(--ds-muted)' }}>
              {doc.fileName} · {doc.fileSize}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
          <button className="ds-btn ds-btn-secondary ds-btn-sm" type="button">
            Заменить файл
          </button>
          <button className="ds-btn ds-btn-ghost ds-btn-sm" type="button">
            Удалить
          </button>
        </div>
      </div>
    )
  }

  return (
    <div>
      <label
        onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault(); setDragOver(false)
          const f = e.dataTransfer.files?.[0]
          if (f) setFile(f)
        }}
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          textAlign: 'center',
          gap: 12,
          padding: '32px 20px',
          border: `2px dashed ${dragOver ? 'var(--ds-purple)' : 'var(--ds-border)'}`,
          borderRadius: 'var(--ds-r-md)',
          background: dragOver ? 'var(--ds-purple-soft)' : 'var(--ds-bg-alt)',
          cursor: 'pointer',
          transition: 'all 120ms',
        }}
      >
        <div
          style={{
            width: 52,
            height: 52,
            borderRadius: 14,
            background: 'var(--ds-purple-soft)',
            color: 'var(--ds-purple-deep)',
            display: 'grid',
            placeItems: 'center',
            fontSize: 24,
            fontWeight: 700,
          }}
        >
          ↑
        </div>
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--ds-ink)', letterSpacing: '-0.005em' }}>
          {file ? file.name : 'Перетащи файл или нажми чтобы выбрать'}
        </div>
        <div style={{ fontSize: 12, color: 'var(--ds-muted)' }}>
          {file
            ? `${(file.size / 1024 / 1024).toFixed(1)} МБ · готово к загрузке`
            : 'PDF, JPG или PNG · до 10 МБ'}
        </div>
        <input
          type="file"
          accept="application/pdf,image/jpeg,image/png"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          style={{ display: 'none' }}
        />
      </label>

      {file && (
        <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
          <button
            type="button"
            className="ds-btn ds-btn-primary"
            onClick={() => {
              // TODO: real upload via Supabase Storage + client_documents row
              alert(`Загрузка ${file.name} — будет подключена когда появится таблица client_documents`)
            }}
          >
            Загрузить
          </button>
          <button
            type="button"
            className="ds-btn ds-btn-secondary"
            onClick={() => setFile(null)}
          >
            Отмена
          </button>
        </div>
      )}
    </div>
  )
}

/* ─── Реальный образец (PDF / JPG / PNG) из /public/samples/ ───────── */

function SamplePreview({ src }: { src: string }) {
  const isPdf = /\.pdf($|\?)/i.test(src)
  return (
    <div
      style={{
        background: '#FFFFFF',
        borderRadius: 'var(--ds-r-md)',
        border: '1px solid var(--ds-border)',
        aspectRatio: '1 / 1.25',
        overflow: 'hidden',
        boxShadow: 'var(--ds-sh-md)',
        position: 'relative',
      }}
    >
      {isPdf ? (
        <iframe
          src={`${src}#toolbar=0&navpanes=0&view=FitH`}
          title="Образец документа"
          style={{ width: '100%', height: '100%', border: 0, display: 'block' }}
        />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt="Образец документа"
          style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block', background: '#fff' }}
        />
      )}
      <div
        style={{
          position: 'absolute',
          top: 14,
          right: 14,
          padding: '4px 10px',
          background: 'rgba(255,255,255,0.92)',
          border: '1px solid var(--ds-border-soft)',
          borderRadius: 100,
          fontFamily: 'var(--ds-font-display-stack)',
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: '0.12em',
          textTransform: 'uppercase',
          color: 'var(--ds-purple)',
          pointerEvents: 'none',
        }}
      >
        Образец
      </div>
    </div>
  )
}

/* ─── PDF mock preview ────────────────────────────────────────────── */

function PdfMock() {
  const lineBg = 'var(--ds-border-soft)'
  const lineShort = 'rgba(0,0,0,0.08)'

  return (
    <div
      style={{
        background: '#FFFFFF',
        borderRadius: 'var(--ds-r-md)',
        border: '1px solid var(--ds-border)',
        aspectRatio: '1 / 1.25',
        padding: '8%',
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        boxShadow: 'var(--ds-sh-md)',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
        <div
          style={{
            width: 28,
            height: 28,
            borderRadius: '50%',
            background: 'var(--ds-ink)',
            flexShrink: 0,
          }}
        />
        <div style={{ flex: 1 }}>
          <div style={{ height: 8, background: lineBg, borderRadius: 2, width: '70%' }} />
          <div style={{ height: 6, background: lineShort, borderRadius: 2, width: '45%', marginTop: 4 }} />
        </div>
      </div>

      <div style={{ height: 14, background: 'var(--ds-ink)', borderRadius: 3, width: '85%', marginTop: 4, marginBottom: 6 }} />
      <div style={{ height: 10, background: lineBg, borderRadius: 2, width: '65%' }} />

      <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {[1, 2, 3, 4].map(i => (
          <div key={i}>
            <div style={{ height: 6, background: lineShort, borderRadius: 2, width: '30%', marginBottom: 4 }} />
            <div style={{ height: 10, background: 'var(--ds-bg-alt)', borderRadius: 2, border: `1px solid ${lineBg}` }} />
          </div>
        ))}
      </div>

      <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 4 }}>
        <div style={{ height: 5, background: lineShort, borderRadius: 2 }} />
        <div style={{ height: 5, background: lineShort, borderRadius: 2, width: '95%' }} />
        <div style={{ height: 5, background: lineShort, borderRadius: 2, width: '70%' }} />
      </div>

      <div style={{ marginTop: 'auto', display: 'flex', justifyContent: 'space-between', gap: 16, paddingTop: 16 }}>
        <div>
          <div style={{ height: 24, width: 90, background: 'var(--ds-bg-alt)', borderRadius: 2, border: `1px dashed ${lineBg}` }} />
          <div style={{ height: 4, background: lineShort, borderRadius: 2, marginTop: 4, width: 60 }} />
        </div>
        <div style={{ height: 40, width: 40, background: 'var(--ds-amber-soft)', borderRadius: '50%', border: `1px solid ${lineBg}` }} />
      </div>

      <div
        style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%) rotate(-18deg)',
          fontFamily: 'var(--ds-font-display-stack)',
          fontSize: 52,
          fontWeight: 700,
          color: 'rgba(181,127,207,0.16)',
          textTransform: 'uppercase',
          letterSpacing: '0.1em',
          pointerEvents: 'none',
          userSelect: 'none',
        }}
      >
        Пример
      </div>
    </div>
  )
}
