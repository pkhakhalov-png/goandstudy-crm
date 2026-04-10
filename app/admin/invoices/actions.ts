'use server'

import { createClient, createAdminClient } from '@/lib/supabase/server'
import { tbankInit, tbankGetQr, tbankGetState } from '@/lib/tbank'
import { revalidatePath } from 'next/cache'

export async function createInvoice(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Не авторизован' }

  const amountRub = Number(formData.get('amount'))
  const description = (formData.get('description') as string)?.trim()
  const clientId = formData.get('client_id') as string | null
  const email = (formData.get('email') as string)?.trim() || undefined
  const phone = (formData.get('phone') as string)?.trim() || undefined

  if (!amountRub || amountRub <= 0) return { error: 'Укажите сумму' }
  if (!description) return { error: 'Укажите назначение платежа' }
  if (!email && !phone) return { error: 'Укажите email или телефон для чека' }

  const amountKopecks = Math.round(amountRub * 100)
  const orderId = `GAS-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`

  // 1. Init payment
  const initRes = await tbankInit({
    amount: amountKopecks,
    orderId,
    description,
    email,
    phone,
  })

  console.log('[T-Bank Init] request:', { amount: amountKopecks, orderId, description })
  console.log('[T-Bank Init] response:', JSON.stringify(initRes))

  if (!initRes.Success || !initRes.PaymentId) {
    return { error: `T-Bank: ${initRes.Message || 'Неизвестная ошибка'} (код ${initRes.ErrorCode}). Details: ${JSON.stringify(initRes.Details ?? '')}` }
  }

  // 2. Get SBP QR payload
  let sbpPayload: string | null = null
  const qrRes = await tbankGetQr(initRes.PaymentId)
  if (qrRes.Success && qrRes.Data) {
    sbpPayload = qrRes.Data
  }

  // 3. Save to DB
  const admin = await createAdminClient()
  const { error: dbError } = await admin.from('invoices').insert({
    client_id: clientId ? Number(clientId) : null,
    amount: amountRub,
    description,
    order_id: orderId,
    payment_id: initRes.PaymentId,
    payment_url: initRes.PaymentURL || null,
    sbp_payload: sbpPayload,
    status: initRes.Status || 'NEW',
    created_by: user.id,
  })

  if (dbError) return { error: dbError.message }

  revalidatePath('/admin/invoices')
  revalidatePath('/sales/invoices')
  return { success: true, paymentUrl: initRes.PaymentURL, sbpPayload }
}

export async function refreshInvoiceStatus(invoiceId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Не авторизован' }

  const admin = await createAdminClient()
  const { data: invoice } = await admin
    .from('invoices')
    .select('payment_id')
    .eq('id', invoiceId)
    .single()

  if (!invoice?.payment_id) return { error: 'Счёт не найден' }

  const stateRes = await tbankGetState(invoice.payment_id)

  if (!stateRes.Success) {
    return { error: stateRes.Message || 'Ошибка запроса статуса' }
  }

  await admin
    .from('invoices')
    .update({ status: stateRes.Status, updated_at: new Date().toISOString() })
    .eq('id', invoiceId)

  revalidatePath('/admin/invoices')
  revalidatePath('/sales/invoices')
  return { success: true, status: stateRes.Status }
}
