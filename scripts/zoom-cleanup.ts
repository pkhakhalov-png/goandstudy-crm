/**
 * Очистка облака Zoom.
 *
 *   npx tsx scripts/zoom-cleanup.ts                      # показать, что есть, ничего не трогая
 *   npx tsx scripts/zoom-cleanup.ts --старше 90          # то же, но только записи старше 90 дней
 *   npx tsx scripts/zoom-cleanup.ts --старше 90 --в-корзину   # переложить их в корзину Zoom
 *   npx tsx scripts/zoom-cleanup.ts --старше 90 --забрать     # сначала скачать к себе, потом в корзину
 *   npx tsx scripts/zoom-cleanup.ts --освободить 3            # чистить самые старые, пока не станет 3 ГБ свободно
 *
 * Почему «в корзину», а не «удалить». Корзина Zoom держит файл 30 дней и, по
 * документации Zoom, НЕ занимает место хранилища. То есть место освобождается
 * сразу, а передумать можно ещё месяц. Безвозвратное удаление здесь не нужно
 * никому: выигрыша нет, риск есть.
 *
 * `--забрать` скачивает запись в наш приватный бакет перед очисткой. Это
 * медленно (гигабайты), зато 89 часов живых консультаций остаются у нас, а не
 * пропадают ради освобождения места.
 *
 * По умолчанию скрипт НИЧЕГО не делает — только показывает. Стереть чужую
 * работу за полгода одной опечаткой в аргументах слишком легко.
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

const БАКЕТ = 'call-recordings'
const ГБ = 1073741824

function арг(имя: string): string | undefined {
  const i = process.argv.indexOf(имя)
  return i >= 0 ? process.argv[i + 1] : undefined
}

type Встреча = {
  uuid: string
  id: string
  тема: string
  дата: string
  минут: number
  байт: number
  host: string
  файлы: { id: string; url: string; тип: string; расш: string; байт: number }[]
}

async function собрать(токен: string): Promise<Встреча[]> {
  const зов = async (u: string) => {
    const x = await fetch(`https://api.zoom.us/v2${u}`, { headers: { authorization: `Bearer ${токен}` } })
    const j: any = await x.json()
    if (!x.ok) throw new Error(`${x.status} ${j?.message ?? ''}`)
    return j
  }

  // Zoom отдаёт максимум месяц за запрос — идём помесячно на год назад.
  const все: Встреча[] = []
  for (let m = 0; m < 14; m++) {
    const to = new Date(); to.setMonth(to.getMonth() - m)
    const from = new Date(to); from.setMonth(from.getMonth() - 1)
    try {
      const d = await зов(`/accounts/me/recordings?from=${from.toISOString().slice(0, 10)}&to=${to.toISOString().slice(0, 10)}&page_size=300`)
      for (const mt of d.meetings ?? []) {
        const файлы = (mt.recording_files ?? []).map((f: any) => ({
          id: String(f.id), url: f.download_url, тип: f.file_type, расш: f.file_extension, байт: Number(f.file_size ?? 0),
        }))
        все.push({
          uuid: mt.uuid, id: String(mt.id), тема: mt.topic ?? '',
          дата: (mt.start_time ?? '').slice(0, 10), минут: Number(mt.duration ?? 0),
          байт: файлы.reduce((s: number, f: any) => s + f.байт, 0),
          host: mt.host_email ?? '', файлы,
        })
      }
    } catch (e: any) {
      console.log(`  период пропущен: ${e.message}`)
    }
  }

  // Один и тот же uuid может прийти из двух соседних окон — схлопываем.
  const карта = new Map(все.map(v => [v.uuid, v]))
  return [...карта.values()].sort((a, b) => (a.дата < b.дата ? -1 : 1))
}

async function main() {
  const { zoomToken, downloadRecording } = await import('../lib/zoom/client')

  const старше = Number(арг('--старше') ?? 0)
  const освободить = Number(арг('--освободить') ?? 0)
  const вКорзину = process.argv.includes('--в-корзину')
  const забрать = process.argv.includes('--забрать')

  const токен = await zoomToken()
  const все = await собрать(токен)

  const итого = все.reduce((s, v) => s + v.байт, 0)
  console.log(`в облаке Zoom: ${все.length} встреч, ${(итого / ГБ).toFixed(2)} ГБ, ${Math.round(все.reduce((s, v) => s + v.минут, 0) / 60)} ч разговоров`)

  // ── Кого чистим ───────────────────────────────────────────────────────────
  let цели = все
  if (старше > 0) {
    const порог = new Date(Date.now() - старше * 86400000).toISOString().slice(0, 10)
    цели = все.filter(v => v.дата < порог)
    console.log(`старше ${старше} дн. (до ${порог}): ${цели.length} встреч, ${(цели.reduce((s, v) => s + v.байт, 0) / ГБ).toFixed(2)} ГБ`)
  }
  if (освободить > 0) {
    // Самые старые сверху — набираем, пока не наберётся нужный объём.
    const нужно = освободить * ГБ
    const набранное: Встреча[] = []
    let сумма = 0
    for (const v of цели) {
      if (сумма >= нужно) break
      набранное.push(v); сумма += v.байт
    }
    цели = набранное
    console.log(`чтобы освободить ${освободить} ГБ, хватит ${цели.length} самых старых (${(сумма / ГБ).toFixed(2)} ГБ)`)
  }

  if (!вКорзину && !забрать) {
    console.log('\nсухой прогон — ничего не тронуто.')
    console.log('чтобы освободить место:  --старше 90 --в-корзину')
    console.log('чтобы сначала забрать:   --старше 90 --забрать')
    console.log('\nпервые десять кандидатов:')
    for (const v of цели.slice(0, 10)) {
      console.log(`  ${v.дата}  ${String(v.минут).padStart(4)} мин  ${String(Math.round(v.байт / 1048576)).padStart(5)} МБ  ${v.тема.slice(0, 46)}`)
    }
    return
  }

  // ── Работа ────────────────────────────────────────────────────────────────
  let освобождено = 0, забрано = 0, ошибок = 0

  for (const [i, v] of цели.entries()) {
    const метка = `[${i + 1}/${цели.length}] ${v.дата} ${v.тема.slice(0, 34)}`

    try {
      if (забрать) {
        // Берём звук, если он есть: он в разы меньше видео и содержит всё,
        // что нужно для разбора. Видео забираем, только если звука нет.
        const файл = v.файлы.find(f => f.тип === 'M4A') ?? v.файлы.find(f => f.тип === 'MP4')
        if (!файл) { console.log(`${метка} — нечего забирать`); continue }

        const данные = await downloadRecording(файл.url, токен)
        const путь = `архив/${v.дата}/${v.id}-${файл.id}.${(файл.расш ?? 'm4a').toLowerCase()}`
        const { error } = await sb.storage.from(БАКЕТ).upload(путь, данные, {
          contentType: файл.тип === 'MP4' ? 'video/mp4' : 'audio/m4a',
          upsert: true,
        })
        if (error) throw new Error(`не сохранилась к нам: ${error.message}`)

        await sb.from('call_recordings').upsert({
          source: 'zoom',
          external_id: файл.id,
          meeting_id: v.id,
          host_email: v.host,
          storage_path: путь,
          duration_sec: v.минут * 60,
          started_at: `${v.дата}T00:00:00Z`,
          file_size: данные.byteLength,
          status: 'ingested',
        }, { onConflict: 'external_id' })

        забрано++
      }

      // В корзину. Место освобождается сразу, файл живёт там ещё 30 дней.
      const res = await fetch(`https://api.zoom.us/v2/meetings/${encodeURIComponent(v.uuid)}/recordings?action=trash`, {
        method: 'DELETE',
        headers: { authorization: `Bearer ${токен}` },
      })
      if (!res.ok && res.status !== 204) {
        const t = await res.text()
        throw new Error(`не убралось: ${res.status} ${t.slice(0, 120)}`)
      }

      освобождено += v.байт
      console.log(`${метка} — ${забрать ? 'забрано и ' : ''}в корзину (${Math.round(v.байт / 1048576)} МБ)`)
    } catch (e: any) {
      ошибок++
      console.log(`${метка} — ОШИБКА: ${String(e?.message ?? e).slice(0, 140)}`)
    }
  }

  console.log(`\nосвобождено: ${(освобождено / ГБ).toFixed(2)} ГБ${забрать ? ` · забрано к себе: ${забрано}` : ''}${ошибок ? ` · ошибок: ${ошибок}` : ''}`)
  console.log('файлы лежат в корзине Zoom 30 дней и места не занимают — передумать ещё можно.')
}

main().catch(e => { console.error(e?.message ?? e); process.exit(1) })
