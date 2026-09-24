/**
 * Что именно читает модель, когда разбирает разговор.
 *
 * Собрать материал — половина задачи разбора, и самая недооценённая. Модель
 * отвечает ровно на то, что ей дали: если подать голую переписку, она не
 * узнает, что человек пришёл с квиза, где уже назвал страну и бюджет, и
 * добросовестно напишет «бюджет не выяснен» там, где он выяснен формой.
 *
 * Поэтому материал собирается из трёх мест:
 *   · квиз с сайта — то, что человек рассказал о себе до первого касания;
 *   · переписка — то, как шёл разговор;
 *   · факты о сделке — этап, источник, сколько дней в работе.
 *
 * Чего здесь намеренно нет: расшифровка звонка. Она подключается тем же
 * образом, когда поедут записи, и ложится рядом с перепиской в общий
 * хронологический ряд — потому что для человека это один разговор, а не два.
 */
import type { SupabaseClient } from '@supabase/supabase-js'

/** Названия полей квиза человеческим языком — иначе модель гадает по ключам. */
const ПОЛЯ_КВИЗА: Record<string, string> = {
  quiz_country: 'страна',
  quiz_degree: 'уровень обучения',
  quiz_year: 'год поступления',
  quiz_budget: 'бюджет',
  quiz_age: 'возраст',
  quiz_stage: 'на каком этапе',
  quiz_about: 'о себе',
  quiz_format: 'формат',
  quiz_result: 'желаемый результат',
  quiz_status: 'статус',
  quiz_consultation_format: 'формат консультации',
}

export type ConversationMaterial = {
  dealId: string
  /** Готовый текст для модели. */
  text: string
  /** Сколько реплик вошло. */
  messagesCount: number
  /** Время последней вошедшей реплики — по нему видно, устарел ли разбор. */
  coveredTo: string | null
  /** Пусто — разбирать нечего, модель звать не надо. */
  empty: boolean
}

export async function collectConversation(
  supabase: SupabaseClient,
  dealId: string,
  opts: { maxMessages?: number } = {},
): Promise<ConversationMaterial> {
  const maxMessages = opts.maxMessages ?? 400

  const { data: deal } = await supabase
    .from('deals')
    .select('id, title, contact_name, contact_phone, source, custom_fields, created_at, stage_id, budget')
    .eq('id', dealId)
    .maybeSingle()

  if (!deal) {
    return { dealId, text: '', messagesCount: 0, coveredTo: null, empty: true }
  }

  const { data: stage } = await supabase
    .from('pipeline_stages')
    .select('name')
    .eq('id', deal.stage_id)
    .maybeSingle()

  // Берём последние N реплик, а не первые: если переписка длинная, свежее
  // важнее. Порядок для модели восстанавливаем прямой — иначе она будет
  // читать разговор задом наперёд и путать, кто на что ответил.
  const { data: rawMessages } = await supabase
    .from('deal_messages')
    .select('direction, channel, sender_name, content, created_at')
    .eq('deal_id', dealId)
    .order('created_at', { ascending: false })
    .limit(maxMessages)

  const messages = (rawMessages ?? []).slice().reverse()

  const части: string[] = []

  // ── Кто это ───────────────────────────────────────────────────────────────
  части.push('# Клиент')
  части.push(`Имя: ${deal.contact_name || '—'}`)
  части.push(`Источник заявки: ${описатьИсточник(deal.source)}`)
  части.push(`Этап в воронке сейчас: ${stage?.name ?? '—'}`)
  const дней = Math.floor((Date.now() - new Date(deal.created_at).getTime()) / 86400000)
  части.push(`Заявке ${дней} дн.`)

  // ── Что сказал в квизе ────────────────────────────────────────────────────
  const cf = (deal.custom_fields ?? {}) as Record<string, unknown>
  const квиз = Object.entries(ПОЛЯ_КВИЗА)
    .map(([ключ, ярлык]) => [ярлык, cf[ключ]] as const)
    .filter(([, знач]) => знач !== undefined && знач !== null && String(знач).trim() !== '')

  if (квиз.length > 0) {
    части.push('')
    части.push('# Анкета с сайта (заполнена клиентом до разговора)')
    for (const [ярлык, знач] of квиз) части.push(`${ярлык}: ${String(знач)}`)
  }

  if (typeof cf.consultation_notes === 'string' && cf.consultation_notes.trim()) {
    части.push('')
    части.push('# Заметки менеджера после консультации')
    части.push(cf.consultation_notes.trim())
  }

  // ── Переписка ─────────────────────────────────────────────────────────────
  if (messages.length > 0) {
    части.push('')
    части.push('# Переписка')
    части.push('Формат строки: дата — кто: текст. «Менеджер» — наш сотрудник, «Клиент» — человек.')
    части.push('')
    for (const m of messages) {
      const дата = new Date(m.created_at).toLocaleString('ru', {
        day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
        timeZone: 'Europe/Moscow',
      })
      const кто = m.direction === 'outgoing' ? 'Менеджер' : `Клиент (${m.sender_name || 'без имени'})`
      const текст = (m.content ?? '').trim()
      if (!текст) continue
      части.push(`${дата} — ${кто}: ${текст}`)
    }
  }

  const полезных = messages.filter(m => (m.content ?? '').trim()).length
  const coveredTo = messages.length > 0 ? messages[messages.length - 1].created_at : null

  return {
    dealId,
    text: части.join('\n'),
    messagesCount: полезных,
    coveredTo,
    // Три реплики «привет — здравствуйте — ок» разбирать нечего: модель
    // сочинит содержание там, где его не было, и разбор будет врать увереннее,
    // чем пустое место.
    empty: полезных < 4 && квиз.length === 0,
  }
}

function описатьИсточник(source: string | null): string {
  switch (source) {
    case 'booking': return 'запись на консультацию с сайта'
    case 'website': return 'форма на сайте'
    case 'telegram': return 'Telegram'
    case 'telegram_group_bot': return 'Telegram, групповой чат'
    case 'manual': return 'заведена вручную'
    default: return source || '—'
  }
}
