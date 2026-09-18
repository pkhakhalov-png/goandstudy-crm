import Link from 'next/link'
import { createAdminClient } from '@/lib/supabase/server'
import { карточкаПубликации, type Ступень } from '@/lib/content/publication-card'
import { ru, ago } from '@/lib/content/overview'
import { Пусто, Таблица } from '../../Bits'
import { Метка, Числом } from '../../channels/Кусочки'

export const dynamic = 'force-dynamic'

const дата = (iso: string | null) => iso
  ? new Date(iso).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
  : '—'

/**
 * Раздел, свёрнутый по умолчанию.
 *
 * Развёрнутым остаётся только то, ради чего на экран приходят: сам текст и
 * факты под ним. Остальное — попытки, ступени, деньги, соседние адаптации —
 * лежит свёрнутым: это нужно, когда что-то пошло не так, а не каждый раз.
 */
function Раздел({ имя, итог, открыт, children }: {
  имя: string; итог: string; открыт?: boolean; children: React.ReactNode
}) {
  return (
    <details open={открыт} style={{
      border: '1px solid var(--bor2)', borderRadius: 12, background: 'var(--surf)',
      padding: '10px 14px', marginBottom: 10,
    }}>
      <summary style={{ cursor: 'pointer', listStyle: 'revert', display: 'list-item' }}>
        <span style={{ fontWeight: 600, fontSize: 13 }}>{имя}</span>
        <span style={{ fontSize: 12, color: 'var(--muted)', marginLeft: 8 }}>{итог}</span>
      </summary>
      <div style={{ marginTop: 12 }}>{children}</div>
    </details>
  )
}

function Ступенька({ с }: { с: Ступень }) {
  const цвет = с.состояние === 'пройдена' ? 'var(--green)' : с.состояние === 'не_пройдена' ? 'var(--red)' : 'var(--muted)'
  const знак = с.состояние === 'пройдена' ? '✓' : с.состояние === 'не_пройдена' ? '✕' : '·'
  return (
    <div style={{ display: 'flex', gap: 10, alignItems: 'baseline', padding: '6px 0', borderTop: '1px solid var(--bor)' }}>
      <span style={{ color: цвет, width: 14 }}>{знак}</span>
      <span style={{ minWidth: 250, fontSize: 13 }}>{с.имя}</span>
      <span style={{ fontSize: 12, color: 'var(--muted)', flex: 1 }}>{с.чем}</span>
      <span style={{ fontSize: 12, color: 'var(--muted)' }}>{с.когда ? дата(с.когда) : ''}</span>
    </div>
  )
}

