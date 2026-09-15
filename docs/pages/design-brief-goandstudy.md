# Дизайн сайта goandstudy.com — бриф для новой страницы

Файл нужен, чтобы собрать новую страницу, неотличимую от остальных страниц
сайта. Всё ниже — не пожелания, а то, что реально лежит в теме: значения взяты
из живых стилей `goandstudy.com`, версия темы `0.1.323`, снято 14 сентября 2026.

**Главное правило: ничего не придумывать.** Цвета, радиусы, тени, длительности и
отступы уже сведены в шкалы — брать значения из них. Если нужного значения в
шкале нет, это повод спросить, а не подобрать на глаз: в теме однажды уже было
14 разных `box-shadow`, набранных вручную, и их сводили обратно.

---

## 1. Где физически живёт дизайн

Тема WordPress: `/var/www/html/wordpress/wp-content/themes/goandstudy/`
(сервер `72.56.242.202`). В этом репозитории лежит только `wp-theme/blog.php` —
остальное правится на сервере.

Стили подключаются тремя файлами, строго в этом порядке:

| Файл | Что внутри |
|---|---|
| `assets/css/fonts.css` | `@font-face` для ArtegraSans |
| `assets/css/v6.css` | база: сброс, сетка, типографика, компоненты главной и внутренних страниц |
| `assets/css/v7-design.css` | шкалы-токены (`:root`), нормализация, **стили конкретных страниц** |

Скрипты и разметка страницы живут в контенте самой страницы WordPress. Стили
страницы — не инлайном, а отдельным блоком в `v7-design.css` (см. §8).

После правки CSS нужно поднять `GOANDSTUDY_VERSION` в `functions.php`, иначе
браузеры отдадут старый файл из кэша: версия подставляется в `?ver=`.

---

## 2. Токены

Объявлены в `:root` в `v7-design.css` (шкалы) и в `v6.css` (палитра).

### Цвет

```css
/* Бренд — шкала вокруг #B15ECC */
--acc-800: #6E2F86;
--acc-700: #8A3FA6;
--acc-600: #B15ECC;   /* основной фиолетовый */
--acc-400: #CE7FE8;
--acc-200: #E9CFF3;
--acc-050: #FAF3FD;
--acc-grad:   linear-gradient(135deg, #C570E2 0%, #B15ECC 46%, #8A3FA6 100%);
--acc-grad-h: linear-gradient(135deg, #D083EC 0%, #BB6BD6 46%, #97489F 100%); /* hover */
--tint:     rgba(177,94,204,.07);
--hairline: rgba(29,29,31,.09);

/* Нейтральные */
--paper: #FFFFFF;
--mist:  #F5F5F7;   /* фон секции, когда нужно отбить её от белого */
--ink:   #1D1D1F;   /* весь основной текст */
--muted: #86868B;   /* подписи, лиды, второстепенное */
--hair:  rgba(29,29,31,0.08);

/* Статусы — только для статусов, не для декора */
--amber: #E8B844;
--fresh: #34C759;
--coral: #FF3B30;

/* Устаревшее, встречается в старой разметке: --orchid #B57FCF,
   --orchid-soft #DBC4E7. В новой странице использовать шкалу --acc-*. */
```

### Высота (тени)

Четыре ступени плюс акцентная для фиолетовых плашек. Больше ступеней не заводить.

```css
--e1: 0 1px 2px rgba(29,29,31,.05), 0 2px 8px -2px rgba(29,29,31,.06);
--e2: 0 2px 6px -1px rgba(29,29,31,.06), 0 12px 28px -12px rgba(29,29,31,.14);
--e3: 0 4px 12px -2px rgba(29,29,31,.07), 0 24px 48px -20px rgba(29,29,31,.20);
--e4: 0 8px 20px -4px rgba(29,29,31,.09), 0 48px 88px -36px rgba(29,29,31,.30);
--e-acc:   0 18px 44px -20px rgba(177,94,204,.60);
--e-acc-2: 0 26px 60px -24px rgba(177,94,204,.75);   /* hover акцентной плашки */
```

### Радиусы

```css
--r-xs: 10px;  --r-sm: 14px;  --r-md: 20px;
--r-lg: 28px;  --r-xl: 40px;  --r-pill: 999px;
```

Крупные плашки исторически стоят на 30 и 44 px ради совпадения 1:1 с оригиналом
на Tilda — если верстаете рядом с такой, повторяйте соседнее значение, а не
подменяйте его ближайшей ступенью.

