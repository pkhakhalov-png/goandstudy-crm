import { createAdminClient } from '@/lib/supabase/server'
import { ru, ago } from '@/lib/content/overview'
import { Пусто, Таблица } from '../Bits'
import { Закрыть } from './Resolve'

export const dynamic = 'force-dynamic'

/**
 * Требуют внимания.
 *
 * Сюда попадает то, что не блокирует, но и не должно молча исчезнуть:
 * разногласие двух проверок, вышедший пост на устаревшей версии, прошедший
 * слот. Код сюда не отвечает за человека — открытый вопрос означает «ждём»,
 * и планировщик его обходить не будет.
 */
export default async function AttentionPage() {
  const content = (await createAdminClient()).schema('content' as any)

  const { data: items, error } = await content
    .from('attention_items')
    .select('id, reason_code, severity, entity_type, entity_id, entity_version, owner, suggested_action, resolution, opened_at, resolved_at')
    .is('resolved_at', null)
    .order('severity', { ascending: false })
    .order('opened_at')
    .limit(200)

  if (error) return <Пусто что="Очередь внимания не прочиталась" почему={error.message} />

  const { count: resolved } = await content.from('attention_items')
    .select('*', { count: 'exact', head: true }).not('resolved_at', 'is', null)

  if (!items?.length) {
    return (
      <>
        <h2 style={{ margin: '0 0 12px' }}>Требуют внимания</h2>
        <Пусто
          что="Открытых вопросов нет"
          почему={
            `Это честный ноль: очередь читается, вопросов в ней нет. Закрытых за всё время — ${resolved ?? 0}. `
            + 'Сюда попадает то, что не блокирует, но и не должно исчезнуть молча: разногласие двух проверок, '
            + 'вышедший пост на устаревшей версии, прошедший слот.'
          }
        />
      </>
    )
  }

  const ПРИЧИНЫ: Record<string, string> = {
    published_on_superseded_version: 'пост вышел на устаревшей версии',
    slot_expired: 'слот прошёл, пост не вышел',
    reviewers_disagree: 'проверки разошлись',
  }

  return (
    <>
      <h2 style={{ margin: '0 0 4px' }}>Требуют внимания</h2>
      <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 12 }}>
        Открыто {items.length}, закрыто за всё время {resolved ?? 0}.
      </div>
      <Таблица
        columns={['Важность', 'Что случилось', 'К чему относится', 'Что решить', 'Открыт', '']}
        rows={(items as any[]).map((a) => [
          <span key="s" style={{ color: a.severity === 'high' ? 'var(--red)' : a.severity === 'medium' ? 'var(--purple)' : 'var(--muted)' }}>
            {ru(a.severity)}
          </span>,
          ПРИЧИНЫ[a.reason_code] ?? a.reason_code,
          a.entity_type ? `${a.entity_type} #${a.entity_id}${a.entity_version ? ` в. ${a.entity_version}` : ''}` : '—',
          <span key="a" style={{ lineHeight: 1.5 }}>{a.suggested_action ?? '—'}</span>,
          ago(a.opened_at) ?? '—',
          <Закрыть key="z" id={a.id} />,
        ])}
      />
    </>
  )
}
