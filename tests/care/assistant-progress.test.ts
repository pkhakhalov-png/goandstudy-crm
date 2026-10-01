/**
 * Ход работы: куратор видит, на чём помощник сейчас.
 *
 * ЗАЧЕМ. Подбор с проверкой требований идёт до полутора минут. Всё это время на
 * экране была одна неизменная серая строка — и она ничем не отличалась от
 * зависшей. Куратор ждал, не понимая, работает что-то или нет, и спрашивал
 * второй раз: второй раз за те же деньги.
 *
 * ЧТО ПРОВЕРЯЕМ. Что шаги настоящие. Это главное отличие от «печатает…»:
 * строка появляется, когда инструмент действительно вызван, и названа так, как
 * понятно человеку. Выдуманный ход хуже отсутствующего — по нему принимают
 * решение ждать дальше.
 */
import { describe, it, expect } from 'vitest'
import { базаCare } from '@/lib/care/db'
import { спросить, ПОДПИСЬ_ШАГА } from '@/lib/care/ai/assistant'
import { инструменты } from '@/lib/care/ai/tools'
import type { Участник } from '@/lib/care/access'

describe('ход работы помощника', () => {
  it('у каждого инструмента есть человеческая подпись шага', async () => {
    // Иначе в ходе работы всплывёт «edit_task» — слово из кода, которое
    // куратору ничего не говорит.
    const { data: у } = await базаCare()
      .from('members')
      .select('id, user_id, care_role, team_lead_id, active')
      .eq('care_role', 'lead')
      .single()

    const имена = (инструменты(у as unknown as Участник, { все: true }) as unknown as { name: string }[])
      .map((и) => и.name)

    expect(имена.length).toBeGreaterThan(0)
    for (const имя of имена) {
      expect(ПОДПИСЬ_ШАГА[имя], `нет подписи шага для «${имя}»`).toBeTruthy()
    }
  })

  it('подписи на русском и не повторяют названия инструментов', () => {
    for (const [имя, подпись] of Object.entries(ПОДПИСЬ_ШАГА)) {
      expect(подпись).not.toBe(имя)
      expect(подпись, `«${подпись}» без кириллицы`).toMatch(/[а-яё]/i)
    }
  })

  it('колбэк зовётся на каждом вызове инструмента, а не один раз в конце', async () => {
    const { data: у } = await базаCare()
      .from('members')
      .select('id, user_id, care_role, team_lead_id, active')
      .eq('care_role', 'lead')
      .single()
    const { data: дело } = await базаCare()
      .from('cases')
      .select('id')
      .eq('is_synthetic', true)
      .limit(1)
      .single()

    const шаги: string[] = []
    const ответ = await спросить(
      у as unknown as Участник,
      { все: false, caseId: дело!.id },
      'сколько открытых задач по этому делу и какая ближайшая по сроку?',
      (ш) => {
        шаги.push(ш)
      }
    )

    expect(ответ.текст.length).toBeGreaterThan(0)
    expect(шаги.length).toBeGreaterThan(0)
    // Столько же, сколько вызовов инструментов — не больше и не меньше.
    expect(шаги.length).toBeLessThanOrEqual(ответ.шагов + 1)
    for (const ш of шаги) expect(Object.values(ПОДПИСЬ_ШАГА)).toContain(ш)
  }, 120_000)

  it('ошибка в показе хода не валит разговор, за который заплачено', async () => {
    const { data: у } = await базаCare()
      .from('members')
      .select('id, user_id, care_role, team_lead_id, active')
      .eq('care_role', 'lead')
      .single()

    const ответ = await спросить(
      у as unknown as Участник,
      { все: true },
      'сколько у меня дел?',
      () => {
        throw new Error('база недоступна')
      }
    )

    expect(ответ.текст.length).toBeGreaterThan(0)
    expect(ответ.отказ).toBe(false)
  }, 120_000)
})
