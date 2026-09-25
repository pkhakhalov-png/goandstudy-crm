/**
 * Проверка цепочки Zoom по шагам, без ожидания живой консультации.
 *
 *   npx tsx scripts/zoom-selftest.ts              # только проверки, ничего не создаём
 *   npx tsx scripts/zoom-selftest.ts --встреча    # создать тестовую встречу и дать ссылку
 *   npx tsx scripts/zoom-selftest.ts --убрать <id> # удалить тестовую встречу
 *
 * Зачем отдельным скриптом. Ждать настоящей брони, чтобы узнать, что права не
 * те или бакета нет, — дорого: ошибка всплывёт через день, на живом клиенте и
 * в неудобный момент. Здесь всё то же самое проверяется за минуту и до того,
 * как включены флаги.
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

function строкой(v: unknown, запасной = ''): string {
  return typeof v === 'string' ? v.replace(/^"|"$/g, '') : запасной
}

async function main() {
  const { zoomConfigured, zoomToken, listUsers, createMeeting, deleteMeeting } = await import('../lib/zoom/client')
  const { транскрипцияНастроена } = await import('../lib/zoom/transcribe')

  const убрать = process.argv.indexOf('--убрать')
  if (убрать >= 0) {
    const id = process.argv[убрать + 1]
    if (!id) { console.error('укажи id встречи'); process.exit(1) }
    await deleteMeeting(id)
    console.log(`встреча ${id} удалена`)
    return
  }

  let сбоев = 0
  const шаг = (ок: boolean, что: string, деталь = '') => {
    if (!ок) сбоев++
    console.log(`${ок ? '✅' : '❌'} ${что}${деталь ? ' — ' + деталь : ''}`)
  }

  // 1. Ключи
  шаг(zoomConfigured(), 'ключи Zoom в окружении')
  шаг(транскрипцияНастроена(), 'ключ распознавателя речи (GEMINI_API_KEY)')
  шаг(Boolean(process.env.ZOOM_WEBHOOK_SECRET_TOKEN?.trim()), 'секрет вебхука')
  шаг(Boolean(process.env.ANTHROPIC_API_KEY?.trim()), 'ключ модели разбора')

  // 2. Доступ к API
  try {
    await zoomToken()
    шаг(true, 'токен Zoom выдаётся')
  } catch (e: any) {
    шаг(false, 'токен Zoom выдаётся', e.message)
  }

  // 3. Аккаунты-хосты
  const настройки = (await sb.from('rop_settings').select('key, value')).data ?? []
  const основной = строкой(настройки.find(s => s.key === 'calls_zoom_primary_host')?.value, 'gs@goandstudy.com')
  const запасной = строкой(настройки.find(s => s.key === 'calls_zoom_backup_host')?.value)

  try {
    const люди = await listUsers()
    const есть = (email: string) => люди.some(u => u.email.toLowerCase() === email.toLowerCase() && u.licensed)
    шаг(есть(основной), `основной хост ${основной} существует и лицензирован`)
    if (запасной) шаг(есть(запасной), `запасной хост ${запасной} существует и лицензирован`)
  } catch (e: any) {
    шаг(false, 'список пользователей Zoom', e.message)
  }

  // 4. Хранилище
  const { data: бакеты } = await sb.storage.listBuckets()
  const бакет = (бакеты ?? []).find(b => b.name === 'call-recordings')
  шаг(Boolean(бакет), 'бакет call-recordings существует')
  if (бакет) шаг(!bпубличный(бакет), 'бакет приватный', bпубличный(бакет) ? 'ПУБЛИЧНЫЙ — записи доступны по ссылке' : '')

  // 5. Схема
  const { error: e1 } = await sb.from('call_recordings').select('id').limit(1)
  шаг(!e1, 'таблица call_recordings доступна', e1?.message ?? '')
  const { error: e2 } = await sb.from('bookings').select('zoom_meeting_id').limit(1)
  шаг(!e2, 'поля Zoom в бронях', e2?.message ?? '')

  // 6. Флаги
  const флаг = (k: string) => строкой(настройки.find(s => s.key === k)?.value, String(настройки.find(s => s.key === k)?.value))
  console.log(`\nфлаги: calls_enabled=${флаг('calls_enabled')} · calls_zoom_auto=${флаг('calls_zoom_auto')} · calls_zoom_purge=${флаг('calls_zoom_purge')}`)
  console.log(`хосты: основной ${основной}${запасной ? ', запасной ' + запасной : ''}`)

  // 7. Тестовая встреча — только по явному требованию
  if (process.argv.includes('--встреча')) {
    const через = new Date(Date.now() + 5 * 60_000)
    const в = await createMeeting({
      hostEmail: основной,
      topic: 'Проверка цепочки — тестовая встреча',
      startTime: через.toISOString(),
      durationMin: 15,
      agenda: 'Самопроверка интеграции. Можно удалять.',
    })
    console.log(`\n✅ тестовая встреча создана`)
    console.log(`   id:     ${в.id}`)
    console.log(`   войти:  ${в.joinUrl}`)
    console.log(`\n   Зайди по ссылке, скажи вслух несколько фраз за менеджера и за клиента,`)
    console.log(`   выйди. Через 3–10 минут Zoom пришлёт событие о готовой записи.`)
    console.log(`\n   Удалить встречу: npx tsx scripts/zoom-selftest.ts --убрать ${в.id}`)
  }

  console.log(сбоев === 0
    ? '\nВсё готово. Можно включать флаги.'
    : `\nСбоев: ${сбоев}. Включать рано.`)
  process.exit(сбоев === 0 ? 0 : 1)
}

function bпубличный(b: any): boolean {
  return Boolean(b.public)
}

main().catch(e => { console.error(e?.message ?? e); process.exit(1) })
