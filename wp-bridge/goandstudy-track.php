<?php
/**
 * Счётчик переходов goandstudy.
 *
 * Зачем. Заявку CRM видит — она приходит через форму. Переход не видит никак:
 * человек открыл статью, почитал и ушёл, и в базе от этого не остаётся ничего.
 * Без этого фрагмента считается только вторая половина пути, и вопрос «окупается
 * ли блог» остаётся без ответа.
 *
 * Почему mu-plugin, а не правка темы. Агент публикации пересеивает тему при
 * каждой новой статье — меняет сид-флаг в functions.php и заставляет WordPress
 * перечитать файлы. Фрагмент внутри темы рано или поздно уехал бы вместе с
 * пересевом, причём молча. Mu-plugin живёт отдельно и переживает и пересев,
 * и смену темы.
 *
 * Что собирается: адрес страницы, откуда пришли, метки кампании из адреса.
 * Что НЕ собирается: ничего, что опознаёт человека. Ни адреса, ни телефона,
 * ни отпечатка браузера. Анонимный идентификатор ставит сама CRM своей кукой,
 * и он нужен ровно для одного — связать несколько просмотров в одну цепочку.
 *
 * Установка:
 *   /var/www/html/wordpress/wp-content/mu-plugins/goandstudy-track.php
 * Проверка: открыть любую статью и посмотреть в CRM «Цифровой след → Конвейер».
 *
 * @package Goandstudy
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

const GOANDSTUDY_TRACK_ENDPOINT = 'https://crm.goandstudy.com/api/track';

/**
 * Считать ли этот просмотр.
 *
 * Не считаем: админку, предпросмотр, подачу форм и своих сотрудников.
 * Свои заходят на статьи чаще читателей, и без этой отсечки отчёт покажет
 * не интерес аудитории, а нашу собственную работу.
 *
 * @return bool
 */
function goandstudy_track_should_count(): bool {
	if ( is_admin() || is_preview() || is_feed() || is_robots() ) {
		return false;
	}
	if ( is_user_logged_in() ) {
		return false;
	}
	if ( defined( 'DOING_AJAX' ) && DOING_AJAX ) {
		return false;
	}
	return true;
}

/**
 * Вставить счётчик в подвал страницы.
 *
 * Отправка идёт через sendBeacon: браузер досылает её, даже если человек уже
 * закрыл вкладку, и не задерживает отрисовку. Тип text/plain выбран намеренно —
 * с ним запрос считается простым и не требует предварительного OPTIONS, который
 * sendBeacon сделать не умеет. На стороне CRM тело всё равно разбирается как
 * JSON, тип там не проверяется.
 */
function goandstudy_track_footer(): void {
	if ( ! goandstudy_track_should_count() ) {
		return;
	}
	$endpoint = esc_js( GOANDSTUDY_TRACK_ENDPOINT );
	?>
<script>
(function () {
  try {
    // Уважаем «не отслеживать»: человек попросил — не считаем.
    if (navigator.doNotTrack === '1' || window.doNotTrack === '1') return;

    // Один просмотр — одна отправка. Защита от повторного вызова, если фрагмент
    // случайно окажется на странице дважды.
    if (window.__gsTracked) return;
    window.__gsTracked = true;

    var KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'];
    var sp = new URLSearchParams(window.location.search);
    var utm = {};
    for (var i = 0; i < KEYS.length; i++) {
      var v = sp.get(KEYS[i]);
      if (v) utm[KEYS[i]] = v.slice(0, 200);
    }

    // Сессия — на время вкладки. Нужна, чтобы отличить два визита одного
    // человека от одного визита с двумя страницами.
    var sid;
    try {
      sid = sessionStorage.getItem('gs_sid');
      if (!sid) {
        sid = (Math.random().toString(36) + Math.random().toString(36)).replace(/[^a-z0-9]/g, '').slice(0, 24);
        sessionStorage.setItem('gs_sid', sid);
      }
    } catch (e) { sid = null; }

    var payload = JSON.stringify({
      event: 'pageview',
      platform: 'wordpress',
      url: window.location.href,
      referrer: document.referrer || null,
      session_id: sid,
      utm: utm
    });

    var url = '<?php echo $endpoint; // phpcs:ignore WordPress.Security.EscapeOutput ?>';

    // sendBeacon доносит отправку даже при уходе со страницы. Если его нет —
    // обычный запрос с keepalive. Счётчик, который мешает читать статью, хуже
    // отсутствующего, поэтому обе ветки молчат при любой ошибке.
    if (navigator.sendBeacon) {
      navigator.sendBeacon(url, new Blob([payload], { type: 'text/plain;charset=UTF-8' }));
    } else if (window.fetch) {
      fetch(url, {
        method: 'POST',
        body: payload,
        keepalive: true,
        credentials: 'include',
        headers: { 'Content-Type': 'text/plain;charset=UTF-8' }
      }).catch(function () {});
    }
  } catch (e) { /* счётчик не должен ломать страницу */ }
})();
</script>
	<?php
}
add_action( 'wp_footer', 'goandstudy_track_footer', 99 );
