/**
 * Выдать кураторе Анастасии invite-ссылку для САМОСТОЯТЕЛЬНОЙ установки пароля.
 * Кабинет НЕ удаляем (там привязаны клиенты), invite в reset-режиме обновит пароль.
 *
 * Работает с обновлённым app/invite/curator/[token]/actions.ts:
 * если у куратора уже есть user_id — invite просто меняет пароль.
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
const NAME = 'Анастасия'
const EMAIL = '8677378@mail.ru'

async function main() {
  const { data: curator, error: findErr } = await sb
    .from('curators').select('id, name, email, contact, user_id').eq('name', NAME).maybeSingle()
  if (findErr) throw findErr
  if (!curator) throw new Error('Куратор не найден')

  console.log('Куратор:', { id: curator.id, name: curator.name, email: curator.email, hasCabinet: !!curator.user_id })

  // Гасим старые активные invites (чтобы был один валидный)
  const { error: delErr } = await sb
    .from('curator_invitations')
    .delete()
    .eq('curator_id', curator.id)
    .is('used_at', null)
  if (delErr) console.warn('cleanup invites:', delErr.message)

  // Поправим email в curators если разошёлся
  if (curator.email !== EMAIL) {
    const { error: updErr } = await sb.from('curators')
      .update({ email: EMAIL, contact: curator.contact || EMAIL })
      .eq('id', curator.id)
    if (updErr) console.warn('update curator email:', updErr.message)
  }

  // Новый invite
  const token = randomBytes(24).toString('hex')
  const expiresAt = new Date(Date.now() + INVITE_TTL_DAYS * 86400_000)
  const { error: insErr } = await sb.from('curator_invitations').insert({
    curator_id: curator.id, token, email: EMAIL,
    expires_at: expiresAt.toISOString(),
  })
  if (insErr) throw insErr

  const url = `${APP_URL}/invite/curator/${token}`
  console.log('\n═══════════════════════════════════════════════════════════════')
  console.log(`  ${NAME} — invite для самостоятельной установки пароля`)
  console.log('═══════════════════════════════════════════════════════════════')
  console.log(`Email:   ${EMAIL}`)
  console.log(`Ссылка:  ${url}`)
  console.log(`Срок:    до ${expiresAt.toISOString().slice(0, 10)} (${INVITE_TTL_DAYS} дней)`)
  console.log(`Кабинет: ${curator.user_id ? 'уже активен — клиенты сохранятся, обновится только пароль' : 'новый'}`)
}

main().catch(e => { console.error(e); process.exit(1) })
