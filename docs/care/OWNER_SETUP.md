# Настройка контура v2 — пошагово

Для владельца. Всё, что нельзя сделать из репозитория: требуется ваш браузер
и ваши учётные записи.

Порядок обязателен. Каждый шаг проверяется до перехода к следующему —
иначе на четвёртом будет непонятно, какой из трёх предыдущих не сработал.

Время: около 25 минут.

---

## Шаг 1. Бот в BotFather

Нужен **отдельный** бот. Тот, что работает с клиентами сейчас, не трогаем:
Телеграм разрешает только один активный вебхук на бота, и переиспользование
означало бы отключить старый контур.

### 1.1. Создать

В Телеграме откройте **@BotFather** → отправьте `/newbot`.

1. `Alright, a new bot. How are we going to call it?` — имя для людей,
   например `Goandstudy Care`.
2. `Now let's choose a username for your bot.` — имя должно кончаться на
   `bot`, например `goandstudy_care_bot`.

В ответ придёт строка вида `8123456789:AAH...` — это **`CARE_TELEGRAM_BOT_TOKEN`**.
Сохраните, второй раз его не покажут (можно перевыпустить через
`/mybots` → бот → `API Token` → `Revoke current token`, но тогда старый
перестанет работать).

### 1.2. Выключить privacy mode

Без этого бот в группе видит только сообщения, адресованные лично ему —
то есть почти ничего.

`/mybots` → выберите `@goandstudy_care_bot` → **`Bot Settings`** →
**`Group Privacy`** → кнопка **`Turn off`**.

Должно смениться на `Privacy mode is disabled for <бот>.`

> **Важно.** Если бот уже был добавлен в какую-то группу до этого
> переключения, из неё его нужно удалить и добавить заново — иначе
> настройка на эту группу не подействует. BotFather об этом предупреждает
> строкой про «re-add the bot».

**Проверка шага:** в BotFather у бота написано `Privacy mode is disabled`.

---

## Шаг 2. Protection Bypass в Vercel

Проверено 28.09.2026: превью-деплои проекта закрыты **Vercel Deployment
Protection**. Любой путь отдаёт 302 на `vercel.com/sso-api`, POST получает
401 — то есть наш код не выполняется вовсе.

Телеграм проходить SSO Vercel не умеет. Вебхук на такой адрес будет
отвергаться при каждой доставке, а выглядеть это будет как «настроено, но
сообщения не приходят».

### Путь, который рекомендую: обход, не отключение

`vercel.com` → команда **`pkhakhalov-pngs-projects`** → проект
**`goandstudy-crm`** → вкладка **`Settings`** → в левом меню
**`Deployment Protection`**.

На странице несколько блоков. Нужен **`Protection Bypass for Automation`**
(не `Vercel Authentication` и не `Password Protection`).

1. Нажмите **`Add Secret`** — Vercel сгенерирует строку из 32 символов.
2. **`Save`**.
3. Скопируйте секрет. Это **`CARE_VERCEL_BYPASS`** для локального запуска
   скрипта. В переменные проекта его добавлять не нужно: Vercel сам заводит
   `VERCEL_AUTOMATION_BYPASS_SECRET`.

Почему так, а не выключить `Vercel Authentication` для Preview: превью
остаётся закрытым для посторонних, а наш маршрут всё равно требует
собственный секрет. Защита в два слоя вместо нуля.

> Если `Protection Bypass for Automation` на вашем тарифе недоступен —
> альтернатива: тот же раздел, блок **`Vercel Authentication`** →
> **`Standard Protection`** переключить на **`Only Preview Deployments are
> protected`** → **`Disabled`**. Тогда превью открыто всем, кто знает адрес;
> единственной защитой останутся наши секреты. Скажите, если пойдёте этим
> путём — я допишу предупреждение в STATUS.

**Проверка шага:** выполните в терминале, подставив секрет:

```
curl -s -o /dev/null -w "%{http_code}\n" \
  -H "x-vercel-protection-bypass: <секрет>" \
  https://goandstudy-crm-git-feat-curator-v2-pkhakhalov-pngs-projects.vercel.app/api/care/health
```

