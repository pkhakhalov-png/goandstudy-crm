/**
 * Проверка напоминаний. Раздел «Этап 3» плана сборки.
 *
 * Показывает только напоминания по делам в области куратора: очередь строится
 * из `видимыеДела`, как и всё остальное.
 */
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { сессияКонтура } from '@/lib/care/session'
import { видимыеДела } from '@/lib/care/access'
import { базаCare, базаPublic } from '@/lib/care/db'
import { режим } from '@/lib/care/mode'
import { ReminderQueue, type Напоминание } from './ReminderQueue'

export const dynamic = 'force-dynamic'

export default async function НапоминанияСтраница() {
  const сессия = await сессияКонтура()
  if (!сессия?.участник) notFound()

  const [область, состояние] = await Promise.all([видимыеДела(сессия.участник), режим()])

  let очередь: Напоминание[] = []

  if (!область.пусто) {
    const { data: предложения } = await базаCare()
      .from('proposals')
      .select('id, case_id, payload, created_at')
      .in('case_id', область.дела)
      .eq('kind', 'reminder')
      .eq('status', 'pending')
      .order('created_at')

    const строки = (предложения ?? []) as {
      id: string
      case_id: string
      payload: {
        текст?: string
        документ?: string
        срок?: string
        просрочено?: boolean
        чем?: 'модель' | 'шаблон'
        почему_шаблон?: string
      }
      created_at: string
    }[]

    if (строки.length) {
      const { data: дела } = await базаCare()
        .from('cases')
        .select('id, client_id, is_synthetic, synthetic_name')
        .in('id', [...new Set(строки.map((с) => с.case_id))])

      const записи = (дела ?? []) as { id: string; client_id: number; is_synthetic: boolean; synthetic_name: string | null }[]
      const настоящие = записи.filter((д) => !д.is_synthetic)
      const { data: клиенты } = настоящие.length
        ? await базаPublic().from('clients').select('id, name').in('id', настоящие.map((д) => д.client_id))
        : { data: [] }
      const имена = new Map((клиенты ?? []).map((к) => [к.id as number, к.name as string | null]))

      const имяДела = new Map(
        записи.map((д) => [
          д.id,
          д.is_synthetic ? (д.synthetic_name ?? 'тестовое дело') : (имена.get(д.client_id) ?? `клиент #${д.client_id}`),
        ])
      )

      очередь = строки.map((с) => ({
        id: с.id,
        caseId: с.case_id,
        клиент: имяДела.get(с.case_id) ?? 'без имени',
        документ: с.payload.документ ?? 'документ',
        срок: с.payload.срок ?? null,
        просрочено: с.payload.просрочено === true,
        текст: с.payload.текст ?? '',
        // Предложения, подготовленные до 30.09, поля «чем» не имеют — они
        // шаблонные по построению, и показать это честнее, чем промолчать.
        чем: с.payload.чем === 'модель' ? 'модель' : 'шаблон',
        почемуШаблон: с.payload.почему_шаблон ?? null,
        подготовлено: с.created_at,
      }))
    }
  }

  return (
    <>
      <Link href="/care/review" className="ds-link" style={{ fontSize: 13 }}>
        ← На проверку
      </Link>

      <h1 className="ds-hero-h1" style={{ fontSize: 30, margin: '12px 0 4px' }}>
        Напоминания
      </h1>
      <p style={{ color: 'var(--ds-muted)', marginBottom: 22, fontSize: 14 }}>
        Каждое видит человек перед отправкой
      </p>

      <ReminderQueue очередь={очередь} отправкиВключены={состояние.external_sends} />
    </>
  )
}
