/**
 * Переразобрать запись, которая упала.
 *
 *   npx tsx scripts/recording-retry.ts              # показать упавшие
 *   npx tsx scripts/recording-retry.ts --все        # переразобрать все упавшие
 *   npx tsx scripts/recording-retry.ts --id <uuid>  # одну
 *   npx tsx scripts/recording-retry.ts --id <uuid> --текст   # напечатать расшифровку
 *
 * Зачем. Запись уже лежит у нас в хранилище — скачивать её заново незачем, и
 * дёргать Zoom тоже: ссылка на скачивание всё равно живёт сутки. Повторная
 * попытка берёт наш файл и прогоняет его через расшифровку и разбор.
 *
 * Именно поэтому очистка облака Zoom стоит последним шагом и только после
 * подтверждённой копии: упавший разбор не должен означать потерянный разговор.
 */
import { config } from 'dotenv'
import path from 'path'
import { createClient } from '@supabase/supabase-js'

config({ path: path.resolve(process.cwd(), '.env.local') })

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
)

function арг(имя: string): string | undefined {
  const i = process.argv.indexOf(имя)
  return i >= 0 ? process.argv[i + 1] : undefined
}

async function main() {
  const { расшифровать } = await import('../lib/zoom/transcribe')
  const { analyzeConversation } = await import('../lib/sales/analyze-conversation')

  const один = арг('--id')
  const все = process.argv.includes('--все')
  const показатьТекст = process.argv.includes('--текст')

  let запрос = sb.from('call_recordings')
    .select('id, deal_id, meeting_id, status, error, storage_path, duration_sec, started_at')
    .order('created_at', { ascending: false })

  if (один) запрос = запрос.eq('id', один)
  else запрос = запрос.in('status', ['failed', 'transcribing', 'analyzing'])

  const { data: записи } = await запрос
  if (!записи?.length) { console.log('нечего переразбирать'); return }

  if (!один && !все) {
    console.log(`упавших записей: ${записи.length}\n`)
    for (const з of записи) {
      console.log(`  ${з.id}`)
      console.log(`    встреча ${з.meeting_id} · ${Math.round((з.duration_sec ?? 0) / 60)} мин · ${з.status}`)
      console.log(`    ${з.error ?? ''}`)
    }
    console.log('\nпереразобрать всё:  --все')
    return
  }

  for (const з of записи) {
    console.log(`\n── ${з.id} (встреча ${з.meeting_id}) ──`)

    if (!з.storage_path) { console.log('  нет нашей копии — переразобрать нечем'); continue }

    const { data: файл, error } = await sb.storage.from('call-recordings').download(з.storage_path)
    if (error || !файл) { console.log(`  файл не достаётся: ${error?.message}`); continue }

    const буфер = Buffer.from(await файл.arrayBuffer())
    console.log(`  файл: ${Math.round(буфер.byteLength / 1024)} КБ`)

    let расшифровка
    try {
      расшифровка = await расшифровать(буфер, 'audio/m4a')
      console.log(`  ✓ расшифровано за ${(расшифровка.мс / 1000).toFixed(1)} с, ${расшифровка.текст.length} символов`)
    } catch (e: any) {
      const причина = String(e?.message ?? e).slice(0, 300)
      console.log(`  ✕ расшифровка: ${причина}`)
      await sb.from('call_recordings').update({ status: 'failed', error: причина, updated_at: new Date().toISOString() }).eq('id', з.id)
      continue
    }

    if (показатьТекст) {
      console.log('\n' + '─'.repeat(70))
      console.log(расшифровка.текст)
      console.log('─'.repeat(70) + '\n')
    }

    if (!з.deal_id) {
      console.log('  сделка не определена — разбор не сохраняем, запись в «неопознанных»')
      await sb.from('call_recordings').update({ status: 'done', error: null, updated_at: new Date().toISOString() }).eq('id', з.id)
      continue
    }

    const материал = {
      dealId: з.deal_id,
      text: `# Звонок\nДата: ${з.started_at ?? '—'}\nДлительность: ${Math.round((з.duration_sec ?? 0) / 60)} мин.\n\n${расшифровка.текст}`,
      messagesCount: расшифровка.текст.split('\n').filter(Boolean).length,
      coveredTo: з.started_at ?? null,
      empty: false,
    }

    const res = await analyzeConversation(материал)
    if (!res.ok) {
      console.log(`  ✕ разбор: ${res.why}`)
      await sb.from('call_recordings').update({ status: 'failed', error: res.why, updated_at: new Date().toISOString() }).eq('id', з.id)
      continue
    }

    const p = res.payload as any
    await sb.from('deal_analyses').insert({
      deal_id: з.deal_id, source: 'call',
      covered_to: з.started_at, items_count: материал.messagesCount,
      client_type: p['тип_клиента'] ?? null,
      next_step: p['следующий_шаг']?.['есть'] ?? null,
      summary: p['резюме'] ?? null,
      payload: res.payload, model: res.model, cost_usd: res.costUsd, ms: res.ms,
    })
    await sb.from('call_recordings').update({ status: 'done', error: null, updated_at: new Date().toISOString() }).eq('id', з.id)
    console.log(`  ✓ разобрано: ${p['тип_клиента']}, следующий шаг ${p['следующий_шаг']?.['есть'] ? 'есть' : 'НЕТ'}`)
  }
}

main().catch(e => { console.error(e?.message ?? e); process.exit(1) })
