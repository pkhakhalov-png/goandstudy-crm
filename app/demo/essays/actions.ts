'use server'

// Stub-actions для /demo — никаких записей в БД.
// Возвращают success чтобы существующие client Editor компоненты работали без падений.
// Реальное сохранение черновика в /demo идёт через useDemoState (sessionStorage).

type EssayType = 'resume' | 'motivation'

export async function saveClientDraft(_opts: { clientId?: number; type: EssayType; content: any }) {
  return { ok: true, status: 'draft' as const }
}

export async function submitToCurator(_opts: { type: EssayType; clientId?: number }) {
  return { ok: true, status: 'sent' as const }
}

export async function curatorSaveEdit(_opts: { clientId: number; type: EssayType; curatorContent: any }) {
  return { ok: true, status: 'editing' as const }
}

export async function approveEssay(_opts: { clientId: number; type: EssayType }) {
  return { ok: true, status: 'approved' as const }
}
