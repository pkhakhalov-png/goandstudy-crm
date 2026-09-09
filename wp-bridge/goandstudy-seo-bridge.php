<?php
/**
 * Plugin Name: Go&Study SEO Bridge
 * Description: Мост между CRM SEO-модулем и WordPress: lookup по мете, идемпотентная
 *              публикация/правки, редиректы, rendered-HTML, экспорт, resolve URL→ID,
 *              загрузка медиа и изображение записи.
 *              Плюс техническая SEO-база: canonical на всех страницах, JSON-LD и
 *              meta description из меты. Аутентификация — HMAC (WP_BRIDGE_SECRET)
 *              + окно времени. Ставится как mu-plugin.
 * Version: 0.6
 *
 * УСТАНОВКА: положить файл в wp-content/mu-plugins/goandstudy-seo-bridge.php
 * В wp-config.php добавить: define('GS_SEO_BRIDGE_SECRET', '<тот же WP_BRIDGE_SECRET, что в CRM env>');
 */

if (!defined('ABSPATH')) exit;

define('GS_SEO_NS', 'goandstudy-seo/v1');
define('GS_SEO_KEY_META', '_gs_seo_key');
define('GS_SEO_VER_META', '_gs_version_id');
define('GS_SEO_SCHEMA_META', '_gs_schema');
define('GS_SEO_METADESC_META', '_gs_meta_description');
define('GS_SEO_OG_PREFIX', '_gs_og_');   // _gs_og_title, _gs_og_description, _gs_og_image, _gs_og_url

/* ── Регистрация меты (видна в REST) ──────────────────────────────────────── */
add_action('init', function () {
    foreach ([GS_SEO_KEY_META, GS_SEO_VER_META, GS_SEO_SCHEMA_META, GS_SEO_METADESC_META] as $k) {
        foreach (['post', 'page'] as $pt) {
            register_post_meta($pt, $k, ['show_in_rest' => true, 'single' => true, 'type' => 'string',
                'auth_callback' => function () { return current_user_can('edit_posts'); }]);
        }
    }
});

/* ── HMAC-аутентификация ──────────────────────────────────────────────────── */
function gs_seo_secret() {
    return defined('GS_SEO_BRIDGE_SECRET') ? GS_SEO_BRIDGE_SECRET : '';
}
function gs_seo_check_auth(WP_REST_Request $req) {
    $secret = gs_seo_secret();
    if (!$secret) return new WP_Error('gs_no_secret', 'Bridge secret не настроен', ['status' => 500]);
    $ts  = $req->get_header('x-gs-timestamp');
    $sig = $req->get_header('x-gs-signature');
    if (!$ts || !$sig) return new WP_Error('gs_auth', 'Нет подписи', ['status' => 401]);
    if (abs(time() - intval($ts)) > 300) return new WP_Error('gs_auth', 'Устаревший запрос', ['status' => 401]);
    $body = $req->get_body();
    $expected = hash_hmac('sha256', $ts . '.' . $body, $secret);
    if (!hash_equals($expected, $sig)) return new WP_Error('gs_auth', 'Неверная подпись', ['status' => 401]);
    return true;
}

/* ── Разрешить webp в загрузках ───────────────────────────────────────────── */
/* Обложки и схемы мы отдаём в webp (§9.1). На части сборок WordPress тип не в
   белом списке, и загрузка падает с «недопустимый тип файла». */
add_filter('upload_mimes', function ($mimes) {
    if (!isset($mimes['webp'])) $mimes['webp'] = 'image/webp';
    return $mimes;
});

