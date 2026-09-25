'use client'

/**
 * Ссылка на встречу Zoom: скопировать или войти.
 *
 * Порядок действий не случаен. Копируют её чаще, чем открывают: ссылку надо
 * отправить клиенту, и это делает продажник руками — автоотправку решили не
 * делать. Поэтому «Копировать» стоит первой и выделена, а «Войти» рядом.
 *
 * Почему отдельным компонентом, а не дважды в разметке: ссылка показывается в
 * расписании и в карточке сделки, и вести себя в обоих местах должна одинаково.
 * Две копии кода разойдутся на первой же правке.
 */

import { useState } from 'react'

export function ZoomLinkRow({ url, compact = false }: { url: string; compact?: boolean }) {
  const [скопировано, setСкопировано] = useState(false)

  async function копировать() {
    try {
      await navigator.clipboard.writeText(url)
    } catch {
      // Буфер может быть недоступен — например, страница открыта не по https
      // или браузер не дал прав. Тогда показываем ссылку выделенной, чтобы
      // человек скопировал руками, а не гадал, почему кнопка не работает.
      window.prompt('Скопируйте ссылку:', url)
      return
    }
    setСкопировано(true)
    setTimeout(() => setСкопировано(false), 1800)
  }

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8,
      marginTop: compact ? 6 : 8, marginBottom: compact ? 8 : 0,
      padding: '8px 10px', borderRadius: 9,
      background: 'rgba(45,140,255,.06)', border: '1px solid rgba(45,140,255,.18)',
    }}>
      <span style={{ fontSize: 13 }}>🎥</span>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: '#2d8cff' }}>Встреча Zoom</div>
        <div style={{
          fontSize: 10, color: 'var(--muted)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {url.replace(/^https:\/\//, '')}
        </div>
      </div>

      <button
        onClick={копировать}
        type="button"
        style={{
          padding: '6px 12px', borderRadius: 7, fontSize: 11, fontWeight: 700,
          border: 'none', cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0,
          background: скопировано ? 'rgba(22,163,97,.15)' : '#2d8cff',
          color: скопировано ? 'var(--green)' : '#fff',
          transition: 'all .15s',
        }}>
        {скопировано ? 'Скопировано' : 'Копировать'}
      </button>

      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        style={{
          padding: '6px 12px', borderRadius: 7, fontSize: 11, fontWeight: 600,
          textDecoration: 'none', flexShrink: 0,
          border: '1px solid rgba(45,140,255,.3)', color: '#2d8cff',
        }}>
        Войти
      </a>
    </div>
  )
}