Ожидается **503** — это наш маршрут, он отвечает «нет переменных». Если
пришло 401 или 302 — обход не принят, секрет скопирован не целиком.

---

## Шаг 3. Ключ базы: выпустить CARE_DB_KEY

Ключ уже есть в `.env.local` и работает (проверено 28.09: тесты прав 10 из 10).
Этот шаг нужен, только если ключ потерян или вы хотите выпустить новый.

### 3.1. Токен Supabase

Нужен **персональный** токен, ключи проекта не подходят — у них нет прав
читать настройки.

`supabase.com/dashboard/account/tokens` → **`Generate new token`** → имя,
например `care-v2-local` → **`Generate token`**.

Положите в `.env.local` как `SUPABASE_ACCESS_TOKEN=...`.

### 3.2. Выпустить ключ

```
npx tsx scripts/care/mint-key.ts             # показать, ничего не записывая
npx tsx scripts/care/mint-key.ts --записать  # дописать CARE_DB_KEY в .env.local
```

Скрипт берёт секрет подписи проекта через Management API, собирает JWT с
claim `role=care_app` и сроком 10 лет. Секрет подписи никуда не сохраняется.

Первая строка вывода покажет схемы, открытые для API. Там должна быть `care`:

```
Схемы, открытые для API сейчас: public,graphql_public,storage,seo,finance,content,care
Схема care открыта
```

Если написано `ЕЩЁ НЕ ОТКРЫТА` — выполните
`npx tsx scripts/care/expose-schema.ts --открыть`.

**Проверка шага:** `npx tsx scripts/care/selftest-perms.ts` → 10 из 10.

---

## Шаг 4. Переменные в Vercel

`goandstudy-crm` → **`Settings`** → в левом меню **`Environment Variables`**.

Для каждой: заполнить **`Key`**, **`Value`**, затем в блоке
**`Environments`** снять галочки `Production` и `Development`, оставить
только **`Preview`**. Ниже появится поле ветки — в нём выбрать
**`feat/curator-v2`** (в текущем интерфейсе это поле подписано
`Git Branch` и по умолчанию пусто, что означает «все ветки превью»).
Затем **`Save`**.

Scope именно на ветку — важно. Переменная на всех превью означает, что
любая будущая ветка получит ключи контура care, включая ветки, которые
никто не проверял.

| Key | Value | Откуда |
|---|---|---|
| `CARE_DB_KEY` | JWT из `.env.local` | шаг 3 |
| `CARE_TELEGRAM_BOT_TOKEN` | `8123456789:AAH...` | шаг 1.1 |
| `CARE_TELEGRAM_WEBHOOK_SECRET` | сгенерировать, см. ниже | — |
| `CARE_TICK_SECRET` | сгенерировать, см. ниже | — |
| `ANTHROPIC_API_KEY` | тот же, что в Production | уже есть в проекте |

Два секрета сгенерировать так — каждый своей командой, не один и тот же:

```
openssl rand -base64 32
```

Не короче 16 символов: `lib/care/secret.ts` отвергает короткие и значения
вроде `changeme`, и маршрут ответит 500, а не сделает вид, что защищён.

Те же два секрета положите и в `.env.local` — локальные скрипты берут их
оттуда.

### Проверьте заодно

`NEXT_PUBLIC_SUPABASE_URL` и `NEXT_PUBLIC_SUPABASE_ANON_KEY` должны быть
доступны в Preview. Anon-ключ контуру нужен как пропуск на шлюз Supabase:
права даёт не он, а `CARE_DB_KEY`, но без него запрос до базы не доходит.
Обычно они заведены на все окружения — проверьте, что в колонке
`Environments` у них есть `Preview`.

### После сохранения — передеплоить

Переменные подхватываются при сборке, а не на лету.
Вкладка **`Deployments`** → у верхнего превью-деплоя меню **`⋯`** →
**`Redeploy`** → **`Redeploy`**.

**Проверка шага:**

