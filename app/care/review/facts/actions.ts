'use server'

/**
 * Решения по расхождениям — тонкая обёртка над `lib/care/facts-decision.ts`.
 *
 * Здесь только то, что относится к запросу: кто это, можно ли ему в это дело и
 * что обновить на экране. Сама работа с фактами живёт в lib — её проверяет
 * тест, а не глаза.
 */
import { revalidatePath } from 'next/cache'
import { сессияКонтура } from '@/lib/care/session'
import { делоДоступно } from '@/lib/care/access'
import {
  расхождение,
  принятьРасхождение,
  отклонитьРасхождение,
  уточнитьРасхождение,
  type ИтогРешения,
} from '@/lib/care/facts-decision'

export type Итог = ИтогРешения

/** Кто это и пускают ли его в это дело. Номер приходит с клиента — проверяем. */
async function пропуск(proposalId: string) {
  const сессия = await сессияКонтура()
  if (!сессия?.участник || !сессия.интерфейсОткрыт) {
    return { ok: false as const, ошибка: 'Кабинет недоступен' }
  }
  const п = await расхождение(proposalId)
  if (!п.ok) return п
  if (!(await делоДоступно(сессия.участник, п.caseId))) {
    return { ok: false as const, ошибка: 'Нет доступа к этому делу' }
  }
  return { ok: true as const, участник: сессия.участник, caseId: п.caseId }
}

function обновить(caseId: string) {
  revalidatePath('/care/review/facts')
  revalidatePath('/care/review')
  revalidatePath(`/care/cases/${caseId}`)
}

export async function принятьНовое(proposalId: string): Promise<Итог> {
  const п = await пропуск(proposalId)
  if (!п.ok) return п
  const итог = await принятьРасхождение(п.участник, proposalId)
  обновить(п.caseId)
  return итог
}

export async function отклонитьНовое(proposalId: string, причина: string): Promise<Итог> {
  const п = await пропуск(proposalId)
  if (!п.ok) return п
  const итог = await отклонитьРасхождение(п.участник, proposalId, причина)
  обновить(п.caseId)
  return итог
}

export async function уточнитьУКлиента(proposalId: string): Promise<Итог> {
  const п = await пропуск(proposalId)
  if (!п.ok) return п
  const итог = await уточнитьРасхождение(п.участник, proposalId)
  обновить(п.caseId)
  return итог
}
