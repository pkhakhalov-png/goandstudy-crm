/**
 * Журнал отправок. Этап 3 плана: «unknown остаётся на ручную проверку lead'а,
 * показывается отдельно».
 *
 * До сих пор этого экрана не было вовсе: `неизвестныеИсходы()` возвращала
 * строки, которые никто не читал, а на вопрос «мы точно отправили?» в кабинете
 * ответа не было.
 */
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { сессияКонтура } from '@/lib/care/session'
import { видимыеДела } from '@/lib/care/access'
import { отправки } from '@/lib/care/outbox'
import { SendsLog } from './SendsLog'

export const dynamic = 'force-dynamic'

export default async function ОтправкиСтраница() {
  const сессия = await сессияКонтура()
  if (!сессия?.участник || !сессия.интерфейсОткрыт) notFound()

  const область = await видимыеДела(сессия.участник)
  const список = область.пусто ? { неизвестные: [], последние: [] } : await отправки(область.дела)

  return (
    <>
      <h1 className="ds-hero-h1" style={{ fontSize: 30, marginBottom: 4 }}>
        Что ушло клиентам
      </h1>
      <p style={{ marginBottom: 10 }}>
        <Link href="/care/review" className="ds-link" style={{ fontSize: 14 }}>
          ← На проверку
        </Link>
      </p>
      <p style={{ color: 'var(--ds-muted)', marginBottom: 22, fontSize: 14, maxWidth: 680, lineHeight: 1.6 }}>
        Каждая строка здесь — сообщение, которое человек утвердил. Автомат сам не отправляет
        ничего. Отметка «дошло» фиксирует то, что вы увидели в чате, и ничего не пересылает.
      </p>

      <SendsLog отправки={список} />
    </>
  )
}
