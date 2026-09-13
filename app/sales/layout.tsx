import { redirect } from 'next/navigation'
import { viewer, initialsOf } from '@/lib/auth/viewer'
import { SalesSidebar } from './SalesSidebar'

/**
 * Оболочка раздела продажника: сайдбар, который переживает переходы.
 *
 * Роль здесь намеренно не проверяется. Страницы раздела перекидывают админа и
 * руководителя каждая на свой адрес: из «Счетов» — в админские счета, из
 * «Календаря» — в админский календарь. Одна проверка в оболочке это потеряла бы
 * и увела бы всех на одну страницу. Поэтому проверка остаётся у страниц, а
 * профиль читается общей функцией — в базу за ним идут один раз на запрос.
 */
export default async function SalesLayout({ children }: { children: React.ReactNode }) {
  const { user, profile } = await viewer()
  if (!user) redirect('/login')

  return (
    <div className="app">
      <SalesSidebar
        userName={profile?.name || ''}
        userEmail={user.email || ''}
        initials={initialsOf(profile?.name, user.email, 'ПР')}
      />
      {children}
    </div>
  )
}
