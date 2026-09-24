/**
 * Заводит клиенту доступ в личный кабинет и печатает ссылку.
 *
 *   npx tsx scripts/client-invite.ts --client 144 --email kseniya@example.com
 *   npx tsx scripts/client-invite.ts --client 144 --email … --confirm
 *
 * Без --confirm — показ, ничего не пишется.
 *
 * Email обязателен и проставляется в карточку клиента, если его там нет:
 * приглашение выписывается на адрес, на странице активации он показан и не
 * редактируется, и именно по нему создаётся аккаунт. Клиент придумывает только
 * пароль — мы его не видим и не пересылаем.
 *
 * Идемпотентен: активная неиспользованная ссылка переиспользуется, новая не
 * плодится (то же поведение, что у createClientInvitation в lib/invitation.ts).
 */
import { config } from 'dotenv'; import path from 'path'; import { randomBytes } from 'crypto'
import { createClient } from '@supabase/supabase-js'
config({ path: path.resolve(process.cwd(), '.env.local') })

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
)
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://crm.goandstudy.com'
const INVITE_TTL_DAYS = 30

const arg = (f: string) => { const i = process.argv.indexOf(`--${f}`); return i >= 0 ? process.argv[i + 1] : undefined }
const CONFIRM = process.argv.includes('--confirm')
const CLIENT_ID = Number(arg('client'))
const EMAIL = arg('email')?.trim().toLowerCase()

if (!CLIENT_ID || !EMAIL) {
  console.error('Нужны --client <id> и --email <адрес>. См. шапку файла.')
  process.exit(1)
}

async function main() {
  const { data: c } = await sb.from('clients')
    .select('id, name, email, curator_id').eq('id', CLIENT_ID).maybeSingle()
  if (!c) { console.error(`Клиент #${CLIENT_ID} не найден`); process.exit(1) }
  console.log(`Клиент #${c.id} ${c.name}`)

  // Кабинет уже активирован — инвайт не поможет, нужен сброс пароля админом
  const { data: already } = await sb.from('users')
    .select('id').ilike('email', EMAIL!).eq('role', 'client').maybeSingle()
  if (already) {
    console.log(`⚠ Кабинет на ${EMAIL} уже активирован — нужна не ссылка, а сброс пароля.`)
    return
  }
  const { data: auth } = await sb.auth.admin.listUsers()
  if (auth?.users?.some(u => u.email?.toLowerCase() === EMAIL)) {
    console.log(`⚠ В auth уже есть пользователь с ${EMAIL} (другая роль) — активация упрётся в дубль.`)
    return
  }

  if (!c.email) console.log(`＋ email в карточку: ${EMAIL}`)
  else if (c.email.toLowerCase() !== EMAIL) console.log(`~ email в карточке: ${c.email} → ${EMAIL}`)
  if (CONFIRM && c.email?.toLowerCase() !== EMAIL) {
    const { error } = await sb.from('clients').update({ email: EMAIL }).eq('id', c.id)
    if (error) { console.error(`✗ clients: ${error.message}`); process.exit(1) }
  }

  const now = new Date()
  const { data: live } = await sb.from('client_invitations')
    .select('token, expires_at').eq('client_id', c.id)
    .is('used_at', null).gt('expires_at', now.toISOString())
    .order('created_at', { ascending: false }).limit(1).maybeSingle()

  let token = live?.token as string | undefined
  if (token) console.log(`↺ активная ссылка уже есть, годна до ${live!.expires_at}`)
  else {
    token = randomBytes(24).toString('hex')
    const expiresAt = new Date(now.getTime() + INVITE_TTL_DAYS * 86400_000)
    console.log(`＋ ссылка на ${INVITE_TTL_DAYS} дней (до ${expiresAt.toISOString().slice(0, 10)})`)
    if (CONFIRM) {
      const { error } = await sb.from('client_invitations').insert({
        client_id: c.id, token, email: EMAIL, expires_at: expiresAt.toISOString(),
      })
      if (error) { console.error(`✗ invitation: ${error.message}`); process.exit(1) }
    }
  }

  if (!CONFIRM) { console.log('\n⚠️ Показ. Запусти с --confirm.'); return }
  console.log('\n═══ ССЫЛКА В ЛИЧНЫЙ КАБИНЕТ (30 дней, одноразовая) ═══')
  console.log(`${APP_URL}/invite/${token}`)
}
main().catch(e => { console.error(e); process.exit(1) })
