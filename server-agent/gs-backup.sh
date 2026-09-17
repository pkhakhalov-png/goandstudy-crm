#!/usr/bin/env bash
#
# Ночной бэкап goandstudy: данные CRM, файлы клиентов и сам сайт.
#
# Живёт на московском сервере — там, где сайт. Смысл именно в этом: копия
# должна лежать не там, где оригинал. База CRM живёт в Supabase, файлы клиентов
# там же, сайт здесь; если пропадёт что-то одно, второе останется.
#
# Чего здесь намеренно нет: ключей Supabase. Сервисный ключ даёт полный доступ
# к CRM на запись, и взлом сайта означал бы взлом всей системы. Поэтому сервер
# ничего не знает: он просит данные у CRM подписанным запросом, а решает CRM.
#
# Чего не покрывает: структуру базы — таблицы, функции, политики. Она лежит в
# миграциях в гите. Здесь только данные, которых в гите нет.
#
# Настройки — в /etc/gs-backup.env (chmod 600):
#   CRM_URL=https://crm.goandstudy.com
#   BACKUP_SECRET=...
#   DEST=/root/backups/gs
#   KEEP_DAYS=30
#
# Запуск: /usr/local/bin/gs-backup.sh  (в cron ночью)

set -euo pipefail

CONF=/etc/gs-backup.env
[ -f "$CONF" ] || { echo "нет $CONF"; exit 1; }
# shellcheck disable=SC1090
. "$CONF"

CRM_URL="${CRM_URL:-https://crm.goandstudy.com}"
DEST="${DEST:-/root/backups/gs}"
KEEP_DAYS="${KEEP_DAYS:-30}"
WP_ROOT="${WP_ROOT:-/var/www/html/wordpress}"

DAY=$(date +%Y-%m-%d)
OUT="$DEST/$DAY"
mkdir -p "$OUT/tables" "$OUT/files"

log() { echo "[$(date +%H:%M:%S)] $*"; }
fail() { log "ОШИБКА: $*"; exit 1; }

# Подпись запроса: секрет общий с CRM, время внутри подписи — чтобы
# перехваченный запрос нельзя было повторить завтра.
call() {
  local body="$1" ts sig
  ts=$(date +%s)
  sig=$(printf '%s.%s' "$ts" "$body" | openssl dgst -sha256 -hmac "$BACKUP_SECRET" -hex | awk '{print $NF}')
  curl -sS --max-time 120 -X POST "$CRM_URL/api/backup/export" \
    -H 'content-type: application/json' \
    -H "x-gs-timestamp: $ts" \
    -H "x-gs-signature: $sig" \
    -d "$body"
}

# ─── 1. Что выгружать ────────────────────────────────────────────────────────
log "спрашиваю список таблиц и файлов"
MANIFEST="$OUT/manifest.json"
call '{"kind":"manifest"}' > "$MANIFEST"
jq -e '.tables | length > 0' "$MANIFEST" >/dev/null || fail "CRM не отдала список: $(head -c 200 "$MANIFEST")"

TABLES=$(jq -r '.tables[] | "\(.schema)|\(.table)"' "$MANIFEST")
FILES_COUNT=$(jq -r '.files | length' "$MANIFEST")
log "таблиц: $(echo "$TABLES" | wc -l), файлов: $FILES_COUNT"

# ─── 2. Данные ───────────────────────────────────────────────────────────────
# Выгрузки Search Console — сотни тысяч строк, и они восстановимы из самого
# Google. Тянуть их каждую ночь незачем: берём раз в неделю, по воскресеньям.
HEAVY="gsc_daily gsc_page_daily"
IS_SUNDAY=$([ "$(date +%u)" = "7" ] && echo yes || echo no)

for entry in $TABLES; do
  schema="${entry%%|*}"; table="${entry##*|}"

  if [ "$IS_SUNDAY" = "no" ] && echo "$HEAVY" | grep -qw "$table"; then
    log "  $schema.$table — пропуск, тяжёлая таблица (по воскресеньям)"
    continue
  fi

  offset=0; total=0
  : > "$OUT/tables/$schema.$table.jsonl"
  while :; do
    resp=$(call "{\"kind\":\"table\",\"schema\":\"$schema\",\"table\":\"$table\",\"offset\":$offset,\"limit\":1000}")
    if ! echo "$resp" | jq -e '.rows' >/dev/null 2>&1; then
      log "  $schema.$table — не отдалась: $(echo "$resp" | head -c 160)"
      break
    fi
    echo "$resp" | jq -c '.rows[]' >> "$OUT/tables/$schema.$table.jsonl"
    got=$(echo "$resp" | jq -r '.count')
    total=$((total + got))
    [ "$(echo "$resp" | jq -r '.done')" = "true" ] && break
    offset=$((offset + 1000))
  done
  gzip -f "$OUT/tables/$schema.$table.jsonl"
  [ "$total" -gt 0 ] && log "  $schema.$table — $total строк"
done

