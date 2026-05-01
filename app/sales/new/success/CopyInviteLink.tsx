'use client'

import { useState } from 'react'

export function CopyInviteLink({ url }: { url: string }) {
  const [copied, setCopied] = useState(false)

  async function copy() {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      const ta = document.createElement('textarea')
      ta.value = url
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      document.body.removeChild(ta)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  return (
    <div style={{
      display: 'flex', gap: 6,
      background: '#F9F8FC', border: '1px solid rgba(0,0,0,.08)',
      borderRadius: 10, padding: 6,
    }}>
      <input
        type="text"
        value={url}
        readOnly
        onFocus={e => e.currentTarget.select()}
        style={{
          flex: 1, fontSize: 12, fontFamily: 'monospace',
          padding: '8px 10px', border: 'none', outline: 'none',
          background: 'transparent', color: '#14121e',
        }}
      />
      <button
        type="button"
        onClick={copy}
        style={{
          padding: '8px 16px', fontSize: 12, fontWeight: 600,
          background: copied ? '#16a361' : '#B15ECC', color: '#fff',
          border: 'none', borderRadius: 8, cursor: 'pointer',
          fontFamily: 'inherit', whiteSpace: 'nowrap',
        }}
      >
        {copied ? '✓ Скопировано' : 'Копировать'}
      </button>
    </div>
  )
}
