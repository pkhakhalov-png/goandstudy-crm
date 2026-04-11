/**
 * Normalize phone number to a standard format: 79146666266
 * Handles: +7, 8, spaces, dashes, dots, parentheses
 */
export function normalizePhone(phone: string | null | undefined): string | null {
  if (!phone) return null

  // Remove everything except digits
  let digits = phone.replace(/\D/g, '')

  if (digits.length === 0) return null

  // Handle Russian numbers
  if (digits.startsWith('8') && digits.length === 11) {
    digits = '7' + digits.slice(1)
  }

  // If no country code and 10 digits — assume Russian
  if (digits.length === 10 && !digits.startsWith('7')) {
    digits = '7' + digits
  }

  // Remove leading + equivalent (already stripped)
  return digits || null
}

/**
 * Check if two phone numbers are the same
 */
export function phonesMatch(a: string | null | undefined, b: string | null | undefined): boolean {
  const na = normalizePhone(a)
  const nb = normalizePhone(b)
  if (!na || !nb) return false
  return na === nb
}
