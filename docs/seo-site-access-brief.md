# Задание для Claude, управляющего сайтом goandstudy

Контекст: в CRM (Next.js на Vercel + Supabase) поднят фундамент SEO-модуля (**M0 готов, крутится на проде**).
Схема `seo` изолирована, воркер и cron работают. Дальше строим **M1 (инвентарь сайта) → M2 (Google
Search Console) → M3 (атрибуция лидов) → M4 (WordPress Bridge)**. Для этого нужны доступы и решения ниже.

**Верни ответы строго по пунктам** (значения можно прямо списком `KEY=value`). Что не готово — помечай «нет/позже».
Секреты не публикуй в открытых каналах — но сюда, во внутренний чат, можно.

---

## БЛОК 0 — Домены (критично для атрибуции, M3)
0.1 Точные хосты (production):
- Основной сайт: `?` (например `goandstudy.com`)
- Блог/WordPress со статьями: `?` (это **поддомен** `goandstudy.com`, например `blog.goandstudy.com`, — или отдельный домен?)
- Квиз `/book`: `crm.goandstudy.com/book` (наш, подтверди)
0.2 Все ли три на одном registrable-домене `goandstudy.com`? (если WP на чужом домене — атрибуция статей будет частичной; тогда обсуждаем перенос на поддомен)
0.3 Есть ли consent-баннер (куки-согласие) на сайте/блоге/Tilda? Единый?

## БЛОК 1 — Инвентарь сайта (M1)
1.1 URL sitemap(ов): `?` (например `https://goandstudy.com/sitemap.xml`, отдельный для WP-блога)
1.2 Какие части сайта на чём: список секций/URL-паттернов → платформа (`wordpress` / `tilda` / `next`).
   Пример: `/blog/* → wordpress`, `/uslugi, /yazykovye-kursy/* → tilda`, `/book → next`.
1.3 WordPress REST API доступен? База: `https://<wp-домен>/wp-json/wp/v2/` — отдаёт посты публично? (да/нет)
1.4 Роботы: `robots.txt` не блокирует наш обход? Если есть WAF/Cloudflare — можно ли добавить в allow наш
   User-Agent `goandstudy-seo-bot` (или дать обходить без челленджа)?

## БЛОК 2 — Google Search Console (M2)
2.1 Сайт верифицирован в GSC? Тип property: **Domain** (`sc-domain:goandstudy.com`) или **URL-prefix** (`https://...`)?
   Верни точную строку property → это `GSC_SITE_URL`.
2.2 Доступ к API. Нужен OAuth-клиент с Search Console API. Верни одно из:
   - `GSC_CLIENT_ID`, `GSC_CLIENT_SECRET`, `GSC_REFRESH_TOKEN` (refresh_token с scope `webmasters.readonly`), **или**
   - сервис-аккаунт (JSON) + добавь его email как **пользователя с доступом** в GSC этого property.
   (Если проще — заведи Google Cloud project, включи «Search Console API», создай OAuth desktop-клиент, получи refresh token.)

## БЛОК 3 — Атрибуция / Tilda (M3)
3.1 Доступ к настройкам сайта Tilda: можно ли **вставить скрипт `track.js` в Head** (Настройки сайта → Ещё → HTML-код в HEAD)? (да/нет)
3.2 В формах Tilda можно ли добавить **скрытые поля** `anon_id`, `session_id`? (да/нет)
3.3 Можно ли настроить **webhook формы** (отправка данных формы на наш URL при сабмите)? (да/нет)
   Если да — верни `TILDA_WEBHOOK_SECRET` (любой рандом, мы проверим подпись).
3.4 Список форм-источников лидов на Tilda (названия/страницы) — какие вообще ловим.

## БЛОК 4 — WordPress Bridge (M4)
4.1 WP admin URL: `?`
4.2 **Application Password**: создай пользователя (или под существующим) с правами
   read+publish posts + управление; верни `WP_USER` и `WP_APP_PASSWORD`.
4.3 Можно ли установить **mu-plugin** (положить файл в `wp-content/mu-plugins/`)? (да/нет)
   Если да — я пришлю файл `goandstudy-seo-bridge.php`, поставишь.
4.4 Какой SEO-плагин активен: **Yoast / Rank Math / нет**? (влияет, куда писать meta description/schema)
4.5 `WP_BASE_URL` (например `https://blog.goandstudy.com`).

## БЛОК 5 — Провайдеры (можно позже)
5.1 **Voyage** (эмбеддинги, нужно уже для M1): `EMBEDDING_API_KEY=?` (модель `voyage-3`, dim 1024).
5.2 **SERP-провайдер** (нужно к M3-этапу производства): DataForSEO или SerpApi + `SERP_PROVIDER_KEY`. (можно «позже»)

## БЛОК 6 — Для калибровки (позже, M1/M8)
6.1 10–15 ссылок на **уже опубликованные статьи блога** — на них соберём стартовую `claim_policy` и порог похожести.

---

### Формат ответа (пример)
```
0.1 сайт=goandstudy.com; wp=blog.goandstudy.com; book=crm.goandstudy.com/book
0.2 да, всё на goandstudy.com
1.1 https://blog.goandstudy.com/sitemap.xml
1.3 да, wp-json открыт
2.1 sc-domain:goandstudy.com
2.2 GSC_CLIENT_ID=...; GSC_CLIENT_SECRET=...; GSC_REFRESH_TOKEN=...
3.1 да  3.2 да  3.3 да, TILDA_WEBHOOK_SECRET=...
4.2 WP_USER=seo_bot; WP_APP_PASSWORD=xxxx xxxx xxxx
4.3 да  4.4 Rank Math  4.5 https://blog.goandstudy.com
5.1 EMBEDDING_API_KEY=pa-...
```

Минимум, чтобы я стартовал **M1 сегодня**: **0.1, 1.1, 1.3** и **5.1 (ключ Voyage)**. Остальное подтянем по мере M2–M4.
