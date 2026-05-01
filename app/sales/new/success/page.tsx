import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { createClientInvitation } from '@/lib/invitation'
import { CopyInviteLink } from './CopyInviteLink'

export const dynamic = 'force-dynamic'

export default async function NewClientSuccessPage({
  searchParams,
}: {
  searchParams: Promise<{ clientId?: string }>
}) {
  const sp = await searchParams
  const clientId = Number(sp.clientId)
  if (!clientId) redirect('/sales')

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const admin = await createAdminClient()
  const { data: client } = await admin
    .from('clients').select('id, name, email, country, curator_id').eq('id', clientId).maybeSingle()
  if (!client) redirect('/sales')

  // Генерируем (или достаём существующую) invite-ссылку
  const invite = await createClientInvitation(clientId, user.id)

  return (
    <div style={{ maxWidth: 640, margin: '40px auto', padding: '0 24px', fontFamily: '-apple-system, sans-serif' }}>
      <div style={{
        background: '#fff', border: '1px solid rgba(0,0,0,.07)', borderRadius: 14,
        padding: 32, boxShadow: '0 1px 4px rgba(0,0,0,.07)',
      }}>
        <div style={{ fontSize: 56, marginBottom: 12, textAlign: 'center' }}>✅</div>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: '0 0 8px', textAlign: 'center' }}>
          Клиент создан
        </h1>
        <p style={{ fontSize: 14, color: '#8a8796', textAlign: 'center', marginTop: 0, marginBottom: 28, lineHeight: 1.5 }}>
          <b style={{ color: '#14121e' }}>{client.name}</b>, {client.country}<br />
          {client.email}
        </p>

        {invite.ok ? (
          <>
            <div style={{
              fontSize: 11, fontWeight: 700, letterSpacing: '0.06em',
              textTransform: 'uppercase', color: '#8a8796', marginBottom: 8,
            }}>
              Ссылка для активации кабинета (срок 30 дней)
            </div>
            <CopyInviteLink url={invite.url} />

            <div style={{
              marginTop: 16, padding: '12px 14px',
              background: invite.emailSent ? 'rgba(22,163,97,.08)' : 'rgba(255,193,7,.08)',
              border: `1px solid ${invite.emailSent ? 'rgba(22,163,97,.25)' : 'rgba(255,193,7,.3)'}`,
              borderRadius: 8, fontSize: 13, lineHeight: 1.5,
            }}>
              {invite.emailSent ? (
                <>✓ Email с инструкцией отправлен на <b>{client.email}</b></>
              ) : (
                <>⚠ Email не отправлен{invite.emailError ? ` (${invite.emailError})` : ''} — отправь клиенту ссылку вручную через Telegram/WhatsApp.</>
              )}
            </div>
          </>
        ) : (
          <div style={{
            padding: '12px 14px',
            background: 'rgba(220,53,69,.08)', border: '1px solid rgba(220,53,69,.25)',
            borderRadius: 8, fontSize: 13, color: '#dc3545',
          }}>
            Не удалось сгенерировать invite-ссылку: {invite.error}
            <br />Создай ссылку вручную в админке.
          </div>
        )}

        <div style={{ marginTop: 28, display: 'flex', gap: 10 }}>
          <Link href="/sales" className="btn-p" style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}>
            К списку клиентов
          </Link>
          <Link href="/sales/new" className="btn-s" style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}>
            + Ещё клиент
          </Link>
        </div>
      </div>
    </div>
  )
}
