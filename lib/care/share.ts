/**
 * Страница подборки для клиента: сборка и отзыв ссылки.
 *
 * ЧТО НА СТРАНИЦЕ ЕСТЬ. Вузы, программы, города, стоимость, ссылки на сайты
 * вузов и список того, что ещё предстоит уточнить. Вступление, написанное
 * помощником и утверждённое куратором.
 *
 * ЧЕГО НА НЕЙ НЕТ И НЕ ДОЛЖНО БЫТЬ. Имени клиента, бюджета, сведений из дела,
 * переписки, внутренних заметок. Ссылку могут переслать, и исходить надо из
 * того, что её прочитает посторонний. Всё, что на странице, — это то, что мы
 * готовы показать незнакомому человеку: список вузов и честный список
 * непроверенного.
 *
 * ПОЧЕМУ ЦЕНЫ И НАЗВАНИЯ НЕ ПИШЕТ МОДЕЛЬ. Она пишет только вступление. Всё
 * остальное подставляется из строк подборки механически — иначе в документе
 * клиента появится программа, которой нет, и проверять это будет он сам.
 */
import { randomBytes } from 'crypto'
import { базаCare } from './db'

/** Секрет в адресе. Длинный и из алфавита, который переживает копирование. */
export function новыйТокен(): string {
  return randomBytes(24).toString('base64url')
}

export type СтраницаПодборки = {
  intro: string | null
  собрана: string
  строки: {
    вуз: string
    программа: string
    город: string | null
    страна: string | null
    ссылка: string | null
    стоимость: string | null
    проверить: string[]
  }[]
}

/**
 * Прочитать страницу по секрету из адреса.
 *
 * `null` и для неизвестного секрета, и для отозванной ссылки, и для
 * неопубликованной подборки — намеренно одинаково. Разные ответы рассказали бы,
 * что такая подборка существует.
 */
export async function страницаПоТокену(токен: string): Promise<СтраницаПодборки | null> {
  if (!токен || токен.length < 20) return null

  const { data: подборка } = await базаCare()
    .from('shortlists')
    .select('id, status, intro, published_at')
    .eq('share_token', токен)
    .maybeSingle()

  if (!подборка || подборка.status !== 'published') return null

  const { data: строки } = await базаCare()
    .from('shortlist_items')
    .select('program_ref, tuition_amount, currency, unresolved')
    .eq('shortlist_id', подборка.id)
    .order('position')

  return {
    intro: (подборка.intro as string | null) ?? null,
    собрана: (подборка.published_at as string | null) ?? '',
    строки: (строки ?? []).map((с) => {
      const ref = (с.program_ref ?? {}) as Record<string, string>
      return {
        вуз: ref.вуз ?? '',
        программа: ref.программа ?? '',
        город: ref.город ?? null,
        страна: ref.страна ?? null,
        ссылка: ref.ссылка ?? null,
        стоимость: с.tuition_amount ? `${с.tuition_amount} ${с.currency ?? ''}`.trim() : null,
        проверить: (с.unresolved ?? []) as string[],
      }
    }),
  }
}

/** Экранирование. Содержимое строк приходит из поиска, а не от нас. */
function э(т: string | null | undefined): string {
  return String(т ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

/** Адрес в href: только http(s), иначе ссылка не выводится вовсе. */
function безопаснаяСсылка(адрес: string | null): string | null {
  if (!адрес) return null
  try {
    const u = new URL(адрес)
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.toString() : null
  } catch {
    return null
  }
}

/**
 * Собрать страницу.
 *
 * Стили внутри: страницу открывают с телефона, пересылают в мессенджер и
 * иногда сохраняют. Внешних файлов у неё быть не должно — ни одного запроса
 * наружу, иначе она однажды откроется сломанной.
 */
export function собратьСтраницу(с: СтраницаПодборки): string {
  const дата = с.собрана ? new Date(с.собрана).toLocaleDateString('ru-RU') : ''

  const карточки = с.строки
    .map((п) => {
      const ссылка = безопаснаяСсылка(п.ссылка)
      const место = [п.город, п.страна].filter(Boolean).map(э).join(', ')
      return `
      <article class="p">
        <h2>${э(п.программа)}</h2>
        <div class="вуз">${э(п.вуз)}${место ? ` · ${место}` : ''}</div>
        <div class="цена">${п.стоимость ? `${э(п.стоимость)} в год` : 'Стоимость уточняется'}</div>
        ${ссылка ? `<a class="ссылка" href="${э(ссылка)}" target="_blank" rel="noopener noreferrer">Страница программы на сайте вуза →</a>` : ''}
        ${
          п.проверить.length
            ? `<div class="проверить"><span>Уточняем:</span> ${п.проверить.map(э).join(' · ')}</div>`
            : ''
        }
      </article>`
    })
    .join('\n')

  return `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>Подборка программ · goandstudy</title>
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body {
    margin: 0; padding: 28px 20px 64px;
    font: 16px/1.65 -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    color: #1d1b20; background: #faf8f5;
  }
  main { max-width: 680px; margin: 0 auto; }
  .шапка { font-size: 13px; letter-spacing: .08em; text-transform: uppercase; color: #6f6a75; }
  h1 { font-size: 27px; line-height: 1.25; margin: 10px 0 0; font-weight: 650; }
  .intro { margin: 16px 0 0; color: #3c3842; white-space: pre-line; }
  .p {
    background: #fff; border: 1px solid #e8e3dc; border-radius: 14px;
    padding: 18px 20px; margin-top: 14px;
  }
  .p h2 { font-size: 18px; line-height: 1.35; margin: 0; font-weight: 600; }
  .вуз { margin-top: 4px; color: #4a4550; font-size: 15px; }
  .цена { margin-top: 8px; font-weight: 600; }
  .ссылка { display: inline-block; margin-top: 10px; color: #6b4ea8; text-decoration: none; font-size: 15px; }
  .ссылка:hover { text-decoration: underline; }
  .проверить {
    margin-top: 12px; padding-top: 10px; border-top: 1px solid #f0ece6;
    font-size: 13px; color: #6f6a75;
  }
  .проверить span { color: #8a6d1f; }
  footer { margin-top: 28px; font-size: 13px; color: #6f6a75; }
  @media (prefers-color-scheme: dark) {
    body { background: #17151a; color: #ece9f0; }
    .p { background: #201d26; border-color: #332e3a; }
    .вуз, .проверить, .шапка, footer { color: #a39dad; }
    .intro { color: #d6d1dc; }
    .ссылка { color: #b79cf0; }
    .проверить { border-top-color: #2b2733; }
  }
</style>
</head>
<body>
<main>
  <div class="шапка">goandstudy · подборка программ</div>
  <h1>Варианты, которые мы подобрали</h1>
  ${с.intro ? `<p class="intro">${э(с.intro)}</p>` : ''}
  ${карточки}
  <footer>
    ${дата ? `Подборка собрана ${э(дата)}. ` : ''}Стоимость и требования уточняются на сайтах вузов —
    всё, что ещё не подтверждено, названо под каждой программой. Вопросы — вашему куратору.
  </footer>
</main>
</body>
</html>`
}
