'use client'

import Link from 'next/link'
import { DemoTopNav } from '../DemoTopNav'
import { DemoDocumentsSection } from '../components/DemoDocumentsSection'

export default function DemoDocumentsPage() {
  return (
    <>
      <DemoTopNav activePage="documents" />
      <main style={{ maxWidth: 1100, margin: '0 auto', padding: '24px 32px 80px' }}>
        <Link href="/demo" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--ds-ink-dim)', textDecoration: 'none', marginBottom: 24 }}>
          ← Назад на главную
        </Link>
        <header style={{ marginBottom: 32 }}>
          <h1 style={{ fontFamily: 'var(--ds-font-display-stack)', fontWeight: 700, fontSize: 32, letterSpacing: '0.02em', margin: 0 }}>
            Документы
          </h1>
          <p style={{ fontSize: 13, color: 'var(--ds-ink-dim)', marginTop: 8 }}>
            Загружай сканы — куратор проверит и подскажет если что-то не так. Файлы хранятся в этой вкладке и сбрасываются при её закрытии.
          </p>
        </header>
        <DemoDocumentsSection />
      </main>
    </>
  )
}
