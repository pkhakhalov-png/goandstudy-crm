<?php
/**
 * Plugin Name: Go&Study SEO Bridge
 * Description: Мост между CRM SEO-модулем и WordPress: lookup по мете, идемпотентная
 *              публикация/правки, редиректы, rendered-HTML, экспорт. Аутентификация —
 *              HMAC (WP_BRIDGE_SECRET) + окно времени. Ставится как mu-plugin.
 * Version: 0.1
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

/* ── Регистрация меты (видна в REST) ──────────────────────────────────────── */
add_action('init', function () {
    foreach ([GS_SEO_KEY_META, GS_SEO_VER_META, GS_SEO_SCHEMA_META, GS_SEO_METADESC_META] as $k) {
        register_post_meta('post', $k, ['show_in_rest' => true, 'single' => true, 'type' => 'string',
            'auth_callback' => function () { return current_user_can('edit_posts'); }]);
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

/* ── Лог операций ─────────────────────────────────────────────────────────── */
function gs_seo_log($post_id, $key, $action) {
    global $wpdb;
    $t = $wpdb->prefix . 'gs_seo_log';
    $wpdb->query($wpdb->prepare(
        "CREATE TABLE IF NOT EXISTS $t (id BIGINT AUTO_INCREMENT PRIMARY KEY, post_id BIGINT, ikey VARCHAR(191), action VARCHAR(64), created_at DATETIME)"
    ));
    $wpdb->insert($t, ['post_id' => $post_id, 'ikey' => $key, 'action' => $action, 'created_at' => current_time('mysql')]);
}

/* ── Идемпотентность: найти пост по ключу ─────────────────────────────────── */
function gs_seo_find_by_key($key) {
    $q = new WP_Query(['post_type' => 'post', 'post_status' => 'any', 'posts_per_page' => 1,
        'meta_key' => GS_SEO_KEY_META, 'meta_value' => $key, 'fields' => 'ids', 'no_found_rows' => true]);
    return $q->have_posts() ? $q->posts[0] : 0;
}

/* ── Роуты ────────────────────────────────────────────────────────────────── */
add_action('rest_api_init', function () {
    $auth = 'gs_seo_check_auth';

    // GET lookup?key=
    register_rest_route(GS_SEO_NS, '/lookup', ['methods' => 'GET', 'permission_callback' => $auth,
        'callback' => function (WP_REST_Request $r) {
            $id = gs_seo_find_by_key($r->get_param('key'));
            if (!$id) return ['found' => false];
            return ['found' => true, 'post_id' => $id, 'status' => get_post_status($id),
                'modified' => get_post_modified_time('c', true, $id), 'link' => get_permalink($id)];
        }]);

    // POST posts — создать (идемпотентно по key)
    register_rest_route(GS_SEO_NS, '/posts', ['methods' => 'POST', 'permission_callback' => $auth,
        'callback' => function (WP_REST_Request $r) {
            $b = $r->get_json_params();
            $key = $b['key'] ?? '';
            if (!$key) return new WP_Error('gs_key', 'нет key', ['status' => 400]);
            $existing = gs_seo_find_by_key($key);
            if ($existing) return ['post_id' => $existing, 'idempotent' => true, 'status' => get_post_status($existing)];
            $id = wp_insert_post([
                'post_type' => 'post',
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
            gs_seo_log($id, $key, 'create');
            return ['post_id' => $id, 'idempotent' => false, 'status' => get_post_status($id), 'link' => get_permalink($id)];
        }]);

    // PATCH posts/{id} — частичные операции с idempotency_key
    register_rest_route(GS_SEO_NS, '/posts/(?P<id>\d+)', ['methods' => 'PATCH', 'permission_callback' => $auth,
        'callback' => function (WP_REST_Request $r) {
            $id = intval($r['id']); $b = $r->get_json_params();
            if (get_post_status($id) === false) return new WP_Error('gs_404', 'нет поста', ['status' => 404]);
            $up = ['ID' => $id];
            if (isset($b['replace_content'])) $up['post_content'] = $b['replace_content'];
            if (isset($b['title'])) $up['post_title'] = wp_strip_all_tags($b['title']);
            if (isset($b['status']) && in_array($b['status'], ['draft', 'publish'])) $up['post_status'] = $b['status'];
            if (count($up) > 1) wp_update_post($up);
            if (isset($b['set_meta']) && is_array($b['set_meta'])) {
                foreach ($b['set_meta'] as $mk => $mv) update_post_meta($id, sanitize_key($mk), $mv);
            }
            if (isset($b['schema'])) update_post_meta($id, GS_SEO_SCHEMA_META, wp_json_encode($b['schema']));
            if (isset($b['meta_description'])) update_post_meta($id, GS_SEO_METADESC_META, $b['meta_description']);
            gs_seo_log($id, $b['idempotency_key'] ?? '', 'patch');
            return ['post_id' => $id, 'ok' => true, 'modified' => get_post_modified_time('c', true, $id)];
        }]);

    // POST redirects — 301
    register_rest_route(GS_SEO_NS, '/redirects', ['methods' => 'POST', 'permission_callback' => $auth,
        'callback' => function (WP_REST_Request $r) {
            $b = $r->get_json_params();
            $map = get_option('gs_seo_redirects', []);
            $map[$b['from_path']] = $b['to_url'];
            update_option('gs_seo_redirects', $map);
            return ['ok' => true, 'count' => count($map)];
        }]);

    // GET posts/{id}/rendered — HTML как видит бот (для post_publish_verify)
    register_rest_route(GS_SEO_NS, '/posts/(?P<id>\d+)/rendered', ['methods' => 'GET', 'permission_callback' => $auth,
        'callback' => function (WP_REST_Request $r) {
            $id = intval($r['id']);
            $url = get_permalink($id);
            $resp = wp_remote_get($url, ['timeout' => 20, 'headers' => ['User-Agent' => 'goandstudy-seo-bot']]);
            if (is_wp_error($resp)) return $resp;
            return ['url' => $url, 'status' => wp_remote_retrieve_response_code($resp), 'html' => wp_remote_retrieve_body($resp)];
        }]);

    // GET export?since= — посты с телом для инвентаря (пагинация page/per_page)
    register_rest_route(GS_SEO_NS, '/export', ['methods' => 'GET', 'permission_callback' => $auth,
        'callback' => function (WP_REST_Request $r) {
            $args = ['post_type' => 'post', 'post_status' => 'publish', 'posts_per_page' => intval($r->get_param('per_page') ?: 50),
                'paged' => intval($r->get_param('page') ?: 1), 'orderby' => 'modified', 'order' => 'DESC'];
            if ($r->get_param('since')) $args['date_query'] = [['column' => 'post_modified_gmt', 'after' => $r->get_param('since')]];
            $q = new WP_Query($args); $out = [];
            foreach ($q->posts as $p) $out[] = ['id' => $p->ID, 'link' => get_permalink($p->ID), 'title' => $p->post_title,
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

/* ── Вставка canonical/schema/meta description от Bridge (тема их не даёт) ──── */
add_action('wp_head', function () {
    if (!is_singular('post')) return;
    $id = get_queried_object_id();
    if (!get_post_meta($id, GS_SEO_KEY_META, true)) return;   // только наши посты
    echo "\n<link rel=\"canonical\" href=\"" . esc_url(get_permalink($id)) . "\" />\n";
    $desc = get_post_meta($id, GS_SEO_METADESC_META, true);
    if ($desc) echo '<meta name="description" content="' . esc_attr($desc) . "\" />\n";
    $schema = get_post_meta($id, GS_SEO_SCHEMA_META, true);
    if ($schema) echo '<script type="application/ld+json">' . $schema . "</script>\n";
}, 5);
