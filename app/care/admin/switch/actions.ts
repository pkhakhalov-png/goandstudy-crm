'use server'

/**
 * Переключение клиента между кабинетами — действия экрана.
 *
 * Только руководителю контура. Это не вкусовое ограничение: перевод решает,
 * какая система ведёт живого человека, и обратный ход стоит отменённых заданий
 * и погашенных предложений. Такое решение принимает тот, кто отвечает за
 * команду целиком.
 *
 * Сама работа — в `lib/care/switch.ts`, общая со скриптом. Два чек-листа
 * разъехались бы, и экран однажды перевёл бы клиента, которого скрипт
 * переводить отказался.
 */
import { revalidatePath } from 'next/cache'
import { сессияКонтура } from '@/lib/care/session'
import { делоДоступно } from '@/lib/care/access'
import { перевестиНаV2, вернутьНаLegacy, готовность, type ИтогПеревода, type Готовность } from '@/lib/care/switch'

async function руководитель() {
  const сессия = await сессияКонтура()
  if (!сессия?.участник || !сессия.интерфейсОткрыт) return null
  if (сессия.участник.care_role !== 'lead') return null
  return сессия.участник
}

export async function чекЛист(caseId: string): Promise<Готовность | null> {
  const кто = await руководитель()
  if (!кто) return null
  if (!(await делоДоступно(кто, caseId))) return null
  return готовность(caseId)
}

export async function включитьДело(caseId: string): Promise<ИтогПеревода> {
  const кто = await руководитель()
  if (!кто) return { ok: false, ошибка: 'Переключать может только руководитель контура' }
  if (!(await делоДоступно(кто, caseId))) return { ok: false, ошибка: 'Нет доступа к этому делу' }

  const итог = await перевестиНаV2(caseId, {
    actor_kind: 'member',
    actor_id: кто.id,
    откуда: 'app/care/admin/switch',
  })
  revalidatePath('/care/admin/switch')
  revalidatePath(`/care/cases/${caseId}`)
  revalidatePath('/care')
  return итог
}

export async function выключитьДело(caseId: string): Promise<ИтогПеревода> {
  const кто = await руководитель()
  if (!кто) return { ok: false, ошибка: 'Переключать может только руководитель контура' }
  if (!(await делоДоступно(кто, caseId))) return { ok: false, ошибка: 'Нет доступа к этому делу' }

  const итог = await вернутьНаLegacy(caseId, {
    actor_kind: 'member',
    actor_id: кто.id,
    откуда: 'app/care/admin/switch',
  })
  revalidatePath('/care/admin/switch')
  revalidatePath(`/care/cases/${caseId}`)
  revalidatePath('/care')
  return итог
}
