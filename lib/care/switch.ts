/**
 * Перевод клиента на новый кабинет — и возврат обратно.
 *
 * ПОЧЕМУ ЭТО ЖИВЁТ ЗДЕСЬ, А НЕ В СКРИПТЕ. Скрипт `scripts/care/switch-client.ts`
 * был первым, и чек-лист написан там. Но тот же чек-лист нужен экрану
 * `/care/admin/switch`: руководитель должен переводить клиентов сам, не прося
 * терминал. Два списка проверок разъедутся — и экран однажды переведёт
 * клиента, которого скрипт переводить отказался бы. Поэтому список один, здесь,
 * а скрипт и экран его зовут.
 *
 * ЧТО ПРОВЕРЯЕТСЯ (раздел 5 плана). Владелец дела назначен; у контакта студента
 * заполнен чат Телеграма; история переписки перенесена в `care.sources`; у
 * владельца включены флаги `ui` и `ai`. Непройденный пункт — не предупреждение,
 * а отказ: клиент, переведённый без чата, просто перестаёт получать что-либо, и
 * заметить это можно только по тишине.
 *
 * ТЕСТОВЫЕ ДЕЛА. Проверки чата и истории пропускаются: чата у них нет по
 * построению, и переписываться там не с кем.
 *
 * ВОЗВРАТ НЕ УДАЛЯЕТ ДАННЫЕ. Он останавливает автоматику: незавершённые задания
 * отменяются, ждущие предложения гаснут, очередь отправки чистится. Уже
 * отправленное остаётся фактом — его не отменить.
 */
import { базаCare } from './db'

export type ПунктПроверки = {
  пункт: string
  ok: boolean
  /** Что сделать, если не пройден. Без этого отказ бесполезен. */
  подсказка?: string
}

export type Готовность = {
  caseId: string
  имя: string
  наV2: boolean
  is_synthetic: boolean
  switched_at: string | null
  пункты: ПунктПроверки[]
  готово: boolean
}

type ЗаписьДела = {
  id: string
  client_id: number
  automation_owner: string
  owner_member_id: string | null
  is_synthetic: boolean
  synthetic_name: string | null
  switched_at: string | null
}

async function дело(caseId: string): Promise<ЗаписьДела | null> {
  const { data } = await базаCare()
    .from('cases')
    .select('id, client_id, automation_owner, owner_member_id, is_synthetic, synthetic_name, switched_at')
    .eq('id', caseId)
    .maybeSingle()
  return (data as ЗаписьДела | null) ?? null
}

function имяДела(д: ЗаписьДела): string {
  return д.synthetic_name ?? `клиент #${д.client_id}`
}

/** Чек-лист включения. Ничего не меняет — только отвечает. */
export async function готовность(caseId: string): Promise<Готовность | null> {
  const д = await дело(caseId)
  if (!д) return null

  const пункты: ПунктПроверки[] = []

  пункты.push({
    пункт: 'у дела назначен владелец',
    ok: Boolean(д.owner_member_id),
    подсказка: 'назначить куратора в карточке дела',
  })

  if (д.is_synthetic) {
    пункты.push({
      пункт: 'тестовое дело: чат и история не нужны',
      ok: true,
    })
  } else {
    const [{ data: контакты }, { data: источники }] = await Promise.all([
      базаCare().from('contacts').select('tg_chat_id').eq('case_id', caseId).eq('kind', 'student'),
      базаCare().from('sources').select('id').eq('case_id', caseId).eq('kind', 'message').limit(1),
    ])

    const чат = (контакты ?? []).find((к) => к.tg_chat_id !== null)?.tg_chat_id ?? null

    пункты.push({
      пункт: 'у контакта студента заполнен чат Телеграма',
      ok: чат !== null,
      подсказка: 'npx tsx scripts/care/link-chats.ts --дело <id> --применить',
    })

    // План требует здесь именно `getChatMember`, и не зря: заполненное поле
    // говорит, что чат известен, а не что мы можем в него писать. Care-бот —
    // отдельный от прежнего, и в группы клиентов его надо добавлять заново.
    // Проверка 02.10.2026 показала: он не состоит ни в одной из двенадцати.
    if (чат !== null) {
      const { проверитьЧат } = await import('./channels')
      const состояние = await проверитьЧат(Number(чат))
      пункты.push({
        пункт: 'care-бот состоит в группе клиента и может писать',
        ok: состояние.можемПисать,
        подсказка: состояние.почему
          ? `${состояние.почему}. Добавьте @goandstudy_care_bot в группу клиента`
          : 'добавьте @goandstudy_care_bot в группу клиента',
      })
    }
    пункты.push({
      пункт: 'история переписки перенесена',
      ok: (источники ?? []).length > 0,
      подсказка: 'npx tsx scripts/care/import-history.ts --дело <id> --применить',
    })
  }

  if (д.owner_member_id) {
    const { data: флаги } = await базаCare()
      .from('feature_flags')
      .select('flag, enabled')
      .eq('scope', 'curator')
      .eq('scope_id', д.owner_member_id)

    for (const нужен of ['ui', 'ai'] as const) {
      пункты.push({
        пункт: `владельцу включён флаг ${нужен}`,
        ok: (флаги ?? []).some((ф) => ф.flag === нужен && ф.enabled),
        подсказка: `npx tsx scripts/care/setup-team.ts --флаг ${нужен} --кому ${д.owner_member_id}`,
      })
    }
  }

  return {
    caseId,
    имя: имяДела(д),
    наV2: д.automation_owner === 'v2',
    is_synthetic: д.is_synthetic,
    switched_at: д.switched_at,
    пункты,
    готово: пункты.every((п) => п.ok),
  }
}

