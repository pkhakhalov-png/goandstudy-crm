import Link from 'next/link'
import { createAdminClient } from '@/lib/supabase/server'
import { карточкиКаналов, ДОСТАВКА_RU } from '@/lib/content/channel-panel'
import { ru, ago } from '@/lib/content/overview'
import { Пусто, Таблица } from '../../Bits'
import { РежимКанала } from '../Controls'
import { Состояние_, Метка, Числом } from '../Кусочки'

export const dynamic = 'force-dynamic'

const ВКЛАДКИ = [
  { ключ: 'история', имя: 'История публикаций' },
  { ключ: 'план', имя: 'Запланировано' },
  { ключ: 'проблемы', имя: 'Проблемы' },
  { ключ: 'метрики', имя: 'Метрики' },
  { ключ: 'настройки', имя: 'Настройки' },
] as const

type Ключ = typeof ВКЛАДКИ[number]['ключ']

const дата = (iso: string | null) => iso ? new Date(iso).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—'

/**
 * Один канал: всё, что не поместилось в карточку.
 *
 * Вкладки, а не длинная простыня, по той же причине, по какой на списке только
 * пять чисел: человек приходит сюда с одним вопросом — «что вышло», «что
 * запланировано», «что сломалось» — и должен получить ответ, не проматывая
 * четыре чужих раздела.
 */
export default async function ChannelPage({ params, searchParams }: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ вкладка?: string }>
}) {
  const { id } = await params
  const { вкладка } = await searchParams
  const текущая = (ВКЛАДКИ.find((в) => в.ключ === вкладка)?.ключ ?? 'история') as Ключ

  const sb = await createAdminClient()
  const content = sb.schema('content' as any)
  const seo = sb.schema('seo')

  const { data: канал } = await content.from('channels')
    .select('id, platform, account_external_id, title, timezone, mode, delivery, daily_cap, max_catch_up, policy_id, secret_ref, capabilities_version, created_at')
    .eq('id', Number(id)).maybeSingle()
  if (!канал) return <Пусто что="Канала нет" почему={`Канал #${id} не найден. Возможно, его удалили.`} />

  const все = await карточкиКаналов(content, seo)
  const к = все.find((x) => x.id === Number(id))!

  return (
    <>
      <div style={{ fontSize: 12, marginBottom: 10 }}>
        <Link href="/admin/content/channels" style={{ color: 'var(--muted)' }}>← Каналы</Link>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <h2 style={{ margin: 0 }}>{к.название}</h2>
        <span style={{ fontSize: 12, color: 'var(--muted)' }}>{к.аккаунт}</span>
        <Метка тон="тихий">{к.платформа}</Метка>
        <Метка тон="тихий">{ДОСТАВКА_RU[к.доставка]}</Метка>
        <Состояние_ с={к.состояние} />
        <span style={{ marginLeft: 'auto' }}><РежимКанала id={к.id} mode={к.режим} /></span>
      </div>
      <div style={{ fontSize: 12, color: 'var(--muted)', margin: '6px 0 14px' }}>{к.строка}</div>

      <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', padding: '12px 14px', border: '1px solid var(--bor2)', borderRadius: 12, background: 'var(--surf)', marginBottom: 14 }}>
        <Числом label="вышло · 7 дн" мера={к.вышло7} />
        <Числом label="вышло · 30 дн" мера={к.вышло30} />
        <Числом label="в плане · нед" мера={к.вПлане7} />
        <Числом label="переходы · 30" мера={к.переходы30} />
        <Числом label="заявки · 30" мера={к.заявки30} />
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
        {ВКЛАДКИ.map((в) => {
          const активна = в.ключ === текущая
          return (
            <Link key={в.ключ} href={`/admin/content/channels/${к.id}?вкладка=${в.ключ}`}
              style={{
                padding: '5px 13px', borderRadius: 8, fontSize: 13, textDecoration: 'none',
                border: `1px solid ${активна ? 'var(--purple)' : 'var(--bor2)'}`,
                background: активна ? 'rgba(177,94,204,.10)' : 'var(--surf2)',
                color: активна ? 'var(--purple)' : 'var(--text)', fontWeight: активна ? 600 : 400,
              }}>
              {в.имя}{в.ключ === 'проблемы' && к.проблем ? ` · ${к.проблем}` : ''}
            </Link>
          )
        })}
      </div>

      {текущая === 'история' ? <История content={content} id={к.id} /> : null}
      {текущая === 'план' ? <План content={content} id={к.id} зона={канал.timezone} /> : null}
      {текущая === 'проблемы' ? <Проблемы content={content} id={к.id} /> : null}
      {текущая === 'метрики' ? <Метрики content={content} id={к.id} к={к} /> : null}
      {текущая === 'настройки' ? <Настройки канал={канал} content={content} /> : null}
    </>
  )
}

