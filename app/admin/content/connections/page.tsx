import Link from 'next/link'
import { createAdminClient } from '@/lib/supabase/server'
import {
  подключения, сводкаПодключений, ПУТЬ_СЛОВАМИ, СОСТОЯНИЕ_СЛОВАМИ,
  type Состояние,
} from '@/lib/content/platforms'
import { Пусто } from '../Bits'
import { Метка } from '../channels/Кусочки'
import { НовыйКанал } from '../channels/Controls'
import { Проверить } from './Проверка'

export const dynamic = 'force-dynamic'

const ЦВЕТ: Record<Состояние, string> = {
  подключено: 'var(--green)',
  частично: 'var(--purple)',
  не_проверено: 'var(--muted)',
  нет_секрета: 'var(--red)',
  нет_доступа: 'var(--red)',
  через_ленту: 'var(--purple)',
  нет_пути: 'var(--muted)',
  по_ssh: 'var(--green)',
  нет_коннектора: 'var(--red)',
}

/**
 * Подключения: куда мы можем публиковать и чего для этого не хватает.
 *
 * Экран каналов отвечает на вопрос «что происходит там, где мы уже выпускаем».
 * Этот — на предыдущий: куда мы вообще собираемся и что мешает начать. Пока не
 * заведён ни один канал, экран каналов пуст, и по нему не видно ни списка
 * площадок, ни того, что для каждой требуется.
 *
 * Главное правило здесь: «подключено» пишется только после живого вызова.
 * Заданная переменная окружения значит, что строка есть, — не что она рабочая и
 * не что у неё есть права на наш канал. Эти три случая с виду одинаковы, и
 * экран, который их не различает, отправляет человека публиковать в пустоту.
 */
export default async function ConnectionsPage() {
  const sb = await createAdminClient()
  const content = sb.schema('content' as any)

  let карточки
  try {
    карточки = await подключения(content)
  } catch (e: any) {
    return <Пусто что="Подключения не прочитались" почему={String(e?.message ?? e)} />
  }

  const поAPI = карточки.filter((к) => к.площадка.путь === 'api')
  const лентой = карточки.filter((к) => к.площадка.путь === 'rss')
  const тупики = карточки.filter((к) => к.площадка.путь === 'нет')

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap', marginBottom: 4 }}>
        <h2 style={{ margin: 0 }}>Подключения</h2>
        <span style={{ fontSize: 12, color: 'var(--muted)' }}>{сводкаПодключений(карточки)}</span>
      </div>

      <div style={{ fontSize: 12, color: 'var(--muted)', margin: '8px 0 18px', lineHeight: 1.6, maxWidth: 820 }}>
        Руками не публикуем нигде. Поэтому вопрос к каждой площадке один: есть ли путь, по которому
        наш код положит туда пост сам. «Подключено» означает, что живой вызов прошёл и право
        публикации доказано, — не то, что задан токен. Секреты на экран не выводятся: видно имя
        переменной и задана она или нет, никогда значение.
      </div>

      <Группа
        title="Подключается по API"
        подпись={
          'Площадка принимает пост по своему интерфейсу. Нужен коннектор с нашей стороны и один раз — '
          + 'приложение и токен с твоей. Здесь же доступ проверяется живым вызовом.'
        }
        карточки={поAPI}
      />

      <Группа
        title="Забирает сама, из нашей ленты"
        подпись={
          'Публиковать туда нельзя, зато площадка умеет сама вычитывать нашу ленту. Мы не публикуем, '
          + 'мы отдаём: момент выхода решает она, и выдавать это за публикацию по расписанию нельзя.'
        }
        карточки={лентой}
      />

      <Группа
        title="Автоматически нельзя"
        подпись={
          'Интерфейса публикации у площадки не существует — не «мы не дописали», а дописывать нечего. '
          + 'Остаётся либо выкинуть площадку из планов, либо однажды нанять на неё человека. '
          + 'Обходов — браузерной автоматизации вместо API, парольных сессий — мы не делаем: это '
          + 'нарушение правил площадки и канал, который ломается от чужой перерисовки и молча молчит.'
        }
        карточки={тупики}
      />

      <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 20, lineHeight: 1.6, maxWidth: 820 }}>
        В объём MVP входят сайт, Telegram и VK — остальные подключаются после точки решения.
        MCP в этом списке нет намеренно: это способ модели позвать наш инструмент, а за инструментом
        всё равно стоит либо API площадки, либо браузер. Где API есть, коннектор пишется и без MCP;
        где API нет, MCP его не создаёт.
      </div>
    </>
  )
}

