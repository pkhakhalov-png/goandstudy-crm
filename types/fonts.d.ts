// Ни opentype.js, ни wawoff2 не везут типы. Описываем ровно то, чем пользуемся
// в lib/seo/cover-hook.ts, — остальное этому проекту не нужно.
declare module 'opentype.js' {
  export type Path = { toPathData(precision?: number): string }
  export type Font = {
    getPath(text: string, x: number, y: number, fontSize: number): Path
    getAdvanceWidth(text: string, fontSize: number): number
  }
  export function parse(buffer: ArrayBuffer): Font
  const _default: { parse: typeof parse }
  export default _default
}

declare module 'wawoff2' {
  export function decompress(data: Uint8Array): Promise<Uint8Array>
  export function compress(data: Uint8Array): Promise<Uint8Array>
}
