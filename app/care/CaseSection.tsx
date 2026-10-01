'use client'

/**
 * Сворачивающийся блок страницы дела.
 *
 * ЗАЧЕМ. Открытое дело — это восемь блоков подряд, и стратегия поступления одна
 * занимает два экрана. Куратор, которому нужны задачи, пролистывает мимо всего
 * остального. Свёрнутый блок называет, что внутри, одной строкой — и до нужного
 * доезжаешь за один взгляд, а не за три прокрутки.
 *
 * ПОЧЕМУ СОСТОЯНИЕ ЖИВЁТ В БРАУЗЕРЕ. Куратор разворачивает «Что известно»,
 * правит факт, страница перезагружается после действия — и всё схлопывается
 * обратно. Это злит сильнее, чем длинная страница. Храним по ключу блока в
 * localStorage: у каждого куратора свой набор того, с чем он работает.
 *
 * ПОЧЕМУ НЕ max-height С ЗАПАСОМ. Так делают, и так ломается: стратегия на
 * десять абзацев выше любого запаса, и низ обрезается молча. `grid-template-rows`
 * от 0fr к 1fr анимирует до настоящей высоты содержимого, какой бы она ни была.
 */
import { useCallback, useSyncExternalStore } from 'react'

const КЛЮЧ = 'care:раскрыто:'
/** Своё событие: `storage` приходит только в другие вкладки, не в свою. */
const СОБЫТИЕ = 'care:раскрыто'

function подписаться(слушатель: () => void): () => void {
  window.addEventListener(СОБЫТИЕ, слушатель)
  window.addEventListener('storage', слушатель)
  return () => {
    window.removeEventListener(СОБЫТИЕ, слушатель)
    window.removeEventListener('storage', слушатель)
  }
}

export function CaseSection({
  ключ,
  заголовок,
  сводка,
  действие,
  поумолчанию = false,
  дети,
}: {
  /** Устойчивый ключ блока — по нему запоминается, раскрыт он или нет. */
  ключ: string
  заголовок: string
  /** Одна строка о содержимом: сколько чего и что главное. Видна всегда. */
  сводка: string
  /** Кнопка в шапке блока. Нажатие на неё не сворачивает блок. */
  действие?: React.ReactNode
  поумолчанию?: boolean
  дети: React.ReactNode
}) {
  // Через внешнее хранилище, а не через состояние с эффектом: на сервере
  // localStorage нет, и первый кадр должен быть ровно таким, каким его
  // отрисовал сервер, иначе React считает разметку разошедшейся.
  const снимок = useSyncExternalStore(
    подписаться,
    useCallback(() => window.localStorage.getItem(КЛЮЧ + ключ), [ключ]),
    () => null
  )
  const раскрыт = снимок === null ? поумолчанию : снимок === '1'

  const переключить = () => {
    window.localStorage.setItem(КЛЮЧ + ключ, раскрыт ? '0' : '1')
    window.dispatchEvent(new Event(СОБЫТИЕ))
  }

  return (
    <section className="care-block" data-open={раскрыт ? '1' : '0'}>
      <div className="care-block-head">
        <button
          type="button"
          className="care-block-toggle"
          onClick={переключить}
          aria-expanded={раскрыт}
        >
          <span className="care-block-chev" aria-hidden>
            ▾
          </span>
          <span className="care-block-title">{заголовок}</span>
          <span className="care-block-sum">{сводка}</span>
        </button>
        {действие && <div className="care-block-act">{действие}</div>}
      </div>

      <div className="care-block-body">
        <div className="care-block-inner">{дети}</div>
      </div>
    </section>
  )
}
