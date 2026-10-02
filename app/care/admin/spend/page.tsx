/**
 * Что контур тратит на модель.
 *
 * ПОЧЕМУ ЭКРАН, А НЕ СТРОКА В ОТЧЁТЕ. Первый вопрос к системе, которая зовёт
 * модель, — «сколько это стоит». До сих пор ответить на него мог только тот, у
 * кого есть терминал и ключ к базе.
 *
 * ПОЧЕМУ ТОЛЬКО РУКОВОДИТЕЛЮ. Куратору эти числа ничего не меняют: он не
 * решает, поднимать ли потолок. А решения о деньгах принимает тот, кто отвечает
 * за контур целиком.
 */
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { сессияКонтура } from '@/lib/care/session'
import { картинаРасхода } from '@/lib/care/spend'

export const dynamic = 'force-dynamic'

const ПОДПИСЬ: Record<string, string> = {
  outbound: 'сообщения клиентам',
  extraction: 'разбор переписки',
  research: 'подбор и справки',
  review: 'стратегия и вступления',
}

function деньги(сумма: number): string {
  if (сумма === 0) return '0 $'
  return сумма < 0.01 ? 'меньше цента' : `${сумма.toFixed(2)} $`
}

export default async function РасходСтраница() {
  const сессия = await сессияКонтура()
  if (!сессия?.участник || !сессия.интерфейсОткрыт) notFound()
  if (сессия.участник.care_role !== 'lead') notFound()

  const к = await картинаРасхода()
  const сегодняВсего = к.виды.reduce((с, в) => с + в.сегодня, 0)
  const неделяВсего = к.виды.reduce((с, в) => с + в.неделя, 0)

  return (
    <>
      <h1 className="ds-hero-h1" style={{ fontSize: 30, marginBottom: 4 }}>
        Расход на модель
      </h1>
      <p style={{ marginBottom: 10 }}>
        <Link href="/care/admin/switch" className="ds-link" style={{ fontSize: 14 }}>
          ← Кабинеты и отправки
        </Link>
      </p>
      <p style={{ color: 'var(--ds-muted)', marginBottom: 22, fontSize: 14, maxWidth: 680, lineHeight: 1.6 }}>
        Сегодня {деньги(сегодняВсего)}, за неделю {деньги(неделяВсего)}. Потолок по каждому виду —
        предохранитель, а не бюджет: упереться в него при обычной работе нельзя, и если он
        сработал, значит что-то пошло по кругу.
      </p>

      {к.обрезано && (
        <p style={{ fontSize: 13, color: 'var(--ds-amber-ink, var(--ds-muted))', marginBottom: 16 }}>
          Строк за неделю больше, чем прочитано, — суммы ниже занижены.
        </p>
      )}

      <section style={{ marginBottom: 28 }}>
        <div className="ds-label" style={{ marginBottom: 10 }}>
          Сегодня по видам работы
        </div>
        <div className="ds-card" style={{ padding: 0 }}>
          {к.виды.map((в) => (
            <div key={в.вид} className="care-расход">
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: 14 }}>{ПОДПИСЬ[в.вид] ?? в.вид}</div>
                <div style={{ fontSize: 12, color: 'var(--ds-muted)', marginTop: 2 }}>
                  за неделю {деньги(в.неделя)}
                </div>
                {/* Полоса, а не только число: «8.67 из 15» глазом не
                    сравнивается, а длина сравнивается сразу. */}
                <div className="care-полоса">
                  <span
                    style={{
                      width: `${Math.min(100, Math.round(в.доля * 100))}%`,
                      background:
                        в.доля >= 0.8 ? 'var(--ds-amber, var(--ds-ai))' : 'var(--ds-ai)',
                    }}
                  />
                </div>
              </div>
              <div style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                <div style={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                  {деньги(в.сегодня)}
                </div>
                <div style={{ fontSize: 12, color: 'var(--ds-muted)' }}>
                  потолок {в.потолок.toFixed(2)} $
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section style={{ marginBottom: 28 }}>
        <div className="ds-label" style={{ marginBottom: 10 }}>
          Прогоны проверок
        </div>
        <div className="ds-card" style={{ padding: '14px 16px' }}>
          <div style={{ fontSize: 14 }}>
            Сегодня {деньги(к.проверки.сегодня)} · за неделю {деньги(к.проверки.неделя)} · потолок{' '}
            {к.проверки.потолок.toFixed(2)} $
          </div>
          {/* Деньги настоящие, и прятать их нельзя. Но и смешивать с рабочим
              нельзя: прогон однажды съел дневной потолок подбора, и куратор до
              полуночи не мог собрать подборку. */}
          <p style={{ fontSize: 12, color: 'var(--ds-muted)', marginTop: 6, lineHeight: 1.55 }}>
            Считается отдельно: проверки зовут модель по-настоящему, и однажды прогон съел дневной
            потолок подбора — куратор до полуночи не мог собрать подборку.
          </p>
        </div>
      </section>

      <section style={{ marginBottom: 28 }}>
        <div className="ds-label" style={{ marginBottom: 10 }}>
          По дням
        </div>
        <div className="ds-card" style={{ padding: 0 }}>
          {к.поДням.length === 0 ? (
            <p style={{ fontSize: 13, color: 'var(--ds-muted)', padding: '14px 16px', margin: 0 }}>
              За неделю модель не звали ни разу.
            </p>
          ) : (
            к.поДням.map((д) => (
              <div key={д.день} className="care-расход">
                <div style={{ fontSize: 14 }}>
                  {new Date(д.день).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })}
                </div>
                <div style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                  <div style={{ fontWeight: 600 }}>{деньги(д.сумма)}</div>
                  {д.проверки > 0 && (
                    <div style={{ fontSize: 12, color: 'var(--ds-muted)' }}>
                      проверки {деньги(д.проверки)}
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </section>

      <section>
        <div className="ds-label" style={{ marginBottom: 10 }}>
          Самые дорогие вызовы за неделю
        </div>
        {к.крупные.length === 0 ? (
          <p style={{ fontSize: 13, color: 'var(--ds-muted)' }}>Вызовов не было.</p>
        ) : (
          <div className="ds-card" style={{ padding: 0 }}>
            {к.крупные.map((в, и) => (
              <div key={и} className="care-расход">
                <div style={{ minWidth: 0, flex: 1 }}>
                  {/* «Девять долларов за сутки» не говорит, что делать.
                      «Подбор по трём делам — семь долларов» говорит. */}
                  <div style={{ fontSize: 13, lineHeight: 1.5 }}>
                    {в.пометка ?? ПОДПИСЬ[в.вид] ?? в.вид}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--ds-muted)', marginTop: 2 }}>
                    {new Date(в.когда).toLocaleString('ru-RU', {
                      day: 'numeric',
                      month: 'long',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                    {в.проверка ? ' · прогон проверок' : ''}
                  </div>
                </div>
                <div style={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                  {деньги(в.сумма)}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </>
  )
}