### Моушн

```css
--t-fast:   160ms;   /* смена цвета, подчёркивание */
--t-base:   220ms;   /* hover карточек и кнопок */
--t-slow:   320ms;   /* раскрытие, аккордеон */
--t-reveal: 560ms;   /* появление при скролле */
--ease-out:    cubic-bezier(.22, 1, .36, 1);
--ease-in:     cubic-bezier(.4, 0, 1, 1);
--ease-spring: cubic-bezier(.34, 1.28, .64, 1);
--ease:        cubic-bezier(.2,.8,.2,1);   /* из v6, для старых компонентов */
```

### Вертикальный ритм секций

```css
--sec-y:    clamp(56px, 7vw, 104px);   /* обычная секция */
--sec-y-lg: clamp(72px, 9vw, 136px);   /* смысловой раздел, который надо отбить */
```

Отступы секций брать отсюда, а не набирать числами: до введения этих двух
значений на сайте были пары 30/37, 44/71, 108/112 — секции то слипались, то
зияли.

---

## 3. Шрифт

**ArtegraSans**, локально в теме, fallback `Arial, sans-serif`. Один шрифт на
весь сайт: и заголовки, и текст, и цифры.

```css
--display: 'ArtegraSans', Arial, sans-serif;
--body:    'ArtegraSans', Arial, sans-serif;
```

Доступные начертания: **300** Light, **400** Regular, **500** Medium, **700**
Bold. Плюс декоративный Vasek italic — только как акцент, он из оригинального
макета.

> **Вес 600 использовать нельзя.** Слот 600 в теме указывает на файл Bold, внутри
> которого лежит SemiBoldItalic — текст на весе 600 получает ложный курсив.
> В кнопках по этой причине стоит `font-weight: 500` с прямым комментарием в
> коде. Настоящего SemiBold в теме нет.

Шрифты — сабсет (латиница, кириллица, типографская пунктуация, валюты, стрелки),
17 КБ на начертание. Если понадобится символ вне этого набора — он не отрисуется,
нужно пересобирать сабсет.

---

## 4. Сетка и брейкпоинты

```css
.container { width: 100%; max-width: 1200px; padding: 0 20px; margin: 0 auto; }
```

Исключения, где контейнер шире: финальная CTA-плашка и футер — `max-width: 1384px`.

Брейкпоинты, которые уже используются в теме (в порядке частоты):
**1180 · 1024 · 900 · 860 · 760 · 640**. Новых не вводить — брать ближайший.

`html, body` стоят с `overflow-x: clip; max-width: 100vw` — горизонтального
скролла на странице быть не должно ни на одной ширине.

---

## 5. Типографика страницы

Шапка раздела — единый компонент `.section-head`:

```html
<div class="section-head reveal">
  <div class="section-head__eyebrow">География</div>
  <h2 class="section-head__title">Короткий <em>заголовок</em></h2>
  <p class="section-head__lead">Лид на одну-две строки.</p>
</div>
```

```css
.section-head__eyebrow { font-weight:600; font-size:13px; letter-spacing:.18em;
                         text-transform:uppercase; color:var(--muted); margin-bottom:16px; }
.section-head__title   { font-size:clamp(48px,7vw,96px); font-weight:800;
                         line-height:.95; letter-spacing:-.02em; margin:0 0 24px; }
.section-head__title em { color:var(--orchid); font-style:normal; }
.section-head__lead    { font-size:18px; line-height:1.55; color:var(--muted); max-width:580px; }
```

`96px` рассчитаны на короткий заголовок — примерно 13 символов в строке. Для
длинного заголовка есть `.section-head__title--compact`
(`clamp(30px, 4.4vw, 56px)`, `line-height: 1.05`). **Уменьшать кегль, а не резать
формулировку под вёрстку** — это прямо оговорено в коде темы.

Заголовок внутри карточки — `h3`, `clamp(20px, 3vw, 26px)`, вес 800, `line-height: 1.25`.
Основной текст — 15–18 px, `line-height` 1.5–1.65, цвет `--muted` для
второстепенного и `--ink` для основного.

---

## 6. Готовые компоненты

Это живые классы. Для новой страницы сначала ищем подходящий здесь и только потом
заводим свой.

### Кнопки

