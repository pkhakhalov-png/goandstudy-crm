'use client'

/**
 * Кнопка «Загрузить обложку» / «Убрать обложку».
 * Видна только staff (через useEditMode().canEdit).
 *
 * Flow:
 *  1. file input → readAsImage → canvas resize до 1600px max + JPEG 0.82
 *  2. prepareSchoolCoverUpload → получаем signed upload URL
 *  3. PUT файла прямо в Supabase Storage
 *  4. finalizeSchoolCover → сохраняем public URL в raw_data.curator_extras
 *  5. router.refresh() чтобы новая обложка сразу отрисовалась
 */

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useEditMode } from './EditMode'
import { prepareSchoolCoverUpload, finalizeSchoolCover, removeSchoolCover } from '@/lib/curator-edit-actions'

const MAX_WIDTH = 1600
const QUALITY = 0.82

async function compressImage(file: File): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      URL.revokeObjectURL(url)
      let { width, height } = img
      if (width > MAX_WIDTH) {
        height = Math.round((height * MAX_WIDTH) / width)
        width = MAX_WIDTH
      }
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext('2d')
      if (!ctx) return reject(new Error('canvas 2d не доступен'))
      ctx.fillStyle = '#fff'  // на случай PNG с прозрачностью
      ctx.fillRect(0, 0, width, height)
      ctx.drawImage(img, 0, 0, width, height)
      canvas.toBlob(
        (blob) => blob ? resolve(blob) : reject(new Error('canvas.toBlob вернул null')),
        'image/jpeg', QUALITY,
      )
    }
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('файл не является изображением')) }
    img.src = url
  })
}

export function CoverPhotoUploader({ schoolId, hasCustomCover }: { schoolId: number; hasCustomCover: boolean }) {
  const router = useRouter()
  const { canEdit } = useEditMode()
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  if (!canEdit) return null

  async function handleFile(file: File) {
    setBusy(true); setErr(null)
    try {
      // 1) Сжимаем
      const blob = await compressImage(file)

      // 2) Готовим signed upload URL
      const prep = await prepareSchoolCoverUpload({ schoolId, ext: 'jpg' })
      if (!prep.ok) throw new Error(prep.error)

      // 3) PUT в storage
      const put = await fetch(prep.uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': 'image/jpeg' },
        body: blob,
      })
      if (!put.ok) throw new Error(`storage upload ${put.status}`)

      // 4) Сохраняем URL в БД
      const fin = await finalizeSchoolCover({ schoolId, storagePath: prep.storagePath })
      if (!fin.ok) throw new Error(fin.error)

      router.refresh()
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'Ошибка')
    } finally {
      setBusy(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  async function handleRemove() {
    if (!confirm('Убрать обложку вуза? Поле станет пустым (AI-фото не вернётся).')) return
    setBusy(true); setErr(null)
    const res = await removeSchoolCover({ schoolId })
    setBusy(false)
    if (res.ok) router.refresh()
    else setErr(res.error)
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) handleFile(f)
        }}
        style={{ display: 'none' }}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={busy}
        className="btn-s"
        style={{ fontSize: 12, padding: '8px 14px', whiteSpace: 'nowrap', opacity: busy ? 0.6 : 1 }}
      >
        {busy ? 'Загружаем…' : hasCustomCover ? '🖼 Заменить обложку' : '🖼 Загрузить обложку'}
      </button>
      {hasCustomCover && !busy && (
        <button
          type="button"
          onClick={handleRemove}
          className="btn-s"
          style={{
            fontSize: 12, padding: '8px 14px', whiteSpace: 'nowrap',
            background: 'rgba(255,59,48,.06)', color: '#C92D22',
            border: '1px solid rgba(255,59,48,.2)',
          }}
        >
          ✕ Убрать обложку
        </button>
      )}
      {err && (
        <span style={{ fontSize: 11, color: '#C92D22' }}>Ошибка: {err}</span>
      )}
    </div>
  )
}
