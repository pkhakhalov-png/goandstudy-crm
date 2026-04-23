# Design System — Go & Study

> Система для клиентского ЛК и кабинета куратора. Admin + Sales — не в скоупе (остаются утилитарными).

## Product Context

- **Что это:** Клиентский кабинет Go & Study (assisted client) и кабинет куратора (superset). Будущий self-serve SaaS-tier использует ту же ДНК.
- **Для кого:** родитель/студент (read-mostly) + куратор команды Go & Study (full control + мультиклиент-switcher).
- **Пространство:** admission consulting / EdTech (ApplyBoard, Common App, Crimson, Sherpa.ai — категория).
- **Тип:** web app (Next.js 16 App Router + Tailwind 4 + Supabase), русский UI.
- **Memorable thing:** "Премиум-сервис, я не зря заплатил". Apple-tech energy, не academic-editorial.

## Aesthetic Direction

- **Direction:** Apple-style tech-minimal на светлом фоне + бренд-акценты Go & Study.
- **Decoration:** минимум — soft shadows, subtle purple radial glow в hero, hairline borders, no gradients кроме брендового fade в hero-card.
- **Mood:** прозрачно, технологично, профессионально. Продукт-шоукейс, не letter.
- **Reference:** apple.com product pages + бренд-цвета Go & Study (лендинг goandstudy.ru).

## Typography

Single source of truth: `app/layout.tsx` загружает шрифты через `next/font` и прокидывает переменные в `<body>`.

Две семьи, обе через `next/font/google` с subsets `latin + cyrillic`:

- **Display — Oswald** (condensed bold caps, как на лендинге goandstudy.ru).
  - Weights: 500, 600, 700. Always uppercase, letter-spacing `+0.01–0.04em`.
  - Роли: hero h1, ключевые section-labels (ПОДБОРКА ВУЗОВ, ДОКУМЕНТЫ), ds-stat-num, пробро топбара `.pt`, ds-logo-mark текст.
  - Fallback: `'Oswald', 'Arial Narrow', 'Roboto Condensed', -apple-system, sans-serif`.
  - НЕ использовать для длинных mixed-case строк (названия программ на английском) — condensed делает их нечитаемыми.

- **Body / UI — Geist.**
  - Weights: 400 (body) · 500 (accents) · 600 (buttons) · 700 (card titles, inline emphasis, program names, имена людей).
  - Fallback: `-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'SF Pro Text', 'Inter', sans-serif`.
  - Tabular-nums обязательно на цифрах через `font-variant-numeric: tabular-nums`.

**История.** Изначально пробовали Archivo Black для display — не поддерживает кириллицу в Google Fonts. Потом Geist 900 — не condensed, не даёт бренд-характер Go & Study (узкие жирные капс). Oswald 700 = condensed + кириллица + 700 weight = правильная ДНК.
- **Mono (data, hex, file sizes):** `JetBrains Mono, 'SF Mono', ui-monospace, monospace` — обязательно `font-variant-numeric: tabular-nums` на всех числах в UI.
- **Scale (rem-based, base 16):** `caption 11/12` · `body 14` · `body-lg 16-17` · `subtitle 19-22` · `title 28` · `h3 32` · `h2 clamp(36px, 4.5vw, 68px)` · `h1 clamp(44px, 7vw, 92px)`.
- **Tracking:** display `-0.02em` · body `-0.01em` · uppercase labels `+0.08em` или `+0.14em`.

## Color

Определены как CSS-переменные в `app/globals.css`. Существующие кастомные vars (`--purple`, `--green`, `--red`, `--bg`, `--surf`, `--bor`, `--text`, `--muted`) **остаются на admin/sales** и alias'ятся на новые токены. Новые роуты `/curator/*` и `/client/*` используют DS-токены напрямую.

### Base — Light

| Token             | Hex       | Role                                    |
| ----------------- | --------- | --------------------------------------- |
| `--ds-bg`         | `#FFFFFF` | Page background, primary surface        |
| `--ds-bg-alt`     | `#F5F5F7` | Section background, card wells          |
| `--ds-bg-soft`    | `#FAFAFB` | Subtle alternation                      |
| `--ds-ink`        | `#1D1D1F` | Primary text                            |
| `--ds-ink-dim`    | `#424245` | Secondary text                          |
| `--ds-muted`      | `#86868B` | Tertiary/muted text, labels             |
| `--ds-border`     | `#E5E5E7` | Hairline borders                        |
| `--ds-border-soft`| `#EFEFF1` | Softer dividers                         |

### Brand accents

| Token             | Hex       | Role                                    |
| ----------------- | --------- | --------------------------------------- |
| `--ds-purple`     | `#B57FCF` | **Primary.** CTAs, current step, links  |
| `--ds-purple-hov` | `#A16BBD` | Hover на purple                         |
| `--ds-purple-deep`| `#8B5FA8` | Progress %, match %, gradient end       |
| `--ds-purple-soft`| `rgba(181,127,207,0.12)` | Icon bg, subtle fills    |
| `--ds-amber`      | `#E8B844` | **Highlight.** Pill behind keyword, status chips |
| `--ds-amber-hov`  | `#D9AA35` | Hover на amber                          |
| `--ds-amber-soft` | `rgba(232,184,68,0.16)` | Deadline chips background   |

### Semantic

| Token             | Hex       | Role                 |
| ----------------- | --------- | -------------------- |
| `--ds-success`    | `#34C759` | Completed / on-track |
| `--ds-warning`    | `#E8B844` | Due soon (reuse amber) |
| `--ds-error`      | `#FF3B30` | Missed deadline / error |
| `--ds-info`       | `#0071E3` | Neutral info (rare)  |

