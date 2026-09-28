/**
 * Подготовка окружения тестов.
 *
 * Тесты ходят в настоящую базу под ролью care_app, а ключ лежит в `.env.local`.
 * Vite сам его не читает: переменные без префикса `VITE_` он в `process.env`
 * не кладёт — и правильно делает, иначе секреты утекали бы в браузерную сборку.
 * Здесь мы в Node, поэтому читаем файл явно.
 *
 * Если ключа нет — падаем сразу и с внятным текстом. Тест, который молча
 * работает без ключа, проверяет не то, что написано в его названии.
 */
import { config } from 'dotenv'
import path from 'path'

config({ path: path.resolve(process.cwd(), '.env.local') })

const обязательные = ['NEXT_PUBLIC_SUPABASE_URL', 'CARE_DB_KEY']
const нет = обязательные.filter((имя) => !process.env[имя]?.trim())

if (нет.length) {
  throw new Error(
    `Нет переменных для тестов: ${нет.join(', ')}. ` +
      `Ожидаются в .env.local. CARE_DB_KEY выпускается через scripts/care/mint-key.ts.`
  )
}
