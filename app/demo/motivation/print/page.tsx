'use client'

import { useEffect } from 'react'
import { MotivationPreview } from '@/app/client/motivation/MotivationPreview'
import { INITIAL_LETTER } from '@/app/client/motivation/mock'
import { useDemoState } from '../../DemoState'
import { DEMO_CLIENT_NAME } from '../../data'

export default function DemoMotivationPrintPage() {
  const { state, ready } = useDemoState()

  useEffect(() => {
    if (!ready) return
    const t = setTimeout(() => {
      try { window.print() } catch {}
    }, 400)
    return () => clearTimeout(t)
  }, [ready])

  if (!ready) return null

  const letter = state.motivation || INITIAL_LETTER
  const authorName = letter.authorName?.trim() || DEMO_CLIENT_NAME

  return (
    <div style={{ background: '#fff', minHeight: '100vh' }}>
      <style>{`
        @media print {
          @page { size: A4; margin: 16mm; }
          body { background: #fff !important; }
          .print-toolbar { display: none !important; }
          .print-frame > div { box-shadow: none !important; border: none !important; }
        }
        body { background: #f4f4f6; }
      `}</style>
      <div className="print-toolbar" style={{ position: 'sticky', top: 0, background: 'rgba(255,255,255,.96)', backdropFilter: 'blur(8px)', borderBottom: '1px solid #e5e5e7', padding: '14px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', zIndex: 10 }}>
        <div style={{ fontSize: 13, color: '#555' }}>Мотивационное · {authorName}</div>
        <button
          type="button"
          onClick={() => window.print()}
          style={{ background: '#0A0A0F', color: '#fff', border: 'none', padding: '8px 18px', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}
        >
          ↓ Печать / PDF
        </button>
      </div>
      <div style={{ maxWidth: 880, margin: '24px auto', padding: '0 16px 40px' }}>
        <div className="print-frame">
          <MotivationPreview letter={letter} authorName={authorName} />
        </div>
      </div>
    </div>
  )
}
