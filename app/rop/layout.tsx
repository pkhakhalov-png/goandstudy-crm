import { redirect } from 'next/navigation'
import { viewer, initialsOf } from '@/lib/auth/viewer'
import { RopSidebar } from './RopSidebar'

/**
 * Оболочка раздела руководителя отдела продаж.
 *
 * Та же причина, что и в админке: пока сайдбар рисовала каждая страница, при
 * переходе перерисовывался весь экран — меню исчезало вместе с пунктом, по
 * которому только что нажали. Теперь оно живёт здесь и при переходах остаётся
 * на месте, а меняется только содержимое справа.
 */
export default async function RopLayout({ children }: { children: React.ReactNode }) {
  const { user, profile } = await viewer()
  if (!user) redirect('/login')
  if (profile?.role !== 'rop' && profile?.role !== 'admin') redirect('/sales')

  const initials = initialsOf(profile?.name, user.email, 'РП')

  return (
    <div className="app">
      <RopSidebar userName={profile?.name || ''} userEmail={user.email || ''} initials={initials} />
      {children}
    </div>
  )
}