export default async function PublicationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const sb = await createAdminClient()
  const к = await карточкаПубликации(sb.schema('content' as any), sb.schema('seo'), Number(id))

  if (!к) return <Пусто что="Публикации нет" почему={`Публикация #${id} не найдена.`} />

  const подтверждено = к.факты.filter((ф) => ф.подтверждение).length
  const безИсточника = к.факты.length - подтверждено
  const замечаний = к.проверки.reduce((s, п) => s + п.замечаний, 0)
  const стоимостьСтатьи = к.расходыСтатьи.reduce((s, р) => s + р.сумма, 0)

  return (
    <>
      <div style={{ fontSize: 12, marginBottom: 10, color: 'var(--muted)' }}>
        <Link href="/admin/content/publications" style={{ color: 'var(--muted)' }}>← Публикации</Link>
        {к.канал ? <> · <Link href={`/admin/content/channels/${к.канал.id}`} style={{ color: 'var(--muted)' }}>{к.канал.название}</Link></> : null}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <h2 style={{ margin: 0 }}>Публикация #{к.id}</h2>
        <Метка тон="тихий">{к.версияВарианта.формат === 'social_post' ? 'пост' : к.версияВарианта.формат} · v{к.версияВарианта.версия}</Метка>
        {к.канал ? <Метка тон="тихий">{к.канал.платформа}</Метка> : null}
        <span style={{
          fontSize: 12,
          color: к.статус === 'published' ? 'var(--green)'
            : ['failed', 'unknown', 'blocked'].includes(к.статус) ? 'var(--red)' : 'var(--text)',
        }}>{ru(к.статус)}</span>
      </div>

      <div style={{ fontSize: 12, color: 'var(--muted)', margin: '6px 0 14px', lineHeight: 1.6 }}>
        Слот {дата(к.слот)}
        {к.пакет ? <> · из пакета #{к.пакет.id}{к.пакет.версия ? ` · v${к.пакет.версия}` : ''}</> : null}
        {к.статья ? <> · статья #{к.статья.id}</> : null}
        {к.адрес ? <> · <a href={к.адрес} target="_blank" rel="noreferrer" style={{ color: 'var(--purple)' }}>{к.адрес.replace(/^https?:\/\//, '')}</a></> : null}
        {к.кликабельна === true ? ' · ссылка кликабельна'
          : к.кликабельна === false ? ' · ссылка не кликабельна'
            : ' · кликабельность ссылки не подтверждена'}
      </div>

      <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', padding: '12px 14px', border: '1px solid var(--bor2)', borderRadius: 12, background: 'var(--surf)', marginBottom: 14 }}>
        {к.охваты.length
          ? к.охваты.map((о) => <Числом key={о.метрика} label={`${о.метрика} · площадка`} мера={{ n: о.значение, почему: о.почему }} />)
          : <Числом label="охват · площадка" мера={{ n: null, почему: 'метрики не выгружались' }} />}
        <Числом label="переходы · CRM" мера={{
          n: к.переходы,
          почему: к.кликабельна === true ? undefined : 'ссылка не подтверждена — переходы не приписываются',
        }} />
        <Числом label="заявки · CRM" мера={{
          n: к.заявки,
          почему: к.кликабельна === true ? undefined : 'ссылка не подтверждена',
        }} />
      </div>

      <Раздел имя="Текст, который вышел" открыт
        итог={`версия ${к.версияВарианта.версия}${к.хеш ? ` · ${к.хеш.slice(0, 8)}` : ''}${к.версияВарианта.угол ? ` · угол «${к.версияВарианта.угол}»` : ''}`}>
        <div style={{
          whiteSpace: 'pre-wrap', fontSize: 13, lineHeight: 1.65, padding: '12px 14px',
          border: '1px solid var(--bor)', borderRadius: 10, background: 'var(--surf2)',
        }}>{к.текст || '— текст не сохранён'}</div>
      </Раздел>

      <Раздел имя="Факты и источники" открыт
        итог={к.факты.length
          ? `${к.факты.length} фактов · ${подтверждено} с выдержкой${безИсточника ? ` · ${безИсточника} без источника` : ''}`
          : 'текст не ссылается ни на один факт реестра'}>
        {к.факты.length ? (
          <>
            <Таблица
              columns={['Утверждение', 'Значение', 'Дословная выдержка источника', 'Состояние', 'Проверено']}
              rows={к.факты.map((ф) => [
                <span key="s" style={{ display: 'block', maxWidth: 280 }}>{ф.statement}</span>,
                ф.value ?? '—',
                ф.подтверждение
                  ? <span key="q" style={{ display: 'block', maxWidth: 380, color: 'var(--muted)', fontSize: 12, lineHeight: 1.5 }}>
                      «{ф.подтверждение.цитата}»
                      {ф.подтверждение.источник
                        ? <><br /><a href={ф.подтверждение.источник} target="_blank" rel="noreferrer" style={{ color: 'var(--purple)' }}>
                            {ф.подтверждение.источник.replace(/^https?:\/\//, '').slice(0, 52)}
                          </a></>
                        : null}
                    </span>
                  : <span key="q" style={{ color: 'var(--red)' }}>источник не указан</span>,
                ru(ф.status),
                ф.подтверждение?.когда ? ago(ф.подтверждение.когда) : '—',
              ])}
            />
            <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 10, lineHeight: 1.6, maxWidth: 760 }}>
              Подтверждением считается дословная выдержка, а не ссылка рядом. Строка «источник не указан»
              означает, что утверждение в тексте есть, а доказательства под ним нет.
            </div>
          </>
        ) : (
          <div style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.6, maxWidth: 760 }}>
            Список пуст не потому, что фактов нет, а потому, что текст не связан ни с одним утверждением
            реестра. Для поста без цифр это нормально; для поста со стоимостью или дедлайном — повод
            посмотреть, как он прошёл гейт.
          </div>
        )}
      </Раздел>

      <Раздел имя="Две независимые проверки"
        итог={к.проверки.length
          ? `${к.проверки.length} из 2 · замечаний ${замечаний}`
          : 'проверок не записано'}>
        {к.проверки.length ? (
          <>
            {к.проверки.map((п, i) => (
              <div key={i} style={{ padding: '10px 0', borderTop: i ? '1px solid var(--bor)' : 'none' }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
                  <strong style={{ fontSize: 13 }}>{п.provider} · {п.model}</strong>
                  {п.promptVersion ? <Метка тон="тихий">промпт {п.promptVersion}</Метка> : null}
                  <span style={{ fontSize: 12, color: п.verdict === 'passed' || п.verdict === 'supported' ? 'var(--green)' : 'var(--red)' }}>
                    {ru(п.verdict)}
                  </span>
                  {п.стоимость != null ? <span style={{ fontSize: 12, color: 'var(--muted)' }}>{п.стоимость.toFixed(2)} $</span> : null}
                </div>
                {п.фрагменты.map((ф, j) => (
                  <div key={j} style={{ fontSize: 12, color: 'var(--muted)', marginTop: 6, lineHeight: 1.5 }}>— {ф}</div>
                ))}
              </div>
            ))}
            <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 10, lineHeight: 1.6, maxWidth: 760 }}>
              Ревьюеры — разные провайдеры со связанным риском ошибки, а не независимые эксперты. Их
              согласие не делает факт подтверждённым: решает первоисточник, а не большинство.
            </div>
          </>
        ) : (
          <div style={{ fontSize: 13, color: 'var(--muted)', maxWidth: 760, lineHeight: 1.6 }}>
            Записей о проверках нет. Это не «проверки прошли» — это «проверок не было или они не
            записались», и различать эти случаи важнее, чем показать зелёную галочку.
          </div>
        )}
      </Раздел>

      <Раздел имя="Проверка выхода по ступеням"
        итог={`${к.ступени.filter((с) => с.состояние === 'пройдена').length} из ${к.ступени.length}`}>
        {к.ступени.map((с, i) => <Ступенька key={i} с={с} />)}
        <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 10, lineHeight: 1.6, maxWidth: 760 }}>
          «Приняли по API» и «пост виден людям» — разные утверждения. Последняя ступень проверяется
          чтением страницы поста, и её «не проверяли» — это не «не видно».
        </div>
      </Раздел>

      <Раздел имя="Попытки отправки" итог={к.попытки.length ? `${к.попытки.length}` : 'не отправлялась'}>
        {к.попытки.length ? (
          <Таблица
            columns={['№', 'Фаза', 'Идентификатор запроса', 'Результат', 'Начата', 'Кончена']}
            rows={к.попытки.map((п) => [
              String(п.n), п.phase,
              <span key="r" style={{ fontSize: 11, color: 'var(--muted)' }}>{п.requestId ?? '—'}</span>,
              п.error
                ? <span key="e" style={{ color: 'var(--red)' }}>{п.error}</span>
                : (п.result ?? <span key="e" style={{ color: 'var(--muted)' }}>ответа нет</span>),
              дата(п.начата), дата(п.кончена),
            ])}
          />
        ) : (
          <div style={{ fontSize: 13, color: 'var(--muted)' }}>Ни одной попытки: публикация ещё не уходила наружу.</div>
        )}
      </Раздел>

      <Раздел имя="Деньги"
        итог={стоимостьСтатьи ? `статья целиком — ${стоимостьСтатьи.toFixed(2)} $` : 'расходы не записаны'}>
        {к.расходыСтатьи.length ? (
          <Таблица
            columns={['Роль', 'Провайдер', 'Сумма']}
            rows={к.расходыСтатьи.map((р) => [ru(р.роль), р.provider, `${р.сумма.toFixed(2)} $`])}
          />
        ) : (
          <div style={{ fontSize: 13, color: 'var(--muted)' }}>По статье-источнику расходов не записано.</div>
        )}
        <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 10, lineHeight: 1.6, maxWidth: 760 }}>
          Это стоимость статьи целиком, а не доля этой публикации. Доля не считается сознательно: одна
          статья даёт несколько адаптаций, и делить её расходы поровну — значит придумывать число,
          которое потом попадёт в отчёт как измерение.
        </div>
      </Раздел>

      <Раздел имя="Связи" итог={к.родня.length ? `${к.родня.length} адаптаций пакета` : 'связи не прочитались'}>
        {к.родня.length ? (
          <Таблица
            columns={['Адаптация', 'Версия', 'Канал', 'Состояние', 'Ссылка']}
            rows={к.родня.map((р) => [
              <span key="f" style={{ fontWeight: р.этот ? 600 : 400 }}>
                {р.формат === 'social_post' ? 'пост' : р.формат}{р.угол ? ` · ${р.угол}` : ''}{р.этот ? ' — эта' : ''}
              </span>,
              `v${р.версия}`,
              р.канал ?? <span key="c" style={{ color: 'var(--muted)' }}>не запланирована</span>,
              р.статус ? ru(р.статус) : '—',
              р.адрес
                ? <a key="l" href={р.адрес} target="_blank" rel="noreferrer" style={{ color: 'var(--purple)' }}>открыть</a>
                : '—',
            ])}
          />
        ) : null}
      </Раздел>
    </>
  )
}
