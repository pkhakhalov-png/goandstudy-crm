/**
 * Настройка тестов контура care.
 *
 * Конфигурация лежит здесь, а не в корне: корень — общая территория, а правило
 * границ (п. 0.2 плана) разрешает контуру care только свои каталоги.
 *
 * Запуск: npm run test:care
 */
import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  // Тот же псевдоним, что в tsconfig.json. Vitest про пути tsconfig сам не
  // знает, а тесты импортируют код контура через `@/lib/care/…`.
  resolve: {
    alias: { '@': path.resolve(__dirname, '../..') },
  },
  test: {
    // Только свои тесты. Чужих в репозитории нет, но явное ограничение
    // дешевле, чем однажды случайно запустить всё подряд.
    include: ['tests/care/**/*.test.ts'],
    setupFiles: [path.resolve(__dirname, 'setup.ts')],
    // Защёлка на весь прогон: два прогона разом затирают фикстуры друг друга,
    // и красным становится исправное. Трижды искал дефект там, где его не было.
    globalSetup: [path.resolve(__dirname, 'global-setup.ts')],
    // Тесты ходят в настоящую базу: задание берётся и закрывается в один
    // приём, и параллельные файлы мешали бы друг другу считать строки.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
})
