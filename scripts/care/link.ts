// Готовые ссылки на кабинет v2 — с обходом защиты превью.
//
//   npx tsx scripts/care/link.ts
//
// ЗАЧЕМ. Превью закрыто Vercel Deployment Protection, и без параметра обхода
// любой адрес отдаёт 302 на страницу входа Vercel. Параметр длинный, руками
// его не набрать, а собранная в терминале команда переносится по строкам и
// разваливается. Проще напечатать готовое.
//
// Ссылка даёт доступ к превью, но не к кабинету: внутри всё равно нужен вход
// под учётной записью с ролью curator, rop или admin и включённым флагом ui.
// Кто это сейчас — печатается ниже.
import { config } from 'dotenv'
import path from 'path'

config({ path: path.resolve(process.cwd(), '.env.local') })

const ХОСТ = 'goandstudy-crm-git-feat-curator-v2-pkhakhalov-pngs-projects.vercel.app'

const СТРАНИЦЫ: { путь: string; что: string }[] = [
  { путь: '/login', что: 'вход — сначала сюда, сессия ставится на домен превью' },
  { путь: '/care', что: 'главная кабинета: лента внимания, сводка, помощник' },
  { путь: '/care/cases', что: 'список дел' },
  { путь: '/care/review', что: 'на проверку: черновики фактов и замены «было → стало»' },
  { путь: '/care/review/reminders', что: 'очередь напоминаний «1 из N»' },
  { путь: '/care/team', что: 'работа команды (только руководителю)' },
]

function main() {
  const обход = process.env.CARE_VERCEL_BYPASS?.trim()
  if (!обход) {
    console.error('В .env.local нет CARE_VERCEL_BYPASS — без него превью отдаёт страницу входа Vercel.')
    process.exit(1)
  }

  console.log('Кабинет куратора v2 — ветка feat/curator-v2, в main НЕ слито.\n')

  for (const с of СТРАНИЦЫ) {
    console.log(`${с.что}:`)
    console.log(`  https://${ХОСТ}${с.путь}?x-vercel-protection-bypass=${обход}\n`)
  }

  console.log('Войти можно под gs@goandstudy.com (руководитель) или milenagainulina01@gmail.com (куратор Милена).')
  console.log('Остальным кабинет закрыт: флаг ui включён только этим двоим.')
  console.log('\nЕсли открылась страница входа Vercel — потерялся параметр обхода при копировании.')
}

main()
