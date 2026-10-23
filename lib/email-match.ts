/**
 * Email для поиска без учёта регистра через .ilike().
 *
 * Вход Supabase хранит email строчными, а в карточках клиентов он записан как
 * ввёл продажник: «Astashkina03@inbox.ru». Поиск через .eq('email', …) их не
 * сводил — клиент с заглавной буквой получал пустой кабинет, а при активации
 * ещё и роль продажника. ilike сравнивает без учёта регистра, но «_» и «%» в
 * нём шаблоны: «zayceva_ksusha@bk.ru» совпал бы и с «zaycevaXksusha@bk.ru».
 * Поэтому экранируем их.
 */
export function emailPattern(email: string | null | undefined): string {
  return String(email ?? '').trim().replace(/[\\%_]/g, (c) => `\\${c}`)
}
