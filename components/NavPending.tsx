'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useLinkStatus } from 'next/link'

/**
 * Показывает, что переход начался: точка на пункте меню и полоска поверх экрана.
 *
 * Ставится внутрь `<Link>` — хук `useLinkStatus` знает только про ту ссылку, в
 * которую вложен. Это и удобно: одновременно «в пути» бывает одна ссылка, и
 * общее состояние заводить не нужно.
 *
 * ПОЧЕМУ НЕ `loading.tsx`. Тот подставляет заглушку вместо содержимого, но Next
 * при этом выбрасывает текущую страницу сразу, ещё до ответа сервера. Экран мигал
 * серым при каждом переходе, даже когда новая страница приезжала за треть
 * секунды. Без заглушки прежняя страница остаётся на месте, приглушается, а
 * поверх идёт полоска — это ответ на нажатие, а не подмена экрана.
 *
 * ПОЧЕМУ ПОЛОСКА ЧЕРЕЗ ПОРТАЛ. На узком экране сайдбар уезжает за край через
 * `transform`, а трансформация у предка превращает `position: fixed` у потомков
 * в позиционирование относительно неё же. Полоска осталась бы внутри уехавшего
 * сайдбара, то есть за кадром. Портал выносит её в `body`, где ей и место.
 */
export function NavPending({ accent }: {
  /** Цвет полоски. У каждого раздела свой: админка фиолетовая, РОП золотой,
      продажник зелёный. Через переменную не передать — портал выносит полоску
      из сайдбара, где эта переменная объявлена. */
  accent?: string
} = {}) {
  const { pending } = useLinkStatus()
  const [mounted, setMounted] = useState(false)

  useEffect(() => setMounted(true), [])

  if (!pending) return <span aria-hidden className="ni-dot" />

  return (
    <>
      <span aria-hidden className="ni-dot is-pending" />
      {mounted && createPortal(
        <>
          <span aria-hidden className="nav-progress" style={accent ? { background: accent } : undefined} />
          <span className="sr-only" role="status">Страница загружается</span>
        </>,
        document.body,
      )}
    </>
  )
}
