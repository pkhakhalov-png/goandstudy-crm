/**
 * Переключение клиентов между кабинетами. Раздел 5 плана.
 *
 * ЗАЧЕМ ЭКРАН, КОГДА ЕСТЬ СКРИПТ. Пилот растёт ступенями: 10–20 клиентов,
 * потом 30–50. Каждый перевод через терминал — это я, а не руководитель
 * контура. Экран убирает посредника из решения, которое принимает он.
 *
 * Чек-лист и сама работа общие со скриптом (`lib/care/switch.ts`): два списка
 * проверок разъехались бы, и экран однажды перевёл бы клиента, которого скрипт
 * переводить отказался.
 */
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { сессияКонтура } from '@/lib/care/session'
import { видимыеДела } from '@/lib/care/access'
import { ктоГде } from '@/lib/care/switch'
import { картинаОтправок } from '@/lib/care/sends'
import { SwitchList } from './SwitchList'
import { SendsList } from '../SendsList'

export const dynamic = 'force-dynamic'

export default async function ПереключениеСтраница() {
  const сессия = await сессияКонтура()
  if (!сессия?.участник || !сессия.интерфейсОткрыт) notFound()
  // Только руководителю: перевод решает, какая система ведёт живого человека.
  if (сессия.участник.care_role !== 'lead') notFound()

  const область = await видимыеДела(сессия.участник)
  const [строки, отправки] = await Promise.all([
    область.пусто ? Promise.resolve([]) : ктоГде(область.дела),
    картинаОтправок(область.пусто ? [] : область.дела),
  ])

  return (
    <>
      <h1 className="ds-hero-h1" style={{ fontSize: 30, marginBottom: 4 }}>
        Кабинеты и отправки
      </h1>
      <p style={{ marginBottom: 10 }}>
        <Link href="/care/team" className="ds-link" style={{ fontSize: 14 }}>
          ← Работа команды
        </Link>
      </p>
      <p style={{ color: 'var(--ds-muted)', marginBottom: 22, fontSize: 14, maxWidth: 680, lineHeight: 1.6 }}>
        Перевод обратим. Пока клиент на старом кабинете, автоматика нового его не видит вовсе:
        ни напоминаний, ни разбора переписки, ни подборок. Возврат останавливает работу — задания
        отменяются, ждущие предложения гаснут, — но ничего не удаляет.
      </p>

      <SwitchList строки={строки} />

      <div style={{ marginTop: 28 }}>
        <SendsList картина={отправки} />
      </div>
    </>
  )
}
