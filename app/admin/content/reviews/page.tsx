import { createAdminClient } from '@/lib/supabase/server'
import { ru, ago } from '@/lib/content/overview'
import { Пусто, Таблица } from '../Bits'

export const dynamic = 'force-dynamic'

/**
 * Проверки.
 *
 * Формулировка здесь важнее таблицы: это не два независимых эксперта, а
 * прогоны языковых моделей со связанным риском ошибки. Защита — обязательная
 * выдержка из первоисточника, которую сверяет код, а не согласие моделей
 * между собой.
 */
export default async function ReviewsPage() {
  const content = (await createAdminClient()).schema('content' as any)

  const { data: revs, error } = await content
    .from('reviews')
    .select('id, target_type, target_id, target_version, provider, model, prompt_version, verdict, findings_json, created_at')
    .order('id', { ascending: false }).limit(100)

  if (error) return <Пусто что="Проверки не прочитались" почему={error.message} />

  if (!revs?.length) {
    return (
      <>
        <h2 style={{ margin: '0 0 12px' }}>Проверки</h2>
        <Пусто
          что="Проверок нет"
          почему={
            'Протокол проверки готов и откалиброван — отчёт в docs/gate-calibration.md. В конвейер он пока '
            + 'не включён: это решение принимается по отчёту, а не по умолчанию. Строки здесь появятся, когда '
            + 'проверка начнёт работать на пакетах и вариантах.'
          }
        />
      </>
    )
  }

  return (
    <>
      <h2 style={{ margin: '0 0 4px' }}>Проверки</h2>
      <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 12, lineHeight: 1.6, maxWidth: 760 }}>
        Проверки — это прогоны языковых моделей, а не независимые эксперты: ошибаются они связанно, и
        согласие двух ничего не доказывает. Подтверждением считается дословная выдержка из первоисточника,
        которую сверяет код. Средних баллов и голосования здесь нет: одна проверка против — уже замечание.
      </div>
      <Таблица
        columns={['Проверка', 'Что проверяли', 'Чем', 'Вердикт', 'Замечаний', 'Когда']}
        rows={(revs as any[]).map((r) => [
          <span key="id">#{r.id}</span>,
          `${r.target_type} #${r.target_id}${r.target_version ? ` в. ${r.target_version}` : ''}`,
          <span key="m" style={{ fontSize: 12 }}>{r.provider}/{r.model}{r.prompt_version ? ` · ${r.prompt_version}` : ''}</span>,
          <span key="v" style={{ color: ['supported', 'passed'].includes(r.verdict) ? 'var(--green)' : 'var(--red)' }}>{ru(r.verdict)}</span>,
          Array.isArray(r.findings_json) ? r.findings_json.length : 0,
          ago(r.created_at) ?? '—',
        ])}
      />
    </>
  )
}
