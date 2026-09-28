/**
 * Оболочка кабинета куратора v2.
 *
 * Три решения принимаются здесь и больше нигде.
 *
 * ПЕРВОЕ: 404 вместо редиректа, если доступа нет. Перенаправление на страницу
 * входа или в старый кабинет сообщает, что раздел существует. Пока кабинет
 * закрыт флагом, посторонний не должен узнать о нём даже этого.
 *
 * ВТОРОЕ: полоса среды сверху. Пока контур живёт на превью и наружу ничего не
 * отправляет, человек, открывший его в соседней вкладке с рабочей CRM, обязан
 * видеть разницу без вглядывания в адресную строку.
 *
 * ТРЕТЬЕ: `ds-scope` и шрифты — те же, что в действующем кабинете куратора.
 * Дизайн-система одна, и ветка v2 её не форкает.
 */
import { notFound } from 'next/navigation'
import { Geist, Oswald } from 'next/font/google'
import Link from 'next/link'
import '../curator/ds.css'
import { сессияКонтура } from '@/lib/care/session'
import { режим } from '@/lib/care/mode'

const geist = Geist({
  subsets: ['latin', 'cyrillic'],
  weight: ['400', '500', '600', '700'],
  variable: '--ds-font-body',
  display: 'swap',
})

const oswald = Oswald({
  subsets: ['latin', 'cyrillic'],
  weight: ['500', '600', '700'],
  variable: '--ds-font-display',
  display: 'swap',
})

export const dynamic = 'force-dynamic'

export default async function CareLayout({ children }: { children: React.ReactNode }) {
  const сессия = await сессияКонтура()

  // Роль в CRM проверяет middleware. Здесь — то, чего он проверить не может:
  // заведён ли человек в контуре и открыт ли ему интерфейс.
  if (!сессия || !сессия.участник || !сессия.интерфейсОткрыт) {
    notFound()
  }

  const состояние = await режим()
  const боевой = состояние.mode === 'prod' && состояние.external_sends

  return (
    <div className={`${geist.variable} ${oswald.variable} ds-scope`} style={{ minHeight: '100vh' }}>
      {!боевой && (
        <div
          style={{
            background: 'var(--ds-amber-soft)',
            borderBottom: '1px solid var(--ds-amber)',
            padding: '6px 16px',
            fontSize: 12,
            textAlign: 'center',
            color: 'var(--ds-ink-dim)',
          }}
        >
          Тестовый контур · режим «{состояние.mode}» · наружу ничего не отправляется
        </div>
      )}

      <header
        style={{
          borderBottom: '1px solid var(--ds-border)',
          padding: '12px 16px',
          display: 'flex',
          alignItems: 'center',
          gap: 20,
          flexWrap: 'wrap',
        }}
      >
        <Link href="/care/cases" className="ds-link" style={{ fontWeight: 600 }}>
          Дела
        </Link>
        {сессия.участник.care_role === 'lead' && (
          <Link href="/care/team" className="ds-link">
            Команда
          </Link>
        )}
        <span style={{ marginLeft: 'auto', fontSize: 13, color: 'var(--ds-muted)' }}>
          {сессия.имя ?? 'без имени'} · {сессия.участник.care_role}
        </span>
      </header>

      <main style={{ padding: '24px 16px', maxWidth: 1100, margin: '0 auto' }}>{children}</main>
    </div>
  )
}
