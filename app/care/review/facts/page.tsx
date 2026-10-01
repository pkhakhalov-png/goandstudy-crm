/**
 * Расхождения сведений — очередь «1 из N».
 *
 * Разбор переписки находил, что клиент сказал не то, что записано в карточке,
 * заводил конфликт и предложение — и на этом всё заканчивалось. Показать их
 * было некому: четыре расхождения лежали в базе невидимыми. Механизм, который
 * никто не видит, — это потраченные деньги и ложное чувство, что всё учтено.
 */
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { сессияКонтура } from '@/lib/care/session'
import { очередьРасхождений } from '@/lib/care/cases'
import { склонение } from '@/lib/care/labels'
import { FactQueue, type Расхождение } from './FactQueue'

export const dynamic = 'force-dynamic'

export default async function РасхожденияСтраница() {
  const сессия = await сессияКонтура()
  if (!сессия?.участник || !сессия.интерфейсОткрыт) notFound()

  const очередь = (await очередьРасхождений(сессия.участник)) as Расхождение[]

  return (
    <>
      <h1 className="ds-hero-h1" style={{ fontSize: 30, marginBottom: 4 }}>
        Расхождения в сведениях
      </h1>
      <p style={{ marginBottom: 10 }}>
        <Link href="/care/review" className="ds-link" style={{ fontSize: 14 }}>
          ← Черновики сведений
        </Link>
      </p>
      <p style={{ color: 'var(--ds-muted)', marginBottom: 22, fontSize: 14 }}>
        {очередь.length === 0
          ? 'Всё, что знаем о клиентах, сходится с тем, что они говорят'
          : `${очередь.length} ${склонение(очередь.length, 'расхождение ждёт', 'расхождения ждут', 'расхождений ждут')} решения`}
      </p>

      <FactQueue очередь={очередь} />
    </>
  )
}