/* ── Лог операций ─────────────────────────────────────────────────────────── */
/* Таблица создаётся один раз (по версии в опции), а не при каждой записи. */
add_action('init', function () {
    if (get_option('gs_seo_log_v') === '1') return;
    global $wpdb;
    $t = $wpdb->prefix . 'gs_seo_log';
    $wpdb->query("CREATE TABLE IF NOT EXISTS $t (id BIGINT AUTO_INCREMENT PRIMARY KEY, post_id BIGINT, ikey VARCHAR(191), action VARCHAR(64), created_at DATETIME)");
    update_option('gs_seo_log_v', '1');
});
function gs_seo_log($post_id, $key, $action) {
    global $wpdb;
    $wpdb->insert($wpdb->prefix . 'gs_seo_log', ['post_id' => $post_id, 'ikey' => $key, 'action' => $action, 'created_at' => current_time('mysql')]);
}

/* ── Время правки ─────────────────────────────────────────────────────────── */
/* У черновика post_modified_gmt бывает пустым, и get_post_modified_time отдаёт false.
   Для защиты от гонки с админкой (§12.1.3) нужно хоть какое-то время, поэтому
   откатываемся на локальное время правки, затем на дату создания. */
function gs_seo_modified($id) {
    $t = get_post_modified_time('c', true, $id);
    if ($t) return $t;
    $t = get_post_modified_time('c', false, $id);
    if ($t) return $t;
    $p = get_post($id);
    return $p ? mysql2date('c', $p->post_date) : null;
}

/* ── Идемпотентность: найти пост по ключу ─────────────────────────────────── */
function gs_seo_find_by_key($key) {
    $q = new WP_Query(['post_type' => ['post', 'page'], 'post_status' => 'any', 'posts_per_page' => 1,
        'meta_key' => GS_SEO_KEY_META, 'meta_value' => $key, 'fields' => 'ids', 'no_found_rows' => true]);
    return $q->have_posts() ? $q->posts[0] : 0;
}

