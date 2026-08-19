'use server'

import { createClient, createAdminClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function markPaymentPaidSales(formData: FormData): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return

  await supabase
    .from('payments')
    .update({
      is_paid: true,
      fact_date: formData.get('fact_date') as string || new Date().toISOString().split('T')[0],
      fact_sum: Number(formData.get('fact_sum')),
      comment: formData.get('comment') as string || null,
    })
    .eq('id', formData.get('payment_id') as string)

  revalidatePath('/sales')
}

export async function unmarkPaymentPaidSales(formData: FormData): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return

  await supabase
    .from('payments')
    .update({
      is_paid: false,
      fact_date: null,
      fact_sum: null,
      comment: null,
    })
    .eq('id', formData.get('payment_id') as string)

  revalidatePath('/sales')
}

export async function completeTask(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Не авторизован' }

  const taskId = formData.get('task_id') as string
  const admin = await createAdminClient()

  await admin.from('deal_tasks').update({
    is_done: true,
    completed_at: new Date().toISOString(),
  }).eq('id', taskId)

  revalidatePath('/sales')
  revalidatePath('/rop')
  return { success: true }
}


// Сгенерировать invite-ссылку для клиента залогиненным продажником.
// Доступно если клиент привязан к этому продажнику (или роль admin/rop).
export async function generateInviteForOwnClient(clientId: number) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "Не авторизован" }

  const { data: profile } = await supabase.from("users").select("role").eq("id", user.id).single()
  const isPrivileged = profile?.role === "admin" || profile?.role === "rop"

  if (!isPrivileged) {
    // Продажник — проверяем что клиент его
    const admin = await createAdminClient()
    const { data: client } = await admin.from("clients").select("salesperson_id").eq("id", clientId).maybeSingle()
    if (!client) return { error: "Клиент не найден" }
    if (client.salesperson_id !== user.id) return { error: "Этот клиент не у вас" }
  }

  const { createClientInvitation } = await import("@/lib/invitation")
  const result = await createClientInvitation(clientId, user.id)
  if (!result.ok) return { error: result.error }
  return { success: true, url: result.url, emailSent: result.emailSent, emailError: result.emailError }
}



// Поправить email и переотправить invite-ссылку (если email указали с ошибкой).
export async function resendInviteForOwnClient(clientId: number, newEmail?: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "Не авторизован" }

  const { data: profile } = await supabase.from("users").select("role").eq("id", user.id).single()
  const isPrivileged = profile?.role === "admin" || profile?.role === "rop"

  if (!isPrivileged) {
    const admin = await createAdminClient()
    const { data: client } = await admin.from("clients").select("salesperson_id").eq("id", clientId).maybeSingle()
    if (!client) return { error: "Клиент не найден" }
    if (client.salesperson_id !== user.id) return { error: "Этот клиент не у вас" }
  }

  const { resendClientInvitation } = await import("@/lib/invitation")
  const result = await resendClientInvitation(clientId, newEmail, user.id)
  if (!result.ok) return { error: result.error }
  revalidatePath("/sales")
  return { success: true, url: result.url, emailSent: result.emailSent, emailError: result.emailError }
}

// Проставить email клиенту перед генерацией invite (если его нет).
export async function setClientEmail(clientId: number, email: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "Не авторизован" }
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: "Некорректный email" }

  const { data: profile } = await supabase.from("users").select("role").eq("id", user.id).single()
  const isPrivileged = profile?.role === "admin" || profile?.role === "rop"

  const admin = await createAdminClient()
  if (!isPrivileged) {
    const { data: client } = await admin.from("clients").select("salesperson_id").eq("id", clientId).maybeSingle()
    if (!client) return { error: "Клиент не найден" }
    if (client.salesperson_id !== user.id) return { error: "Этот клиент не у вас" }
  }
  const { error } = await admin.from("clients").update({ email }).eq("id", clientId)
  if (error) return { error: error.message }
  revalidatePath("/sales")
  return { success: true }
}

// Ориентировочный месяц оффера/зачисления (формат 'YYYY-MM' или пусто = сбросить).
export async function setExpectedOfferMonth(clientId: number, month: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "Не авторизован" }

  const value = month?.trim() || null
  if (value && !/^\d{4}-(0[1-9]|1[0-2])$/.test(value)) return { error: "Некорректный месяц" }

  const { data: profile } = await supabase.from("users").select("role").eq("id", user.id).single()
  const isPrivileged = profile?.role === "admin" || profile?.role === "rop"

  const admin = await createAdminClient()
  if (!isPrivileged) {
    const { data: client } = await admin.from("clients").select("salesperson_id").eq("id", clientId).maybeSingle()
    if (!client) return { error: "Клиент не найден" }
    if (client.salesperson_id !== user.id) return { error: "Этот клиент не у вас" }
  }
  const { error } = await admin.from("clients").update({ expected_offer_month: value }).eq("id", clientId)
  if (error) return { error: error.message }
  revalidatePath("/sales")
  revalidatePath("/admin/clients")
  return { success: true }
}