function Группа({ title, подпись, карточки }: {
  title: string
  подпись: string
  карточки: Awaited<ReturnType<typeof подключения>>
}) {
  if (!карточки.length) return null
  return (
    <section style={{ marginBottom: 26 }}>
      <h3 style={{ margin: '0 0 4px', fontSize: 14 }}>{title}</h3>
      <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 12, lineHeight: 1.6, maxWidth: 820 }}>{подпись}</div>
      {/* Три блока в строку: на планшете два, на телефоне один — классы .kg .k3
          те же, что у KPI-плиток, чтобы сетка везде ломалась одинаково. */}
      <div className="kg k3">
        {карточки.map((к) => (
          <div key={к.площадка.код} style={{
            padding: '14px 16px', border: '1px solid var(--bor2)', borderRadius: 12, background: 'var(--surf)',
            display: 'flex', flexDirection: 'column',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <strong style={{ fontSize: 14 }}>{к.площадка.имя}</strong>
              <Метка тон="тихий">{ПУТЬ_СЛОВАМИ[к.площадка.путь]}</Метка>
              {!к.площадка.вОбъёме ? <Метка тон="тихий">после точки решения</Метка> : null}
              {к.каналов
                ? <Link href="/admin/content/channels" style={{ fontSize: 12, color: 'var(--purple)' }}>
                    {к.каналов === 1 ? '1 канал' : `${к.каналов} каналов`}
                  </Link>
                : null}
              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                fontSize: 12, color: ЦВЕТ[к.состояние],
              }}>
                <span style={{ width: 7, height: 7, borderRadius: 999, background: ЦВЕТ[к.состояние] }} />
                {СОСТОЯНИЕ_СЛОВАМИ[к.состояние]}
              </span>
            </div>

            <div style={{ fontSize: 12, color: 'var(--muted)', margin: '6px 0 0', lineHeight: 1.6 }}>{к.строка}</div>

            {к.площадка.цена ? (
              <div style={{ marginTop: 8, fontSize: 12, color: 'var(--gold, var(--purple))', lineHeight: 1.6 }}>
                {к.площадка.цена}
              </div>
            ) : null}

            {к.площадка.нужно.length ? (
              <ul style={{ margin: '10px 0 0', padding: '0 0 0 18px', fontSize: 12, lineHeight: 1.7 }}>
                {к.площадка.нужно.map((н) => <li key={н}>{н}</li>)}
              </ul>
            ) : null}

            {Object.keys(к.секретЗадан).length ? (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
                {Object.entries(к.секретЗадан).map(([имя, есть]) => (
                  <span key={имя} style={{
                    fontSize: 11, padding: '2px 7px', borderRadius: 6, fontFamily: 'ui-monospace, monospace',
                    border: `1px solid ${есть ? 'var(--bor2)' : 'var(--red)'}`,
                    color: есть ? 'var(--muted)' : 'var(--red)', background: 'var(--surf2)',
                  }}>
                    {имя} · {есть ? 'задана' : 'не задана'}
                  </span>
                ))}
              </div>
            ) : null}

            {к.требуется.length ? (
              <div style={{ marginTop: 10, fontSize: 12, lineHeight: 1.7 }}>
                <span style={{ color: 'var(--muted)' }}>Чтобы заработало: </span>
                {к.требуется.join(' · ')}
              </div>
            ) : null}

            <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 'auto', paddingTop: 12, flexWrap: 'wrap' }}>
              {к.площадка.доставка !== 'ssh' && к.площадка.путь !== 'нет'
                ? <НовыйКанал площадка={к.площадка.код} /> : null}
              {/* У VK есть свой экран выпуска: что вышло, когда и на сколько
                  хватит запаса картинок. Ссылка отсюда, потому что человек
                  приходит сюда с вопросом «работает ли», а ответ на него —
                  список вышедших постов, а не цвет метки. */}
              {к.площадка.код === 'vk'
                ? <Link href="/admin/content/vk"
                    style={{ fontSize: 12, color: 'var(--purple)', alignSelf: 'center' }}>выпуск и запас</Link>
                : null}
              {к.площадка.док
                ? <a href={к.площадка.док} target="_blank" rel="noreferrer"
                    style={{ fontSize: 12, color: 'var(--purple)', alignSelf: 'center' }}>документация</a>
                : null}
            </div>

            <Проверить код={к.площадка.код} доставка={к.площадка.путь === 'api' ? 'api' : 'нет'} />
          </div>
        ))}
      </div>
    </section>
  )
}
