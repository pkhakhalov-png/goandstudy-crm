import { createAdminClient } from '@/lib/supabase/server'
import { ru, ago } from '@/lib/content/overview'
import { Пусто, Таблица } from '../Bits'

export const dynamic = 'force-dynamic'

/**
 * Выпуск в VK: что вышло, что выйдет, на сколько хватит запаса.
 *
 * Почему отдельный экран, а не строки в «Публикациях». Тот экран читает
 * `content.publications`, а там обязательны пакет, вариант и версия варианта —
 * цепочка контент-машины. Посты в VK собираются не ею: они берут готовую статью
 * блога и заранее загруженную фотографию. Заводить ради каждого поста пустой
 * пакет значило бы засорять учёт материала записями, которых там быть не должно.
 *
 * Главное, что должно быть видно с одного взгляда: идёт ли поток и когда он
 * встанет. Второе важнее первого — запас фотографий пополняется только руками
 * (ключ сообщества их не грузит, docs/spikes/vk.md), и узнать об этом заранее
 * можно только здесь или из тревоги сторожа.
 */
export default async function VkPage() {
  const seo = (await createAdminClient()).schema('seo' as any)

  const { data: строки, error } = await seo
    .from('vk_photo_pool')
    .select('id, slug, title, article_url, attachment, used_at, remote_post_id, remote_url, created_at')
    .order('id')

  if (error) {
    // Таблицы нет — миграция не применена. Это не поломка, а невыполненный шаг
    // настройки, и говорить о нём надо тем же тоном.
    return (
      <>
        <h2 style={{ margin: '0 0 12px' }}>Выпуск в VK</h2>
        <Пусто
          что="Запас публикаций не прочитался"
          почему={`${error.message}. Если таблицы ещё нет — применить миграцию `
            + `supabase/migrations/20260923000000_vk_autopost.sql и залить партию: npx tsx scripts/vk-pool-seed.ts`}
        />
      </>
    )
  }

  const { data: настройка } = await seo.from('settings').select('value').eq('key', 'vk_flow').maybeSingle()
  const flow: any = настройка?.value ?? {}
  const включён = Boolean(flow.enabled)
  const пауза = Number(flow.everyHours ?? 48)

  const все = (строки ?? []) as any[]
  const вышли = все.filter((с) => с.remote_post_id)
  const вЗапасе = все.filter((с) => !с.used_at)
  // Потрачена, но поста нет — публикация не удалась. Считаем отдельно: молчаливо
  // смешать это с запасом значило бы показать больше запаса, чем есть на самом деле.
  const потеряны = все.filter((с) => с.used_at && !с.remote_post_id)

  const последняя = вышли
    .map((с) => Date.parse(с.used_at))
    .filter(Boolean)
    .sort((a, b) => b - a)[0] ?? 0
  const следующая = последняя ? new Date(последняя + пауза * 3600 * 1000) : null
  const днейЗапаса = вЗапасе.length * (пауза / 24)

  if (!все.length) {
    return (
      <>
        <h2 style={{ margin: '0 0 12px' }}>Выпуск в VK</h2>
        <Пусто
          что="Запас пуст"
          почему={'Публиковать нечем: ни одной заготовки. Фотографии загружаются партией вручную — '
            + 'ключ сообщества их не грузит, а ключ пользователя живёт сутки. Порядок описан в docs/spikes/vk.md.'}
        />
      </>
    )
  }

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap', marginBottom: 4 }}>
        <h2 style={{ margin: 0 }}>Выпуск в VK</h2>
        <span style={{ fontSize: 12, color: 'var(--muted)' }}>
          {включён
            ? `поток идёт, пост раз в ${пауза} ч · вышло ${вышли.length} · в запасе ${вЗапасе.length}`
            : `поток выключен · вышло ${вышли.length} · в запасе ${вЗапасе.length}`}
        </span>
      </div>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', margin: '12px 0 18px' }}>
        <Плитка
          заголовок="Состояние"
          значение={включён ? 'идёт' : 'выключен'}
          цвет={включён ? 'var(--green)' : 'var(--muted)'}
          подпись={включён
            ? (следующая ? `следующий пост ${ru(следующая.toISOString())}` : 'первый пост выйдет с ближайшим тиком')
            : 'включается настройкой vk_flow.enabled'}
        />
        <Плитка
          заголовок="Запас картинок"
          значение={String(вЗапасе.length)}
          // Три штуки — тот же порог, на котором поднимает тревогу сторож.
          цвет={вЗапасе.length === 0 ? 'var(--red)' : вЗапасе.length <= 3 ? 'var(--purple)' : 'var(--green)'}
          подпись={вЗапасе.length === 0
            ? 'поток встанет: публиковать нечем'
            : `хватит примерно на ${Math.round(днейЗапаса)} дн.`}
        />
        <Плитка
          заголовок="Опубликовано"
          значение={String(вышли.length)}
          цвет="var(--text)"
          подпись={последняя ? `последний ${ago(new Date(последняя).toISOString())}` : 'пока ничего'}
        />
        {потеряны.length > 0 && (
          <Плитка
            заголовок="Не дошли"
            значение={String(потеряны.length)}
            цвет="var(--red)"
            подпись="картинка потрачена, поста нет"
          />
        )}
      </div>

      <Таблица
        columns={['Статья', 'Состояние', 'Когда', 'Пост']}
        rows={все
          // Свежие публикации сверху, запас — снизу в порядке очереди: экран
          // отвечает сначала на «что вышло», потом на «что будет дальше».
          .slice()
          .sort((a, b) => {
            const ta = a.used_at ? Date.parse(a.used_at) : 0
            const tb = b.used_at ? Date.parse(b.used_at) : 0
            if (ta !== tb) return tb - ta
            return a.id - b.id
          })
          .map((с) => {
            const состояние = с.remote_post_id
              ? { текст: 'опубликовано', цвет: 'var(--green)' }
              : с.used_at
                ? { текст: 'не дошло', цвет: 'var(--red)' }
                : { текст: 'в запасе', цвет: 'var(--muted)' }
            return [
              <a key="t" href={с.article_url} target="_blank" rel="noreferrer"
                style={{ color: 'var(--text)', textDecoration: 'none' }}>
                {с.title}
              </a>,
              <span key="s" style={{ color: состояние.цвет }}>{состояние.текст}</span>,
              с.used_at ? ru(с.used_at) : '—',
              с.remote_url
                ? <a key="l" href={с.remote_url} target="_blank" rel="noreferrer" style={{ color: 'var(--purple)' }}>
                    {String(с.remote_url).replace('https://vk.com/', '')}
                  </a>
                : '—',
            ]
          })}
      />

      <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 16, lineHeight: 1.6, maxWidth: 820 }}>
        Картинки загружаются партией заранее и тратятся по одной на пост. Загрузить их в момент
        публикации нельзя: ключу сообщества этот метод закрыт, а ключ пользователя живёт сутки.
        Когда запас подойдёт к концу, сторож напишет в чат — за несколько дней, а не в день остановки.
      </div>
    </>
  )
}

function Плитка({ заголовок, значение, подпись, цвет }: {
  заголовок: string; значение: string; подпись: string; цвет: string
}) {
  return (
    <div style={{
      padding: '10px 14px', border: '1px solid var(--bor2)', borderRadius: 10,
      background: 'var(--surf2)', minWidth: 150,
    }}>
      <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.6, color: 'var(--muted)' }}>{заголовок}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color: цвет, lineHeight: 1.3 }}>{значение}</div>
      <div style={{ fontSize: 11, color: 'var(--muted)' }}>{подпись}</div>
    </div>
  )
}
