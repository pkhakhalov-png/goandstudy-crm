// Получение доступа к Яндекс.Вебмастеру.
//
// Запуск: npx tsx scripts/seo-yandex-auth.ts
// До запуска в .env.local нужны YANDEX_CLIENT_ID и YANDEX_CLIENT_SECRET —
// их выдаёт oauth.yandex.ru при создании приложения.
//
// Скрипт поднимает приёмник на 127.0.0.1, открывает согласие, меняет код на
// токен и дописывает его в .env.local. Токен Яндекса живёт год.
import { config } from 'dotenv'; import path from 'path'
config({ path: path.resolve(process.cwd(), '.env.local') })
import http from 'http'
import fs from 'fs'
import { exec } from 'child_process'

const PORT = 5600
const REDIRECT = `http://127.0.0.1:${PORT}/`

async function main() {
  const id = process.env.YANDEX_CLIENT_ID
  const secret = process.env.YANDEX_CLIENT_SECRET
  if (!id || !secret) {
    console.error('✗ В .env.local нет YANDEX_CLIENT_ID / YANDEX_CLIENT_SECRET')
    console.error('  Создать приложение: https://oauth.yandex.ru/client/new')
    console.error('  Права: «Яндекс.Вебмастер» → полный доступ')
    console.error(`  Redirect URI: ${REDIRECT}`)
    process.exit(1)
  }

  // Запасной путь: код, выданный на странице Яндекса, передаётся аргументом.
  // Нужен, когда приложение зарегистрировано без локального адреса возврата —
  // тогда Яндекс показывает код на экране, а не отправляет его нам.
  // Код Яндекса — произвольные буквы и цифры, а не шестнадцатеричный: первая
  // версия проверки искала только 0-9a-f и код с буквой «z» пропускала мимо
  const manual = process.argv.find((a) => /^[0-9a-z]{8,}$/i.test(a) && a !== id && !a.includes('/'))
  if (manual) {
    console.log('Меняю код, выданный Яндексом, на токен…')
    await exchange(manual, id, secret, null)
    return
  }

  const url = `https://oauth.yandex.ru/authorize?response_type=code&client_id=${id}&redirect_uri=${encodeURIComponent(REDIRECT)}`
  console.log('\nОткрываю согласие Яндекса. Если не открылось — скопируйте:\n')
  console.log(url + '\n')
  exec(`open "${url}"`)

  const code: string = await new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const q = new URL(req.url ?? '/', REDIRECT).searchParams
      const got = q.get('code'); const err = q.get('error')
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
      res.end(`<meta charset="utf-8"><body style="font:16px system-ui;padding:40px">
        ${got ? 'Готово. Вернитесь в терминал.' : `Отказано: ${err}`}</body>`)
      server.close()
      got ? resolve(got) : reject(new Error(err ?? 'согласие не получено'))
    })
    server.listen(PORT, '127.0.0.1')
    setTimeout(() => { server.close(); reject(new Error('истекло время ожидания')) }, 300000)
  })

  await exchange(code, id, secret, REDIRECT)
}

async function exchange(code: string, id: string, secret: string, redirect: string | null) {
  const body: Record<string, string> = { grant_type: 'authorization_code', code, client_id: id, client_secret: secret }
  if (redirect) body.redirect_uri = redirect

  const res = await fetch('https://oauth.yandex.ru/token', {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body),
  })
  const json: any = await res.json()
  if (!res.ok || !json.access_token) {
    console.error('✗ Яндекс не выдал токен:', JSON.stringify(json).slice(0, 300))
    process.exit(1)
  }

  const env = fs.readFileSync('.env.local', 'utf8')
  const next = /^YANDEX_TOKEN=/m.test(env)
    ? env.replace(/^YANDEX_TOKEN=.*$/m, `YANDEX_TOKEN=${json.access_token}`)
    : env.replace(/\s*$/, `\nYANDEX_TOKEN=${json.access_token}\n`)
  fs.writeFileSync('.env.local', next)
  console.log(`\n✓ Токен сохранён в .env.local (живёт ${Math.round((json.expires_in ?? 0) / 86400)} дней)`)

  // Проверяем сразу: токен без доступа к сайту бесполезен
  process.env.YANDEX_TOKEN = json.access_token
  const { hostId, recrawlQuota } = await import('../lib/seo/yandex')
  try {
    const host = await hostId()
    const quota = await recrawlQuota(host)
    console.log(`✓ Сайт найден: ${host}`)
    console.log(`✓ Заявок на переобход сегодня: ${quota.total - quota.used} из ${quota.total}`)
  } catch (e: any) {
    console.log(`⚠ Токен есть, но сайт недоступен: ${e.message}`)
  }
}
main().catch((e) => { console.error('✗', e.message); process.exit(1) })