/* ── Вкладки ────────────────────────────────────────────────────────────── */

async function История({ content, id }: { content: any; id: number }) {
  const { data: пабы } = await content.from('publications')
    .select('id, status, scheduled_at, remote_url, remote_id, link_clickable, variant_version_id, last_verified_at')
    .eq('channel_id', id).order('scheduled_at', { ascending: false }).limit(50)

  if (!пабы?.length) {
    return <Пусто что="Публикаций ещё не было"
      почему="Как только материал пройдёт проверку и попадёт в слот, здесь появится строка — с исходом отправки, ссылкой и числом попыток." />
  }

  const { data: попытки } = await content.from('publication_attempts')
    .select('publication_id, phase, http_status, created_at').in('publication_id', (пабы as any[]).map((p) => p.id))

  return (
    <>
      <Таблица
        columns={['Слот', 'Исход', 'Ссылка', 'Попыток', 'Кликабельна', 'Проверено']}
        rows={(пабы as any[]).map((p) => [
          <Link key="s" href={`/admin/content/publications/${p.id}`} style={{ color: 'var(--purple)' }}>{дата(p.scheduled_at)}</Link>,
          <span key="s" style={{ color: p.status === 'verified' || p.status === 'published' ? 'var(--green)' : p.status === 'unknown' || p.status === 'failed' || p.status === 'blocked' ? 'var(--red)' : 'var(--text)' }}>
            {ru(p.status)}
          </span>,
          p.remote_url
            ? <a key="l" href={p.remote_url} target="_blank" rel="noreferrer" style={{ color: 'var(--purple)' }}>{p.remote_url.replace(/^https?:\/\//, '').slice(0, 42)}</a>
            : <span key="l" style={{ color: 'var(--muted)' }}>—</span>,
          String((попытки ?? []).filter((a: any) => a.publication_id === p.id).length || '—'),
          p.link_clickable === true ? 'да' : p.link_clickable === false ? 'нет'
            : <span key="c" style={{ color: 'var(--muted)' }}>не знаем</span>,
          p.last_verified_at ? ago(p.last_verified_at) : <span key="v" style={{ color: 'var(--muted)' }}>—</span>,
        ])}
      />
      <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 10, lineHeight: 1.6, maxWidth: 760 }}>
        «Не знаем» в колонке кликабельности — это не «нет». Пока площадка не подтвердила, что ссылка ушла
        живой, переходы этой публикации не приписываются никому.
      </div>
    </>
  )
}

async function План({ content, id, зона }: { content: any; id: number; зона: string }) {
  const { data: пабы } = await content.from('publications')
    .select('id, status, scheduled_at, variant_version_id, idempotency_key')
    .eq('channel_id', id).in('status', ['scheduled', 'publishing', 'blocked'])
    .order('scheduled_at').limit(30)

  if (!пабы?.length) {
    return <Пусто что="Ничего не запланировано"
      почему="Слоты появляются, когда одобренный материал попадает в расписание канала. Пустой план при работающем канале значит, что материал не дошёл до одобрения." />
  }

  return (
    <>
      <Таблица
        columns={['Слот', 'Состояние', 'Версия варианта', 'Ключ повтора']}
        rows={(пабы as any[]).map((p) => [
          <Link key="s" href={`/admin/content/publications/${p.id}`} style={{ color: 'var(--purple)' }}>{дата(p.scheduled_at)}</Link>,
          <span key="s" style={{ color: p.status === 'blocked' ? 'var(--red)' : 'var(--text)' }}>
            {p.status === 'blocked' ? 'заблокировано: под публикацией изменился факт' : ru(p.status)}
          </span>,
          String(p.variant_version_id),
          <span key="k" style={{ fontSize: 11, color: 'var(--muted)' }}>{p.idempotency_key}</span>,
        ])}
      />
      <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 10 }}>Время слотов — в зоне канала: {зона}.</div>
    </>
  )
}