/* ── Роуты ────────────────────────────────────────────────────────────────── */
add_action('rest_api_init', function () {
    $auth = 'gs_seo_check_auth';

    // GET resolve?url= — сопоставить публичный URL с ID поста/страницы.
    // Нужно, чтобы применять schema/description к УЖЕ существующим 159 страницам,
    // у которых нет нашей меты _gs_seo_key (их создавали не мы).
    register_rest_route(GS_SEO_NS, '/resolve', ['methods' => 'GET', 'permission_callback' => $auth,
        'callback' => function (WP_REST_Request $r) {
            $url = (string) $r->get_param('url');
            if ($url === '') return new WP_Error('gs_url', 'нет url', ['status' => 400]);
            $host = parse_url($url, PHP_URL_HOST);
            $home = parse_url(home_url(), PHP_URL_HOST);
            if ($host && $home && strcasecmp($host, $home) !== 0) {
                return new WP_Error('gs_url', 'url не с этого сайта', ['status' => 400]);
            }
            $id = url_to_postid($url);
            if (!$id) {                                  // url_to_postid не находит иерархические страницы надёжно
                $path = trim((string) parse_url($url, PHP_URL_PATH), '/');
                if ($path !== '') {
                    $p = get_page_by_path($path, OBJECT, ['page', 'post']);
                    if ($p) $id = $p->ID;
                }
            }
            if (!$id) return ['found' => false];
            return ['found' => true, 'post_id' => $id, 'type' => get_post_type($id),
                'status' => get_post_status($id), 'title' => get_the_title($id), 'link' => get_permalink($id),
                'has_schema' => (bool) get_post_meta($id, GS_SEO_SCHEMA_META, true),
                'has_meta_description' => (bool) get_post_meta($id, GS_SEO_METADESC_META, true),
                'seo_key' => get_post_meta($id, GS_SEO_KEY_META, true)];
        }]);

    // GET lookup?key=
    register_rest_route(GS_SEO_NS, '/lookup', ['methods' => 'GET', 'permission_callback' => $auth,
        'callback' => function (WP_REST_Request $r) {
            $id = gs_seo_find_by_key($r->get_param('key'));
            if (!$id) return ['found' => false];
            return ['found' => true, 'post_id' => $id, 'status' => get_post_status($id),
                'modified' => gs_seo_modified($id), 'link' => get_permalink($id)];
        }]);

    // POST posts — создать (идемпотентно по key)
    register_rest_route(GS_SEO_NS, '/posts', ['methods' => 'POST', 'permission_callback' => $auth,
        'callback' => function (WP_REST_Request $r) {
            $b = $r->get_json_params();
            $key = $b['key'] ?? '';
            if (!$key) return new WP_Error('gs_key', 'нет key', ['status' => 400]);
            $existing = gs_seo_find_by_key($key);
            if ($existing) return ['post_id' => $existing, 'idempotent' => true, 'status' => get_post_status($existing)];
            $ptype = in_array(($b['post_type'] ?? 'post'), ['post', 'page'], true) ? $b['post_type'] : 'post';
            $id = wp_insert_post([
                'post_type' => $ptype,
                'post_title' => wp_strip_all_tags($b['title'] ?? ''),
                'post_content' => $b['content'] ?? '',
                'post_excerpt' => $b['excerpt'] ?? '',
                'post_name' => sanitize_title($b['slug'] ?? ''),
                'post_status' => in_array($b['status'] ?? 'draft', ['draft', 'publish']) ? $b['status'] : 'draft',
                'meta_input' => array_filter([
                    GS_SEO_KEY_META => $key,
                    GS_SEO_VER_META => $b['version_id'] ?? null,
                    GS_SEO_SCHEMA_META => isset($b['schema']) ? wp_json_encode($b['schema']) : null,
                    GS_SEO_METADESC_META => $b['meta_description'] ?? null,
                ]),
            ], true);
            if (is_wp_error($id)) return $id;
            if (!empty($b['featured_media'])) set_post_thumbnail($id, intval($b['featured_media']));
            gs_seo_log($id, $key, 'create');
            return ['post_id' => $id, 'idempotent' => false, 'type' => get_post_type($id),
                    'status' => get_post_status($id), 'link' => get_permalink($id)];
        }]);

    // PATCH posts/{id} — частичные операции с idempotency_key
    register_rest_route(GS_SEO_NS, '/posts/(?P<id>\d+)', ['methods' => 'PATCH', 'permission_callback' => $auth,
        'callback' => function (WP_REST_Request $r) {
            $id = intval($r['id']); $b = $r->get_json_params();
            if (get_post_status($id) === false) return new WP_Error('gs_404', 'нет поста', ['status' => 404]);
            // Пост могли править руками в админке: если он изменён позже, чем мы читали,
            // не перезаписываем, а отдаём конфликт человеку.
            if (!empty($b['if_unmodified_since'])) {
                $modified = get_post_modified_time('U', true, $id);
                $expected = strtotime($b['if_unmodified_since']);
                if ($expected && $modified > $expected) {
                    return new WP_Error('gs_conflict', 'пост изменён в админке после нашего чтения', [
                        'status' => 409,
                        'modified' => get_post_modified_time('c', true, $id),
                    ]);
                }
            }
            $up = ['ID' => $id];
            if (isset($b['replace_content'])) $up['post_content'] = $b['replace_content'];
            if (isset($b['title'])) $up['post_title'] = wp_strip_all_tags($b['title']);
            if (isset($b['status']) && in_array($b['status'], ['draft', 'publish'])) $up['post_status'] = $b['status'];
            if (isset($b['post_type']) && in_array($b['post_type'], ['post', 'page'], true)) $up['post_type'] = $b['post_type'];
            if (isset($b['slug']) && $b['slug'] !== '') $up['post_name'] = sanitize_title((string) $b['slug']);
            if (count($up) > 1) wp_update_post($up);
            if (isset($b['set_meta']) && is_array($b['set_meta'])) {
                foreach ($b['set_meta'] as $mk => $mv) update_post_meta($id, sanitize_key($mk), $mv);
            }
            if (!empty($b['featured_media'])) set_post_thumbnail($id, intval($b['featured_media']));
            if (isset($b['schema'])) update_post_meta($id, GS_SEO_SCHEMA_META, wp_json_encode($b['schema']));
            if (isset($b['meta_description'])) update_post_meta($id, GS_SEO_METADESC_META, $b['meta_description']);
            gs_seo_log($id, $b['idempotency_key'] ?? '', 'patch');
            return ['post_id' => $id, 'ok' => true, 'modified' => gs_seo_modified($id)];
        }]);

    // POST media — загрузка картинки в медиатеку. Файл приходит base64 в теле,
    // поэтому подпись HMAC покрывает и его: отдельного канала для файлов не заводим.
    register_rest_route(GS_SEO_NS, '/media', ['methods' => 'POST', 'permission_callback' => $auth,
        'callback' => function (WP_REST_Request $r) {
            $b = $r->get_json_params();
            $name = sanitize_file_name((string) ($b['filename'] ?? ''));
            $data = (string) ($b['data'] ?? '');
            $alt  = (string) ($b['alt'] ?? '');
            if ($name === '' || $data === '') return new WP_Error('gs_media', 'filename и data обязательны', ['status' => 400]);

            $bytes = base64_decode($data, true);
            if ($bytes === false) return new WP_Error('gs_media', 'data не является base64', ['status' => 400]);
            if (strlen($bytes) > 5 * 1024 * 1024) return new WP_Error('gs_media', 'файл больше 5 МБ', ['status' => 413]);

            // Разрешаем только картинки и только те типы, которые WordPress признаёт сам
            $ft = wp_check_filetype($name);
            if (empty($ft['type']) || strpos($ft['type'], 'image/') !== 0) {
                return new WP_Error('gs_media', 'разрешены только изображения; для webp может потребоваться разрешить тип в WordPress', ['status' => 400]);
            }

            $up = wp_upload_bits($name, null, $bytes);
            if (!empty($up['error'])) return new WP_Error('gs_media', $up['error'], ['status' => 500]);

            $att_id = wp_insert_attachment([
                'post_mime_type' => $ft['type'],
                'post_title'     => sanitize_text_field(pathinfo($name, PATHINFO_FILENAME)),
                'post_content'   => '',
                'post_status'    => 'inherit',
            ], $up['file']);
            if (is_wp_error($att_id)) return $att_id;

            require_once ABSPATH . 'wp-admin/includes/image.php';
            $meta = wp_generate_attachment_metadata($att_id, $up['file']);
            if (!is_wp_error($meta) && $meta) wp_update_attachment_metadata($att_id, $meta);
            if ($alt !== '') update_post_meta($att_id, '_wp_attachment_image_alt', $alt);

            return ['media_id' => $att_id, 'url' => wp_get_attachment_url($att_id), 'mime' => $ft['type']];
        }]);

    // POST redirects — 301 (to_url ограничен своим доменом: защита от угона трафика)
    register_rest_route(GS_SEO_NS, '/redirects', ['methods' => 'POST', 'permission_callback' => $auth,
        'callback' => function (WP_REST_Request $r) {
            $b = $r->get_json_params();
            $from = isset($b['from_path']) ? (string) $b['from_path'] : '';
            $to   = isset($b['to_url']) ? (string) $b['to_url'] : '';
            if ($from === '' || $to === '') return new WP_Error('gs_redirect', 'from_path/to_url обязательны', ['status' => 400]);
            // разрешаем только относительный путь или абсолютный URL на goandstudy.com
            $host = parse_url($to, PHP_URL_HOST);
            if ($host !== null && $host !== '' && strcasecmp($host, 'goandstudy.com') !== 0 && !preg_match('/\.goandstudy\.com$/i', $host)) {
                return new WP_Error('gs_redirect', 'to_url разрешён только в пределах goandstudy.com', ['status' => 400]);
            }
            $map = get_option('gs_seo_redirects', []);
            $map[$from] = $to;
            update_option('gs_seo_redirects', $map);
            return ['ok' => true, 'count' => count($map)];
        }]);

    // GET posts/{id}/rendered — HTML как видит бот (для post_publish_verify)
    register_rest_route(GS_SEO_NS, '/posts/(?P<id>\d+)/rendered', ['methods' => 'GET', 'permission_callback' => $auth,
        'callback' => function (WP_REST_Request $r) {
            $id = intval($r['id']);
            // Черновик анонимному запросу отдаёт 404 — проверять его «глазами бота»
            // бессмысленно. Пусть вызывающая сторона знает причину, а не гадает по коду.
            if (get_post_status($id) !== 'publish') {
                return ['url' => get_permalink($id), 'status' => 0, 'html' => '',
                        'reason' => 'post_not_public', 'post_status' => get_post_status($id)];
            }
            $url = get_permalink($id);
            $resp = wp_remote_get($url, ['timeout' => 20, 'headers' => ['User-Agent' => 'goandstudy-seo-bot']]);
            if (is_wp_error($resp)) return $resp;
            return ['url' => $url, 'status' => wp_remote_retrieve_response_code($resp), 'html' => wp_remote_retrieve_body($resp)];
        }]);

    // GET export?since= — посты с телом для инвентаря (пагинация page/per_page)
    register_rest_route(GS_SEO_NS, '/export', ['methods' => 'GET', 'permission_callback' => $auth,
        'callback' => function (WP_REST_Request $r) {
            $pt = (string) ($r->get_param('post_type') ?: 'post');
            if (!in_array($pt, ['post', 'page', 'any'], true)) $pt = 'post';
            $args = ['post_type' => $pt, 'post_status' => 'publish', 'posts_per_page' => intval($r->get_param('per_page') ?: 50),
                'paged' => intval($r->get_param('page') ?: 1), 'orderby' => 'modified', 'order' => 'DESC'];
            if ($r->get_param('since')) $args['date_query'] = [['column' => 'post_modified_gmt', 'after' => $r->get_param('since')]];
            $q = new WP_Query($args); $out = [];
            foreach ($q->posts as $p) $out[] = ['id' => $p->ID, 'type' => $p->post_type, 'link' => get_permalink($p->ID), 'title' => $p->post_title,
                'modified' => get_post_modified_time('c', true, $p->ID), 'content' => $p->post_content,
                'seo_key' => get_post_meta($p->ID, GS_SEO_KEY_META, true)];
            return ['page' => $args['paged'], 'total' => $q->found_posts, 'posts' => $out];
        }]);
});

