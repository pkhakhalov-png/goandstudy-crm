/**
 * Единственный вход в базу для контура care.
 *
 * ГЛАВНОЕ ПРАВИЛО КОНТУРА: здесь не используется service-role. Клиент
 * создаётся на `CARE_DB_KEY` — это JWT с claim `role=care_app`, и PostgREST
 * переключается на эту роль. Роли выдано право писать только в схему `care` и
 * читать перечисленные таблицы `public`.
 *
 * Почему это важнее дисциплины в коде. В действующей CRM `createAdminClient()`
 * встречается в 128 файлах и обходит RLS. Любая ошибка в новом коде,
 * дотянувшемся до него, портила бы рабочие данные кураторов. Роль закрывает
 * это на уровне базы: запись в `public` ей просто не выдана, и никакой код
 * этого не обойдёт. Импорт `lib/supabase/server.ts` из `lib/care/**` и
 * `app/care/**` запрещён правилом ESLint — не на словах.
 *
 * Схема по умолчанию — `care`: обращения вида `.from('cases')` попадают в
 * `care.cases`. Для чтения рабочих таблиц есть отдельный клиент `базаPublic()`.
 */
import { createClient } from '@supabase/supabase-js'
import { требуется } from './env'

/**
 * Общие настройки обоих клиентов.
 *
 * ДВА КЛЮЧА, А НЕ ОДИН. Шлюз Supabase принимает в заголовке `apikey` только
 * anon или service_role — свой JWT там отвергается с «Invalid API key». Роль
 * же берётся из `Authorization`. Поэтому anon идёт пропуском на входе, а права
 * определяет `CARE_DB_KEY` с claim `role=care_app`.
 *
 * Anon сам по себе ничего не даёт: схема `care` ему не видна вовсе
 * (проверяется в selftest-perms), а в `public` он ограничен RLS. Передать
 * только `CARE_DB_KEY` нельзя — до PostgREST запрос просто не дойдёт.
 *
 * Сессия не хранится и не обновляется: контур работает под ключом роли, а не
 * под пользователем. Заголовок `x-care-contour` нужен, чтобы в журналах базы
 * было видно, чей это запрос, когда рядом работают три других контура.
 */
function ОБЩЕЕ() {
  return {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      headers: {
        Authorization: `Bearer ${требуется('CARE_DB_KEY')}`,
        'x-care-contour': 'v2',
      },
    },
  }
}

// Схема указывается литералом, а не переменной: тип клиента зависит от неё,
// и `string` превратил бы точный тип в бесполезный.
function новыйCare() {
  return createClient(
    требуется('NEXT_PUBLIC_SUPABASE_URL'),
    требуется('NEXT_PUBLIC_SUPABASE_ANON_KEY'),
    { db: { schema: 'care' }, ...ОБЩЕЕ() }
  )
}

function новыйPublic() {
  return createClient(
    требуется('NEXT_PUBLIC_SUPABASE_URL'),
    требуется('NEXT_PUBLIC_SUPABASE_ANON_KEY'),
    { db: { schema: 'public' }, ...ОБЩЕЕ() }
  )
}

let клиент: ReturnType<typeof новыйCare> | null = null
let публичный: ReturnType<typeof новыйPublic> | null = null

/**
 * Клиент схемы `care`. Чтение и запись.
 *
 * Один на процесс: создавать клиент на каждый запрос значит заново собирать
 * заголовки и терять переиспользование соединений.
 */
export function базаCare() {
  if (!клиент) клиент = новыйCare()
  return клиент
}

/**
 * Клиент схемы `public`. **Только чтение.**
 *
 * Запись через него невозможна не потому, что мы её не пишем, а потому что
 * роли `care_app` не выдан `INSERT/UPDATE/DELETE` на `public`. Попытка вернёт
 * ошибку прав — и это ожидаемое поведение, проверяемое тестом.
 */
export function базаPublic() {
  if (!публичный) публичный = новыйPublic()
  return публичный
}

/** Для тестов: сбросить запомненные клиенты после подмены переменных. */
export function сброситьКлиенты(): void {
  клиент = null
  публичный = null
}
