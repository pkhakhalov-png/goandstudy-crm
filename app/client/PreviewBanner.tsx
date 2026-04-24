import Link from 'next/link'

export function PreviewBanner({ clientName, clientId }: { clientName: string; clientId: number }) {
  return (
    <div
      style={{
        background: 'var(--ds-amber-soft, #FFF4D6)',
        borderBottom: '1px solid var(--ds-amber, #E8B844)',
        padding: '10px 24px',
        fontSize: 13,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 14,
        color: 'var(--ds-ink)',
      }}
    >
      <span style={{ fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', fontSize: 11 }}>
        Preview
      </span>
      <span>
        Ты смотришь кабинет клиента <b>{clientName}</b> (id {clientId}) в режиме куратора.
      </span>
      <Link
        href={`/curator/clients/${clientId}`}
        style={{
          color: 'var(--ds-purple)',
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          fontSize: 11,
          textDecoration: 'none',
        }}
      >
        ← В рабочее пространство
      </Link>
    </div>
  )
}
