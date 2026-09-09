# WordPress: точные правки на сервере (согласовано)

_Для сисадмина. Три правки + предусловия. Цель — открыть ТОЛЬКО namespace моста
`goandstudy-seo/v1` под HMAC, не ослабляя защиту остального REST._

Перед началом: mu-plugin обновлён до **v0.2** (ограничены редиректы, лог-таблица —
разовый init). **Перезалей** `wp-bridge/goandstudy-seo-bridge.php` из репозитория.

Мост вызывается CRM по пути `https://goandstudy.com/wp-json/goandstudy-seo/v1/...`
(не через `?rest_route=`). Значит открыть нужно только префикс `/wp-json/goandstudy-seo/`.

---

## Предусловия (до открытия API)
1. **Сменить пароль `admin`** — не менялся после инцидента.
2. **Сгенерировать новый секрет:** `openssl rand -hex 32`. Не брать из брифа. Использовать в п.1 ниже и в Vercel env.

## Правка 1 — секрет в wp-config.php
Перед `/* That's all, stop editing! */` (≈ строка 99):
```php
define('GS_SEO_BRIDGE_SECRET', '<новый секрет из openssl rand -hex 32>');
```

## Правка 2 — nginx: открыть только namespace моста
В `/etc/nginx/conf.d/wordpress.conf` добавить блок **ВЫШЕ** общего ограничения на `/wp-json/`
(более точный `location` должен идти раньше). Пример:
```nginx
# Мост Go&Study SEO — защищён HMAC внутри плагина; allowlist/basic-auth не нужны
location ^~ /wp-json/goandstudy-seo/ {
    # без allowlist: у Vercel плавающие исходящие IP; защита — HMAC
    try_files $uri $uri/ /index.php?$args;
    # если PHP-обработка задаётся отдельным location — продублируй сюда fastcgi_pass,
    # как в основном location ~ \.php$
}
```
`wp/v2`, `batch/v1`, `?rest_route=` — **не трогаем**, остаются закрыты.
После правки: `nginx -t && systemctl reload nginx`.

## Правка 3 — gs-security.php: исключение для namespace
Проблема: фильтр `rest_authentication_errors` в `gs-security.php` рубит REST для
неавторизованных **раньше**, чем срабатывает `permission_callback` моста (HMAC).
Нужно пропустить только наш namespace дальше — к HMAC-проверке.

В начало колбэка фильтра `rest_authentication_errors` добавить:
```php
// Пропускаем namespace моста к его собственной HMAC-проверке (permission_callback).
$gs_uri = $_SERVER['REQUEST_URI'] ?? '';
if (strpos($gs_uri, '/wp-json/goandstudy-seo/') !== false) {
    return $result; // не блокируем; мост сам проверит подпись
}
```
`$result` — это входной аргумент фильтра (текущее значение ошибки/`null`). Возврат его
без изменения = «не мешать», дальше отработает HMAC моста. Остальной REST защита не теряет.

---

## Проверка (сисадмин, локально на сервере или снаружи)
```
curl -s "https://goandstudy.com/wp-json/goandstudy-seo/v1/lookup?key=test"
```
Ожидается **HTTP 401** с телом вида `{"code":"gs_auth","message":"Нет подписи",...}`.
- `gs_auth` → ✅ мост живой, дошли до HMAC.
- `rest_not_logged_in` → правка 3 не сработала (фильтр всё ещё рубит раньше).
- `404` → mu-plugin не подхватился или nginx не открыл путь.
- страница логина / basic-auth → nginx-правка не применилась/ниже по приоритету.

---

## После сервера — на стороне CRM (делаю я)
1. Впишем в Vercel env (значения даёшь ты, в чат не публикуем):
   ```
   WP_BASE_URL=https://goandstudy.com
   WP_BRIDGE_SECRET=<тот же секрет, что в wp-config>
   ```
2. Прогоняю `scripts/seo-wp-test.ts`: `lookup` → создать **черновик** (draft, не публикация)
   → `lookup` находит → `rendered` (проверка, что тема не ломает canonical/schema) → отчёт с ID
   тестового черновика (удалишь в админке).
3. Если ок — подключаю применение 80 schema и публикацию статей по согласованию.

Никаких публикаций и правок существующих страниц без отдельного «да».
