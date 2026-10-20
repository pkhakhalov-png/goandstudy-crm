/**
 * Переразобрать запись, которая упала.
 *
 *   npx tsx scripts/recording-retry.ts              # показать упавшие
 *   npx tsx scripts/recording-retry.ts --все        # переразобрать все упавшие
 *   npx tsx scripts/recording-retry.ts --id <uuid>  # одну
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

  const один = арг('--id')
  const все = process.argv.includes('--все')

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

  // Та же логика, что у автоповтора на сервере (/api/zoom/retry): расшифровка
  // с запасными моделями, сохранение текста, поиск сделки по телефону.
  if (один) {
    await sb.from('call_recordings').update({ status: 'failed', updated_at: '2000-01-01T00:00:00Z' }).eq('id', один)
  }
  const { повторитьОдну } = await import('../lib/zoom/process-recording')
  for (let i = 0; i < записи.length; i++) {
    const итог = await повторитьОдну(sb, один)
    console.log(итог)
    if (итог === 'нечего повторять' || один) break
  }
}

main().catch(e => { console.error(e?.message ?? e); process.exit(1) })