```css
.btn-primary, .btn-outline {
  display:inline-flex; align-items:center; gap:8px;
  padding:16px 28px; border-radius:999px;
  font-weight:500; font-size:15px; letter-spacing:.01em;   /* 500, не 600 — см. §3 */
}
.btn-primary { background:var(--ink); color:var(--paper); }
.btn-primary:hover { background:var(--orchid); transform:translateY(-2px); }
.btn-outline { background:transparent; color:var(--ink); border:1px solid var(--ink); }
.btn-outline:hover { background:var(--ink); color:var(--paper); }
```

Нажатие: `transform: translateY(-1px) scale(.985)` — общее правило из `v7-design.css`.

### Шаги (нумерованный процесс)

```html
<section class="steps">
  <div class="container">
    <h2 class="steps__heading reveal">
      <span class="steps__heading-accent">5 важных</span>
      <span class="steps__heading-dark">этапов для успешного поступления</span>
    </h2>
    <ol class="steps-list">
      <li class="step reveal" data-delay="1">
        <div class="step__num">1</div>
        <div class="step__body">
          <h3>Подбор программы и университета</h3>
          <p>Одно-два предложения.</p>
        </div>
      </li>
    </ol>
  </div>
</section>
```

`.step__num` — круг 40×40 на `#B15ECC`, белая цифра, вес 900.

### Частые вопросы

Нативный `<details>`, без JS:

```html
<section class="faq" id="faq">
  <div class="container">
    <h2 class="faq__heading reveal">Отвечаем на частые вопросы</h2>
    <div class="faq-list">
      <details class="faq-item reveal" data-delay="1">
        <summary>Заключаем ли мы договор?</summary>
        <p>Ответ.</p>
      </details>
    </div>
  </div>
</section>
```

Разделитель между вопросами — `border-top: 1px solid #EEEEEE`.

### Карточки услуг

`.services-grid` → `.service-card` (+ `.service-card--featured` для выделенной)
→ `.service-card__title` (внутри `<span class="u">` подчёркивает часть
заголовка), `.service-card__priceblock` с `__price-label` и `__price`,
кнопка `.btn-primary.service-card__btn`.

### Финальная CTA-плашка — эталон

Один и тот же компонент стоит в конце всех страниц. Фиолетовая плашка «парит»
над чёрным футером, заходя в него нижней половиной.

```html
<section class="final-cta" id="contacts">
  <div class="container">
    <div class="final-cta__bar reveal">
      <div class="final-cta__text">
        <h2 class="final-cta__title">Записывайтесь на консультацию</h2>
        <p class="final-cta__sub">и делайте первый шаг к своей мечте</p>
      </div>
      <a href="…" target="_blank" rel="noopener" class="final-cta__btn">Записаться на консультацию</a>
    </div>
  </div>
</section>
```

Ключевые значения: фон `#B15ECC`, радиус `40px` (на ≤760 px — `22px`), паддинг
`44px clamp(40px,4vw,64px)`, тень `0 40px 80px -40px rgba(177,94,204,.5)`,
`margin-bottom: -88px` (заезд на футер), контейнер `1384px`. Кнопка белая,
текст `#403F3F`, радиус `30px`, паддинг `28px 52px`, `text-transform: uppercase`.
На ≤760 px плашка становится колонкой, кнопка — во всю ширину.

Компонент уже нормализован в `v7-design.css` принудительно, потому что скоупы
страниц перебивали его оформление. **Не переопределять его на своей странице.**

---

## 7. Движение

Появление при скролле — класс `.reveal`, задержки атрибутом `data-delay="1…8"`
(шаг 45 мс). JS вешает `.in`, когда блок входит в экран.

```css
.js .reveal    { transform: translateY(22px) scale(.995);
                 transition: opacity var(--t-reveal) var(--ease-out),
                             transform var(--t-reveal) var(--ease-out); }
.js .reveal.in { transform: none; }
```

Hover карточек — `translateY(-3px)`/`-4px` за `--t-base`. Ничего не крутится и не
пульсирует без причины.

`@media (prefers-reduced-motion: reduce)` уже обработан в теме: `.reveal`
показывается сразу, без сдвига. Свою анимацию — закрывать тем же медиазапросом.

---

## 8. Как оформляется новая страница

Конвенция видна на странице услуг `/uslugi/`:

1. Вся страница обёрнута **скоуп-классом** — там это `.usl4`.
2. Элементы внутри — с коротким префиксом: `.u4-hero`, `.u4-svc`, `.u4-guar`,
   `.u4-session`, `.u4-list`, `.u4-pitch`.
