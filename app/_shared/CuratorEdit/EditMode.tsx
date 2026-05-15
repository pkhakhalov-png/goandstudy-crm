'use client'

/**
 * Единый контекст «режим редактирования» для куратор-страниц.
 * Когда mode=true:
 *  - EditableField превращается в textarea/input
 *  - Появляются кнопки save / cancel
 *  - У переопределённых полей висит бейдж «✏ ред. куратором»
 *
 * Видимость кнопки toggle: только curator/admin/rop (контролируется на странице через viewerRole).
 */

import { createContext, useContext, useState, type ReactNode } from 'react'

type Ctx = {
  enabled: boolean
  setEnabled: (v: boolean) => void
  viewerRole: 'curator' | 'admin' | 'rop' | 'client' | string
  /** true если viewer может видеть кнопки/бейджи редактирования (staff-only) */
  canEdit: boolean
}

const EditModeContext = createContext<Ctx | null>(null)

export function EditModeProvider({ viewerRole, asClient, children }: { viewerRole: string; asClient?: boolean; children: ReactNode }) {
  const [enabled, setEnabled] = useState(false)
  // Клиенту (или режиму asClient=1) бейджи/кнопки не видны
  const canEdit = !asClient && (viewerRole === 'curator' || viewerRole === 'admin' || viewerRole === 'rop')
  return (
    <EditModeContext.Provider value={{ enabled: canEdit && enabled, setEnabled, viewerRole, canEdit }}>
      {children}
    </EditModeContext.Provider>
  )
}

export function useEditMode() {
  const ctx = useContext(EditModeContext)
  if (!ctx) return { enabled: false, setEnabled: () => {}, viewerRole: 'client', canEdit: false }
  return ctx
}

export function EditModeToggle() {
  const { enabled, setEnabled, canEdit } = useEditMode()
  if (!canEdit) return null
  return (
    <button
      type="button"
      onClick={() => setEnabled(!enabled)}
      className={enabled ? 'btn-p' : 'btn-s'}
      style={{
        fontSize: 12, padding: '8px 14px', whiteSpace: 'nowrap',
        display: 'inline-flex', alignItems: 'center', gap: 6,
      }}
    >
      <span style={{ fontSize: 13 }}>{enabled ? '✓' : '✏️'}</span>
      {enabled ? 'Готово' : 'Режим редактирования'}
    </button>
  )
}

/** Бейдж «переопределено куратором» — только для staff-просмотра */
export function OverrideBadge({ by, at }: { by?: string; at?: string }) {
  const { canEdit } = useEditMode()
  if (!canEdit) return null
  const when = at ? new Date(at).toLocaleDateString('ru', { day: 'numeric', month: 'short' }) : ''
  return (
    <span
      title={`Переопределено куратором${by ? ` (${by})` : ''}${when ? ` · ${when}` : ''}`}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 4,
        fontSize: 9, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase',
        padding: '2px 6px', borderRadius: 4,
        background: 'rgba(232,184,68,.18)', color: '#8A6D1E',
        whiteSpace: 'nowrap',
      }}
    >
      ✏ ред. куратором
    </span>
  )
}
