import { redirect } from 'next/navigation'
import { viewer } from '@/lib/auth/viewer'
import { Sidebar } from './Sidebar'

/**
 * Общая оболочка админки: сайдбар и проверка доступа.
 *
 * Зачем он появился. Раньше каждая страница рисовала сайдбар сама. Для Next это
 * означало, что при переходе со страницы на страницу меняется всё дерево целиком:
 * сайдбар размонтируется и собирается заново. На экране это выглядело так, что
 * после нажатия весь интерфейс исчезал — вместе с пунктом, по которому только
 * что кликнули, — а потом появлялся заново. Человеку непонятно, нажалось ли
 * вообще.
 *
 * Теперь сайдбар живёт в оболочке и при переходах не перерисовывается. Меняется
 * только содержимое справа, а `loading.tsx` подставляет на это время заглушку —
 * тоже только справа.
 *
 * Проверка роли здесь же, одна на всю админку: раньше её повторяла каждая
 * страница, и это был лишний поход в базу при каждом открытии.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user, profile } = await viewer()
  if (!user) redirect('/login')
  if (profile?.role !== 'admin') redirect('/sales')

  return (
    <div className="app">
      <Sidebar userName={profile?.name || ''} userEmail={user.email || ''} />
      {children}
    </div>
  )
}
