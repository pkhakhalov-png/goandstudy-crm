/**
 * Граница контура держится линтером, а не обещанием.
 *
 * Правило п. 0.3 плана: из `app/care/**` и `lib/care/**` нельзя тянуть
 * `createAdminClient` и прочие пишущие модули старой CRM. Правило, которое
 * нельзя проверить, через месяц перестаёт соблюдаться — поэтому проверяем.
 *
 * Файл-образец создаётся на время проверки и удаляется. Держать его в
 * репозитории нельзя: он попал бы в сборку и в проверку типов.
 */
import { describe, it, expect, afterAll } from 'vitest'
import { execFileSync } from 'child_process'
import fs from 'fs'
import path from 'path'

const КАТАЛОГ = path.resolve(process.cwd(), 'app/care/__проверка_границы__')
const ФАЙЛ = path.join(КАТАЛОГ, 'образец.ts')

function линтер(содержимое: string): string {
  fs.mkdirSync(КАТАЛОГ, { recursive: true })
  fs.writeFileSync(ФАЙЛ, содержимое, 'utf8')
  try {
    execFileSync('npx', ['eslint', ФАЙЛ, '--format', 'json'], { encoding: 'utf8', stdio: 'pipe' })
    return ''
  } catch (err) {
    // eslint выходит с кодом 1, когда есть ошибки. Это ожидаемый путь.
    const e = err as { stdout?: string }
    return e.stdout ?? ''
  }
}

afterAll(() => {
  fs.rmSync(КАТАЛОГ, { recursive: true, force: true })
})

describe('граница контура care', () => {
  it('createAdminClient из app/care не проходит линт', () => {
    const вывод = линтер(
      "import { createAdminClient } from '@/lib/supabase/server'\nexport const х = createAdminClient\n"
    )
    expect(вывод).toContain('no-restricted-imports')
  })

  it('пишущие модули старой CRM не проходят линт', () => {
    const вывод = линтер(
      "import { saveRoadmap } from '@/lib/roadmap-actions'\nexport const х = saveRoadmap\n"
    )
    expect(вывод).toContain('no-restricted-imports')
  })

  it('разрешённый импорт проходит', () => {
    const вывод = линтер("import { viewer } from '@/lib/auth/viewer'\nexport const х = viewer\n")
    expect(вывод).not.toContain('no-restricted-imports')
  })

  it('свой клиент базы проходит', () => {
    const вывод = линтер("import { базаCare } from '@/lib/care/db'\nexport const х = базаCare\n")
    expect(вывод).not.toContain('no-restricted-imports')
  })
})