3. Стили пишутся в `v7-design.css` **всегда парой «скоуп + элемент»**:
   `.usl4 .u4-hero { … }`. Так страница не задевает остальной сайт, а глобальные
   компоненты не ломают её.
4. Общие блоки — `.container`, `.reveal`, `.final-cta`, `.faq` — берутся как есть,
   без переопределений.

Для новой страницы выбрать свой скоуп и префикс (например `.psop` и `.ps-*` для
«Полного сопровождения») и держаться их.

---

## 9. Чего делать нельзя

- **Вводить новые цвета, радиусы, тени, длительности.** Всё есть в §2.
- **Использовать вес 600** — получите ложный курсив (§3).
- **Переопределять `.final-cta`** — это сквозной эталон.
- **Ставить `rel="noopener noreferrer"` на ссылках записи.** `noreferrer`
  стирает переход и обрывает аналитику; от подмены вкладки защищает `noopener`.
- **Ставить ссылку на запись без меток.** Формат — §10.
- **Допускать горизонтальный скролл** ни на одной ширине.
- Заменять формулировку из текста ради вёрстки: если заголовок не влезает,
  уменьшается кегль.

---

## 10. Ссылки на запись

Все кнопки «Записаться» ведут на форму с метками источника — по ним в уведомлении
менеджеру видно, с какой страницы и по какой кнопке пришёл человек:

```
https://crm.goandstudy.com/book
  ?utm_source=goandstudy
  &utm_medium=site_page
  &utm_campaign=<имя-страницы>
  &utm_content=<какая-кнопка: cta-hero | cta-steps | cta-final>
  &from=<путь страницы, например %2Fpolnoe-soprovozhdenie%2F>
```

Правила разметки и разбор меток — в `lib/booking-link.ts` в репозитории CRM.

---

## 11. Скелет новой страницы

Разметка под контент из `docs/pages/polnoe-soprovozhdenie.md`. Классы `ps-*`
описываются в `v7-design.css` парой со скоупом `.psop`.

```html
<div class="psop">

  <section class="ps-hero">
    <div class="container">
      <div class="section-head reveal">
        <div class="section-head__eyebrow">Услуга</div>
        <h1 class="section-head__title section-head__title--compact">
          Поступление <em>под ключ</em>
        </h1>
        <p class="section-head__lead">
          Полный цикл: от выбора университета до переезда.
          Гарантия поступления прописана в договоре.
        </p>
      </div>
      <a href="…utm_content=cta-hero…" target="_blank" rel="noopener" class="btn-primary">
        Записаться на бесплатную консультацию
      </a>
    </div>
  </section>

  <section class="ps-included">      <!-- что входит: 4 блока -->
  <section class="ps-guarantee">     <!-- гарантия, акцентная плашка -->
  <section class="steps">            <!-- как начать: общий компонент -->
  <section class="ps-compare">       <!-- сравнение трёх пакетов -->
  <section class="faq" id="faq">     <!-- частые вопросы: общий компонент -->

  <section class="final-cta" id="contacts">   <!-- эталон, не трогать -->

</div>
```

---

## 12. Перед сдачей проверить

- [ ] Ни одного цвета, радиуса или тени вне шкал из §2.
- [ ] Нигде нет `font-weight: 600`.
- [ ] Ширины проверены на 1180 / 1024 / 900 / 760 / 640; горизонтального скролла нет.
- [ ] Все стили написаны парой «скоуп + элемент», глобальные классы не переопределены.
- [ ] `.final-cta` выглядит ровно как на остальных страницах.
- [ ] Блоки имеют `.reveal` и разумные `data-delay`; при `prefers-reduced-motion` всё видно сразу.
- [ ] Ссылки записи с метками и `rel="noopener"`.
- [ ] `GOANDSTUDY_VERSION` поднят, иначе браузер отдаст старый CSS.

---

## Чего в этом брифе нет

- **Макета.** Здесь система и компоненты, но не сетка конкретной страницы: как
  именно раскладывать «что входит» и сравнение пакетов — решение дизайнера.
- **Картинок и иконок.** Что лежит в `assets/img/`, я не смотрел.
- **Тёмной темы.** Её на сайте нет.
- **Исходников темы в репозитории.** Значения сняты с живых CSS версии `0.1.323`;
  если тему успели поменять, свериться с сервером.
