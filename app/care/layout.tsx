/**
 * Оболочка кабинета куратора v2. Разделы 3.1–3.4 дизайн-документа.
 *
 * Три решения принимаются здесь и больше нигде.
 *
 * ПЕРВОЕ: 404 вместо редиректа, если доступа нет. Перенаправление на вход
 * или в старый кабинет сообщает, что раздел существует. Пока кабинет закрыт
 * флагом, посторонний не должен узнать о нём даже этого.
 *
 * ВТОРОЕ: полоса среды над всем, включая сайдбар. Она не закрывается и не
 * скрывается: куратор на пилоте обязан одним взглядом понимать, куда уйдёт
 * сообщение. В production её нет вовсе — это единственное отличие каркаса
 * между средами.
 *
 * ТРЕТЬЕ: дизайн-система общая с действующим кабинетом. `ds.css` берётся
 * оттуда без изменений, а `care.css` только добавляет — ветка v2 систему не
 * форкает.
 */
import { notFound } from 'next/navigation'
import { Geist, Oswald } from 'next/font/google'
import '../curator/ds.css'
import './care.css'
import { сессияКонтура, кабинетОткрыт } from '@/lib/care/session'
import { режим } from '@/lib/care/mode'
import { счётчикиНавигации } from '@/lib/care/cases'
import { CareNav, type ПунктМеню } from './CareNav'

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
  // заведён ли человек в контуре и открыт ли ему интерфейс. Само правило
  // живёт в lib/care/session.ts и покрыто тестом.
  if (!кабинетОткрыт(сессия)) notFound()

  const [состояние, счётчики] = await Promise.all([режим(), счётчикиНавигации(сессия.участник)])

  const боевой = состояние.mode === 'prod' && состояние.external_sends

  const пункты: ПунктМеню[] = [
    { href: '/care', подпись: 'Главная' },
    { href: '/care/cases', подпись: 'Клиенты', бейдж: счётчики.клиентов },
    {
      href: '/care/review',
      подпись: 'На проверку',
      бейдж: счётчики.наПроверку,
      уровень: счётчики.естьПросроченные ? 'error' : счётчики.естьСрочные ? 'amber' : 'обычный',
    },
  ]
  if (сессия.участник.care_role === 'lead') {
    пункты.push({ href: '/care/team', подпись: 'Команда' })
    // Переключение кабинетов — решение руководителя, и до него должно быть
    // видно из меню: иначе оно остаётся тем, что делают через терминал.
    пункты.push({ href: '/care/admin/switch', подпись: 'Кабинеты' })
  }

  return (
    <div className={`${geist.variable} ${oswald.variable} ds-scope`}>
      {!боевой && (
        <div className="care-env">
          Тестовая среда · внешние отправки выключены · данные синтетические
        </div>
      )}

      <div className="care-shell">
        <nav className="care-side">
          <div
            style={{
              fontFamily: 'var(--ds-font-display), sans-serif',
              fontWeight: 700,
              fontSize: 17,
              padding: '4px 12px 16px',
            }}
          >
            goandstudy
          </div>

          <CareNav пункты={пункты} />

          <div style={{ marginTop: 'auto', paddingTop: 16 }}>
            <div className="care-nav-sep" />
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px' }}>
              <span className="care-ava">{(сессия.имя ?? '??').slice(0, 2).toUpperCase()}</span>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {сессия.имя ?? 'без имени'}
                </div>
                <div style={{ fontSize: 11, color: 'var(--ds-muted)' }}>
                  {сессия.участник.care_role === 'lead' ? 'руководитель' : 'куратор'}
                </div>
              </div>
            </div>
          </div>
        </nav>

        <main className="care-main">{children}</main>
      </div>
    </div>
  )
}
