// Здоровье доступа к Search Console: жив ли токен и когда протухнет.
//
// В режиме Testing постоянный токен Google живёт семь дней. Это не ошибка
// настройки, а правило: приложение, не переведённое в рабочий режим, считается
// черновиком. Узнать об этом лучше заранее, а не по упавшему импорту.
import { config } from 'dotenv'; import path from 'path'
config({ path: path.resolve(process.cwd(), '.env.local') })

async function main() {
  const body = new URLSearchParams({
    client_id: process.env.GSC_CLIENT_ID!, client_secret: process.env.GSC_CLIENT_SECRET!,
    refresh_token: process.env.GSC_REFRESH_TOKEN!, grant_type: 'refresh_token',
  })
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body,
  })
  const json: any = await res.json()

  if (!res.ok) {
    console.log(`✗ доступ не работает: ${json.error} — ${String(json.error_description ?? '').slice(0, 120)}`)
    if (json.error === 'invalid_grant') {
      console.log('\nПохоже, токен протух. Так бывает, когда экран согласия остался в режиме Testing.')
      console.log('Починка: npx tsx scripts/seo-gsc-auth.ts — и перевести приложение в рабочий режим,')
      console.log('иначе через неделю повторится: console.cloud.google.com/auth/audience → Publish app')
    }
    process.exit(1)
  }

  console.log('✓ доступ работает, токен обновляется')
  console.log(`  срок текущего ключа: ${Math.round((json.expires_in ?? 3600) / 60)} минут (обновляется сам)`)
  console.log('\nРежим приложения проверить глазами: console.cloud.google.com/auth/audience')
  console.log('  «Testing» — постоянный токен протухнет через 7 дней после выдачи')
  console.log('  «In production» — живёт, пока его не отозвать')
}
main().catch((e) => { console.error('✗', e.message); process.exit(1) })