# ─── 3. Файлы клиентов ───────────────────────────────────────────────────────
# Их не покрывают бэкапы Supabase ни на каком тарифе: в базе лежат только
# записи о файлах, а сами файлы — в хранилище. Панель Supabase пишет об этом
# прямым текстом.
# Файлы держим одним зеркалом, а в ночную копию кладём жёсткими ссылками.
# Иначе каждая ночь стоила бы пять гигабайт, и тридцать дней истории не влезли
# бы на диск. Жёсткая ссылка не занимает места: неизменившийся файл лежит один
# раз, а виден во всех копиях.
MIRROR="$DEST/files-mirror"
mkdir -p "$MIRROR"

log "обновляю зеркало файлов хранилища"
downloaded=0; skipped=0
for bucket in $(jq -r '.files[].bucket' "$MANIFEST" | sort -u); do
  mapfile -t entries < <(jq -c --arg b "$bucket" '.files[] | select(.bucket==$b)' "$MANIFEST")
  total=${#entries[@]}
  log "  бакет $bucket: файлов $total"

  # Сначала отбираем те, которых нет или размер разошёлся
  need=()
  for e in "${entries[@]}"; do
    path=$(echo "$e" | jq -r '.path')
    size=$(echo "$e" | jq -r '.size // 0')
    local_file="$MIRROR/$bucket/$path"
    if [ -f "$local_file" ]; then
      have=$(stat -c%s "$local_file" 2>/dev/null || echo 0)
      if [ "$size" = "0" ] || [ "$have" = "$size" ]; then skipped=$((skipped + 1)); continue; fi
    fi
    need+=("$path")
  done
  log "    качать: ${#need[@]}, уже есть: $skipped"

  for ((i = 0; i < ${#need[@]}; i += 100)); do
    chunk=$(printf '%s\n' "${need[@]:i:100}" | jq -R . | jq -s -c .)
    resp=$(call "{\"kind\":\"files\",\"bucket\":\"$bucket\",\"paths\":$chunk}")
    if ! echo "$resp" | jq -e '.urls' >/dev/null 2>&1; then
      log "    ссылки не выдались: $(echo "$resp" | head -c 140)"
      continue
    fi
    while read -r line; do
      path=$(echo "$line" | jq -r '.path')
      url=$(echo "$line" | jq -r '.url // empty')
      [ -z "$url" ] && continue
      target="$MIRROR/$bucket/$path"
      mkdir -p "$(dirname "$target")"
      curl -sS --max-time 120 -o "$target" "$url" && downloaded=$((downloaded + 1))
    done < <(echo "$resp" | jq -c '.urls[]')
  done
done
log "  скачано новых: $downloaded, не менялось: $skipped"

log "снимок файлов в копию за $DAY"
rm -rf "$OUT/files"
cp -al "$MIRROR" "$OUT/files"

# ─── 4. Сайт ─────────────────────────────────────────────────────────────────
log "дамп базы WordPress"
DB_NAME=$(php -r "include '$WP_ROOT/wp-config.php'; echo DB_NAME;")
DB_USER=$(php -r "include '$WP_ROOT/wp-config.php'; echo DB_USER;")
DB_PASS=$(php -r "include '$WP_ROOT/wp-config.php'; echo DB_PASSWORD;")
DB_HOST=$(php -r "include '$WP_ROOT/wp-config.php'; echo DB_HOST;")

MYSQL_PWD="$DB_PASS" mysqldump --single-transaction --quick --no-tablespaces \
  -h "$DB_HOST" -u "$DB_USER" "$DB_NAME" | gzip > "$OUT/wordpress-db.sql.gz"
log "  база сайта: $(du -h "$OUT/wordpress-db.sql.gz" | cut -f1)"

log "архив файлов сайта"
# Резервные копии, которые мы сами насыпали при правках, в архив не тянем —
# иначе каждый бэкап тащит все предыдущие.
tar -czf "$OUT/wordpress-content.tar.gz" \
  --exclude='*.bak' --exclude='*.bak.*' --exclude='cache' --exclude='*.log' \
  -C "$WP_ROOT" wp-content 2>/dev/null || true
log "  файлы сайта: $(du -h "$OUT/wordpress-content.tar.gz" | cut -f1)"

# ─── 5. Итог и ротация ───────────────────────────────────────────────────────
SIZE=$(du -sh "$OUT" | cut -f1)
cat > "$OUT/README.txt" <<TXT
Бэкап goandstudy за $DAY

tables/   — данные CRM построчно (JSON Lines, gzip). Структура базы — в
            миграциях репозитория, здесь только данные.
files/    — файлы клиентов из хранилища Supabase: договоры, файлы сделок.
            В бэкапы Supabase они не входят.
wordpress-db.sql.gz      — база сайта
wordpress-content.tar.gz — wp-content вместе с темой

Тяжёлые выгрузки Search Console (gsc_daily, gsc_page_daily) кладутся по
воскресеньям: они восстановимы из самого Google.

Размер: $SIZE
TXT

log "удаляю бэкапы старше $KEEP_DAYS дней"
find "$DEST" -maxdepth 1 -type d -name '20*' -mtime "+$KEEP_DAYS" -exec rm -rf {} + 2>/dev/null || true

log "готово: $OUT ($SIZE), всего копий: $(find "$DEST" -maxdepth 1 -type d -name '20*' | wc -l)"
