import { createAdminClient } from '@/lib/supabase/server'
import { ru, ago } from '@/lib/content/overview'
import { Пусто, Таблица } from '../Bits'

export const dynamic = 'force-dynamic'

/** Пакеты: материал, который живёт неделю-другую в разных форматах. */
export default async function PackagesPage() {
  const content = (await createAdminClient()).schema('content' as any)

  const { data: pkgs, error } = await content
    .from('packages')
    .select('id, seo_article_id, status, current_version_id, created_at, updated_at')
    .order('updated_at', { ascending: false }).limit(100)

  if (error) return <Пусто что="Пакеты не прочитались" почему={error.message} />

  if (!pkgs?.length) {
    return (
      <>
        <h2 style={{ margin: '0 0 12px' }}>Пакеты</h2>
        <Пусто
          что="Пакетов нет"
          почему={
            'Пакет создаётся событием о проверенной статье. Мост, который это делает, готов и проверен: '
            + 'десять повторов события дают один пакет. Но к конвейеру статей он ещё не подключён — '
            + 'проверенная статья пока не порождает пакет сама. Это следующий шаг, а не поломка.'
          }
        />
      </>
    )
  }

  const ids = pkgs.map((p: any) => p.id)
  const { data: vers } = await content.from('package_versions').select('id, package_id, version, source_article_version').in('package_id', ids)
  const { data: vars } = await content.from('variants').select('id, package_id, format').in('package_id', ids)

  const versByPkg = new Map<number, any[]>()
  for (const v of (vers ?? []) as any[]) versByPkg.set(v.package_id, [...(versByPkg.get(v.package_id) ?? []), v])
  const varsByPkg = new Map<number, any[]>()
  for (const v of (vars ?? []) as any[]) varsByPkg.set(v.package_id, [...(varsByPkg.get(v.package_id) ?? []), v])

  return (
    <>
      <h2 style={{ margin: '0 0 12px' }}>Пакеты</h2>
      <Таблица
        columns={['Пакет', 'Статья', 'Состояние', 'Версий', 'Варианты', 'Обновлён']}
        rows={(pkgs as any[]).map((p) => [
          <span key="id" style={{ fontVariantNumeric: 'tabular-nums' }}>#{p.id}</span>,
          p.seo_article_id ? `статья #${p.seo_article_id}` : <span style={{ color: 'var(--muted)' }}>без статьи</span>,
          ru(p.status),
          (versByPkg.get(p.id) ?? []).length,
          (varsByPkg.get(p.id) ?? []).map((v) => ru(v.format)).join(', ') || <span style={{ color: 'var(--muted)' }}>нет</span>,
          ago(p.updated_at) ?? '—',
        ])}
      />
    </>
  )
}