### Dark mode (planned, not v1)

Инверсия: `--ds-bg #1E2129`, `--ds-bg-alt #282B35`, `--ds-ink #FFFFFF`, `--ds-muted #9CA0AB`. Purple/amber остаются те же. Включается через `[data-theme="dark"]` на `<html>`.

## Spacing

Base 4px. Token scale as CSS variables:

```
--ds-sp-1: 4px   --ds-sp-2: 8px   --ds-sp-3: 12px  --ds-sp-4: 16px
--ds-sp-6: 24px  --ds-sp-8: 32px  --ds-sp-10: 40px --ds-sp-12: 48px
--ds-sp-16: 64px --ds-sp-20: 80px --ds-sp-24: 96px
```

**Density:** comfortable. Card internal padding 28–32px (в hero 40–48px). Inter-card gap 20–24px. Page vertical rhythm 96px между крупными секциями.

## Layout

- **Approach:** hybrid. Grid-disciplined внутри dashboard (2×2 grid для 4 блоков, 28px gutter). Apple product-page энергия для landing/hero.
- **Max content width:** 1200px.
- **Page padding:** `px-8` (32px) mobile · `px-8` desktop (фиксированный max-width container).
- **Breakpoints:** mobile-first. Grid 2-col collapses at 980px. Features 3-col collapses at 880px.
- **Border radius scale:**

```
--ds-r-sm: 8px    small chips, doc-icons
--ds-r-md: 12px   inputs, small cards, meeting-block
--ds-r-lg: 18px   generic cards (редко)
--ds-r-xl: 24px   главные cards, hero-card, mockup-frame
```

- **Corner bias:** средние-большие радиусы (Apple energy). Нет pill-shape на кнопках-панелях (pill только у CTA-кнопок 100px).

## Motion

- **Approach:** minimal-functional.
- **Easing:** enter `cubic-bezier(0.25, 0.1, 0.25, 1)` (ease-out) · move `cubic-bezier(0.4, 0, 0.2, 1)` · exit `cubic-bezier(0.4, 0, 1, 1)`.
- **Duration:** hover/toggle `120ms` · small transitions `180ms` · page/modal `280ms` · emphasis (rare) `400ms`.
- **No decorative motion.** Без autoplay, без parallax, без scroll-driven animation в v1.

## Shadow

```
--ds-sh-sm: 0 1px 2px rgba(0,0,0,0.04)          /* inputs, feature cards */
--ds-sh-md: 0 4px 16px rgba(0,0,0,0.06)         /* hover lift */
--ds-sh-lg: 0 24px 80px -24px rgba(29,29,31,0.18) /* mockup frame, major overlays */
--ds-glow-p: 0 0 0 4px rgba(181,127,207,0.18)   /* focus ring on current step */
```

## Component Rules

- **Buttons:** pill (border-radius 100px), font-weight 600, `py-2.5 px-5` default, `py-1.5 px-4` sm.
  - Primary = purple fill white text
  - Amber = amber fill ink text
  - Secondary = rgba(0,0,0,0.06) fill ink text
  - Ghost = transparent, purple text, no underline
- **Cards:** `bg-alt` fill, `border-soft`, radius-xl, padding 28–32px. Белые элементы внутри (doc-items, uni-cards, meeting-block).
- **Hero card (dashboard):** gradient fill `linear-gradient(135deg, #F5F5F7, #EDE3F2 60%, #F5F5F7)` + radial purple glow top-right, radius-xl.
- **Progress numbers:** Archivo 900, `--ds-purple-deep`, font-size 56–60px, tabular-nums.
- **Keyword highlight:** `<span class="hl">…</span>` = amber pill `2px 14px 4px`, ink text, radius 6px.
- **Status chips:** soft color fill + bold weight, font-size 11px, tabular-nums for dates, uppercase letterspacing for labels.
- **Logo mark:** 38×38 ink-filled circle, Archivo 900 каптал "GO" (purple) / "AND" (amber) / "STUDY" (white), три строки внутри кружка.

## Anti-slop (hard reject)

- No generic purple/violet gradients (наш purple-radial glow — исключение, он контролируемый)
- No 3-column icon grids с кругами на cream/white
- No system-ui как primary display font
- No centered-everything uniform layout (hero центр OK, dashboard — нет)
- No serif-display fonts (Fraunces, Cormorant, Playfair, Instrument Serif) — отвергнуты на этом проекте
- No warm cream backgrounds (#F7F4ED и подобные) — отвергнуты
- No gradient CTA buttons
- No uniform bubble radius на всём

## Decisions Log

| Date | Decision | Rationale |
| ---- | -------- | --------- |
| 2026-04-23 | Apple-light base + brand accents | Пользователь отверг academic/editorial/dark; positional "технологичная компания" |
| 2026-04-23 | Archivo Black для display | Тот же язык что на goandstudy.ru лендинге (bold condensed uppercase) |
| 2026-04-23 | Orchid purple primary, amber highlight | Взято с лендинга: purple CTA + amber brand-glow |
| 2026-04-23 | Логотип GO/AND/STUDY в кружке | Сохраняем существующую визуальную метку с лендинга |
| 2026-04-23 | Light theme by default, dark planned v2 | Клиент работает днём; curator тоже не 24/7 night-mode audience |

## Preview

Финальный превью-HTML: `~/Desktop/goandstudy-client-cabinet-preview.html`. Источник правды для первого экрана клиентского ЛК.
