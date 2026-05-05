import { config } from 'dotenv'
import path from 'path'
import { createClient } from '@supabase/supabase-js'
config({ path: path.resolve(process.cwd(), '.env.local') })

async function main() {
  // Логин через прод-Supabase как curator-test
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)
  const { data: auth, error: ae } = await sb.auth.signInWithPassword({
    email: 'curator-test@goandstudy.com', password: 'Test12345',
  })
  if (ae) { console.error('login fail:', ae); process.exit(1) }
  console.log('logged in as:', auth.user?.email)
  const cookie = `sb-${process.env.NEXT_PUBLIC_SUPABASE_URL!.split('//')[1].split('.')[0]}-auth-token=${encodeURIComponent(JSON.stringify({ access_token: auth.session!.access_token, refresh_token: auth.session!.refresh_token }))}`

  // Дёргаем прод-страницу с куки
  const res = await fetch('https://crm.goandstudy.com/curator/universities?country=de&levels=bachelor', {
    headers: { Cookie: cookie },
    redirect: 'manual',
  })
  console.log('status:', res.status)
  const html = await res.text()
  // Ищем "ВСЕГО ПРОГРАММ · N" в HTML
  const m = html.match(/ВСЕГО ПРОГРАММ[^·]*·\s*([\d\s]+)/)
  console.log('countertext match:', m?.[0])
  // Также ищем отметки от нашего нового кода
  console.log('contains "Бакалавриат" option:', html.includes('Бакалавриат'))
  console.log('contains "3-Year Bachelor"  (старая):', html.includes('3-Year Bachelor'))
}
main()
