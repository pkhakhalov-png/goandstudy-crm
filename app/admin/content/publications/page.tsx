import Link from 'next/link'
import { createAdminClient } from '@/lib/supabase/server'
import { ru, ago } from '@/lib/content/overview'
import { Пусто, Таблица } from '../Bits'

export const dynamic = 'force-dynamic'

/** Публикации: что ушло, что уходит, что не ушло. */
export default async function PublicationsPage() {
  const content = (await createAdminClient()).schema('content' as any)

  const { data: pubs, error } = await content
    .from('publications')
    .select('id, channel_id, variant_version_id, scheduled_at, status, remote_url, link_clickable, slot_day, caught_up_at, created_at')
    .order('scheduled_at', { ascending: false }).limit(100)

  if (error) return <Пусто что="Публикации не прочитались" почему={error.message} />

  if (!pubs?.length) {
    return (
      <>
        <h2 style={{ margin: '0 0 12px' }}>Публикации</h2>
        <Пусто
          что="Публикаций нет"
          почему={
            'Ни одна публикация ещё не планировалась. Планирование готово и проверено: занятый слот, '
            + 'превышенный темп, устаревший материал и повтор тезиса в план не проходят. Не хватает каналов '
            + 'и вариантов — то есть того, что планировать и куда.'
          }
        />
      </>
    )
  }

  const { data: chans } = await content.from('channels').select('id, title, account_external_id, platform')
  const chanOf = (id: number) => (chans ?? []).find((c: any) => c.id === id)

  const { data: attempts } = await content.from('publication_attempts')
    .select('publication_id, attempt, result, error').in('publication_id', (pubs as any[]).map((p) => p.id))

  return (
    <>
      <h2 style={{ margin: '0 0 12px' }}>Публикации</h2>
      <Таблица
        columns={['Публикация', 'Канал', 'Слот', 'Состояние', 'Ссылка', 'Переходы', 'Попыток']}
        rows={(pubs as any[]).map((p) => {
          const ch = chanOf(p.channel_id)
          const tries = (attempts ?? []).filter((a: any) => a.publication_id === p.id)
          const failed = tries.filter((a: any) => a.error)
          return [
            <span key="id">
              <Link href={`/admin/content/publications/${p.id}`} style={{ color: 'var(--purple)' }}>#{p.id}</Link>
              {p.caught_up_at ? <span style={{ color: 'var(--muted)', fontSize: 11 }}> · догнан</span> : null}
            </span>,
            ch ? `${ch.title ?? ch.account_external_id} (${ch.platform})` : `канал #${p.channel_id}`,
            <span key="s">{p.slot_day ?? '—'}<div style={{ fontSize: 11, color: 'var(--muted)' }}>{ago(p.scheduled_at) ?? ''}</div></span>,
            ru(p.status),
            p.remote_url
              ? <a key="u" href={p.remote_url} target="_blank" rel="noreferrer" style={{ color: 'var(--purple)' }}>открыть</a>
              : <span style={{ color: 'var(--muted)' }}>—</span>,
            // Ссылка некликабельна — переходы этой публикации не приписываются.
            // Пусто означает «не знаем», и это не то же самое, что «нет».
            p.link_clickable === true ? 'приписываются'
              : p.link_clickable === false ? <span style={{ color: 'var(--muted)' }}>не приписываются: ссылка некликабельна</span>
              : <span style={{ color: 'var(--muted)' }}>неизвестно</span>,
            failed.length ? <span key="a" style={{ color: 'var(--red)' }}>{tries.length}, из них с ошибкой {failed.length}</span> : String(tries.length),
          ]
        })}
      />
    </>
  )
}
