'use server'

import { createAdminClient, createClient as createSsrClient } from '@/lib/supabase/server'
import { lookupInvitation, sendClientWelcomeEmail } from '@/lib/invitation'
import { warnOnError } from '@/lib/supabase/write-guard'
import { assignRole } from '@/lib/auth/assign-role'

export type ActivateResult = { ok: true } | { ok: false; error: string }

export async function activateClientAccount(params: {
  token: string
  password: string
}): Promise<ActivateResult> {
  if (!params.token) return { ok: false, error: 'Нет токена' }
  if (!params.password || params.password.length < 8) {
    return { ok: false, error: 'Пароль должен быть от 8 символов' }
  }

  const verdict = await lookupInvitation(params.token)
  if (!verdict.ok) return { ok: false, error: verdict.error }
  const inv = verdict.invitation

  const admin = await createAdminClient()

  // Проверку «такой аккаунт уже есть» делает сам createUser. Раньше её делал
  // listUsers(), но он отдаёт только первую страницу (50 человек) — при
  // 55 пользователях дубли дальше первой страницы проходили мимо.

  // 2. Создаём auth.users + email confirmed (мы доверяем что email верный,
  //    т.к. продажник сам его вбил при оформлении продажи).
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email: inv.email,
    password: params.password,
    email_confirm: true,
  })
  if (createErr || !created?.user) {
    if (createErr && /already|exists|registered/i.test(createErr.message)) {
      return { ok: false, error: 'Аккаунт с этим email уже существует. Если забыли пароль — напишите куратору.' }
    }
    return { ok: false, error: createErr?.message || 'Не удалось создать аккаунт' }
  }
  const authUserId = created.user.id

  // 3. Роль клиента. Запись в public.users к этому моменту уже создал триггер
  //    на auth.users — с ролью продажника по умолчанию и email в нижнем
  //    регистре. Раньше её искали по email с учётом регистра: у клиентов с
  //    заглавной буквой в адресе (Astashkina03@…) запись не находилась, вставка
  //    падала на дубле, и клиент входил в CRM продажником — семь человек с июня,
  //    и распределение заявок отдавало им чужие сделки. Роль ставим по id.
  const role = await assignRole(admin, { authUserId, email: inv.email, role: 'client' })
  if (!role.ok) return { ok: false, error: role.error }

  // 4. Помечаем invitation как использованный
  await admin.from('client_invitations')
    .update({ used_at: new Date().toISOString() })
    .eq('id', inv.id).then(warnOnError('client_invitations · app/invite/[token]/actions.ts:67'))

  // 5. Логиним пользователя через ssr client (cookies)
  const ssr = await createSsrClient()
  const { error: signInErr } = await ssr.auth.signInWithPassword({
    email: inv.email,
    password: params.password,
  })
  if (signInErr) {
    return { ok: false, error: `Аккаунт создан, но автологин не удался: ${signInErr.message}. Попробуй войти через /login.` }
  }

  // 6. Welcome-письмо (fire-and-forget — не ломаем регистрацию если email
  //    не отправился, сервер просто залогирует ошибку).
  try {
    const { data: client } = await admin
      .from('clients').select('name').eq('id', inv.client_id).maybeSingle()
    sendClientWelcomeEmail({
      to: inv.email,
      clientName: client?.name || 'клиент',
      password: params.password,
    }).then(r => {
      if (!r.ok) console.warn('[invite] welcome email failed:', r.error)
    })
  } catch (e) {
    console.warn('[invite] welcome email exception:', e)
  }

  return { ok: true }
}
