/**
 * Настройка тестов контура care.
 *
 * Конфигурация лежит здесь, а не в корне: корень — общая территория, а правило
 * границ (п. 0.2 плана) разрешает контуру care только свои каталоги.
 *
 * Запуск: npx vitest run --config tests/care/vitest.config.ts
 * (после `npm i -D vitest` и добавления скрипта `test:care` в package.json —
 *  и то и другое сейчас НЕ сделано, см. docs/care/STATUS.md)
 */
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // Только свои тесты. Чужих в репозитории нет, но явное ограничение
    // дешевле, чем однажды случайно запустить всё подряд.
    include: ['tests/care/**/*.test.ts'],
    // Тесты ходят в настоящую базу: задание берётся и закрывается в один
    // приём, и параллельные файлы мешали бы друг другу считать строки.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
})
