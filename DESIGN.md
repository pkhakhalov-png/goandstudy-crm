# DESIGN.md — Go & Study CRM

## Vibe
Светлый, мягкий, воздушный. Apple-like glassmorphism с фиолетовыми акцентами. Чистая типографика, много пространства, полупрозрачные карточки с blur-эффектом.

## Colors

### Base
- `--bg`: #F0EEF6 — основной фон (лёгкий лавандовый оттенок)
- `--surf`: rgba(255,255,255,.55) — стеклянная поверхность карточек
- `--surf2`: rgba(255,255,255,.35) — вторичная поверхность (thead, sidebar header)
- `--bor`: rgba(255,255,255,.45) — стеклянная граница (светлая)
- `--bor2`: rgba(0,0,0,.06) — тонкая разделительная линия

### Accent
- `--purple`: #B15ECC — основной акцент
- `--pl`: rgba(177,94,204,.08) — лёгкая заливка акцента
- `--pb`: rgba(177,94,204,.18) — граница акцента

### Semantic
- `--green`: #34C759 (Apple green)
- `--red`: #FF3B30 (Apple red)
- `--gold`: #FF9500 (Apple orange)

### Text
- `--text`: #1D1D1F (Apple dark)
- `--muted`: #86868B (Apple secondary)
- `--muted2`: #AEAEB2 (Apple tertiary)

## Typography
- Font: 'SF Pro Display', 'SF Pro Text', -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif
- Headings: 700 weight, -0.02em tracking
- Body: 400 weight, 13px
- Labels: 600 weight, 10px, uppercase, 0.06em tracking
- Numbers: tabular-nums, 600 weight

## Spacing
- Page padding: 24px 32px
- Card padding: 18px 20px
- Card gap: 14px
- Border radius: 16px (cards), 10px (buttons, inputs), 24px (pills)

## Glassmorphism
- Card background: rgba(255,255,255,.55)
- Backdrop filter: blur(20px) saturate(180%)
- Border: 1px solid rgba(255,255,255,.45)
- Shadow: 0 2px 20px rgba(0,0,0,.04), 0 0 0 1px rgba(0,0,0,.03)
- Sidebar: rgba(255,255,255,.72) with blur(24px)

## Transitions
- Duration: 0.2s for interactions, 0.3s for layout, 0.4s for progress bars
- Easing: ease for hover, cubic-bezier(0.19, 1, 0.22, 1) for progress/enter
- Hover effects: translateY(-2px) + shadow lift
- Active: scale(0.97)
- Touch-safe: all hovers behind @media (hover: hover) and (pointer: fine)

## Components

### Buttons
- Primary (.btn-p): solid purple, white text, 10px radius, hover lifts with glow shadow
- Secondary (.btn-s): glass background, muted text, hover shows purple border

### Cards (.kc)
- Glass surface with blur backdrop
- Subtle white border
- Hover: lifts 2px with deeper shadow

### Tables (.tw)
- Glass container with blur
- thead: slightly more opaque glass
- Row hover: soft purple tint

### Sidebar
- Fixed, glass background with strong blur
- Nav items shift right on hover with icon scale
- Active item: purple left border + purple tint fill

### Pills
- Rounded (24px), semi-transparent backgrounds
- Semantic colors with 10% opacity fill

### Inputs
- Glass background, subtle border
- Focus: purple border + purple ring glow