/* ── 301-редиректы из опции ────────────────────────────────────────────────── */
add_action('template_redirect', function () {
    $map = get_option('gs_seo_redirects', []);
    if (!$map) return;
    $path = untrailingslashit(parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH));
    if (isset($map[$path])) { wp_redirect($map[$path], 301); exit; }
});

/* ── Техническая SEO-база: canonical / JSON-LD / description ──────────────────
 * У темы нет ни canonical, ни schema.org, ни SEO-плагина. Раньше мост проставлял
 * их только своим постам (по мете _gs_seo_key) — существующие 159 страниц
 * оставались голыми. Теперь canonical идёт на все индексируемые URL, а JSON-LD и
 * description — везде, где CRM положила соответствующую мету.
 *
 * Аварийный выключатель: define('GS_SEO_DISABLE_HEAD', true) в wp-config.php.
 */

/** Активен ли сторонний SEO-плагин — тогда canonical не наш, чтобы не задвоить. */
function gs_seo_other_seo_plugin() {
    return defined('WPSEO_VERSION') || defined('RANK_MATH_VERSION')
        || defined('AIOSEO_VERSION') || defined('SEOPRESS_VERSION') || class_exists('SEOPress');
}

function gs_seo_head_enabled() {
    if (defined('GS_SEO_DISABLE_HEAD') && GS_SEO_DISABLE_HEAD) return false;
    return !gs_seo_other_seo_plugin();
}

