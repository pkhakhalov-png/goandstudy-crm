'use client'

/**
 * Подборка сравнимой таблицей.
 *
 * ПОЧЕМУ НЕ КАРТОЧКИ. Карточка хороша, когда смотрят на одну вещь. Здесь
 * смотрят на семь-десять и выбирают: «где дешевле», «где срок раньше», «что не
 * подходит». В карточках это читается по очереди и не сравнивается — глаз
 * держит два числа, а не десять. Колонка сравнивается сразу.
 *
 * ЧТО ВИДНО ВСЕГДА. Стоимость, срок подачи и то, что не сходится. Остальное —
 * почему подходит, цитаты со страниц вуза, что осталось проверить — по
 * раскрытию строки: это нужно, когда проверяешь, а не когда выбираешь.
 *
 * ЧЕГО НЕ ПРЯЧЕМ НИКОГДА. «Не подходит» и «проверить». Спрятать риск под
 * нажатие — то же самое, что его не показать: до него не доберутся, пока не
 * станет поздно.
 *
 * ПОЧЕМУ НЕИЗВЕСТНОЕ НАПИСАНО СЛОВОМ. Пустая ячейка читается как ноль или как
 * «неважно». «Не указана» — это сведение: его можно пойти и выяснить.
 */
import { useState } from 'react'
import { ProgramControls } from './cases/[id]/CaseOperations'
import { буквыВуза, цветВуза } from '@/lib/care/herb'

export type СтрокаТаблицы = {
  id: string
  вуз: string
  программа: string
  место: string
  ссылка: string | null
  стоимость: string | null
  срокПодачи: string | null
  почему: string
  несходится: { вывод: string; объяснение: string }[]
  проверено: { вид: string; значение: string; цитата: string }[]
  проверить: string[]
  выбрана: boolean
}

export function ProgramTable({ caseId, строки }: { caseId: string; строки: СтрокаТаблицы[] }) {
  const [раскрыта, раскрыть] = useState<string | null>(null)

  if (!строки.length) return null

  return (
    <div className="care-таб-обёртка">
      <table className="care-таб">
        <thead>
          <tr>
            <th style={{ width: '38%' }}>Программа</th>
            <th>Стоимость</th>
            <th>Срок подачи</th>
            <th>Соответствие</th>
            <th aria-label="решение" />
          </tr>
        </thead>
        <tbody>
          {строки.map((с, и) => {
            const плохо = с.несходится.filter((в) => в.вывод === 'не подходит')
            const неясно = с.несходится.filter((в) => в.вывод !== 'не подходит')
            const открыта = раскрыта === с.id

            return (
              <>
                <tr
                  key={с.id}
                  className="care-таб-строка"
                  data-выбрана={с.выбрана ? '1' : '0'}
                  onClick={() => раскрыть(открыта ? null : с.id)}
                >
                  <td>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                      <span
                        aria-hidden
                        className="care-таб-знак"
                        style={{
                          background: цветВуза(с.вуз),
                          fontSize: буквыВуза(с.вуз).length > 2 ? 10 : 12,
                        }}
                      >
                        {буквыВуза(с.вуз)}
                      </span>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 600, lineHeight: 1.35 }}>{с.программа}</div>
                        <div className="care-таб-тихо">
                          {с.вуз}
                          {с.место ? ` · ${с.место}` : ''}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="care-таб-число">
                    {с.стоимость ?? <span className="care-таб-тихо">не указана</span>}
                  </td>
                  <td className="care-таб-число">
                    {с.срокПодачи ?? <span className="care-таб-тихо">не проверен</span>}
                  </td>
                  <td>
                    {/* Несходящееся наружу: это единственное, ради чего вся
                        проверка и затевалась. */}
                    {плохо.length ? (
                      <span className="care-метка care-метка-плохо">не подходит</span>
                    ) : неясно.length ? (
                      <span className="care-метка care-метка-неясно">неясно</span>
                    ) : с.проверить.length ? (
                      <span className="care-метка care-метка-ждём">
                        проверить {с.проверить.length}
                      </span>
                    ) : (
                      <span className="care-таб-тихо">сходится</span>
                    )}
                  </td>
                  <td onClick={(e) => e.stopPropagation()}>
                    <ProgramControls
                      caseId={caseId}
                      itemId={с.id}
                      статус={с.выбрана ? 'chosen' : 'active'}
                      первая={и === 0}
                      последняя={и === строки.length - 1}
                    />
                  </td>
                </tr>

                {открыта && (
                  <tr key={`${с.id}-подробно`} className="care-таб-подробно">
                    <td colSpan={5}>
                      {с.почему && <p className="care-таб-почему">{с.почему}</p>}

                      {с.несходится.map((в, j) => (
                        <div
                          key={j}
                          className="care-таб-вывод"
                          data-плохо={в.вывод === 'не подходит' ? '1' : '0'}
                        >
                          {в.вывод === 'не подходит' ? 'Не подходит: ' : 'Неясно: '}
                          {в.объяснение}
                        </div>
                      ))}

                      {с.проверить.length > 0 && (
                        <div className="care-таб-ждём">Проверить: {с.проверить.join(' · ')}</div>
                      )}

                      {с.проверено.map((т, j) => (
                        <div key={j} className="care-таб-факт">
                          ✓ {т.вид}: {т.значение}
                          {т.цитата && (
                            <div className="care-таб-цитата">
                              «{т.цитата.length > 180 ? `${т.цитата.slice(0, 180)}…` : т.цитата}»
                            </div>
                          )}
                        </div>
                      ))}

                      {с.ссылка && (
                        <a
                          href={с.ссылка}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="ds-link"
                          style={{ fontSize: 12, display: 'inline-block', marginTop: 8 }}
                        >
                          страница программы на сайте вуза ↗
                        </a>
                      )}
                    </td>
                  </tr>
                )}
              </>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
