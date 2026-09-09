'use server'

import { createClient, createAdminClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { persistOpportunities } from '@/lib/seo/opportunities'

async function assertAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Не авторизован' as const, user: null }
  const { data: profile } = await supabase.from('users').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return { error: 'Только админ' as const, user: null }
  return { error: null, user }
}

// Пересчитать очередь возможностей из текущих находок.
export async function recomputeOpportunities() {
  const { error } = await assertAdmin()
  if (error) return { error }
  try {
    const seo = (await createAdminClient()).schema('seo')
    const res = await persistOpportunities(seo)
    revalidatePath('/admin/seo/opportunities')
    return { success: true, ...res }
  } catch (e: any) { return { error: e?.message ?? 'ошибка' } }
}

// Изменить статус возможности (new | approved | queued | dismissed | done).
export async function setOpportunityStatus(id: number, status: string) {
  const { error } = await assertAdmin()
  if (error) return { error }
  const seo = (await createAdminClient()).schema('seo')
  const { error: e } = await seo.from('opportunities').update({ status, updated_at: new Date().toISOString() }).eq('id', id)
  if (e) return { error: e.message }
  revalidatePath('/admin/seo/opportunities')
  return { success: true }
}

// Запустить эксперимент по возможности: фиксирует baseline из GSC (§16).
export async function startExperiment(opportunityId: number) {
  const { error, user } = await assertAdmin()
  if (error) return { error }
  const seo = (await createAdminClient()).schema('seo')

  const { data: opp } = await seo.from('opportunities').select('id, kind, page_ids, decision, evidence').eq('id', opportunityId).single()
  if (!opp) return { error: 'возможность не найдена' }
  const pageId = opp.page_ids?.[0]
  if (!pageId) return { error: 'у возможности нет страницы' }
  const { data: page } = await seo.from('pages').select('id, normalized_url').eq('id', pageId).single()
  if (!page) return { error: 'страница не найдена' }

  // baseline из gsc_page_daily за 28/56/90 дней
  const win = async (days: number) => {
    const since = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10)
    const { data } = await seo.from('gsc_page_daily').select('clicks, impressions, position').eq('normalized_url', page.normalized_url).gte('date', since)
    let c = 0, i = 0, pw = 0
    for (const r of data ?? []) { c += r.clicks || 0; i += r.impressions || 0; pw += (r.position || 0) * (r.impressions || 0) }
    return { clicks: c, impressions: i, ctr: i ? Math.round((c / i) * 1000) / 1000 : 0, position: i ? Math.round((pw / i) * 10) / 10 : null }
  }
  const baseline = { captured_at: new Date().toISOString(), url: page.normalized_url, d28: await win(28), d56: await win(56), d90: await win(90) }

  const changeType = opp.decision === 'UPDATE' ? 'snippet' : opp.decision === 'EXPAND' ? 'content_expand' : opp.decision === 'SCHEMA' ? 'schema' : opp.decision === 'LINK_ONLY' ? 'internal_links' : 'snippet'
  const { data: exp, error: e } = await seo.from('experiments').insert({
    page_id: pageId, opportunity_id: opportunityId,
    hypothesis: `${opp.decision} по «${opp.evidence?.url || page.normalized_url}»: ${opp.evidence?.query ? 'запрос ' + opp.evidence.query : opp.kind}`,
    change_type: changeType, primary_metric: opp.kind === 'ctr_opportunity' ? 'ctr' : 'clicks',
    guardrail_metrics: ['position', 'clicks'], baseline, min_observation_days: 28, started_at: new Date().toISOString(),
  }).select('id').single()
  if (e) return { error: e.message }

  await seo.from('opportunities').update({ status: 'in_production', updated_at: new Date().toISOString() }).eq('id', opportunityId)
  revalidatePath('/admin/seo/opportunities')
  revalidatePath('/admin/seo/experiments')
  return { success: true, experiment_id: exp.id }
}
