/**
 * Пороги и флаги отдела продаж.
 *
 * Живут в таблице `rop_settings` парами ключ-значение, меняются в интерфейсе
 * РОПа и, главное, без выкатки. Это единственный способ выключить новое
 * поведение в ту же секунду, когда оно начало мешать, — и именно поэтому оно
 * читается отсюда, а не из констант в коде.
 *
 * Значение хранится в jsonb, но приезжает по-разному: где-то настоящим числом,
 * где-то строкой с числом внутри — исторически вставляли и так, и так. Разбор
 * здесь один на всех, чтобы каждый экран не изобретал свой.
 */
import type { SupabaseClient } from '@supabase/supabase-js'

export type RopSettingRow = { key: string; value: unknown }

/** Прочитать все настройки одним запросом. */
export async function readRopSettings(supabase: SupabaseClient): Promise<RopSettingRow[]> {
  const { data } = await supabase.from('rop_settings').select('key, value')
  return data ?? []
}

function raw(rows: RopSettingRow[], key: string): unknown {
  const row = rows.find(r => r.key === key)
  if (!row) return undefined
  const v = row.value
  // jsonb-строка вида '"true"' или '30' приезжает как строка — разбираем.
  if (typeof v === 'string') {
    try { return JSON.parse(v) } catch { return v }
  }
  return v
}

/**
 * Флаг. Отсутствующий ключ — это НЕ «выключено»: значение по умолчанию задаёт
 * вызывающий, потому что для разных возможностей безопасная сторона разная.
 */
export function flag(rows: RopSettingRow[], key: string, fallback: boolean): boolean {
  const v = raw(rows, key)
  if (v === undefined || v === null) return fallback
  if (typeof v === 'boolean') return v
  if (typeof v === 'string') return v === 'true'
  return Boolean(v)
}

/** Число. Мусор в значении не роняет экран — возвращается запасное. */
export function num(rows: RopSettingRow[], key: string, fallback: number): number {
  const v = raw(rows, key)
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : fallback
}
