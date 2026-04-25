'use client'

import { useEffect } from 'react'
import { ResumePreview } from '../ResumePreview'
import type { Resume } from '../mock'

export function PrintShell({ resume }: { resume: Resume }) {
  useEffect(() => {
    const t = setTimeout(() => {
      try { window.print() } catch {}
    }, 400)
    return () => clearTimeout(t)
  }, [])

  return (
    <div style={{ background: '#fff', minHeight: '100vh' }}>
      <style>{`
        @media print {
          @page { size: A4; margin: 12mm; }
          body { background: #fff !important; }
          .print-toolbar { display: none !important; }
          .print-frame > div { box-shadow: none !important; border: none !important; }
        }
        body { background: #f4f4f6; }
      `}</style>
      <div className="print-toolbar" style={{ position: 'sticky', top: 0, background: 'rgba(255,255,255,.96)', backdropFilter: 'blur(8px)', borderBottom: '1px solid #e5e5e7', padding: '14px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', zIndex: 10 }}>
        <div style={{ fontSize: 13, color: '#555' }}>
          Резюме · {resume.personal.firstName} {resume.personal.lastName}
        </div>
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
          <ResumePreview resume={resume} />
        </div>
      </div>
    </div>
  )
}
