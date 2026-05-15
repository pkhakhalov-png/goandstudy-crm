/**
 * Заполняет email кураторам и выдаёт доступы:
 *  - если у куратора уже есть кабинет (user_id) → ставим новый пароль
 *  - если нет → создаём curator_invitation и печатаем ссылку
 *
 * RESEND_API_KEY на проде, не локально, поэтому скрипт сам письма не шлёт —
 * выводит всё в консоль, отдадим кураторам вручную.
 */

import { config } from 'dotenv'
import path from 'path'
import { createClient } from '@supabase/supabase-js'
import { randomBytes } from 'crypto'

config({ path: path.resolve(process.cwd(), '.env.local') })

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false, autoRefreshToken: false },
})

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://crm.goandstudy.com'
const INVITE_TTL_DAYS = 30

const CURATORS: { name: string; email: string }[] = [
  { name: 'Милена',     email: 'milenagainulina01@gmail.com' },
  { name: 'Ксения',     email: 'tsareva22kseniya@gmail.com' },
  { name: 'Софья',      email: 'sofiya.yuchko@gmail.com' },
  { name: 'Анастасия',  email: '8677378@mail.ru' },
  { name: 'Евгения',    email: 'genia.gavrilova@gmail.com' },
  { name: 'Алина',      email: 'alinaarsl7@gmail.com' },
]

function genPassword() {
  // 12 символов, безопасный набор
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'
  let s = ''
  const buf = randomBytes(12)
  for (let i = 0; i < 12; i++) s += chars[buf[i] % chars.length]
  return s
}

type Result =
  | { kind: 'new-invite'; name: string; email: string; url: string }
  | { kind: 'reset-password'; name: string; email: string; password: string; loginUrl: string }
  | { kind: 'error'; name: string; email: string; error: string }

async function processCurator(c: { name: string; email: string }): Promise<Result> {
  // 1. Найти куратора
  const { data: curator, error: findErr } = await sb
    .from('curators').select('id, name, email, contact, user_id').eq('name', c.name).maybeSingle()
  if (findErr) return { kind: 'error', name: c.name, email: c.email, error: findErr.message }
  if (!curator) return { kind: 'error', name: c.name, email: c.email, error: 'не найден в curators' }

  // 2. Обновить email и contact (если пусто)
  const patch: Record<string, any> = {}
  if (curator.email !== c.email) patch.email = c.email
  if (!curator.contact) patch.contact = c.email
  if (Object.keys(patch).length > 0) {
    const { error } = await sb.from('curators').update(patch).eq('id', curator.id)
    if (error) return { kind: 'error', name: c.name, email: c.email, error: `update curators: ${error.message}` }
  }

  // 3. Если у куратора уже есть user_id — это активированный кабинет.
  //    Сбрасываем ему пароль через auth admin и обновляем users.email при необходимости.
  if (curator.user_id) {
    const password = genPassword()
    const { error: authErr } = await sb.auth.admin.updateUserById(curator.user_id, {
      password,
      email: c.email,
      email_confirm: true,
    })
    if (authErr) return { kind: 'error', name: c.name, email: c.email, error: `auth update: ${authErr.message}` }
    // sync public.users
    await sb.from('users').update({ email: c.email, name: c.name, role: 'curator', is_active: true })
      .eq('id', curator.user_id)
    return {
      kind: 'reset-password', name: c.name, email: c.email,
      password, loginUrl: `${APP_URL}/login`,
    }
  }

  // 4. Если кабинета нет — создаём invitation.
  //    Сначала чекнем активную:
  const now = new Date()
  const { data: existing } = await sb
    .from('curator_invitations')
    .select('id, token, expires_at')
    .eq('curator_id', curator.id)
    .is('used_at', null)
    .gt('expires_at', now.toISOString())
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (existing) {
    return {
      kind: 'new-invite', name: c.name, email: c.email,
      url: `${APP_URL}/invite/curator/${existing.token}`,
    }
  }

  const token = randomBytes(24).toString('hex')
  const expiresAt = new Date(now.getTime() + INVITE_TTL_DAYS * 86400_000)
  const { error: insErr } = await sb.from('curator_invitations').insert({
    curator_id: curator.id, token, email: c.email,
    expires_at: expiresAt.toISOString(),
  })
  if (insErr) return { kind: 'error', name: c.name, email: c.email, error: `insert invitation: ${insErr.message}` }

  return {
    kind: 'new-invite', name: c.name, email: c.email,
    url: `${APP_URL}/invite/curator/${token}`,
  }
}

async function main() {
  console.log(`Прод: ${APP_URL}\n`)
  const results: Result[] = []
  for (const c of CURATORS) {
    const r = await processCurator(c)
    results.push(r)
  }

  console.log('═══════════════════════════════════════════════════════════════')
  console.log('  РЕЗУЛЬТАТЫ — отправь это кураторам (через WA / TG / лично)')
  console.log('═══════════════════════════════════════════════════════════════\n')

  for (const r of results) {
    if (r.kind === 'error') {
      console.log(`✕ ${r.name} (${r.email}) — ${r.error}\n`)
      continue
    }
    if (r.kind === 'reset-password') {
      console.log(`◆ ${r.name} — пароль сброшен (кабинет был уже создан)`)
      console.log(`    Email:    ${r.email}`)
      console.log(`    Пароль:   ${r.password}`)
      console.log(`    Вход:     ${r.loginUrl}`)
      console.log()
      continue
    }
    // new-invite
    console.log(`◇ ${r.name} — invite на активацию (сама задаст пароль)`)
    console.log(`    Email:    ${r.email}`)
    console.log(`    Ссылка:   ${r.url}`)
    console.log()
  }

  const errors = results.filter(r => r.kind === 'error').length
  console.log(`\nГотово. Ошибок: ${errors}/${results.length}.`)
  if (!process.env.RESEND_API_KEY) {
    console.log('RESEND_API_KEY не настроен локально — письма не отправлены, отдавай ссылки вручную.')
  }
}

main().catch(e => { console.error(e); process.exit(1) })
