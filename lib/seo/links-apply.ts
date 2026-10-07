/**
 * Поставить входящие ссылки на статью.
 *
 * Зачем это отдельно от экрана. Планировщик ссылок (`article_linkplan`)
 * отработал двадцать восемь раз и сложил 110 предложений, а ставил их только
 * человек кнопкой в админке — и нажал дважды, последний раз 10 сентября. В
 * итоге двадцать четыре статьи остались сиротами: ни одной внутренней ссылки.
 *
 * Google находит страницы по ссылкам. Адрес в карте сайта — заявка, а не
 * гарантия: шесть наших статей неделями висят в состоянии «обнаружена, не
 * проиндексирована», то есть он знает адрес и не дошёл. Ссылка с живой
 * страницы — главное, чем это лечится.
 *
 * Логика вынесена из серверного действия сюда, чтобы её мог звать и шаг
 * очереди. Копия в двух местах разошлась бы: одна правилась бы, другая нет.
 */
import { warnOnError } from '@/lib/supabase/write-guard'
import { enqueueJob } from './enqueue'

export async function applyIncomingLinks(seo: any, articleId: number, dryRun = true) {

  const { planInsertion, applyInsertion } = await import('@/lib/seo/linkinsert')

  const { data: article } = await seo.from('articles')
    .select('id, topic_id, status, current_version_id').eq('id', articleId).single()
  if (!article) return { error: 'статья не найдена' }
  if (article.status !== 'published' && !dryRun) {
    return { error: 'статья не опубликована — ссылка вела бы на несуществующую страницу' }
  }

  const { data: version } = await seo.from('article_versions').select('meta').eq('id', article.current_version_id).single()
  const meta: any = version?.meta ?? {}
  const slug = meta.publish?.slug ?? meta.slug
  const targetUrl = `https://goandstudy.com/blog/${slug}/`

  const { data: links } = await seo.from('link_suggestions')
    .select('id, from_page_id, anchor').eq('to_topic_id', article.topic_id)
    .in('status', ['proposed', 'waiting_target'])
  if (!links?.length) return { error: 'план ссылок пуст' }

  const { data: pages } = await seo.from('pages').select('id, url').in('id', links.map((l: any) => l.from_page_id))
  const byId = new Map((pages ?? []).map((p: any) => [p.id, p.url]))

  const report: { url: string; ok: boolean; note: string }[] = []
  for (const l of links) {
    const donorUrl = String(byId.get(l.from_page_id) ?? '')
    if (!donorUrl) { report.push({ url: `page ${l.from_page_id}`, ok: false, note: 'страница не найдена' }); continue }

    // Статья блога: правит агент на сервере, иначе тема затрёт
    if (donorUrl.includes('/blog/')) {
      const donorSlug = donorUrl.replace(/\/$/, '').split('/').pop()!
      if (dryRun) {
        report.push({ url: donorUrl, ok: true, note: `файл темы: ссылка «${l.anchor}» встанет через агента на сервере` })
        continue
      }
      const { data: exists } = await seo.from('jobs').select('id')
        .eq('step', 'link_insert_theme').eq('article_id', articleId)
        .in('status', ['pending', 'running']).contains('payload', { slug: donorSlug }).limit(1)
      if (exists?.length) { report.push({ url: donorUrl, ok: true, note: 'уже в очереди у агента' }); continue }

      // Агент уже ответил, что ссылка со страницы стоит. Это не отказ, а
      // «сделано до нас»: предложение выполнено, и ставить задачу снова незачем.
      //
      // Без этой ветки предложение навсегда оставалось в статусе proposed, и
      // шаг ставил агенту ту же задачу каждый час. За две недели — двести
      // тридцать два падения на двух одних и тех же ссылках.
      const { data: стояла } = await seo.from('jobs').select('id, last_error')
        .eq('step', 'link_insert_theme').eq('article_id', articleId).eq('status', 'failed')
        .contains('payload', { slug: donorSlug }).limit(1)
      if (стояла?.length && /ссылка на эту страницу уже есть/i.test(String(стояла[0].last_error ?? ''))) {
        await seo.from('link_suggestions').update({ status: 'applied' }).eq('id', l.id)
          .then(warnOnError('link_suggestions · lib/seo/links-apply.ts'))
        report.push({ url: donorUrl, ok: true, note: 'ссылка уже стоит на странице — предложение закрыто' })
        continue
      }

      await enqueueJob(seo, {
        step: 'link_insert_theme', lane: 'production', priority: 15, runner: 'agent',
        article_id: articleId, topic_id: article.topic_id,
        payload: { slug: donorSlug, anchor: l.anchor, target: targetUrl, suggestion_id: l.id },
      })
      report.push({ url: donorUrl, ok: true, note: `поставлено агенту: «${l.anchor}»` })
      continue
    }

    // Обычная страница WordPress: правим через мост
    const res: any = await planInsertion(donorUrl, l.anchor, targetUrl)
    if (!res.ok) { report.push({ url: donorUrl, ok: false, note: res.reason }); continue }
    if (!dryRun) {
      await applyInsertion(seo, res.plan, res.newHtml, articleId)
      await seo.from('link_suggestions').update({ status: 'applied' }).eq('id', l.id).then(warnOnError('link_suggestions · lib/seo/links-apply.ts'))
    }
    report.push({ url: donorUrl, ok: true, note: `анкор «${l.anchor}»: …${res.plan.before.slice(-50)}[${l.anchor}]${res.plan.after.slice(0, 50)}…` })
  }

  return { ok: true, dryRun, report }
}