async function Проблемы({ content, id }: { content: any; id: number }) {
  const { data: свои } = await content.from('publications').select('id').eq('channel_id', id)
  const ids = (свои ?? []).map((p: any) => p.id)
  const { data: пункты } = ids.length
    ? await content.from('attention_items')
      .select('id, reason_code, severity, entity_type, entity_id, suggested_action, opened_at')
      .is('resolved_at', null).eq('entity_type', 'publication').in('entity_id', ids).order('id', { ascending: false })
    : { data: [] as any[] }

  if (!пункты?.length) {
    return <Пусто что="Открытых проблем нет"
      почему="Сюда попадает то, что не блокирует работу, но и не должно тихо исчезнуть: неизвестный исход отправки, изменившийся факт под вышедшим постом, расхождение проверок." />
  }

  return (
    <Таблица
      columns={['Что случилось', 'Вес', 'Объект', 'Возраст', 'Что сделать']}
      rows={(пункты as any[]).map((a) => [
        ru(a.reason_code),
        <span key="s" style={{ color: a.severity === 'high' ? 'var(--red)' : 'var(--muted)' }}>{a.severity}</span>,
        `публикация #${a.entity_id}`,
        ago(a.opened_at) ?? '—',
        <span key="d" style={{ whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>{a.suggested_action ?? '—'}</span>,
      ])}
    />
  )
}

async function Метрики({ content, id, к }: { content: any; id: number; к: any }) {
  const { data: свои } = await content.from('publications').select('id').eq('channel_id', id)
  const ids = (свои ?? []).map((p: any) => p.id)
  const { data: строки } = ids.length
    ? await content.from('metrics_daily')
      .select('publication_id, date, metric, source, value, completeness, fetched_at')
      .in('publication_id', ids).order('date', { ascending: false }).limit(200)
    : { data: [] as any[] }

  const сумма = (metric: string) => {
    const свои = (строки ?? []).filter((r: any) => r.metric === metric)
    if (!свои.length) return { n: null, почему: 'площадка не отдавала эту метрику' }
    const доступные = свои.filter((r: any) => r.completeness !== 'unavailable')
    if (!доступные.length) return { n: null, почему: 'площадка отвечала «нет данных» — это не ноль' }
    return { n: доступные.reduce((s: number, r: any) => s + Number(r.value ?? 0), 0) }
  }

  return (
    <>
      <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))' }}>
        <div style={{ padding: '14px 16px', border: '1px solid var(--bor2)', borderRadius: 12, background: 'var(--surf)' }}>
          <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 10 }}>Данные площадки · {к.платформа}</div>
          <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
            <Числом label="охват" мера={сумма('reach') as any} />
            <Числом label="реакции" мера={сумма('reactions') as any} />
          </div>
        </div>
        <div style={{ padding: '14px 16px', border: '1px solid var(--bor2)', borderRadius: 12, background: 'var(--surf)' }}>
          <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 10 }}>Данные CRM · метки и заявки</div>
          <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
            <Числом label="переходы · 30" мера={к.переходы30} />
            <Числом label="заявки · 30" мера={к.заявки30} />
          </div>
        </div>
      </div>
      <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 12, lineHeight: 1.6, maxWidth: 760 }}>
        Две панели — два источника правды, и они не складываются. Левая отвечает на вопрос «увидели ли
        пост», правая — «дошли ли люди до заявки». Общего числа из них не бывает.
      </div>
    </>
  )
}

async function Настройки({ канал, content }: { канал: any; content: any }) {
  const { data: политика } = канал.policy_id
    ? await content.from('channel_policies').select('name, version, formats, caps, review_depth').eq('id', канал.policy_id).maybeSingle()
    : { data: null }
  const { data: умеет } = await content.from('connector_capabilities')
    .select('verified_actions, proof_ref, checked_at').eq('platform', канал.platform).maybeSingle()

  const строки: [string, React.ReactNode][] = [
    ['Режим', ru(канал.mode)],
    ['Доставка', ДОСТАВКА_RU[(канал.delivery ?? 'manual') as 'api' | 'ssh' | 'manual']],
    ['Часовой пояс', канал.timezone],
    ['Темп', `${канал.daily_cap ?? 1} в день · догон не более ${канал.max_catch_up ?? 0}`],
    ['Политика', политика ? `${политика.name} · v${политика.version}${политика.formats?.length ? ` · ${политика.formats.join(', ')}` : ''}` : 'не задана'],
    ['Доступ', канал.secret_ref
      ? <span key="s">секрет хранится на сервере <span style={{ color: 'var(--muted)' }}>({канал.secret_ref})</span>, в интерфейс не отдаётся</span>
      : <span key="s" style={{ color: 'var(--red)' }}>секрет не привязан — публиковать нечем</span>],
    ['Возможности площадки', умеет?.proof_ref
      ? <span key="c" style={{ color: 'var(--green)' }}>проверено вызовом{умеет.checked_at ? ` · ${ago(умеет.checked_at)}` : ''}</span>
      : умеет
        ? <span key="c" style={{ color: 'var(--muted)' }}>записано из документации, вызовом не проверяли</span>
        : <span key="c" style={{ color: 'var(--muted)' }}>не проверяли</span>],
    ['Заведён', дата(канал.created_at)],
  ]

  return (
    <>
      <Таблица columns={['Что', 'Значение']} rows={строки.map(([k, v]) => [<span key="k" style={{ color: 'var(--muted)' }}>{k}</span>, v])} />
      <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 10, lineHeight: 1.6, maxWidth: 760 }}>
        «Записано из документации» значит, что возможности площадки взяты из её описания, а не из
        успешного вызова. До проверки вызовом любые выводы о ссылках и переходах — оценка, а не измерение.
      </div>
    </>
  )
}
