'use client'

/**
 * Shared client-state store — переходный слой между mock-фазой
 * и реальной БД. Хранит в localStorage, синхронит между вкладками.
 *
 * Когда появится таблица `client_state` в Supabase — подменим
 * load/save на query/upsert, компоненты не заметят разницы.
 *
 * Модель умышленно плоская: любое поле из ЛК клиента, которое
 * меняется пользователем (выбор приоритетов, статусы документов,
 * черновики эссе, состояние roadmap и т.д.) живёт здесь.
 */

import { useCallback, useEffect, useState } from 'react'
import { MAX_PRIORITY } from './mock-data'

const STORAGE_KEY = 'gastudy-client-state-v1'

export type ClientSharedState = {
  /** Ключи приоритетных вузов (max 3), в порядке выбора клиентом. */
  priorityUniKeys: string[]
  /** Timestamp последнего обновления — пригодится для инвалидации кешей куратора. */
  updatedAt: number
}

export const DEFAULT_STATE: ClientSharedState = {
  priorityUniKeys: [],
  updatedAt: 0,
}

/* ─────────────────────────────────────────────────────────────
   Read / write primitives
   ───────────────────────────────────────────────────────────── */

function safeLoad(): ClientSharedState {
  if (typeof window === 'undefined') return DEFAULT_STATE
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULT_STATE
    const parsed = JSON.parse(raw) as Partial<ClientSharedState>
    return {
      priorityUniKeys: Array.isArray(parsed.priorityUniKeys) ? parsed.priorityUniKeys.slice(0, MAX_PRIORITY) : [],
      updatedAt: typeof parsed.updatedAt === 'number' ? parsed.updatedAt : 0,
    }
  } catch {
    return DEFAULT_STATE
  }
}

function safeSave(state: ClientSharedState) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    // quota / private mode — fail silently, UI продолжает работать в памяти
  }
}

/* ─────────────────────────────────────────────────────────────
   React hook — подписка на store с автосинхроном между вкладками
   ───────────────────────────────────────────────────────────── */

export function useClientState() {
  // SSR-safe: на сервере всегда возвращаем DEFAULT, на клиенте hydrate из localStorage
  const [state, setState] = useState<ClientSharedState>(DEFAULT_STATE)
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    setState(safeLoad())
    setHydrated(true)
  }, [])

  useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (e.key !== STORAGE_KEY) return
      setState(safeLoad())
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  const update = useCallback((updater: (prev: ClientSharedState) => ClientSharedState) => {
    setState(prev => {
      const next = updater(prev)
      const stamped = { ...next, updatedAt: Date.now() }
      safeSave(stamped)
      return stamped
    })
  }, [])

  return { state, update, hydrated }
}

/* ─────────────────────────────────────────────────────────────
   Derived helpers for shortlist priority
   ───────────────────────────────────────────────────────────── */

export function togglePriority(state: ClientSharedState, uniKey: string): ClientSharedState {
  const existing = state.priorityUniKeys
  const idx = existing.indexOf(uniKey)

  if (idx >= 0) {
    // Снимаем приоритет
    return { ...state, priorityUniKeys: existing.filter(k => k !== uniKey) }
  }

  if (existing.length >= MAX_PRIORITY) {
    // Заполнено — ничего не меняем, UI должен блокировать кнопку
    return state
  }

  return { ...state, priorityUniKeys: [...existing, uniKey] }
}

export function isPriority(state: ClientSharedState, uniKey: string): boolean {
  return state.priorityUniKeys.includes(uniKey)
}

export function priorityRank(state: ClientSharedState, uniKey: string): number | null {
  const idx = state.priorityUniKeys.indexOf(uniKey)
  return idx >= 0 ? idx + 1 : null
}
