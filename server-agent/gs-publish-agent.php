<?php
/**
 * Агент публикации статей блога. Живёт на сервере сайта, запускается по крону.
 *
 * Зачем он есть: статья блога — это файлы в теме, тема принадлежит root, и записать
 * их может только процесс на этой машине. При этом ставить сюда ключи от базы CRM
 * нельзя: сервер ломали в июле и августе. Поэтому агент знает ровно один узкий токен —
 * он умеет спросить «есть работа?» и отчитаться. Доступа к клиентам, платежам
 * и ключам моделей у него нет.
 *
 * Написан на PHP намеренно: он тут уже есть, и ставить второй язык ради одного
 * скрипта незачем.
 *
 * Установка:
 *   /usr/local/bin/gs-publish-agent.php
 *   /etc/gs-publish-agent.env   →  CRM_URL=...  PUBLISH_TOKEN=...
 *   крон: * * * * * /usr/bin/php /usr/local/bin/gs-publish-agent.php >> /var/log/gs-publish.log 2>&1
 */

const THEME = '/var/www/html/wordpress/wp-content/themes/goandstudy';

function env_conf(): array {
    $out = [];
    $file = '/etc/gs-publish-agent.env';
    if (is_readable($file)) {
        foreach (file($file, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) as $line) {
            if (preg_match('/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/', $line, $m)) {
                $out[$m[1]] = trim($m[2], "\"' \t");
            }
        }
    }
    return $out;
}

function say(string $msg): void { echo gmdate('c') . ' ' . $msg . PHP_EOL; }

function api(string $path, array $conf, ?array $body = null): array {
    $ch = curl_init($conf['CRM_URL'] . $path);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => 30,
        CURLOPT_HTTPHEADER => ['x-publish-token: ' . $conf['PUBLISH_TOKEN'], 'content-type: application/json'],
    ]);
    if ($body !== null) {
        curl_setopt($ch, CURLOPT_POST, true);
        curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($body, JSON_UNESCAPED_UNICODE));
    }
    $raw = curl_exec($ch);
    $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    if ($raw === false || $code >= 400) throw new RuntimeException("$path: HTTP $code");
    return json_decode($raw, true) ?: [];
}

/** Строка реестра: порядок ключей фиксирован стандартом статьи. */
function registry_line(array $e): string {
    $esc = fn($v) => str_replace(["\\", "'"], ["\\\\", "\\'"], (string) $v);
    return "\t\tarray( 'slug' => '{$esc($e['slug'])}', 'title' => '{$esc($e['title'])}', 'excerpt' => '{$esc($e['excerpt'])}', 'cat' => '{$esc($e['cat'])}', 'published' => '{$e['published']}', 'updated' => '{$e['updated']}' ),";
}

function seed_flag(): string {
    $out = shell_exec('grep -o "goandstudy_seed_v[0-9]*" ' . THEME . '/functions.php | sort -u | tail -1');
    return trim((string) $out);
}

