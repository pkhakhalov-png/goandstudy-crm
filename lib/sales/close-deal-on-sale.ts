/**
 * Оформили продажу — двигаем сделку в воронке.
 *
 * Зачем это понадобилось. Продажа оформляется в `/sales/new`: создаётся клиент
 * и график платежей. Сделка в воронке при этом остаётся там, где стояла.
 * Замер 24.09.2026: за 90 дней заведено 24 клиента, а в успешных этапах
 * воронки лежит 6 сделок, из них в «Первичная продажа» — ноль. Расхождение
 * вчетверо. Любая конверсия, посчитанная по воронке, до сих пор считала не то.
 *
 * Почему автоматически, а не кнопкой-подсказкой. Решение владельца от
 * 24.09.2026: подсказку половина не нажмёт, и расхождение останется, только
 * меньше. Перевод виден в ленте сделки и откатывается руками, как любой другой
 * переход этапа.
 *
 * Чего эта функция НЕ делает. Она не создаёт сделку, если её нет: продажа без
 * сделки в воронке — это отдельный случай (клиент пришёл мимо воронки), и
 * выдумывать под него сделку задним числом значит портить статистику входа
 * ради красоты статистики выхода.
 *
 * Сбой здесь не должен ронять оформление продажи: клиент и платежи уже
 * созданы, и показать человеку ошибку после успешной операции — худшее, что
 * можно сделать. Поэтому наружу функция не бросает, а рассказывает результатом.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { normalizePhone } from '@/lib/phone'
import { readRopSettings, flag } from '@/lib/rop-settings'

export type CloseResult =
  | { moved: true; dealId: string; stageName: string }
  | { moved: false; why: string }

export type CloseInput = {
  /** Клиент, которого только что создали. */
  clientId: number
  /** Телефон из формы продажи — по нему ищем сделку. */
  phone: string
  /** Сумма договора: ею заполняем `budget`, если он пустой. */
  amount: number
  /** Кто оформил — попадёт в ленту. */
  userId: string
  /** Сделка, если продажу оформляли из карточки. Тогда телефон не нужен. */
  dealId?: string | null
}

export async function closeDealOnSale(
  admin: SupabaseClient,
  input: CloseInput,
): Promise<CloseResult> {
  const settings = await readRopSettings(admin)
  if (!flag(settings, 'funnel_autoclose', false)) {
    return { moved: false, why: 'выключено настройкой funnel_autoclose' }
  }

  // ── Найти сделку ──────────────────────────────────────────────────────────
  let deal: { id: string; stage_id: string; budget: number | null; client_id: number | null } | null = null

  if (input.dealId) {
    const { data } = await admin
      .from('deals')
      .select('id, stage_id, budget, client_id')
      .eq('id', input.dealId)
      .is('deleted_at', null)
      .maybeSingle()
    deal = data
  }

  if (!deal) {
    const phone = normalizePhone(input.phone)
    if (!phone) return { moved: false, why: 'нет телефона — сделку не найти' }

    // Самая свежая сделка по этому телефону. Дублей по телефону в базе хватает
    // (есть отдельная процедура их слияния), поэтому берём последнюю, а не
    // первую попавшуюся: она и есть та, по которой сейчас шла работа.
    const { data } = await admin
      .from('deals')
      .select('id, stage_id, budget, client_id')
      .eq('phone_normalized', phone)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    deal = data
  }

  if (!deal) return { moved: false, why: 'сделки в воронке нет' }

  // ── Куда двигать ──────────────────────────────────────────────────────────
  const { data: stages } = await admin
    .from('pipeline_stages')
    .select('id, name, stage_type, position')
    .eq('is_active', true)
    .order('position')

  const success = (stages ?? []).filter(s => s.stage_type === 'success')
  // «Оплата услуг» — этап, которым отдел пользуется на самом деле: в нём лежат
  // все шесть успешных сделок, в «Первичной продаже» — ноль. Если его
  // переименуют, берём первый успешный по порядку, а не падаем.
  const target = success.find(s => s.name === 'Оплата услуг') ?? success[0]
  if (!target) return { moved: false, why: 'в воронке нет успешного этапа' }

  if (deal.stage_id === target.id) {
    // Уже там: продажу оформили повторно или сделку двинули руками. Повторный
    // проход не должен писать в ленту второй раз — иначе история обрастёт
    // одинаковыми записями, и по ней станет нельзя читать, что происходило.
    return { moved: false, why: 'сделка уже на успешном этапе' }
  }

  // ── Перевести ─────────────────────────────────────────────────────────────
  const updates: Record<string, unknown> = {
    stage_id: target.id,
    closed_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }
  if (!deal.client_id) updates.client_id = input.clientId
  // Сумму не перетираем: если в сделке уже стоял бюджет, его ставил человек,
  // и он может отличаться от суммы договора осмысленно (скидка, рассрочка).
  if (!deal.budget && Number.isFinite(input.amount) && input.amount > 0) {
    updates.budget = input.amount
  }

  const { error } = await admin.from('deals').update(updates).eq('id', deal.id)
  if (error) return { moved: false, why: `не удалось обновить сделку: ${error.message}` }

  await admin.from('deal_activities').insert({
    deal_id: deal.id,
    user_id: input.userId,
    activity_type: 'stage_change',
    content: `Оформлена продажа — сделка переведена в «${target.name}»`,
    metadata: {
      reason: 'sale_created',
      client_id: input.clientId,
      amount: input.amount,
      auto: true,
    },
  })

  return { moved: true, dealId: deal.id, stageName: target.name }
}
