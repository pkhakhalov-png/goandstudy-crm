import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getAnthropic, getSystemPrompt } from '@/lib/ai'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response('Unauthorized', { status: 401 })

  const { dealId } = await req.json() as { dealId: string }
  if (!dealId) return new Response('Missing dealId', { status: 400 })

  // Load deal with stage
  const { data: deal } = await supabase
    .from('deals')
    .select('id, title, contact_name, contact_phone, contact_telegram, budget, source, created_at, stage_id, client_id')
    .eq('id', dealId)
    .single()

  if (!deal) return new Response('Deal not found', { status: 404 })

  const { data: stage } = await supabase
    .from('pipeline_stages')
    .select('name')
    .eq('id', deal.stage_id)
    .single()

  // Load last 40 messages
  const { data: messages } = await supabase
    .from('deal_messages')
    .select('direction, sender_name, content, created_at')
    .eq('deal_id', dealId)
    .order('created_at', { ascending: true })
    .limit(40)

  // Optional linked client
  let extraContext = ''
  if (deal.client_id) {
    const { data: client } = await supabase
      .from('clients')
      .select('name, country, university, status, months')
      .eq('id', deal.client_id)
      .single()
    if (client) {
      extraContext = `Привязанный клиент: ${client.name}, страна: ${client.country || '—'}, вуз: ${client.university || '—'}, статус: ${client.status || '—'}`
    }
  }

  // Build prompt
  const conversation = (messages ?? []).map(m => {
    const who = m.direction === 'incoming' ? `КЛИЕНТ (${m.sender_name || 'клиент'})` : 'МЕНЕДЖЕР'
    const time = new Date(m.created_at).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
    return `[${time}] ${who}: ${m.content || '[файл]'}`
  }).join('\n')

  const dealSummary = [
    `Клиент: ${deal.contact_name}`,
    deal.contact_telegram ? `Telegram: ${deal.contact_telegram}` : null,
    `Этап воронки: ${stage?.name || '—'}`,
    deal.budget ? `Бюджет: ${Number(deal.budget).toLocaleString('ru')} ₽` : null,
    `Источник: ${deal.source || 'manual'}`,
    `Сделка создана: ${new Date(deal.created_at).toLocaleDateString('ru-RU')}`,
  ].filter(Boolean).join('\n')

  const userContent = `КОНТЕКСТ СДЕЛКИ:
${dealSummary}
${extraContext ? '\nДОП.ИНФО:\n' + extraContext : ''}

ИСТОРИЯ ПЕРЕПИСКИ:
${conversation || '(переписки пока нет)'}

Проанализируй и выдай структурированную подсказку по формату.`

  try {
    const client = getAnthropic()
    const stream = await client.messages.stream({
      model: 'claude-sonnet-4-6',
      max_tokens: 1500,
      system: getSystemPrompt(),
      messages: [{ role: 'user', content: userContent }],
    })

    // Pipe Claude stream → HTTP response as plain text chunks
    const encoder = new TextEncoder()
    const body = new ReadableStream({
      async start(controller) {
        try {
          for await (const event of stream) {
            if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
              controller.enqueue(encoder.encode(event.delta.text))
            }
          }
          controller.close()
        } catch (err) {
          controller.error(err)
        }
      },
    })

    return new Response(body, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-store, no-transform',
        'X-Accel-Buffering': 'no',
      },
    })
  } catch (e) {
    return new Response(`AI error: ${e instanceof Error ? e.message : String(e)}`, { status: 500 })
  }
}
