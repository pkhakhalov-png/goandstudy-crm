import { createAdminClient } from '@/lib/supabase/server'
import { contentOverview, ago, ru } from '@/lib/content/overview'
import { Число, Статусы, Пробелы, Пусто } from './Bits'

export const dynamic = 'force-dynamic'

/**
 * Обзор контент-машины.
 *
 * Экран отвечает на вопрос «работает ли это и где стоит». Пока не работает
 * ничего, и главное здесь — сказать об этом словами, а не показать столбик
 * нулей: ноль публикаций читается как «выпустили ноль», а на самом деле пока
 * «выпускать некуда и нечего».
 */
export default async function ContentOverview() {
  const content = (await createAdminClient()).schema('content' as any)

  let o
  try {
    o = await contentOverview(content)
  } catch (e: any) {
    return (
      <Пусто что="Схема content не читается"
        почему={`${String(e?.message ?? e)}. Проверить: схема открыта в Settings → Data API → Exposed schemas, миграции применены.`} />
    )
  }

  const пустаяМашина = o.packages.total === 0 && o.publications.total === 0 && o.channels.total === 0

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div>
        <h2 style={{ margin: '0 0 4px' }}>Обзор</h2>
        <div style={{ fontSize: 12, color: 'var(--muted)' }}>
          Снято {new Date(o.takenAt).toLocaleTimeString('ru')}. Обновляется при открытии страницы.
        </div>
      </div>

      {пустаяМашина ? (
        <Пусто
          что="Машина собрана, но ещё не запущена"
          почему={
            'Схема, событийный мост, снятие устаревшего и планирование выпуска готовы и проверены на живых данных. '
            + 'Ни одного пакета, канала и публикации пока нет — и это не ноль как результат, а незаконченная сборка. '
            + 'Ниже перечислено, чего именно не хватает, чтобы числа начали что-то значить.'
          }
        />
      ) : null}

      <section style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <Число label="Пакеты" value={o.packages.total}
          note={o.packages.total ? `${o.packages.withVersion} с текущей версией, версий всего ${o.versions}` : 'ни одного'} />
        <Число label="Варианты" value={o.variants.total}
          note={o.variants.total ? Object.entries(o.variants.byFormat).map(([k, n]) => `${ru(k)} ${n}`).join(', ') : 'адаптация не запускалась'} />
        <Число label="Публикации" value={o.publications.total}
          note={o.publications.nextSlot ? `ближайший слот ${new Date(o.publications.nextSlot).toLocaleString('ru')}` : 'ни одной в плане'} />
        <Число label="Каналы" value={o.channels.total}
          note={o.channels.total ? `включено ${o.channels.active}, приостановлено ${o.channels.paused}` : 'ни одного'}
          tone={o.channels.total > 0 && o.channels.active === 0 ? 'тревожный' : 'обычный'} />
        <Число label="Требуют внимания" value={o.attention.open}
          note={o.attention.oldestOpenedAt ? `старейший ${ago(o.attention.oldestOpenedAt)}` : 'открытых вопросов нет'}
          tone={o.attention.open ? 'важный' : 'обычный'} />
        <Число label="События ждут разбора" value={o.outbox.unprocessed}
          note={`всего событий ${o.outbox.total}`}
          tone={o.outbox.unprocessed ? 'тревожный' : 'обычный'} />
      </section>

      {o.publications.total ? (
        <section>
          <h3 style={{ fontSize: 13, margin: '0 0 8px', color: 'var(--muted)' }}>ПУБЛИКАЦИИ ПО СОСТОЯНИЮ</h3>
          <Статусы counts={o.publications.byStatus} />
        </section>
      ) : null}

      {o.reviews.total ? (
        <section>
          <h3 style={{ fontSize: 13, margin: '0 0 8px', color: 'var(--muted)' }}>ПРОВЕРКИ</h3>
          <Статусы counts={o.reviews.byVerdict} />
        </section>
      ) : null}

      <Пробелы items={o.gaps} />
    </div>
  )
}