/** Канонический URL текущего запроса. Пустая строка — canonical не нужен. */
function gs_seo_canonical_url() {
    if (is_404() || is_search() || is_feed() || is_trackback() || is_preview()) return '';

    $url = '';
    if (is_front_page()) {
        $url = home_url('/');
    } elseif (is_singular()) {
        $id = get_queried_object_id();
        if (!$id) return '';
        if (post_password_required($id)) return '';
        $url = get_permalink($id);
        $page = intval(get_query_var('page'));          // многостраничный пост <!--nextpage-->
        if ($page > 1 && $url) $url = trailingslashit($url) . user_trailingslashit($page, 'single_paged');
    } elseif (is_home()) {
        $blog = intval(get_option('page_for_posts'));
        $url = $blog ? get_permalink($blog) : home_url('/');
    } elseif (is_category() || is_tag() || is_tax()) {
        $t = get_queried_object();
        if ($t && !is_wp_error($t) && isset($t->term_id)) {
            $l = get_term_link($t);
            if (!is_wp_error($l)) $url = $l;
        }
    } elseif (is_post_type_archive()) {
        $l = get_post_type_archive_link(get_query_var('post_type'));
        if ($l) $url = $l;
    } elseif (is_author()) {
        $url = get_author_posts_url(get_queried_object_id());
    } elseif (is_day() || is_month() || is_year()) {
        $y = get_query_var('year'); $m = get_query_var('monthnum'); $d = get_query_var('day');
        $url = is_day() ? get_day_link($y, $m, $d) : (is_month() ? get_month_link($y, $m) : get_year_link($y));
    }
    if (!$url) return '';

    // страница пагинации архива каноникализируется на саму себя, а не на первую
    $paged = intval(get_query_var('paged'));
    if ($paged > 1 && !is_singular()) {
        $pl = get_pagenum_link($paged);
        if ($pl) $url = strtok($pl, '?');               // без служебных query-параметров
    }
    return (string) apply_filters('gs_seo_canonical', $url);
}

