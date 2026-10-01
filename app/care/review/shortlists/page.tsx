/**
 * Проверка подборок — очередь «1 из N».
 *
 * Последний незакрытый экран этапа 5. Подборка на клиента одна, и без очереди
 * она просто забывается: в отличие от задачи, у неё нет срока, который о себе
 * напомнит.
 */
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { сессияКонтура } from '@/lib/care/session'
import { очередьПодборок } from '@/lib/care/cases'
import { склонение } from '@/lib/care/labels'
import { ShortlistQueue, type Подборка } from './ShortlistQueue'

export const dynamic = 'force-dynamic'

export default async function ПодборкиНаПроверкуСтраница() {
  const сессия = await сессияКонтура()
  if (!сессия?.участник || !сессия.интерфейсОткрыт) notFound()

  const очередь = (await очередьПодборок(сессия.участник)) as Подборка[]

  return (
    <>
      <h1 className="ds-hero-h1" style={{ fontSize: 30, marginBottom: 4 }}>
        Проверка подборок
      </h1>
      <p style={{ marginBottom: 10 }}>
        <Link href="/care/review" className="ds-link" style={{ fontSize: 14 }}>
          ← Черновики сведений
        </Link>
      </p>
      <p style={{ color: 'var(--ds-muted)', marginBottom: 22, fontSize: 14 }}>
        {очередь.length === 0
          ? 'Ничего не ждёт вашего решения'
          : `${очередь.length} ${склонение(очередь.length, 'подборка ждёт', 'подборки ждут', 'подборок ждут')} решения`}
      </p>

      <ShortlistQueue очередь={очередь} />
    </>
  )
}
