/**
 * Заводит куратора и выдаёт invite-ссылку на кабинет.
 *
 *   npx tsx scripts/create-curator-invite.ts \
 *     --email alima.nurgaliyeva24@fizmat.kz \
 *     --name Алима \
 *     --full-name "Нургалиева Алима Бауыржановна" \
 *     --phone "+7 707 816-10-04" \
 *     --confirm
 *
 * Без --confirm — dry-run, ничего не пишет.
 *
 * --name это короткое имя: оно уходит в «Привет, {name}!» в письмах и в шапку
 * карточки. Полное ФИО живёт отдельно в full_name, чтобы не портить обращение.
 *
 * Идемпотентен: если куратор с таким email уже есть — не дублирует, а
 * переиспользует его и активный инвайт (то же поведение, что у кнопки «Доступ»
 * в /admin/curators — см. prepareCuratorAccess в app/admin/curators/actions.ts).
 *
 * Пароль здесь НЕ задаётся: куратор придумывает его сам на странице инвайта,
 * она же создаёт auth-пользователя и public.users с role='curator'.
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

function arg(flag: string): string | undefined {
  const i = process.argv.indexOf(`--${flag}`)
  return i >= 0 ? process.argv[i + 1] : undefined
}
const CONFIRM = process.argv.includes('--confirm')
const EMAIL = arg('email')?.trim().toLowerCase()
const NAME = arg('name')?.trim()
const FULL_NAME = arg('full-name')?.trim() || null
const PHONE = arg('phone')?.trim() || null
const MAX_CLIENTS = Number(arg('max-clients') || 20)

if (!EMAIL || !NAME) {
  console.error('Нужны как минимум --email и --name. См. шапку файла.')
  process.exit(1)
}

async function main() {
  // Дубли — по email и по contact (в старых строках email лежит в contact)
  const { data: dup } = await sb.from('curators')
    .select('id, name, email, contact, user_id')
    .or(`email.ilike.${EMAIL},contact.ilike.${EMAIL}`)
  if (dup?.length) {
    console.log(`⚠ Куратор с ${EMAIL} уже есть: ${dup[0].id} (${dup[0].name})`)
    if (dup[0].user_id) {
      console.log('   Кабинет уже активирован — инвайт не поможет, нужен сброс пароля:')
      console.log('   → /admin/curators → карточка → кнопка «Доступ»')
      return
    }
  }

  let curatorId = dup?.[0]?.id as string | undefined
  if (curatorId) {
    console.log(`↺ переиспользую куратора #${curatorId}`)
    if (CONFIRM) {
      const { error } = await sb.from('curators')
        .update({ full_name: FULL_NAME, phone: PHONE }).eq('id', curatorId)
      if (error) { console.error('curators update:', error.message); process.exit(1) }
    }
  } else {
    console.log(`＋ куратор: ${NAME}${FULL_NAME ? ` (${FULL_NAME})` : ''} · ${EMAIL}${PHONE ? ` · ${PHONE}` : ''}`)
    if (CONFIRM) {
      const { data, error } = await sb.from('curators').insert({
        name: NAME,
        full_name: FULL_NAME,
        phone: PHONE,
        email: EMAIL,
        contact: EMAIL,      // старое поле — держим в синхроне, его читает часть UI
        is_active: true,
        max_clients: MAX_CLIENTS,
      }).select('id').single()
      if (error) { console.error('curators insert:', error.message); process.exit(1) }
      curatorId = data.id
    }
  }

  // Инвайт — переиспользуем активный, если он есть
  const now = new Date()
  let token: string | undefined
  if (curatorId) {
    const { data: live } = await sb.from('curator_invitations')
      .select('token, expires_at').eq('curator_id', curatorId)
      .is('used_at', null).gt('expires_at', now.toISOString())
      .order('created_at', { ascending: false }).limit(1).maybeSingle()
    token = live?.token
    if (token) console.log(`↺ активный инвайт уже есть, годен до ${live!.expires_at}`)
  }
  if (!token) {
    token = randomBytes(24).toString('hex')
    const expiresAt = new Date(now.getTime() + INVITE_TTL_DAYS * 86400_000)
    console.log(`＋ инвайт на ${INVITE_TTL_DAYS} дней (до ${expiresAt.toISOString().slice(0, 10)})`)
    if (CONFIRM) {
      const { error } = await sb.from('curator_invitations').insert({
        curator_id: curatorId, token, email: EMAIL, expires_at: expiresAt.toISOString(),
      })
      if (error) { console.error('invitation insert:', error.message); process.exit(1) }
    }
  }

  if (!CONFIRM) {
    console.log('\n⚠️ dry-run. Ничего не записано. Запусти с --confirm.')
    return
  }

  console.log('\n═══ ССЫЛКА ДЛЯ КУРАТОРА (30 дней, одноразовая) ═══')
  console.log(`${APP_URL}/invite/curator/${token}`)
  console.log(`\ncurator_id: ${curatorId}`)
}
main().catch(e => { console.error(e); process.exit(1) })
