'use client'
import { useState, useTransition } from 'react'
import { проверитьПодключение } from './actions'

/**
 * Кнопка проверки и то, что она показала.
 *
 * Результат остаётся на экране построчно, а не сворачивается в «ок» или
 * «ошибка». Разница между «бот не администратор канала» и «токен отозван» — это
 * разные действия человека, и подменять их общим словом значит заставлять его
 * идти выяснять то, что мы уже знаем.
 */
export function Проверить({ код, доставка }: { код: string; доставка: string }) {
  const [идёт, старт] = useTransition()
  const [строки, setСтроки] = useState<string[] | null>(null)
  const [ошибка, setОшибка] = useState<string | null>(null)

  if (доставка !== 'api') return null

  return (
    <div style={{ marginTop: 10 }}>
      <button
        className="btn-s"
        disabled={идёт}
        onClick={() => старт(async () => {
          setОшибка(null); setСтроки(null)
          const r = await проверитьПодключение(код)
          if ('error' in r) setОшибка(r.error); else setСтроки(r.строки)
        })}
      >
        {идёт ? 'Проверяю…' : 'Проверить подключение'}
      </button>

      {ошибка ? (
        <div style={{ marginTop: 8, fontSize: 12, color: 'var(--red)' }}>{ошибка}</div>
      ) : null}

      {строки?.length ? (
        <div style={{
          marginTop: 8, padding: '10px 12px', borderRadius: 8,
          background: 'var(--surf2)', border: '1px solid var(--bor2)',
          fontSize: 12, lineHeight: 1.7, whiteSpace: 'pre-wrap',
        }}>
          {строки.join('\n')}
        </div>
      ) : null}
    </div>
  )
}
