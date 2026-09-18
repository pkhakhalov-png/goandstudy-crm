import Link from 'next/link'
import { createAdminClient } from '@/lib/supabase/server'
import { карточкиКаналов, сводка, ДОСТАВКА_RU } from '@/lib/content/channel-panel'
import { Пусто } from '../Bits'
import { НовыйКанал, Рубильник } from './Controls'
import { Состояние_, Метка, Числом } from './Кусочки'

export const dynamic = 'force-dynamic'

/**
 * Каналы: куда выпускаем и что там происходит.
 *
 * Наверху у каждого канала одна строка состояния и пять чисел. Всё остальное —
 * история, расписание, настройки, проблемы, метрики — лежит внутри карточки.
 * Разделение сделано нарочно: экран, показывающий сразу всё, перестают читать
 * через неделю, и тогда неважно, насколько точны его цифры.
 */
export default async function ChannelsPage() {
  const sb = await createAdminClient()
  const content = sb.schema('content' as any)
  const seo = sb.schema('seo')

  let карточки
  try {
    карточки = await карточкиКаналов(content, seo)
  } catch (e: any) {
    return <Пусто что="Каналы не прочитались" почему={String(e?.message ?? e)} />
  }

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap', marginBottom: 4 }}>
        <h2 style={{ margin: 0 }}>Каналы</h2>
        <span style={{ fontSize: 12, color: 'var(--muted)' }}>{сводка(карточки)}</span>
      </div>

      <div style={{ display: 'flex', gap: 10, margin: '12px 0 16px', flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <НовыйКанал />
        {карточки.length ? <Рубильник активных={карточки.filter((k) => k.режим === 'active').length} /> : null}
      </div>

      {!карточки.length ? (
        <Пусто
          что="Каналов нет"
          почему={
            'Пока не заведён ни один канал, планировать выпуск некуда, и все числа про публикации будут нулями '
            + 'не потому, что мы ничего не выпустили, а потому, что выпускать некуда. Канал заводится '
            + 'приостановленным: включение — отдельное решение человека, а не побочный эффект создания.'
          }
        />
      ) : (
        <div style={{ display: 'grid', gap: 10 }}>
          {карточки.map((к) => (
            <Link key={к.id} href={`/admin/content/channels/${к.id}`}
              style={{
                display: 'block', textDecoration: 'none', color: 'inherit',
                padding: '14px 16px', border: '1px solid var(--bor2)', borderRadius: 12, background: 'var(--surf)',
              }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <strong style={{ fontSize: 14 }}>{к.название}</strong>
                <span style={{ fontSize: 12, color: 'var(--muted)' }}>{к.аккаунт}</span>
                <Метка тон="тихий">{к.платформа}</Метка>
                <Метка тон="тихий">{ДОСТАВКА_RU[к.доставка].split(' — ')[0]}</Метка>
                <span style={{ marginLeft: 'auto' }}><Состояние_ с={к.состояние} /></span>
              </div>

              <div style={{ fontSize: 12, color: 'var(--muted)', margin: '6px 0 12px' }}>{к.строка}</div>

              <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
                <Числом label="вышло · 7 дн" мера={к.вышло7} />
                <Числом label="вышло · 30 дн" мера={к.вышло30} />
                <Числом label="в плане · нед" мера={к.вПлане7} />
                {к.доставка === 'manual'
                  ? <Числом label="ждут рук" мера={к.ждутРук} />
                  : <Числом label="заблокировано" мера={к.заблокировано} />}
                <Числом label="переходы · 30" мера={к.переходы30} />
                <Числом label="заявки · 30" мера={к.заявки30} />
              </div>
            </Link>
          ))}
        </div>
      )}

      <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 14, lineHeight: 1.6, maxWidth: 780 }}>
        Переходы и заявки — из CRM по меткам, и считаются только у публикаций с подтверждённой
        кликабельной ссылкой: если площадка ссылку переписала или не отдала, приписывать ей переходы
        значит выдумывать результат. Охваты приходят от самой площадки и с этими числами не
        складываются — это разные измерения разных вещей.
      </div>
    </>
  )
}