```
curl -s -H "x-vercel-protection-bypass: <секрет>" \
  https://goandstudy-crm-git-feat-curator-v2-pkhakhalov-pngs-projects.vercel.app/api/care/health
```

Ожидается `{"ok":true,"contour":"care","mode":"pilot","external_sends":false,...}`.
`mode: pilot` и `external_sends: false` — верно: контур наружу не ходит.

---

## Шаг 5. Повесить вебхук

Всё из `.env.local`:

```
npx tsx scripts/care/telegram-set-webhook.ts \
  --адрес https://goandstudy-crm-git-feat-curator-v2-pkhakhalov-pngs-projects.vercel.app
```

Или явно, ничего не кладя в файл:

```
npx tsx scripts/care/telegram-set-webhook.ts \
  --адрес https://goandstudy-crm-git-feat-curator-v2-pkhakhalov-pngs-projects.vercel.app \
  --токен  8123456789:AAH... \
  --секрет <CARE_TELEGRAM_WEBHOOK_SECRET> \
  --обход  <CARE_VERCEL_BYPASS>
```

Скрипт сначала проверяет адрес и откажется работать, если увидит защиту
Vercel, 404 или 500. Ожидаемый вывод:

```
  проба адреса: 401 — маршрут жив и требует секрет, верно

✓ вебхук care-бота: https://…/api/care/webhooks/telegram (+ секрет обхода в параметрах)
  ожидает доставки: 0
```

Посмотреть состояние: `--показать`. Снять: `--снять`.

**Проверка шага:** добавьте бота в тестовую группу, напишите туда что угодно,
затем:

```
npx tsx scripts/care/telegram-set-webhook.ts --показать
```

`pending_update_count: 0` и пустой `last_error_message` означают, что
Телеграм доставил и получил 200.

---

## Шаг 6. Расписание воркера — **пока не включать**

Делается последним и только после того, как всё выше проверено.

1. Записать адрес в настройки контура:
   Supabase → `SQL Editor` →
   ```sql
   insert into care.settings (key, value)
   values ('tick_url', to_jsonb('https://<branch-alias>/api/care/tick'::text))
   on conflict (key) do update set value = excluded.value;
   ```
2. Положить секрет в Vault: Supabase → **`Project Settings`** → **`Vault`** →
   **`Add new secret`** → Name: `CARE_TICK_SECRET`, Secret: то же значение,
   что в Vercel.
3. Включить: `select care.schedule_all();`

Выключить обратно: `select care.unschedule_all();`

Пока этот шаг не сделан, очередь работает только по ручному вызову — и это
правильное состояние для проверки всего остального.

---

## Чего делать НЕ нужно

- **Не трогать старого бота.** Оба живут параллельно, это задумано.
- **Не включать `external_sends`.** Рубильник в `care.env_marker` стоит в
  `false`, и меняется он только миграцией. Наружу контур не ходит.
- **Не сливать `feat/curator-v2` в `main`.** До приёмки этапа код не должен
  попадать в боевой деплой.
- **Не заводить переменные `CARE_*` в Production.** Только Preview, только
  эта ветка.

---

## Если что-то не сходится

| Симптом | Что смотреть |
|---|---|
| `health` отдаёт 302 на `vercel.com/sso-api` | обход не передан или не принят — шаг 2 |
| `health` отдаёт 503, `env_missing` не пуст | переменные не заведены или не передеплоено — шаг 4 |
| `health` отдаёт 503 и `db_error` | `CARE_DB_KEY` протух или схема `care` закрыта — шаг 3 |
| Скрипт вебхука: «закрыт защитой деплоя» | шаг 2 |
| Скрипт вебхука: «маршрут отвечает 500» | нет `CARE_TELEGRAM_WEBHOOK_SECRET` в окружении деплоя — шаг 4 |
| `pending_update_count` растёт | Телеграм не получает 200: посмотрите `last_error_message` в `--показать` |
| Бот не видит сообщений в группе | privacy mode или бота нужно удалить из группы и добавить заново — шаг 1.2 |
