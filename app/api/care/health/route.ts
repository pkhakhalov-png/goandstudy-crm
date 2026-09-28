/**
 * Состояние контура care.
 *
 * Нужен потому, что на ветке всё выкатывается на отдельный адрес, и вопрос
 * «этот деплой вообще живой и с какими переменными» иначе решается только
 * попыткой прислать настоящее сообщение.
 *
 * Два уровня подробностей. Без секрета — только то, что не помогает нападающему:
 * жив ли маршрут и в каком режиме контур. С секретом — версия кода, состояние
 * подключений и список недостающих переменных. Список недостающего наружу не
 * отдаём: он прямо говорит, какая защита сейчас не настроена.
 */
import { NextRequest, NextResponse } from 'next/server'
import { базаCare } from '@/lib/care/db'
import { режим } from '@/lib/care/mode'
import { необязательна, чегоНеХватает, ПЕРЕМЕННЫЕ_КОНТУРА } from '@/lib/care/env'
import { секретГодится, секретыСовпали } from '@/lib/care/secret'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

function подробностиРазрешены(req: NextRequest): boolean {
  const секрет = необязательна('CARE_TICK_SECRET')
  if (!секрет || !секретГодится(секрет).ok) return false
  return секретыСовпали(req.headers.get('x-care-tick-secret'), секрет)
}

export async function GET(req: NextRequest) {
  const подробно = подробностиРазрешены(req)

  // Режим читается из базы, поэтому это заодно проверка, что ключ контура
  // рабочий: не прочитали — значит либо нет CARE_DB_KEY, либо роль потеряла права.
  let состояниеРежима: Awaited<ReturnType<typeof режим>> | null = null
  let ошибкаБазы: string | null = null
  try {
    состояниеРежима = await режим()
  } catch (err) {
    ошибкаБазы = err instanceof Error ? err.message : String(err)
  }

  const общее = {
    ok: ошибкаБазы === null,
    contour: 'care',
    mode: состояниеРежима?.mode ?? 'unknown',
    external_sends: состояниеРежима?.external_sends ?? false,
    time: new Date().toISOString(),
  }

  if (!подробно) {
    return NextResponse.json(общее, { status: ошибкаБазы ? 503 : 200 })
  }

  let подключения: unknown[] = []
  let ошибкаПодключений: string | null = null
  try {
    const { data, error } = await базаCare()
      .from('connections')
      .select('kind, status, last_ok_at, last_error')
      .order('kind')
    if (error) ошибкаПодключений = error.message
    подключения = data ?? []
  } catch (err) {
    ошибкаПодключений = err instanceof Error ? err.message : String(err)
  }

  return NextResponse.json(
    {
      ...общее,
      version: необязательна('VERCEL_GIT_COMMIT_SHA') ?? 'локально',
      env_missing: чегоНеХватает([...ПЕРЕМЕННЫЕ_КОНТУРА]),
      db_error: ошибкаБазы,
      connections: подключения,
      connections_error: ошибкаПодключений,
      note: состояниеРежима?.note ?? null,
    },
    { status: ошибкаБазы ? 503 : 200 }
  )
}