function publish(array $job): array {
    $slug = (string) $job['slug'];
    if (!preg_match('/^[a-z0-9-]+$/', $slug)) throw new RuntimeException("недопустимый слаг: $slug");

    $bodyFile  = THEME . "/inc/blog-articles/$slug.html";
    $coverFile = THEME . "/assets/img/blog/$slug.jpg";
    $isUpdate  = !empty($job['update']);

    // Обновление вышедшей статьи — отдельный режим. Без него нельзя переписать
    // опубликованное, а с ним легко нечаянно затереть чужую правку, поэтому
    // решение принимает человек, а не конвейер.
    if (file_exists($bodyFile) && !$isUpdate) {
        throw new RuntimeException("слаг $slug уже занят — по стандарту не дописываем «-2», а уточняем тему");
    }
    if (!file_exists($bodyFile) && $isUpdate) {
        throw new RuntimeException("нечего обновлять: файла $bodyFile нет");
    }

    $seedFrom = seed_flag();
    $seedTo = 'goandstudy_seed_v' . ((int) str_replace('goandstudy_seed_v', '', $seedFrom) + 1);

    if (!empty($job['dry_run'])) {
        return ['dry_run' => true, 'seed_from' => $seedFrom, 'seed_to' => $seedTo, 'slug' => $slug,
                'steps' => [
                    ($isUpdate ? 'перезапись тела → ' : 'тело → ') . $bodyFile,
                    ($isUpdate ? 'перезапись обложки → ' : 'обложка → ') . $coverFile,
                    $isUpdate ? 'обновление строки реестра, дата правки на сегодня' : 'строка в начало реестра',
                    "сид-флаг $seedFrom → $seedTo",
                    'прогрев главной',
                ]];
    }

    $steps = [];
    if ($isUpdate) copy($bodyFile, $bodyFile . '.bak.' . time());
    file_put_contents($bodyFile, $job['body']);
    $steps[] = ($isUpdate ? 'перезаписано тело → ' : 'тело → ') . $bodyFile;
    file_put_contents($coverFile, base64_decode($job['cover_base64']));
    $steps[] = ($isUpdate ? 'перезаписана обложка → ' : 'обложка → ') . $coverFile;

    // Реестр правим с резервной копией и проверкой синтаксиса: сломанный PHP положит весь сайт
    $registry = THEME . '/inc/blog-data.php';
    $backup = $registry . '.bak.' . time();
    copy($registry, $backup);
    $src = file_get_contents($registry);
    if ($isUpdate) {
        // Меняем существующую строку на месте: порядок карточек в ленте не трогаем,
        // дату первой публикации сохраняем, двигаем только дату правки (§8).
        $pattern = "/^.*'slug'\s*=>\s*'" . preg_quote($slug, '/') . "'.*$/m";
        if (!preg_match($pattern, $src, $found)) throw new RuntimeException("строки со слагом $slug в реестре нет");
        $published = preg_match("/'published'\s*=>\s*'([0-9-]+)'/", $found[0], $pm) ? $pm[1] : $job['registry']['published'];
        $entry = $job['registry'];
        $entry['published'] = $published;
        $src = preg_replace($pattern, str_replace('$', '\\$', registry_line($entry)), $src, 1);
        file_put_contents($registry, $src);
        $steps[] = "строка реестра обновлена, дата первой публикации сохранена ($published)";
    } else {
        $marker = strpos($src, 'return array(');
        if ($marker === false) throw new RuntimeException('в реестре не найдено начало массива');
        $insertAt = strpos($src, "\n", $marker) + 1;
        file_put_contents($registry, substr($src, 0, $insertAt) . registry_line($job['registry']) . "\n" . substr($src, $insertAt));
        $steps[] = 'строка в начало реестра';
    }

    $lint = (string) shell_exec("php -l $registry 2>&1");
    if (!str_contains($lint, 'No syntax errors')) {
        copy($backup, $registry);
        throw new RuntimeException('реестр сломался, откатил: ' . trim(substr($lint, 0, 200)));
    }

    shell_exec("sed -i 's/$seedFrom/$seedTo/g' " . THEME . '/functions.php');
    $steps[] = "сид-флаг $seedFrom → $seedTo";

    shell_exec('curl -s -o /dev/null https://goandstudy.com/ || true');
    $steps[] = 'прогрев главной';

    return ['dry_run' => false, 'seed_from' => $seedFrom, 'seed_to' => $seedTo, 'slug' => $slug, 'steps' => $steps];
}

$conf = env_conf();
if (empty($conf['CRM_URL']) || empty($conf['PUBLISH_TOKEN'])) { say('нет CRM_URL или PUBLISH_TOKEN'); exit(1); }

try {
    $res = api('/api/seo/publish/next', $conf);
} catch (Throwable $e) { say('не смог спросить задание: ' . $e->getMessage()); exit(1); }

