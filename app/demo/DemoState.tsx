'use client'

/**
 * Изолированное состояние демо-кабинета. Всё живёт в sessionStorage —
 * закрытие вкладки сбрасывает кабинет в дефолт.
 */

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { INITIAL_LETTER, type MotivationLetter } from '@/app/client/motivation/mock'
import {
  DEMO_INITIAL_RESUME,
  DEMO_MOTIVATION_LETTER,
  DEMO_UNIVERSITIES,
  DEMO_REQUIRED_DOCS,
  DEMO_ACTIVITIES,
  DEMO_APPLICATIONS,
  DEMO_ESSAYS,
} from './data'
import type { RequiredDoc, Essay, University } from '@/app/client/mock-data'
import type { ApplicationRow } from '@/lib/client-data'

const STORAGE_KEY = 'gastudy-demo-state-v1'

export type DemoUploadedDoc = {
  key: string
  fileName: string
  fileSize: string
  // Локальный object URL (blob:) — действителен только в текущей сессии
  url: string
}

export type DemoState = {
  /** Приоритеты вузов (ключи из DEMO_UNIVERSITIES) */
  priorityKeys: string[]
  /** Мотивационное письмо (редактируется) */
  motivation: MotivationLetter
  motivationStatus: 'in_progress' | 'sent' | 'editing' | 'ready'
  /** Резюме (редактируется) */
  resume: typeof DEMO_INITIAL_RESUME
  resumeStatus: 'in_progress' | 'sent' | 'editing' | 'ready'
  /** Загруженные документы (key → загруженный файл) */
  uploadedDocs: Record<string, DemoUploadedDoc>
  /** Удалённые ключи документов из required-списка (на случай если клиент удалил) */
  removedDocKeys: string[]
  /** Признак что обзорный туториал уже показывали */
  tourSeen: boolean
}

const DEFAULT_STATE: DemoState = {
  priorityKeys: [DEMO_UNIVERSITIES[0].key, DEMO_UNIVERSITIES[1].key, DEMO_UNIVERSITIES[2].key],
  motivation: { ...INITIAL_LETTER, ...DEMO_MOTIVATION_LETTER },
  motivationStatus: 'ready',
  resume: DEMO_INITIAL_RESUME,
  resumeStatus: 'in_progress',
  uploadedDocs: {
    motivation: { key: 'motivation', fileName: 'Мотивационное письмо — финал', fileSize: '24 КБ', url: '' },
    passport: { key: 'passport', fileName: 'passport.pdf', fileSize: '1.2 МБ', url: '' },
    ielts: { key: 'ielts', fileName: 'IELTS_Akademik_Demo.pdf', fileSize: '420 КБ', url: '' },
  },
  removedDocKeys: [],
  tourSeen: false,
}

function loadFromStorage(): DemoState {
  if (typeof window === 'undefined') return DEFAULT_STATE
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULT_STATE
    const parsed = JSON.parse(raw)
    return { ...DEFAULT_STATE, ...parsed }
  } catch {
    return DEFAULT_STATE
  }
}

function saveToStorage(state: DemoState) {
  if (typeof window === 'undefined') return
  try {
    // Object URLs не имеют смысла после рефреша, не сохраняем их —
    // обнулим url, но имя/размер останутся (для иллюзии что файл "загружен")
    const safeDocs = Object.fromEntries(
      Object.entries(state.uploadedDocs).map(([k, d]) => [k, { ...d, url: d.url.startsWith('blob:') ? '' : d.url }]),
    )
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ ...state, uploadedDocs: safeDocs }))
  } catch {
    // quota / private mode — silently ignore
  }
}

type Ctx = {
  state: DemoState
  ready: boolean
  setMotivation: (next: MotivationLetter) => void
  setMotivationStatus: (s: DemoState['motivationStatus']) => void
  setResume: (next: typeof DEMO_INITIAL_RESUME) => void
  setResumeStatus: (s: DemoState['resumeStatus']) => void
  togglePriority: (key: string) => void
  movePriority: (key: string, dir: 'up' | 'down') => void
  addPriority: (key: string) => void
  removePriority: (key: string) => void
  uploadDoc: (key: string, file: File) => void
  removeDoc: (key: string) => void
  markTourSeen: () => void
  resetAll: () => void
}

const DemoContext = createContext<Ctx | null>(null)

export function DemoProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<DemoState>(DEFAULT_STATE)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    setState(loadFromStorage())
    setReady(true)
  }, [])

  const update = useCallback((upd: (prev: DemoState) => DemoState) => {
    setState(prev => {
      const next = upd(prev)
      saveToStorage(next)
      return next
    })
  }, [])

  const ctx: Ctx = {
    state,
    ready,
    setMotivation: (next) => update(prev => ({ ...prev, motivation: next })),
    setMotivationStatus: (s) => update(prev => ({ ...prev, motivationStatus: s })),
    setResume: (next) => update(prev => ({ ...prev, resume: next })),
    setResumeStatus: (s) => update(prev => ({ ...prev, resumeStatus: s })),
    togglePriority: (key) => update(prev => {
      const i = prev.priorityKeys.indexOf(key)
      if (i >= 0) return { ...prev, priorityKeys: prev.priorityKeys.filter(k => k !== key) }
      return { ...prev, priorityKeys: [...prev.priorityKeys, key] }
    }),
    movePriority: (key, dir) => update(prev => {
      const i = prev.priorityKeys.indexOf(key)
      if (i < 0) return prev
      const target = dir === 'up' ? i - 1 : i + 1
      if (target < 0 || target >= prev.priorityKeys.length) return prev
      const arr = [...prev.priorityKeys]
      ;[arr[i], arr[target]] = [arr[target], arr[i]]
      return { ...prev, priorityKeys: arr }
    }),
    addPriority: (key) => update(prev => {
      if (prev.priorityKeys.includes(key)) return prev
      return { ...prev, priorityKeys: [...prev.priorityKeys, key] }
    }),
    removePriority: (key) => update(prev => ({ ...prev, priorityKeys: prev.priorityKeys.filter(k => k !== key) })),
    uploadDoc: (key, file) => update(prev => {
      const url = URL.createObjectURL(file)
      return {
        ...prev,
        uploadedDocs: {
          ...prev.uploadedDocs,
          [key]: { key, fileName: file.name, fileSize: formatBytes(file.size), url },
        },
      }
    }),
    removeDoc: (key) => update(prev => {
      const next = { ...prev.uploadedDocs }
      delete next[key]
      return { ...prev, uploadedDocs: next }
    }),
    markTourSeen: () => update(prev => ({ ...prev, tourSeen: true })),
    resetAll: () => {
      window.sessionStorage.removeItem(STORAGE_KEY)
      setState(DEFAULT_STATE)
    },
  }

  return <DemoContext.Provider value={ctx}>{children}</DemoContext.Provider>
}

export function useDemoState() {
  const ctx = useContext(DemoContext)
  if (!ctx) throw new Error('useDemoState must be used inside <DemoProvider>')
  return ctx
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} Б`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} КБ`
  return `${(bytes / 1024 / 1024).toFixed(1)} МБ`
}

/* ─── Re-exports чтобы не таскать импорты из data.ts всюду ─── */
export {
  DEMO_UNIVERSITIES,
  DEMO_REQUIRED_DOCS,
  DEMO_ACTIVITIES,
  DEMO_APPLICATIONS,
  DEMO_ESSAYS,
}
export type { RequiredDoc, Essay, University, ApplicationRow }
