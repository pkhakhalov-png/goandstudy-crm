/**
 * Защёлка на прогон: два прогона разом не пускаем.
 *
 * ЗАЧЕМ. Проверки ходят в настоящую базу и работают на общих данных —
 * демонстрационном деле, строках сотрудника, очереди заданий. Два прогона
 * одновременно затирают фикстуры друг друга, и красным становится то, что
 * исправно: «дубликат ключа», «строки нет», «ждали одно, пришло другое».
 *
 * Это случилось трижды, и каждый раз я искал дефект в коде, которого там не
 * было. Ложное красное дороже отсутствующей проверки: по нему принимают
 * решения и теряют время, а потом перестают верить и настоящему.
 *
 * ПОЧЕМУ ЗАСЧЁЛКА СТАРЕЕТ. Убитый по таймауту прогон не успевает снять её за
 * собой. Вечная защёлка заблокировала бы работу до ручного вмешательства —
 * хуже той беды, от которой защищает. Четверть часа заведомо больше любого
 * честного прогона.
 */
import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
import path from 'path'

const КЛЮЧ = 'test_run_lock'
const СТАРЕЕТ_МИНУТ = 15

function база() {
  config({ path: path.resolve(process.cwd(), '.env.local') })
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      db: { schema: 'care' },
      global: { headers: { Authorization: `Bearer ${process.env.CARE_DB_KEY}` } },
      auth: { persistSession: false },
    }
  )
}

export async function setup() {
  const b = база()
  const { data } = await b.from('settings').select('value, updated_at').eq('key', КЛЮЧ).maybeSingle()

  if (data) {
    const когда = new Date(String(data.value ?? data.updated_at ?? 0)).getTime()
    const минут = (Date.now() - когда) / 60_000
    if (Number.isFinite(минут) && минут < СТАРЕЕТ_МИНУТ) {
      throw new Error(
        `Другой прогон проверок идёт ${Math.round(минут)} мин. Два разом затирают данные друг друга — ` +
          `дождитесь конца или снимите защёлку: delete from care.settings where key = '${КЛЮЧ}'`
      )
    }
  }

  const сейчас = new Date().toISOString()
  if (data) await b.from('settings').update({ value: сейчас }).eq('key', КЛЮЧ)
  else await b.from('settings').insert({ key: КЛЮЧ, value: сейчас })
}

export async function teardown() {
  await база().from('settings').delete().eq('key', КЛЮЧ)
}
