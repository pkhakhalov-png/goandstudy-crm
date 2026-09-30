/**
 * Список дел.
 *
 * Показывает то, из чего складывается решение «за что взяться»: кого ждём и
 * какой срок ближе всех. Не показывает суммы и оценки разговоров — их роли
 * контура не выдано, и это видно по тому, что таких колонок просто нет.
 */
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { сессияКонтура } from '@/lib/care/session'
import { списокДел } from '@/lib/care/cases'

export const dynamic = 'force-dynamic'

/**
 * Срок словами.
 *
 * Всегда относительно «сегодня», а дата — второй строкой. Смешивать «через
 * 5 дн.» с «15.10.2026» в одной колонке значит заставлять человека считать в
 * уме, какое из двух ближе, — а колонка существует ровно чтобы этого не делать.
 */
function срокомЧерез(дата: string | null): { текст: string; дата: string | null; уровень: 'пусто' | 'горит' | 'скоро' | 'спокойно' } {
  if (!дата) return { текст: 'срока нет', дата: null, уровень: 'пусто' }
  const дней = Math.ceil((new Date(дата).getTime() - Date.now()) / 86_400_000)
  const подпись = new Date(дата).toLocaleDateString('ru-RU')
  if (дней < 0) return { текст: `просрочен на ${-дней} дн.`, дата: подпись, уровень: 'горит' }
  if (дней === 0) return { текст: 'сегодня', дата: подпись, уровень: 'горит' }
  if (дней <= 7) return { текст: `через ${дней} дн.`, дата: подпись, уровень: 'горит' }
  if (дней <= 30) return { текст: `через ${дней} дн.`, дата: подпись, уровень: 'скоро' }
  return { текст: `через ${дней} дн.`, дата: подпись, уровень: 'спокойно' }
}

export default async function СписокДелСтраница() {
  const сессия = await сессияКонтура()
  if (!сессия?.участник) notFound()

  const дела = await списокДел(сессия.участник)

  return (
    <>
      <h1 className="ds-hero-h1" style={{ fontSize: 28, marginBottom: 4 }}>
        Дела
      </h1>
      <p style={{ color: 'var(--ds-muted)', marginBottom: 24, fontSize: 14 }}>
        {дела.length === 0
          ? 'Область видимости пуста'
          : `${дела.length} ${дела.length === 1 ? 'дело' : дела.length < 5 ? 'дела' : 'дел'} в вашей области · сверху то, что горит`}
      </p>

      {дела.length === 0 ? (
        <div className="ds-empty">
          <div className="ds-empty-title">Дел пока нет</div>
          <p style={{ fontSize: 14, color: 'var(--ds-muted)', maxWidth: 460, margin: '8px auto 0' }}>
            Это не ошибка доступа. Дела заводятся импортом из действующей CRM —
            <span className="ds-mono"> scripts/care/import-cases.ts</span>. Пока список
            пилотных клиентов не выбран, здесь пусто.
          </p>
        </div>
      ) : (
        <div className="ds-card" style={{ padding: 0, overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--ds-border)' }}>
                <th style={{ textAlign: 'left', padding: '12px 16px' }}>Клиент</th>
                <th style={{ textAlign: 'left', padding: '12px 16px' }}>Набор</th>
                <th style={{ textAlign: 'left', padding: '12px 16px' }}>Задачи</th>
                <th style={{ textAlign: 'left', padding: '12px 16px' }}>Ждём клиента</th>
                <th style={{ textAlign: 'left', padding: '12px 16px' }}>Ближайший срок</th>
                <th style={{ textAlign: 'left', padding: '12px 16px' }}>Ведётся</th>
              </tr>
            </thead>
            <tbody>
              {дела.map((д) => {
                const срок = срокомЧерез(д.ближайшийСрок)
                return (
                  <tr key={д.id} style={{ borderBottom: '1px solid var(--ds-border-soft)' }}>
                    <td style={{ padding: '12px 16px' }}>
                      <Link href={`/care/cases/${д.id}`} className="ds-link" style={{ fontWeight: 500 }}>
                        {д.имяКлиента}
                      </Link>
                      {/* Тестовое дело помечается всегда и заметно: спутать
                          синтетику с настоящим клиентом — дороже, чем лишняя
                          плашка на экране. */}
                      {д.is_synthetic && <span className="ds-chip ds-chip-warning">тест</span>}
                      {д.страна && (
                        <div style={{ fontSize: 12, color: 'var(--ds-muted)' }}>{д.страна}</div>
                      )}
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      {д.intake_year}
                      {д.intake_term ? ` · ${д.intake_term}` : ''}
                    </td>
                    <td style={{ padding: '12px 16px' }}>{д.задачОткрыто || '—'}</td>
                    <td style={{ padding: '12px 16px' }}>
                      {д.ждутКлиента ? (
                        <span className="ds-chip ds-chip-warning">{д.ждутКлиента}</span>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <span
                        className={
                          срок.уровень === 'горит'
                            ? 'ds-chip ds-chip-error'
                            : срок.уровень === 'скоро'
                              ? 'ds-chip ds-chip-warning'
                              : ''
                        }
                        style={срок.уровень === 'пусто' ? { color: 'var(--ds-muted)' } : undefined}
                      >
                        {срок.текст}
                      </span>
                      {срок.дата && (
                        <div style={{ fontSize: 11, color: 'var(--ds-muted)', marginTop: 2 }}>{срок.дата}</div>
                      )}
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <span
                        className={`ds-chip ${д.automation_owner === 'v2' ? 'ds-chip-purple' : 'ds-chip-neutral'}`}
                      >
                        {д.automation_owner === 'v2' ? 'новый кабинет' : 'старый кабинет'}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}
