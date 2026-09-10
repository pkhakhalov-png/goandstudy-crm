#!/usr/bin/env bash
# Приводит внутренние ссылки темы к канонической форме — со слэшем на конце.
#
# Зачем: каждый внутренний адрес без слэша отдаёт 301 на адрес со слэшем,
# который сайт сам объявляет каноническим. Сейчас так ведут себя примерно
# 165 ссылок, включая всё главное меню и весь список блога. Для поисковика
# это лишний прыжок на каждом переходе и размытый сигнал: часть страниц
# он держит в индексе под старой формой, часть под новой.
#
# Не трогает: адреса с расширением, якорем, параметрами, внешние ссылки
# и файл tilda-redirects.php — там пути являются данными правил, а не ссылками.
#
# Откат: tar xzf /root/backups/theme-<метка>.tgz -C /var/www/html/wordpress/wp-content/themes
set -euo pipefail

T=/var/www/html/wordpress/wp-content/themes/goandstudy
STAMP=$(date +%Y%m%d-%H%M%S)
mkdir -p /root/backups
tar czf "/root/backups/theme-$STAMP.tgz" -C "$(dirname "$T")" "$(basename "$T")"
echo "копия темы: /root/backups/theme-$STAMP.tgz"

CHANGED=""

# 1) href="/путь" → href="/путь/" в разметке и шаблонах
for f in $(grep -rlE 'href="/[a-zA-Z0-9_/-]*[a-zA-Z0-9_-]"' "$T" --include='*.php' --include='*.html' 2>/dev/null | grep -v tilda-redirects); do
  sed -i -E 's|href="(/[a-zA-Z0-9_/-]*[a-zA-Z0-9_-])"|href="\1/"|g' "$f"
  CHANGED="$CHANGED $f"
done

# 2) 'href' => '/путь' в массивах карточек
for f in $(grep -rlE "'href'[[:space:]]*=>[[:space:]]*'/[a-zA-Z0-9_/-]*[a-zA-Z0-9_-]'" "$T" --include='*.php' 2>/dev/null | grep -v tilda-redirects); do
  sed -i -E "s|('href'[[:space:]]*=>[[:space:]]*)'(/[a-zA-Z0-9_/-]*[a-zA-Z0-9_-])'|\1'\2/'|g" "$f"
  CHANGED="$CHANGED $f"
done

# 3) сборка ссылки в списке блога — одна строка, но из неё 76 ссылок
sed -i "s|esc_url( '/blog/' . \$a\['slug'\] )|esc_url( '/blog/' . \$a['slug'] . '/' )|" "$T/inc/blog.php"
CHANGED="$CHANGED $T/inc/blog.php"

# Проверка синтаксиса: сломанный PHP положит сайт целиком, поэтому откат сразу
for f in $(echo "$CHANGED" | tr ' ' '\n' | sort -u | grep '\.php$'); do
  if ! php -l "$f" >/dev/null 2>&1; then
    echo "ОШИБКА синтаксиса в $f — откатываю"
    tar xzf "/root/backups/theme-$STAMP.tgz" -C "$(dirname "$T")"
    exit 1
  fi
done

LEFT=$(grep -rhoE 'href="/[a-zA-Z0-9_/-]*[a-zA-Z0-9_-]"' "$T" --include='*.php' --include='*.html' 2>/dev/null | grep -vc tilda-redirects || true)
echo "готово. синтаксис в порядке, ссылок без слэша осталось: ${LEFT:-0}"
echo "проверить: curl -s https://goandstudy.com/blog/ | grep -c 'href=\"/blog/[a-z0-9-]*\"'   → должно стать 0"
