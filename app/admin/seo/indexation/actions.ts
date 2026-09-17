'use server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { warnOnError } from '@/lib/supabase/write-guard'

async function assertAdmin() {
  const sb = await createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return { error: 'нужен вход' }
  const { data: profile } = await sb.from('users').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return { error: 'нет прав' }
  return {}
}

/** Поставить обход сайта в очередь. Работу делает воркер, а не это нажатие. */
export async function enqueueSiteIndexCheck() {
  const { error: authErr } = await assertAdmin()
  if (authErr) return { error: authErr }

  const seo = (await createAdminClient()).schema('seo')

  const { data: running } = await seo.from('jobs').select('id')
    .eq('step', 'index_check_site').in('status', ['pending', 'running', 'waiting']).limit(1)
  if (running?.length) return { note: 'проверка уже в очереди — результат появится здесь сам' }

  // Сбрасываем сроки, иначе шаг возьмёт только просроченные и «сейчас» ничего не изменит
  await seo.from('index_status').update({ next_check_at: new Date().toISOString() }).gt('page_id', 0).then(warnOnError('index_status · app/admin/seo/indexation/actions.ts:26'))
  await seo.from('jobs').insert({ step: 'index_check_site', lane: 'findings', priority: 95, payload: {} }).then(warnOnError('jobs · app/admin/seo/indexation/actions.ts:27'))

  revalidatePath('/admin/seo/indexation')
  return { note: 'Поставлено в очередь. Порциями по 60 адресов за тик — на весь сайт уходит несколько минут.' }
}

/**
 * Проверить наши статьи сейчас, не дожидаясь суточного цикла.
 *
 * Отдельно от обхода сайта: статей десяток, ответ приходит за полминуты, и
 * гонять ради них проверку двух сотен страниц незачем.
 *
 * Ограничение частоты двойное. Уже стоящая в очереди задача — второй не ставим:
 * она сделает ровно то же. И не чаще раза в десять минут: за меньший срок ответ
 * Google не меняется, а квота метода не бесконечна (2000 адресов в сутки).
 */
export async function enqueueArticleIndexCheck() {
  const { error: authErr } = await assertAdmin()
  if (authErr) return { error: authErr }

  const seo = (await createAdminClient()).schema('seo')

  // «Уже в очереди» — только про задачу, которая вот-вот пойдёт. После выпуска
  // статьи проверка ставится на сутки вперёд и висит в pending; считать её
  // очередью значит запретить кнопку на целые сутки ровно тогда, когда она
  // нужнее всего — сразу после публикации.
  const soon = new Date(Date.now() + 60_000).toISOString()
  const { data: queued } = await seo.from('jobs').select('id')
    .eq('step', 'article_index_check').in('status', ['pending', 'running', 'waiting'])
    .lte('next_run_at', soon).limit(1)
  if (queued?.length) return { note: 'проверка уже в очереди — результат появится здесь сам' }

  const { data: recent } = await seo.from('jobs').select('created_at')
    .eq('step', 'article_index_check').eq('status', 'done')
    .gt('created_at', new Date(Date.now() - 10 * 60_000).toISOString()).limit(1)
  if (recent?.length) {
    return { note: 'проверяли меньше десяти минут назад — за это время ответ Google не меняется' }
  }

  await seo.from('jobs').insert({
    step: 'article_index_check', lane: 'findings', priority: 95, payload: { force: true },
  }).then(warnOnError('jobs · app/admin/seo/indexation/actions.ts:enqueueArticleIndexCheck'))

  revalidatePath('/admin/seo/indexation')
  return { note: 'Поставлено в очередь: спросим Google про каждую статью, минуя сроки.' }
}
