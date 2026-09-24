/**
 * Что происходит с записью после того, как Zoom сообщил о её готовности.
 *
 *   скачать → положить к себе → расшифровать → разобрать → почистить облако Zoom
 *
 * Каждый шаг отмечается в `call_recordings.status`. Это не украшение: если
 * расшифровка упала, запись всё равно лежит у нас и её можно переразобрать,
 * а по статусу видно, на чём именно споткнулись. Молчаливый сбой посреди
 * цепочки — худшее, что может случиться с фоновой обработкой: разговор
 * пропал, и никто не узнает.
 *
 * Очистка облака Zoom — отдельным шагом и строго последней. Между скачиванием
 * и удалением есть момент, когда копия ещё не подтверждена; удалять в нём
 * значит рискнуть единственным экземпляром ради экономии одного запроса.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { downloadRecording, trashMeetingRecordings } from '@/lib/zoom/client'
import { расшифровать, транскрипцияНастроена } from '@/lib/zoom/transcribe'
import { analyzeConversation } from '@/lib/sales/analyze-conversation'
import { readRopSettings, flag } from '@/lib/rop-settings'

const БАКЕТ = 'call-recordings'

export async function обработатьЗапись(
  admin: SupabaseClient,
  recordingId: string,
  источник: { downloadUrl: string; downloadToken?: string },
): Promise<void> {
  const отметить = async (поля: Record<string, unknown>) => {
    await admin.from('call_recordings')
      .update({ ...поля, updated_at: new Date().toISOString() })
      .eq('id', recordingId)
  }

  const { data: запись } = await admin
    .from('call_recordings')
    .select('id, deal_id, meeting_id, external_id, duration_sec, started_at')
    .eq('id', recordingId)
    .single()

  if (!запись) { console.error('[запись] строки нет:', recordingId); return }

  try {
    // ── Забрать файл ────────────────────────────────────────────────────────
    const файл = await downloadRecording(источник.downloadUrl, источник.downloadToken)
    const путь = `${запись.meeting_id}/${запись.external_id}.m4a`

    const { error: upErr } = await admin.storage
      .from(БАКЕТ)
      .upload(путь, файл, { contentType: 'audio/m4a', upsert: true })

    if (upErr) throw new Error(`не сохранилась к нам: ${upErr.message}`)

    await отметить({ storage_path: путь, file_size: файл.byteLength, status: 'transcribing' })
    console.log(`[запись ${recordingId}] сохранена, ${Math.round(файл.byteLength / 1048576)} МБ`)

    // ── Расшифровать ────────────────────────────────────────────────────────
    if (!транскрипцияНастроена()) {
      await отметить({ status: 'failed', error: 'распознаватель речи не настроен (GEMINI_API_KEY)' })
      return
    }

    const расшифровка = await расшифровать(файл, 'audio/m4a')
    await отметить({ status: 'analyzing' })
    console.log(`[запись ${recordingId}] расшифрована за ${Math.round(расшифровка.мс / 1000)} с, ${расшифровка.текст.length} символов`)

    // ── Разобрать ───────────────────────────────────────────────────────────
    //
    // Тем же разбором, что и переписка. Для человека звонок и чат — один
    // разговор, и смотреть на них он должен одинаково.
    if (запись.deal_id) {
      const материал = {
        dealId: запись.deal_id,
        text: `# Звонок\nДата: ${запись.started_at ?? '—'}\nДлительность: ${Math.round((запись.duration_sec ?? 0) / 60)} мин.\n\n${расшифровка.текст}`,
        messagesCount: расшифровка.текст.split('\n').filter(Boolean).length,
        coveredTo: запись.started_at ?? null,
        empty: false,
      }

      const res = await analyzeConversation(материал)
      if (res.ok) {
        const p = res.payload as any
        await admin.from('deal_analyses').insert({
          deal_id: запись.deal_id,
          source: 'call',
          covered_to: запись.started_at,
          items_count: материал.messagesCount,
          client_type: p['тип_клиента'] ?? null,
          next_step: p['следующий_шаг']?.['есть'] ?? null,
          summary: p['резюме'] ?? null,
          payload: res.payload,
          model: res.model,
          cost_usd: res.costUsd,
          ms: res.ms,
        })

        await admin.from('deal_activities').insert({
          deal_id: запись.deal_id,
          activity_type: 'call',
          content: `Звонок ${Math.round((запись.duration_sec ?? 0) / 60)} мин разобран: ${p['тип_клиента']}, следующий шаг ${p['следующий_шаг']?.['есть'] ? 'зафиксирован' : 'НЕ зафиксирован'}`,
          metadata: { recording_id: recordingId, source: 'zoom', model: res.model },
        })

        console.log(`[запись ${recordingId}] разобрана: ${p['тип_клиента']}`)
      } else {
        console.warn(`[запись ${recordingId}] разбор не удался: ${res.why}`)
      }
    } else {
      console.log(`[запись ${recordingId}] сделка не определена — лежит в «неопознанных»`)
    }

    await отметить({ status: 'done' })

    // ── Освободить место в облаке Zoom ──────────────────────────────────────
    //
    // Только теперь: наша копия лежит в Storage и подтверждена загрузкой.
    const настройки = await readRopSettings(admin)
    if (flag(настройки, 'calls_zoom_purge', true) && запись.meeting_id) {
      try {
        await trashMeetingRecordings(запись.meeting_id)
        await отметить({ purged_at: new Date().toISOString() })
        console.log(`[запись ${recordingId}] облако Zoom освобождено`)
      } catch (e: any) {
        // Не почистили — плохо, но запись у нас, разбор сделан. Видно по
        // пустому purged_at при status='done'.
        console.warn(`[запись ${recordingId}] облако Zoom не почистилось: ${e?.message ?? e}`)
      }
    }
  } catch (e: any) {
    const причина = String(e?.message ?? e).slice(0, 400)
    console.error(`[запись ${recordingId}] упала: ${причина}`)
    await отметить({ status: 'failed', error: причина })
  }
}
