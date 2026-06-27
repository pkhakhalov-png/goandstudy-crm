'use client'

import { useFormStatus } from 'react-dom'

export function SubmitButton({
  children,
  pendingText,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { pendingText?: string }) {
  const { pending } = useFormStatus()
  return (
    <button type="submit" disabled={pending} aria-busy={pending} {...rest}>
      {pending ? (pendingText ?? 'Сохранение…') : children}
    </button>
  )
}
