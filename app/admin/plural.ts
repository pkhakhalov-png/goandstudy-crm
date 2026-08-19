// Русская плюрализация: plural(1,['клиент','клиента','клиентов']) → '1 клиент'.
// forms = [для 1, для 2–4, для 5+], с учётом исключения 11–14.
export function plural(n: number, forms: [string, string, string]): string {
  const abs = Math.abs(n) % 100
  const d = abs % 10
  let form: string
  if (abs > 10 && abs < 20) form = forms[2]
  else if (d === 1) form = forms[0]
  else if (d >= 2 && d <= 4) form = forms[1]
  else form = forms[2]
  return `${n} ${form}`
}