export type ИтогПеревода = { ok: true; текст: string } | { ok: false; ошибка: string }

/** Перевести на новый кабинет. Отказывает, пока чек-лист не пройден. */
export async function перевестиНаV2(
  caseId: string,
  кто: { actor_kind: 'member' | 'system'; actor_id?: string | null; откуда: string }
): Promise<ИтогПеревода> {
  const г = await готовность(caseId)
  if (!г) return { ok: false, ошибка: 'Дела с таким номером нет' }
  if (г.наV2) {
    return { ok: false, ошибка: `Уже на новом кабинете с ${г.switched_at?.slice(0, 10) ?? 'неизвестной даты'}` }
  }
  if (!г.готово) {
    const непройдены = г.пункты.filter((п) => !п.ok).map((п) => п.пункт)
    return { ok: false, ошибка: `Переключать рано: ${непройдены.join('; ')}` }
  }

  const { error } = await базаCare()
    .from('cases')
    .update({ automation_owner: 'v2', switched_at: new Date().toISOString() })
    .eq('id', caseId)
    // Повторное переключение из двух вкладок не должно давать двух дат.
    .eq('automation_owner', 'legacy')
    .select('id')
  if (error) return { ok: false, ошибка: `Не переключилось: ${error.message}` }

  await базаCare().from('events').insert({
    actor_kind: кто.actor_kind,
    actor_id: кто.actor_id ?? null,
    case_id: caseId,
    action: 'switched_to_v2',
    before: { automation_owner: 'legacy' },
    after: { automation_owner: 'v2' },
    source: { откуда: кто.откуда },
    reason: 'перевод клиента на новый кабинет',
  })

  return {
    ok: true,
    текст:
      'Переведено. Старый кабинет для этого клиента теперь только для просмотра — ' +
      'это дисциплина, а не запрет: его мы не меняли.',
  }
}

/** Вернуть старому кабинету. Останавливает автоматику, данные не трогает. */
export async function вернутьНаLegacy(
  caseId: string,
  кто: { actor_kind: 'member' | 'system'; actor_id?: string | null; откуда: string }
): Promise<ИтогПеревода> {
  const д = await дело(caseId)
  if (!д) return { ok: false, ошибка: 'Дела с таким номером нет' }
  if (д.automation_owner !== 'v2') return { ok: false, ошибка: 'Дело и так ведёт старый кабинет' }

  const [{ data: задания }, { data: предложения }] = await Promise.all([
    базаCare().from('jobs').select('id').eq('case_id', caseId).in('status', ['queued', 'running']),
    базаCare().from('proposals').select('id').eq('case_id', caseId).eq('status', 'pending'),
  ])

  if ((задания ?? []).length) {
    await базаCare()
      .from('jobs')
      .update({ status: 'cancelled' })
      .eq('case_id', caseId)
      .in('status', ['queued', 'running'])
  }

  if ((предложения ?? []).length) {
    await базаCare()
      .from('proposals')
      .update({ status: 'expired' })
      .eq('case_id', caseId)
      .eq('status', 'pending')

    // Очередь отправки чистим по каждому предложению: строка в ней живёт
    // своей жизнью, и погасшее предложение её само не отменяет.
    for (const п of предложения ?? []) {
      await базаCare()
        .from('outbound_actions')
        .update({ status: 'cancelled', cancel_reason: 'client_switched_back' })
        .eq('proposal_id', п.id)
        .eq('status', 'queued')
    }
  }

  const { error } = await базаCare()
    .from('cases')
    .update({ automation_owner: 'legacy' })
    .eq('id', caseId)
  if (error) return { ok: false, ошибка: `Не вернулось: ${error.message}` }

  await базаCare().from('events').insert({
    actor_kind: кто.actor_kind,
    actor_id: кто.actor_id ?? null,
    case_id: caseId,
    action: 'switched_to_legacy',
    before: { automation_owner: 'v2' },
    after: { automation_owner: 'legacy' },
    source: { откуда: кто.откуда },
    reason: 'возврат клиента на старый кабинет',
  })

  return {
    ok: true,
    текст:
      `Возвращено. Отменено заданий: ${(задания ?? []).length}, погашено предложений: ` +
      `${(предложения ?? []).length}. Данные контура не удалены, уже отправленное остаётся фактом.`,
  }
}

export type СтрокаПереключения = {
  caseId: string
  имя: string
  наV2: boolean
  is_synthetic: boolean
  switched_at: string | null
}

/** Все дела области с их кабинетом — для экрана переключения. */
export async function ктоГде(дела: string[]): Promise<СтрокаПереключения[]> {
  if (!дела.length) return []
  const { data } = await базаCare()
    .from('cases')
    .select('id, client_id, automation_owner, is_synthetic, synthetic_name, switched_at')
    .in('id', дела)
    .order('automation_owner')

  return ((data ?? []) as ЗаписьДела[]).map((д) => ({
    caseId: д.id,
    имя: имяДела(д),
    наV2: д.automation_owner === 'v2',
    is_synthetic: д.is_synthetic,
    switched_at: д.switched_at,
  }))
}
