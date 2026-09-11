# Конвейер: запуск, остановка, разбор поломок

Всё, что нужно, когда что-то пошло не так. Порядок действий, а не теория.

---

## 1. Включить и выключить поток

**В CRM:** `/admin/seo/articles` → блок «Поток статей» → тумблер.

Там же настраивается ритм (статей в неделю) и предел на вычитке. Предел важнее
ритма: если незакрытых статей больше предела, конвейер останавливается сам и
пишет, почему.

**Остановить всё немедленно** — выключить тумблер. Уже запущенные задачи
доработают: они дешёвые и безвредные.

**Остановить вместе с текущей работой:**
```sql
update seo.jobs set status = 'failed', last_error = 'остановлено вручную'
 where status in ('pending', 'running') and step like 'article_%';
```

---

## 2. Посмотреть, что происходит

**В CRM:** `/admin/seo/articles`, блок очереди — видно шаг, статус и ошибку.

**Запросом:**
```sql
select id, step, status, runner, attempts, left(last_error, 120) as error, created_at
  from seo.jobs order by id desc limit 20;
```

**Живой прогон конвейера целиком:**
```bash
npx tsx scripts/seo-selftest.ts        # 11 проверок критических мест
```

---

## 3. Задача застряла

Признак: висит в `running` дольше десяти минут.

Ничего делать не нужно — очередь разблокирует её сама при следующем захвате и
добавит попытку. Если хочется ускорить:
```sql
update seo.jobs set status='pending', locked_at=null, locked_by=null
 where id = <id>;
```

## 4. Задача упала

```sql
select step, attempts, max_attempts, last_error from seo.jobs where status='failed' order by id desc;
```

Как читать ошибку:

| Текст | Что значит | Что делать |
|---|---|---|
| `no credits remaining`, `quota` | кончились деньги у поставщика | пополнить счёт, затем перезапустить |
| `invalid_client`, `401` | ключ не работает | заменить ключ, перенести на Vercel |
| `spawn ssh ENOENT` | задачу взял не тот исполнитель | применить миграцию `20260911120000_jobs_runner.sql` |
| `429 rate limit`, `fetch failed` | временное | повторится само |
| `слаг уже занят` | статья с таким адресом есть | публиковать в режиме обновления |

**Перезапустить упавшую задачу:**
```sql
update seo.jobs set status='pending', attempts=0, next_run_at=now(), last_error=null
 where id = <id>;
```

---

## 5. Публикация

Публикует **агент на сервере**, не CRM. Порядок при разборе:

```bash
# 1. Жив ли агент
ssh root@72.56.242.202 "tail -20 /var/log/gs-publish.log"

# 2. Стоит ли задача
#    select * from seo.jobs where step='article_publish_blog' order by id desc limit 3;

# 3. Что реально лежит на сервере
ssh root@72.56.242.202 "ls -l /var/www/html/wordpress/wp-content/themes/goandstudy/inc/blog-articles/<slug>.html"
```

**Сухой прогон** — кнопка в CRM показывает, какие файлы куда уедут, ничего не
трогая. Пользуйтесь им перед всякой непонятной публикацией.

---

## 6. Откат публикации

Перед каждой перезаписью агент делает копии:

```bash
ssh root@72.56.242.202 "ls -lt /var/www/html/wordpress/wp-content/themes/goandstudy/inc/blog-articles/<slug>.html.bak.* | head"

# вернуть тело статьи
ssh root@72.56.242.202 "cp <файл>.bak.<время> <файл>"

# вернуть реестр
ssh root@72.56.242.202 "ls -lt /var/www/html/wordpress/wp-content/themes/goandstudy/inc/blog-data.php.bak.*"
```

После отката **обязательно** поднять флаг пересборки, иначе страница останется
прежней:
```bash
ssh root@72.56.242.202 "grep -o 'goandstudy_seed_v[0-9]*' /var/www/html/wordpress/wp-content/themes/goandstudy/functions.php | tail -1"
```
Далее заменить номер на следующий в `functions.php`.

**Полный откат темы** (если сломана не одна статья):
```bash
ssh root@72.56.242.202 "ls -lt /root/backups/theme-*.tgz | head -3"
ssh root@72.56.242.202 "tar xzf /root/backups/theme-<метка>.tgz -C /var/www/html/wordpress/wp-content/themes"
```

---

## 7. Статья вышла, но выглядит неправильно

