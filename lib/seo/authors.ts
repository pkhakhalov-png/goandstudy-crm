// Авторы статей (§10.2.3 приложения F).
//
// Требование стандарта: author — реальный консультант, у которого есть страница автора.
// Пока страницы нет, в разметку идёт Person только с именем: это честно и валидно,
// а ссылка на несуществующую страницу хуже, чем её отсутствие.
//
// Когда страницы появятся, достаточно проставить url — остальное подхватится само.
// В WordPress страница автора появляется автоматически у любого пользователя: /author/<логин>/.

export type Author = {
  key: string
  name: string
  /** Страница автора. null — пока не создана. */
  url: string | null
  /** Кем подписывать: должность в разметке и в подписи под статьёй. */
  jobTitle: string
}

export const AUTHORS: Record<string, Author> = {
  pavel: {
    key: 'pavel',
    name: 'Павел Хахалов',
    url: null,               // → 'https://goandstudy.com/author/pavel/' когда заведём пользователя
    jobTitle: 'Основатель goandstudy',
  },
  andrey: {
    key: 'andrey',
    name: 'Андрей Борецкий',
    url: null,
    jobTitle: 'Консультант по поступлению',
  },
}

export const DEFAULT_AUTHOR = 'pavel'

export function getAuthor(key: string = DEFAULT_AUTHOR): Author {
  return AUTHORS[key] ?? AUTHORS[DEFAULT_AUTHOR]
}

/** Готов ли автор к требованию §10.2.3 полностью (есть страница). */
export function authorPageMissing(a: Author): boolean {
  return !a.url
}