/* Ядро само печатает rel=canonical на singular — снимаем, чтобы тег был ровно один. */
add_action('template_redirect', function () {
    if (gs_seo_head_enabled()) remove_action('wp_head', 'rel_canonical');
}, 20);

add_action('wp_head', function () {
    if (!gs_seo_head_enabled()) return;

    $canonical = gs_seo_canonical_url();
    if ($canonical) echo "\n<link rel=\"canonical\" href=\"" . esc_url($canonical) . "\" />\n";

    if (!is_singular()) return;
    $id = get_queried_object_id();
    if (!$id) return;

    $desc = get_post_meta($id, GS_SEO_METADESC_META, true);
    if ($desc) echo '<meta name="description" content="' . esc_attr($desc) . "\" />\n";

    // Open Graph (§2.10). Тема их не печатает; ставим только то, что реально знаем.
    $og_url = get_permalink($id);
    $og = [
        'og:type'        => 'article',
        'og:title'       => get_post_meta($id, GS_SEO_OG_PREFIX . 'title', true) ?: get_the_title($id),
        'og:description' => get_post_meta($id, GS_SEO_OG_PREFIX . 'description', true) ?: $desc,
        'og:url'         => get_post_meta($id, GS_SEO_OG_PREFIX . 'url', true) ?: $og_url,
    ];
    $og_image = get_post_meta($id, GS_SEO_OG_PREFIX . 'image', true);
    if (!$og_image && has_post_thumbnail($id)) $og_image = get_the_post_thumbnail_url($id, 'full');
    if ($og_image) $og['og:image'] = $og_image;
    foreach ($og as $prop => $val) {
        if ($val) echo '<meta property="' . esc_attr($prop) . '" content="' . esc_attr($val) . "\" />\n";
    }

    $schema = get_post_meta($id, GS_SEO_SCHEMA_META, true);
    if ($schema) {
        $decoded = json_decode($schema, true);          // печатаем только валидный JSON
        if (is_array($decoded)) {
            echo '<script type="application/ld+json">'
                . wp_json_encode($decoded, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE)
                . "</script>\n";
        }
    }
}, 5);
