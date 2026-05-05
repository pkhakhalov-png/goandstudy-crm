/**
 * Лог активностей клиента — фид «Обновления» в кабинете клиента + история у куратора.
 * Каждое значимое действие (одобрение эссе, дорожной карты, добавление вуза/стипендии,
 * смена этапа и т.д.) пишется в client_activities.
 *
 * Не падаем на ошибках логирования — это побочный эффект, а не критичный путь.
 */

export type ActivityType =
  | 'stage_change'
  | 'note'
  | 'essay_approved'
  | 'essay_unapproved'
  | 'roadmap_approved'
  | 'roadmap_unapproved'
  | 'shortlist_added'
  | 'shortlist_removed'
  | 'shortlist_published'
  | 'scholarship_added'
  | 'scholarship_visibility'
  | 'application_created'

export async function logActivity(
  admin: any,
  params: {
    clientId: number
    userId?: string | null
    type: ActivityType
    content: string
    metadata?: Record<string, any>
  },
) {
  try {
    const { error } = await admin.from('client_activities').insert({
      client_id: params.clientId,
      user_id: params.userId || null,
      activity_type: params.type,
      content: params.content,
      metadata: params.metadata || null,
    })
    if (error) {
      console.error('[client-activity] insert failed:', error.message, { type: params.type, clientId: params.clientId })
    }
  } catch (e) {
    console.error('[client-activity] logActivity threw:', e)
  }
}
