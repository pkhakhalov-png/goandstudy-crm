'use client'

import { useEffect, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'

/**
 * Какой пункт меню считать активным.
 *
 * Задача одна: подсветка должна переезжать в момент нажатия, а не когда
 * приедет новая страница. Адрес в `usePathname` меняется только после того,
 * как переход завершился, — то есть через полсекунды после клика, и всё это
 * время подсвечен был прежний раздел.
 *
 * Поэтому здесь помнится нажатый адрес и он считается активным, пока настоящий
 * адрес не догонит. Никаких индикаторов загрузки: сам переезд подсветки и есть
 * ответ на нажатие.
 *
 * Страховка на случай, если переход не состоится (отменили, ушли назад,
 * сеть отвалилась): через десять секунд помеченный адрес забывается, иначе
 * подсветка навсегда застряла бы на разделе, куда мы так и не попали.
 */
export function useActiveNav() {
  const pathname = usePathname()
  const [pressed, setPressed] = useState<string | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    setPressed(null)
    if (timer.current) clearTimeout(timer.current)
  }, [pathname])

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])

  const press = (href: string) => {
    setPressed(href)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => setPressed(null), 10_000)
  }

  /** @param exact точное совпадение: нужно «Главной», иначе она активна всегда */
  const isActive = (href: string, exact = false) => {
    const current = pressed ?? pathname
    return exact ? current === href : current === href || current.startsWith(`${href}/`)
  }

  return { isActive, press }
}
