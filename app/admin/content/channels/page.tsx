import { createAdminClient } from '@/lib/supabase/server'
import { ru, ago } from '@/lib/content/overview'
import { Пусто, Таблица } from '../Bits'

export const dynamic = 'force-dynamic'

/**
 * Каналы: куда вообще можно выпускать.
 *
 * Отдельная колонка «проверено вызовом» стоит здесь не для красоты. Запись в
 * справочнике возможностей без ссылки на успешный вызов означает «мы так
 * думаем», а не «площадка это умеет», и разница выясняется в тот момент, когда
 * пост уходит не туда или не так.
 */
export default async function ChannelsPage() {
  const content = (await createAdminClient()).schema('content' as any)

  const { data: chans, error } = await content
    .from('channels')
    .select('id, platform, account_external_id, title, timezone, mode, daily_cap, max_catch_up, policy_id, created_at')
    .order('id')

  if (error) return <Пусто что="Каналы не прочитались" почему={error.message} />

  const { data: caps } = await content.from('connector_capabilities')
    .select('platform, account_external_id, verified_actions, proof_ref, checked_at')

  if (!chans?.length) {
    return (
      <>
        <h2 style={{ margin: '0 0 12px' }}>Каналы</h2>
        <Пусто
          что="Каналов нет"
          почему={
            'Пока не заведён ни один канал, планировать выпуск некуда, и все числа про публикации будут нулями '
            + 'не потому, что мы ничего не выпустили, а потому, что выпускать некуда. Канал заводится '
            + 'приостановленным: включение — отдельное решение человека, а не побочный эффект создания.'
          }
        />
      </>
    )
  }

  const capOf = (c: any) => (caps ?? []).find((k: any) =>
    k.platform === c.platform && (k.account_external_id === c.account_external_id || !k.account_external_id))

  return (
    <>
      <h2 style={{ margin: '0 0 12px' }}>Каналы</h2>
      <Таблица
        columns={['Канал', 'Площадка', 'Режим', 'Зона', 'Темп', 'Догон', 'Возможности']}
        rows={(chans as any[]).map((c) => {
          const cap = capOf(c)
          const проверено = cap?.proof_ref ? 'проверено вызовом' : cap ? 'записано, но не проверено' : 'не проверяли'
          return [
            <span key="t">{c.title ?? c.account_external_id}</span>,
            c.platform,
            <span key="m" style={{ color: c.mode === 'active' ? 'var(--green)' : 'var(--muted)' }}>{ru(c.mode)}</span>,
            c.timezone,
            `${c.daily_cap} в день`,
            String(c.max_catch_up),
            <span key="c" style={{ color: cap?.proof_ref ? 'var(--green)' : 'var(--muted)' }}>
              {проверено}{cap?.checked_at ? ` · ${ago(cap.checked_at)}` : ''}
            </span>,
          ]
        })}
      />
      <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 10, lineHeight: 1.6 }}>
        «Записано, но не проверено» значит, что возможности площадки взяты из документации, а не из
        успешного вызова. До проверки вызовом любые выводы о ссылках и переходах — оценка, а не измерение.
      </div>
    </>
  )
}