$job = $res['job'] ?? null;
if (!$job) exit(0);

// Вставка ссылки в файл статьи блога. Через мост это делать нельзя: тема
// пересидит страницу из файла и затрёт правку.
if (($job['kind'] ?? '') === 'link_insert') {
    $slug = (string) $job['slug'];
    $file = THEME . "/inc/blog-articles/$slug.html";
    try {
        if (!preg_match('/^[a-z0-9-]+$/', $slug)) throw new RuntimeException("недопустимый слаг: $slug");
        if (!file_exists($file)) throw new RuntimeException("нет файла статьи $slug");
        $html = file_get_contents($file);
        $anchor = (string) $job['anchor'];
        $target = (string) $job['target'];

        if (str_contains($html, $target)) throw new RuntimeException('ссылка на эту страницу уже есть');

        // Ищем фразу вне тегов и вне существующих ссылок: разбираем по кускам
        $parts = preg_split('/(<[^>]+>)/u', $html, -1, PREG_SPLIT_DELIM_CAPTURE);
        $inLink = false; $done = false;
        foreach ($parts as $i => $chunk) {
            if ($chunk === '' || $chunk[0] === '<') {
                $low = strtolower($chunk);
                if (str_starts_with($low, '<a')) $inLink = true;
                if (str_starts_with($low, '</a')) $inLink = false;
                continue;
            }
            if ($inLink || $done) continue;
            $pos = mb_stripos($chunk, $anchor);
            if ($pos === false) continue;
            $exact = mb_substr($chunk, $pos, mb_strlen($anchor));
            $parts[$i] = mb_substr($chunk, 0, $pos) . '<a href="' . $target . '">' . $exact . '</a>' . mb_substr($chunk, $pos + mb_strlen($anchor));
            $done = true;
        }
        if (!$done) throw new RuntimeException("фраза «{$anchor}» не найдена вне ссылок");

        copy($file, $file . '.bak.' . time());
        file_put_contents($file, implode('', $parts));

        $seedFrom = seed_flag();
        $seedTo = 'goandstudy_seed_v' . ((int) str_replace('goandstudy_seed_v', '', $seedFrom) + 1);
        shell_exec("sed -i 's/$seedFrom/$seedTo/g' " . THEME . '/functions.php');
        shell_exec('curl -s -o /dev/null https://goandstudy.com/ || true');

        say("ссылка вставлена в {$slug}: «{$anchor}» → {$target}");
        api('/api/seo/publish/result', $conf, ['job_id' => $job['id'], 'article_id' => $job['article_id'], 'kind' => 'link_insert',
            'ok' => true, 'slug' => $slug, 'seed_from' => $seedFrom, 'seed_to' => $seedTo,
            'steps' => ["ссылка «{$anchor}» → {$target} в {$file}"], 'suggestion_id' => $job['suggestion_id'] ?? null]);
    } catch (Throwable $e) {
        say('ошибка вставки: ' . $e->getMessage());
        api('/api/seo/publish/result', $conf, ['job_id' => $job['id'], 'article_id' => $job['article_id'], 'kind' => 'link_insert', 'ok' => false, 'error' => $e->getMessage()]);
    }
    exit(0);
}

say("взял задание {$job['id']}: {$job['slug']}" . (!empty($job['dry_run']) ? ' (план)' : ''));
try {
    $result = publish($job);
    api('/api/seo/publish/result', $conf, array_merge(['job_id' => $job['id'], 'article_id' => $job['article_id'], 'ok' => true], $result));
    say("готово: {$job['slug']}");
} catch (Throwable $e) {
    say('ошибка: ' . $e->getMessage());
    try { api('/api/seo/publish/result', $conf, ['job_id' => $job['id'], 'article_id' => $job['article_id'], 'ok' => false, 'error' => $e->getMessage()]); } catch (Throwable $ignored) {}
}
