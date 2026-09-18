import Link from 'next/link'
import { createAdminClient } from '@/lib/supabase/server'
import { подготовить } from '@/lib/content/manual-publish'
import { ru, ago } from '@/lib/content/overview'
import { Пусто } from '../Bits'
import { Метка } from '../channels/Кусочки'
import { Выкладка } from './Действия'

export const dynamic = 'force-dynamic'

/**
 * Очередь ручной выкладки.
 *
 * Площадок, где материал публикуется руками, у нас больше, чем с API, и список
 * открыт. Поэтому экран один и не знает про конкретные площадки: он показывает
 * готовый текст со ссылкой, у которой уже стоят метки, и принимает обратно
 * адрес поста. Новая площадка появляется настройкой канала, а не релизом.
 */
export default async function ExportPage() {
  const content = (await createAdminClient()).schema('content' as any)

  const { data: каналы } = await content.from('channels')
    .select('id, platform, title, account_external_id, delivery, timezone, mode')
    .eq('delivery', 'manual')

  if (!каналы?.length) {
    return (
      <>
        <h2 style={{ margin: '0 0 12px' }}>Ждут рук</h2>
        <Пусто
          что="Ручных площадок не заведено"
          почему={
            'Ручная площадка — это канал со способом доставки «руками»: машина готовит материал целиком, '
            + 'а публикует человек. Так работают VC, Дзен, TenChat и большинство мест, где API либо нет, '
            + 'либо его не выдают. Заводится как обычный канал — на экране «Каналы».'
          }
        />
      </>
    )
  }

  const ids = (каналы as any[]).map((c) => c.id)
  const { data: пабы } = await content.from('publications')
    .select('id, channel_id, variant_version_id, scheduled_at, status, remote_url')
    .in('channel_id', ids).in('status', ['scheduled', 'publishing'])
    .order('scheduled_at')

  const vvIds = [...new Set((пабы ?? []).map((p: any) => p.variant_version_id))]
  const { data: версии } = vvIds.length
    ? await content.from('variant_versions').select('id, variant_id, version, body_json').in('id', vvIds)
    : { data: [] as any[] }
  const varIds = [...new Set((версии ?? []).map((v: any) => v.variant_id))]
  const { data: варианты } = varIds.length
    ? await content.from('variants').select('id, package_id, format, editorial_angle').in('id', varIds)
    : { data: [] as any[] }

  const сейчас = Date.now()

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap', marginBottom: 4 }}>
        <h2 style={{ margin: 0 }}>Ждут рук</h2>
        <span style={{ fontSize: 12, color: 'var(--muted)' }}>
          {(пабы ?? []).length
            ? `${(пабы ?? []).length} материалов на ${каналы.length} площадках`
            : `${каналы.length} ручных площадок, материала в очереди нет`}
        </span>
      </div>

      {!пабы?.length ? (
        <div style={{ marginTop: 12 }}>
          <Пусто
            что="Очередь пуста"
            почему={
              'Материал попадает сюда, когда одобренный вариант встаёт в слот ручного канала. '
              + 'Пустая очередь при работающей машине значит, что до планирования ничего не дошло, '
              + 'а не что публиковать нечего.'
            }
          />
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 12, marginTop: 14 }}>
          {(пабы as any[]).map((p) => {
            const канал = (каналы as any[]).find((c) => c.id === p.channel_id)
            const версия = (версии ?? []).find((v: any) => v.id === p.variant_version_id)
            const вариант = (варианты ?? []).find((v: any) => v.id === версия?.variant_id)
            const сырой = typeof версия?.body_json?.text === 'string' ? версия.body_json.text : ''
            const { текст, ссылка } = подготовить({
              текст: сырой, платформа: канал?.platform ?? 'unknown',
              публикацияId: p.id, пакетId: вариант?.package_id ?? null,
            })
            const просрочен = new Date(p.scheduled_at).getTime() < сейчас

            return (
              <div key={p.id} style={{ padding: '14px 16px', border: '1px solid var(--bor2)', borderRadius: 12, background: 'var(--surf)' }}>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                  <strong style={{ fontSize: 14 }}>{канал?.title || канал?.account_external_id}</strong>
                  <Метка тон="тихий">{канал?.platform}</Метка>
                  {вариант?.editorial_angle ? <Метка тон="тихий">угол «{вариант.editorial_angle}»</Метка> : null}
                  <span style={{ fontSize: 12, color: просрочен ? 'var(--red)' : 'var(--muted)' }}>
                    слот {new Date(p.scheduled_at).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                    {просрочен ? ` · ждёт ${ago(p.scheduled_at)}` : ''}
                  </span>
                  <span style={{ marginLeft: 'auto', fontSize: 12 }}>
                    <Link href={`/admin/content/publications/${p.id}`} style={{ color: 'var(--purple)' }}>публикация #{p.id}</Link>
                    <span style={{ color: 'var(--muted)' }}> · {ru(p.status)}</span>
                  </span>
                </div>

                <div style={{
                  whiteSpace: 'pre-wrap', fontSize: 13, lineHeight: 1.65, margin: '10px 0 0',
                  padding: '12px 14px', border: '1px solid var(--bor)', borderRadius: 10, background: 'var(--surf2)',
                }}>{текст || '— текст не сохранён'}</div>

                <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 8, lineHeight: 1.6 }}>
                  {ссылка
                    ? <>Ссылка в тексте уже с метками этой публикации — вставлять её надо целиком, вместе с хвостом после «?». Без хвоста переход не приписать никому.</>
                    : <>В тексте нет ссылки: переходы от этого поста считать будет нечем. Это не ошибка, если пост и не должен никуда вести.</>}
                </div>

                <Выкладка id={p.id} текст={текст} />
              </div>
            )
          })}
        </div>
      )}

      <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 16, lineHeight: 1.6, maxWidth: 780 }}>
        После отметки пост читается по указанному адресу — проверяем, что страница открывается и метка
        публикации в ней есть. Не прочитали — так и запишем: «не проверить» это не «пост не вышел», и в
        карточке публикации эти случаи выглядят по-разному.
      </div>
    </>
  )
}