```bash
npx tsx -e "import('./lib/seo/theme-publish').then(m => m.verifyPublished('<slug>').then(console.log))"
```

Проверит: статус, canonical, sitemap, картинки, H1, разметку, карточку в блоге.

---

## 8. Статистика GSC выглядит странно

Сначала — не поломка ли это импорта:

```sql
select value from seo.settings where key = 'gsc_import_health';
```

Смотреть `lastDayRows`: за сутки сайт показывается по сотне с лишним адресов.
Если там десятки — часть строк не доехала. Поле `suspicious` появляется, когда
сторож сам заметил неладное.

**Добрать данные вручную:**
```bash
npx tsx scripts/seo-gsc.ts 2026-05-01 2026-09-08
```

Повторный импорт безопасен: строки перезаписываются, а не складываются.

---

## 9. Индексация

```bash
npx tsx scripts/seo-index-site.ts 50     # обойти сайт
npx tsx scripts/seo-index-check.ts       # только наши статьи
```

Экран `/admin/seo/indexation` показывает то же самое без терминала.

Помнить: **уведомление ≠ индексация**. IndexNow принял — значит Яндекс узнал
об адресе, не более. Google заявок на индексацию не принимает вовсе. Первое
обнаружение в индексе — не точная дата индексации, а дата, когда мы это
увидели.

---

## 10. Ключи и где они живут

| Переменная | Зачем | Где настраивать |
|---|---|---|
| `ANTHROPIC_API_KEY` | тексты | `.env.local` и Vercel → Environment Variables |
| `FAL_KEY`, `IMAGE_PROVIDER` | картинки | там же |
| `GSC_CLIENT_ID/SECRET/REFRESH_TOKEN` | статистика и индексация | там же; токен обновляется `scripts/seo-gsc-auth.ts` |
| `WP_BRIDGE_SECRET` | мост WordPress | сервер: `/root/gs-bridge-secret.txt` |
| `SEO_PUBLISH_TOKEN` | агент публикации | сервер: `/etc/gs-publish-agent.env` |
| `EMBEDDING_API_KEY` | векторы | `.env.local` и Vercel |
| `INDEXNOW_KEY` | уведомление поисковиков | публичный, лежит файлом в корне сайта |

**Правило:** ключи не печатать в терминал и не вставлять в переписку. Локальный
файл целиком не перезаписывать — дописывать строкой.

Копии локального файла: `~/Desktop/env-backup/`.

---

## 11. Режим приложения Google

Постоянный токен Search Console живёт **семь дней**, пока приложение в режиме
Testing. Это правило Google, а не наша ошибка настройки: непереведённое
приложение считается черновиком.

Проверить здоровье доступа:
```bash
npx tsx scripts/seo-gsc-health.ts
```

**Перевести в рабочий режим (делается один раз, руками):**

1. `console.cloud.google.com/auth/audience` — выбрать проект `goandstudy-seo`.
2. Раздел **Audience**, кнопка **Publish app**.
3. Google спросит подтверждение — согласиться.
4. Статус сменится с «Testing» на «In production».

Проверки Google при этом не требуется: мы запрашиваем только доступ к своему
же ресурсу в Search Console, а не к данным пользователей. Экран согласия
увидит только владелец аккаунта.

После перевода токен перестаёт протухать. Если этого не сделать, через неделю
ночной импорт упадёт с `invalid_grant`, и придёт уведомление о поломке —
чинить придётся повторным `npx tsx scripts/seo-gsc-auth.ts`.

## 12. Уведомления о поломках

Раз в час конвейер проверяет себя и пишет в Telegram, если нашёл беду:
задача сдалась окончательно, задача висит дольше получаса, или за сутки не
завершилось ни одной задачи при включённом потоке.

Одно сообщение на одну беду, повтор не раньше чем через шесть часов — иначе
уведомления начнут игнорировать.

Куда пишет: `SEO_ALERT_CHAT_ID`, а если её нет — в чат заявок. Отдельная
переменная лучше: беда конвейера не касается продавцов.

Посмотреть, что система считает бедой прямо сейчас:
```bash
npx tsx -e "import('./lib/seo/alerts').then(async m => console.log(await m.collectAlerts((await import('./lib/supabase/server')).createAdminClient())))"
```

## 13. Что нельзя делать без отдельного решения

- включать автопубликацию;
- массово править адреса и ставить редиректы;
- удалять статьи;
- запускать `server-agent/fix-trailing-slash.sh` (165 ссылок на живом сайте);
- подключать платные сервисы.
