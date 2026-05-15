/**
 * Чистый helper для чтения значения с учётом curator_overrides.
 * Не требует Server Actions — используется в RSC и client components.
 *
 * Приоритет: raw_data.curator_overrides[field] → fallback (AI-fill / parser).
 *
 * Возвращает { value, isOverridden, by } чтобы UI мог показать бейдж «ред. куратором».
 */

export type OverrideMeta = { by_name?: string; by_id?: string; at?: string }

export type EffectiveValue<T> = {
  value: T
  isOverridden: boolean
  by?: OverrideMeta
}

export function getOverrides(rawData: any): Record<string, any> & { __meta?: Record<string, OverrideMeta> } {
  if (!rawData || typeof rawData !== 'object') return {}
  return rawData.curator_overrides || {}
}

export function getEffective<T = string>(rawData: any, field: string, fallback: T): EffectiveValue<T> {
  const overrides = getOverrides(rawData)
  const has = Object.prototype.hasOwnProperty.call(overrides, field)
  if (has && overrides[field] !== undefined && overrides[field] !== null && overrides[field] !== '') {
    return {
      value: overrides[field] as T,
      isOverridden: true,
      by: overrides.__meta?.[field],
    }
  }
  return { value: fallback, isOverridden: false }
}

/**
 * Обложка вуза с приоритетом curator → AI.
 * Если куратор удалил обложку — возвращает null (не fallback'ит на AI-фото).
 */
export function getCoverPhoto(school: any): { url: string | null; isCuratorUploaded: boolean; by?: OverrideMeta } {
  const extras = (school?.raw_data as any)?.curator_extras
  if (extras?.cover_photo_url !== undefined) {
    // Куратор активно управлял этим полем — либо загрузил, либо удалил
    return {
      url: extras.cover_photo_url || null,
      isCuratorUploaded: !!extras.cover_photo_url,
      by: extras.cover_photo_by,
    }
  }
  // Куратор не трогал — показываем AI/parser-фото
  return { url: school?.campus_photo_url || null, isCuratorUploaded: false }
}
