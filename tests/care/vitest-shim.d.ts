/**
 * Заглушка типов vitest.
 *
 * ВРЕМЕННЫЙ ФАЙЛ. Удалить сразу после `npm i -D vitest`.
 *
 * Зачем. `tsconfig.json` включает `**\/*.ts`, а править его нельзя: в списке
 * разрешённых исключений плана (п. 0.2) его нет. Значит тесты попадают под
 * проверку типов при `next build`. Пока пакета нет, `import from 'vitest'`
 * даёт ошибку модуля и роняет сборку — то есть тесты, написанные «на будущее»,
 * сломали бы деплой ветки.
 *
 * Когда vitest появится, настоящие типы и эта заглушка начнут спорить за одно
 * имя модуля, и TypeScript скажет об этом вслух. Это сделано намеренно: тихо
 * устаревшая заглушка опаснее шумной.
 */
declare module 'vitest' {
  type Тело = () => void | Promise<void>

  export function describe(название: string, тело: Тело): void
  export function it(название: string, тело: Тело): void
  export function test(название: string, тело: Тело): void
  export function beforeAll(тело: Тело): void
  export function afterAll(тело: Тело): void
  export function beforeEach(тело: Тело): void
  export function afterEach(тело: Тело): void

  interface Ожидание {
    toBe(значение: unknown): void
    toEqual(значение: unknown): void
    toBeTruthy(): void
    toBeFalsy(): void
    toBeNull(): void
    toBeDefined(): void
    toBeGreaterThan(значение: number): void
    toBeGreaterThanOrEqual(значение: number): void
    toHaveLength(значение: number): void
    toContain(значение: unknown): void
    toMatch(значение: RegExp | string): void
    not: Ожидание
  }

  export function expect(фактическое: unknown): Ожидание
}

declare module 'vitest/config' {
  export function defineConfig<T>(конфигурация: T): T
}
