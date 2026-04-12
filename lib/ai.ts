import Anthropic from '@anthropic-ai/sdk'

/**
 * Claude client for sales assistant features.
 * Requires ANTHROPIC_API_KEY env var.
 */

export function getAnthropic() {
  const key = process.env.ANTHROPIC_API_KEY
  if (!key) throw new Error('ANTHROPIC_API_KEY not configured')
  return new Anthropic({ apiKey: key })
}

// Default system prompt — can be overridden via SALES_SYSTEM_PROMPT env var
// or via the settings page (future).
const DEFAULT_SYSTEM_PROMPT = `Ты — AI-ассистент менеджера по продажам Go & Study — образовательной консалтинговой компании, которая помогает студентам поступать в зарубежные университеты (Корея, Китай, Япония, Европа, США).

ТВОЯ ЗАДАЧА:
Проанализировать историю переписки с клиентом и предложить оптимальный следующий ответ менеджера. Твой ответ будет показан менеджеру как подсказка, которую он может скопировать, отредактировать и отправить.

ПРИНЦИПЫ ОТВЕТА:
1. Пиши от лица менеджера — дружелюбно, но профессионально, на "ты" с клиентом по умолчанию
2. Короткие конкретные сообщения, без воды
3. Всегда двигай диалог к следующему шагу (записи на консультацию, оплате, договору)
4. Отвечай на вопросы клиента прямо, не уходи в пустые фразы
5. Работай с возражениями: не спорь, а предлагай решение
6. Если клиент "горячий" — предлагай сразу конкретное действие (созвон, оплата, встреча)
7. Если клиент сомневается — раскрывай ценность, давай социальное доказательство
8. Не придумывай факты о программах/ценах которых нет в контексте

ФОРМАТ:
- Только текст сообщения, который менеджер может сразу отправить клиенту
- Без префиксов типа "Вот мой ответ:" или "Я бы ответил так:"
- Без markdown, эмодзи по минимуму
- 1-3 абзаца максимум

ЧТО ИЗБЕГАТЬ:
- Не давай гарантий поступления
- Не называй конкретные цены если их нет в контексте
- Не обещай то что компания не может выполнить`

export function getSystemPrompt() {
  return process.env.SALES_SYSTEM_PROMPT || DEFAULT_SYSTEM_PROMPT
}

interface Msg {
  direction: 'incoming' | 'outgoing'
  sender_name?: string | null
  content?: string | null
  created_at: string
}

interface Deal {
  title: string
  stage_name?: string
  contact_name: string
  contact_phone?: string | null
  contact_telegram?: string | null
  budget?: number
  source?: string
  created_at: string
}

export async function suggestSalesReply(deal: Deal, messages: Msg[], extraContext?: string) {
  const client = getAnthropic()

  // Build conversation summary
  const conversation = messages.map(m => {
    const who = m.direction === 'incoming' ? `КЛИЕНТ (${m.sender_name || 'клиент'})` : 'МЕНЕДЖЕР'
    const time = new Date(m.created_at).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
    return `[${time}] ${who}: ${m.content || '[файл]'}`
  }).join('\n')

  const dealSummary = [
    `Клиент: ${deal.contact_name}`,
    deal.contact_telegram ? `Telegram: ${deal.contact_telegram}` : null,
    `Этап воронки: ${deal.stage_name || '—'}`,
    deal.budget ? `Бюджет: ${deal.budget.toLocaleString('ru')} ₽` : null,
    `Источник: ${deal.source || 'manual'}`,
    `Сделка создана: ${new Date(deal.created_at).toLocaleDateString('ru-RU')}`,
  ].filter(Boolean).join('\n')

  const userContent = `КОНТЕКСТ СДЕЛКИ:
${dealSummary}
${extraContext ? '\nДОП.ИНФО:\n' + extraContext : ''}

ИСТОРИЯ ПЕРЕПИСКИ:
${conversation || '(переписки пока нет)'}

Предложи лучший следующий ответ менеджера клиенту.`

  const response = await client.messages.create({
    model: 'claude-sonnet-4-5',
    max_tokens: 800,
    system: getSystemPrompt(),
    messages: [{ role: 'user', content: userContent }],
  })

  // Extract text from response
  const textBlock = response.content.find(b => b.type === 'text')
  return textBlock && 'text' in textBlock ? textBlock.text : ''
}
