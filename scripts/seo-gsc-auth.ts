// Получение доступа к Search Console: обмен согласия на постоянный токен.
//
// Запуск: npx tsx scripts/seo-gsc-auth.ts
// До запуска в .env.local должны лежать GSC_CLIENT_ID и GSC_CLIENT_SECRET
// из Google Cloud Console (тип приложения — Desktop app).
//
// Скрипт поднимает приёмник на 127.0.0.1, открывает согласие в браузере,
// меняет одноразовый код на refresh token и дописывает его в .env.local.
import { config } from 'dotenv'; import path from 'path'
config({ path: path.resolve(process.cwd(), '.env.local') })
import http from 'http'
import fs from 'fs'
import { exec } from 'child_process'

const PORT = 5599
const REDIRECT = `http://127.0.0.1:${PORT}/`
// Полный доступ, а не только чтение: он же нужен, чтобы отправлять sitemap
const SCOPE = 'https://www.googleapis.com/auth/webmasters'

async function main() {
  const id = process.env.GSC_CLIENT_ID
  const secret = process.env.GSC_CLIENT_SECRET
  if (!id || !secret) {
    console.error('✗ В .env.local нет GSC_CLIENT_ID / GSC_CLIENT_SECRET — сначала создайте их в Google Cloud Console')
    process.exit(1)
  }

  const url = 'https://accounts.google.com/o/oauth2/v2/auth?' + new URLSearchParams({
    client_id: id, redirect_uri: REDIRECT, response_type: 'code', scope: SCOPE,
    access_type: 'offline',   // без этого refresh token не выдадут
    prompt: 'consent',        // и без этого тоже, если согласие уже давали
  })

  console.log('\nОткрываю согласие Google в браузере. Если не открылось — скопируйте:\n')
  console.log(url + '\n')
  exec(`open "${url}"`)

  const code: string = await new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const q = new URL(req.url ?? '/', REDIRECT).searchParams
      const err = q.get('error'); const got = q.get('code')
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
      res.end(`<meta charset="utf-8"><body style="font:16px system-ui;padding:40px">
        ${got ? 'Готово. Вернитесь в терминал — доступ сохраняется.' : `Отказано: ${err}`}</body>`)
      server.close()
      got ? resolve(got) : reject(new Error(err ?? 'согласие не получено'))
    })
    server.listen(PORT, '127.0.0.1')
    setTimeout(() => { server.close(); reject(new Error('истекло время ожидания')) }, 300000)
  })

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: id, client_secret: secret, code, grant_type: 'authorization_code', redirect_uri: REDIRECT }),
  })
  const json: any = await res.json()
  if (!res.ok || !json.refresh_token) {
    console.error('✗ Google не выдал постоянный токен:', JSON.stringify(json).slice(0, 300))
    process.exit(1)
  }

  const env = fs.readFileSync('.env.local', 'utf8')
  const next = /^GSC_REFRESH_TOKEN=/m.test(env)
    ? env.replace(/^GSC_REFRESH_TOKEN=.*$/m, `GSC_REFRESH_TOKEN=${json.refresh_token}`)
    : env.replace(/\s*$/, `\nGSC_REFRESH_TOKEN=${json.refresh_token}\n`)
  fs.writeFileSync('.env.local', next)

  // Сразу проверяем на боевом ресурсе, а не верим на слово
  const check = await fetch('https://searchconsole.googleapis.com/v1/urlInspection/index:inspect', {
    method: 'POST', headers: { authorization: `Bearer ${json.access_token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ inspectionUrl: 'https://goandstudy.com/', siteUrl: process.env.GSC_SITE_URL || 'sc-domain:goandstudy.com' }),
  })
  const cj: any = await check.json()
  console.log('\n✓ Доступ сохранён в .env.local')
  console.log(check.ok
    ? `✓ Проверено на боевом: главная — ${cj?.inspectionResult?.indexStatusResult?.coverageState ?? 'ответ получен'}`
    : `⚠ Токен получен, но ресурс не отвечает: ${JSON.stringify(cj).slice(0, 200)}`)
}
main().catch((e) => { console.error('✗', e.message); process.exit(1) })
