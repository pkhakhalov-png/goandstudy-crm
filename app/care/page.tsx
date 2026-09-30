/**
 * Главная — «Требуют внимания». Раздел 4 дизайн-документа.
 *
 * Отвечает не на «как распределены клиенты по этапам», а на «чем заняться
 * прямо сейчас». Поэтому лента, а не таблица, и сортировка по срочности.
 *
 * Дела без причин сюда не попадают: лента показывает то, что требует
 * куратора, а не всё подряд. Полный список — соседний экран.
 */
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { сессияКонтура } from '@/lib/care/session'
import { главная } from '@/lib/care/cases'
import { сводка } from '@/lib/care/ai/summary'
import { флагВключён } from '@/lib/care/flags'
import { инициалы, склонение } from '@/lib/care/labels'
import { AssistantPanel } from './AssistantPanel'

export const dynamic = 'force-dynamic'

/** Стат hero-полосы. Ноль показывается серым и не кликается — позиции не прыгают. */
function Стат({ число, подпись, href }: { число: number; подпись: string; href?: string }) {
  const содержимое = (
    <>
      <div
        className="ds-stat-num"
        style={{
          fontFamily: 'var(--ds-font-display), sans-serif',
          fontSize: 44,
          fontWeight: 700,
          lineHeight: 1,
          color: число === 0 ? 'var(--ds-muted)' : 'var(--ds-ink)',
        }}
      >
        {число}
      </div>
      <div
        className="ds-stat-label"
        style={{
          fontSize: 11,
          textTransform: 'uppercase',
          letterSpacing: '0.1em',
          color: 'var(--ds-muted)',
          marginTop: 6,
          maxWidth: 140,
        }}
      >
        {подпись}
      </div>
    </>
  )
  if (число === 0 || !href) return <div>{содержимое}</div>
  return (
    <Link href={href} style={{ textDecoration: 'none', color: 'inherit' }}>
      {содержимое}
    </Link>
  )
}

export default async function ГлавнаяСтраница() {
  const сессия = await сессияКонтура()
  if (!сессия?.участник) notFound()

  const д = await главная(сессия.участник)
  // Помощник включается отдельно от кабинета: смотреть на данные и тратить на
  // них деньги — разные решения.
  const помощникВключён = await флагВключён('ai', { memberId: сессия.участник.id })
  // Числа уже посчитаны запросом; модель только формулирует к ним две фразы.
  // Если она недоступна, фраза будет суше, а числа — те же.
  const { фраза } = помощникВключён
    ? await сводка(д, сессия.имя)
    : { фраза: '' }

  const сегодня = new Date().toLocaleDateString('ru-RU', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })

  return (
    <>
      <div
        className="ds-hero"
        style={{ borderRadius: 18, padding: '28px 32px', marginBottom: 28 }}
      >
        <div
          className="ds-hero-eyebrow"
          style={{
            fontFamily: 'var(--ds-font-display), sans-serif',
            fontSize: 11,
            textTransform: 'uppercase',
            letterSpacing: '0.14em',
            color: 'var(--ds-muted)',
          }}
        >
          {сегодня}
        </div>

        <h1
          className="ds-hero-h1"
          style={{ fontSize: 34, margin: '10px 0 22px', lineHeight: 1.15 }}
        >
          {д.всегоДел} {склонение(д.всегоДел, 'клиент', 'клиента', 'клиентов')}
          {' · '}
          <span style={{ color: 'var(--ds-purple-deep)' }}>{д.требуютВас}</span>{' '}
          {склонение(д.требуютВас, 'требует', 'требуют', 'требуют')} вас
        </h1>

        {фраза && (
          <p style={{ fontSize: 15, lineHeight: 1.6, maxWidth: 680, margin: '0 0 22px' }}>
            {фраза}
          </p>
        )}

        <div style={{ display: 'flex', gap: 44, flexWrap: 'wrap' }}>
          <Стат число={д.предложений} подпись="на проверку" href="/care/review" />
          <Стат число={д.просроченныхЗадач} подпись="просроченных задачи" />
          <Стат число={д.дедлайновЗа14Дней} подпись="дедлайна за 14 дней" />
          <Стат число={д.ошибокОпераций} подпись="ошибка операции" />
        </div>
      </div>

      {д.лента.length === 0 ? (
        <div className="ds-empty">
          <div className="ds-empty-title">{д.всегоДел === 0 ? 'Дел пока нет' : 'Всё спокойно'}</div>
          <p style={{ fontSize: 14, color: 'var(--ds-muted)', maxWidth: 460, margin: '8px auto 0' }}>
            {д.всегоДел === 0
              ? 'Дела заводятся импортом из действующей CRM. Пока список пилотных клиентов не выбран, здесь пусто.'
              : `${д.всегоДел} ${склонение(д.всегоДел, 'клиент', 'клиента', 'клиентов')} в работе, ничего не горит.`}
          </p>
          <p style={{ marginTop: 12 }}>
            <Link href="/care/cases" className="ds-link">
              Открыть список клиентов
            </Link>
          </p>
        </div>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 320px', gap: 24, alignItems: 'start' }}>
            <div>
              <h2 className="ds-label" style={{ marginBottom: 12 }}>
                Нужно ваше внимание
              </h2>

              <div style={{ display: 'grid', gap: 12 }}>
            {д.лента.map((с) => (
              <Link key={с.caseId} href={`/care/cases/${с.caseId}`} className="care-attn" data-level={с.уровень}>
                <span className="care-ava">{инициалы(с.имя)}</span>

                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: 700, fontSize: 16 }}>{с.имя}</span>
                    {с.is_synthetic && <span className="ds-chip ds-chip-warning">тест</span>}
                    <span style={{ fontSize: 13, color: 'var(--ds-muted)', marginLeft: 'auto' }}>
                      {с.контекст}
                    </span>
                  </div>

                  <div style={{ marginTop: 8, display: 'grid', gap: 3 }}>
                    {с.причины.map((п, i) => (
                      <span key={i} className="care-reason" data-kind={п.вид}>
                        {п.текст}
                      </span>
                    ))}
                  </div>
                </div>

                <span className="ds-btn ds-btn-secondary ds-btn-sm" style={{ flex: '0 0 auto' }}>
                  {с.действие}
                </span>
              </Link>
                ))}
              </div>
            </div>

            <AssistantPanel
              caseId={null}
              областьПодпись="Все мои клиенты"
              доступен={помощникВключён}
              подсказки={['Что сегодня важнее всего?', 'Кто давно молчит?', 'Где мы работаем вслепую?']}
            />
          </div>
        </>
      )}
    </>
  )
}
