import crypto from 'crypto'

const TBANK_API = 'https://securepay.tinkoff.ru/v2'
const TERMINAL_KEY = process.env.TBANK_TERMINAL_KEY!
const PASSWORD = process.env.TBANK_PASSWORD!

function generateToken(params: Record<string, string | number | boolean>): string {
  const withPassword: Record<string, string> = { ...Object.fromEntries(
    Object.entries(params).map(([k, v]) => [k, String(v)])
  ), Password: PASSWORD }

  const sorted = Object.keys(withPassword).sort()
  const concatenated = sorted.map(k => withPassword[k]).join('')
  return crypto.createHash('sha256').update(concatenated).digest('hex')
}

export async function tbankInit(params: {
  amount: number // in kopecks
  orderId: string
  description: string
  email?: string
  phone?: string
  taxation?: string
}) {
  // Token is calculated from flat params only (no Receipt/DATA)
  const tokenParams: Record<string, string | number> = {
    TerminalKey: TERMINAL_KEY,
    Amount: params.amount,
    OrderId: params.orderId,
    Description: params.description,
  }
  const token = generateToken(tokenParams)

  const body: Record<string, any> = {
    ...tokenParams,
    Token: token,
    Receipt: {
      Taxation: params.taxation || 'usn_income',
      Items: [{
        Name: params.description.slice(0, 128),
        Price: params.amount,
        Quantity: 1.00,
        Amount: params.amount,
        Tax: 'none',
        PaymentMethod: 'full_payment',
        PaymentObject: 'service',
      }],
      ...(params.email ? { Email: params.email } : {}),
      ...(params.phone ? { Phone: params.phone } : {}),
    },
  }

  const payload = JSON.stringify(body)
  console.log('[T-Bank Init] sending:', payload)

  const res = await fetch(`${TBANK_API}/Init`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: payload,
  })
  const json = await res.json()
  console.log('[T-Bank Init] received:', JSON.stringify(json))
  return json as {
    Success: boolean
    ErrorCode: string
    Message?: string
    Details?: any
    PaymentId?: string
    PaymentURL?: string
    Status?: string
    Amount?: number
    OrderId?: string
  }
}

export async function tbankGetQr(paymentId: string) {
  const body: Record<string, string> = {
    TerminalKey: TERMINAL_KEY,
    PaymentId: paymentId,
    DataType: 'PAYLOAD',
  }
  body.Token = generateToken(body)

  const res = await fetch(`${TBANK_API}/GetQr`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return res.json() as Promise<{
    Success: boolean
    ErrorCode: string
    Message?: string
    Data?: string
  }>
}

export async function tbankGetState(paymentId: string) {
  const body: Record<string, string> = {
    TerminalKey: TERMINAL_KEY,
    PaymentId: paymentId,
  }
  body.Token = generateToken(body)

  const res = await fetch(`${TBANK_API}/GetState`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return res.json() as Promise<{
    Success: boolean
    ErrorCode: string
    Message?: string
    Status?: string
    PaymentId?: string
    Amount?: number
    OrderId?: string
  }>
}

export function verifyNotificationToken(params: Record<string, string | number | boolean>): boolean {
  const incoming = String(params.Token)
  const filtered = Object.fromEntries(
    Object.entries(params).filter(([k]) => k !== 'Token')
  )
  const expected = generateToken(filtered as Record<string, string | number | boolean>)
  return incoming === expected
}
