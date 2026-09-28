/**
 * Команда — экран руководителя.
 *
 * Главная колонка здесь не «сколько задач», а «сколько времени что-то стоит».
 * Задача, висящая месяц, опаснее десяти свежих, но в обычном счётчике они
 * выглядят одинаково — и именно поэтому такие вещи находят поздно.
 *
 * Числа считаются запросом к базе, а не пересказом модели. Это правило
 * этапа 2, но заведено сразу: счётчик, который однажды напишет модель, потом
 * никто не проверит.
 */
import { notFound } from 'next/navigation'
import { сессияКонтура } from '@/lib/care/session'
import { сводкаКоманды } from '@/lib/care/cases'

export const dynamic = 'force-dynamic'

export default async function КомандаСтраница() {
  const сессия = await сессияКонтура()
  if (!сессия?.участник) notFound()
  // Экран только для руководителя. Не редирект: остальным знать о нём незачем.
  if (сессия.участник.care_role !== 'lead') notFound()

  const строки = await сводкаКоманды(сессия.участник)

  return (
    <>
      <h1 className="ds-hero-h1" style={{ fontSize: 28, marginBottom: 4 }}>
        Команда
      </h1>
      <p style={{ color: 'var(--ds-muted)', marginBottom: 24, fontSize: 14 }}>
        Кто чем занят и что стоит дольше всего
      </p>

      {строки.length === 0 ? (
        <div className="ds-empty">
          <div className="ds-empty-title">В команде пока никого</div>
          <p style={{ fontSize: 14, color: 'var(--ds-muted)', maxWidth: 460, margin: '8px auto 0' }}>
            Кураторы попадают сюда, когда у них в поле «руководитель» стоите вы.
            Связь проставляется при заведении сотрудника контура.
          </p>
        </div>
      ) : (
        <div className="ds-card" style={{ padding: 0, overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--ds-border)' }}>
                <th style={{ textAlign: 'left', padding: '12px 16px' }}>Куратор</th>
                <th style={{ textAlign: 'left', padding: '12px 16px' }}>Дел</th>
                <th style={{ textAlign: 'left', padding: '12px 16px' }}>Открытых задач</th>
                <th style={{ textAlign: 'left', padding: '12px 16px' }}>Ждут решения</th>
                <th style={{ textAlign: 'left', padding: '12px 16px' }}>Самое долгое ожидание</th>
              </tr>
            </thead>
            <tbody>
              {строки.map((с) => (
                <tr key={с.участникId} style={{ borderBottom: '1px solid var(--ds-border-soft)' }}>
                  <td style={{ padding: '12px 16px' }}>
                    {с.имя}
                    {с.участникId === сессия.участник!.id && (
                      <span className="ds-chip ds-chip-neutral">вы</span>
                    )}
                  </td>
                  <td style={{ padding: '12px 16px' }}>{с.дел}</td>
                  <td style={{ padding: '12px 16px' }}>{с.задачОткрыто}</td>
                  <td style={{ padding: '12px 16px' }}>
                    {с.ждутРешения ? (
                      <span className="ds-chip ds-chip-warning">{с.ждутРешения}</span>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    {с.самоеДолгоеОжиданиеДней === null ? (
                      '—'
                    ) : (
                      <span className={с.самоеДолгоеОжиданиеДней > 14 ? 'ds-chip ds-chip-error' : ''}>
                        {с.самоеДолгоеОжиданиеДней} дн.
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}
