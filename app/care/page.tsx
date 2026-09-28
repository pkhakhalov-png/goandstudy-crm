/**
 * Корень кабинета.
 *
 * Пока лента внимания не собрана (этап 2), здесь показывать нечего — и
 * пустая страница была бы хуже честного перенаправления к списку дел.
 */
import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

export default function CarePage() {
  redirect('/care/cases')
}
