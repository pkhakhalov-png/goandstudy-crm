<?php
/**
 * Blog: индекс-рендерер, блок и seed-хелпер статей.
 *
 * Статьи блога /blog/{slug} — дочерние страницы к /blog/. Тело статьи лежит
 * Gutenberg-разметкой в inc/blog-articles/{slug}.html (портировано из Tilda),
 * сидится в post_content и рендерится стандартным шаблоном page.html.
 *
 * Индекс /blog/ — шаблон page-blog (блок goandstudy/blog), карточки статей
 * из реестра inc/blog-data.php.
 *
 * @package Goandstudy
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

require_once __DIR__ . '/blog-data.php';

/**
 * HTML-тело статьи по slug (Gutenberg-разметка) или '' если файла нет.
 *
 * @param string $slug Slug статьи (без префикса blog/).
 * @return string
 */
function goandstudy_blog_article_html( string $slug ): string {
	// Защита от path traversal: только [a-z0-9-_].
	if ( ! preg_match( '/^[a-z0-9_-]+$/', $slug ) ) {
		return '';
	}
	$file = __DIR__ . '/blog-articles/' . $slug . '.html';
	return is_readable( $file ) ? (string) file_get_contents( $file ) : '';
}

/**
 * Рендерер индекса блога (карточки статей).
 *
 * @return string
 */
function goandstudy_render_blog_index(): string {
	$articles = goandstudy_blog_registry();

	// Категории для фильтра — фиксированный порядок (гео → темы), только непустые.
	$all_cats  = array( 'США', 'Германия', 'Великобритания', 'Италия', 'Франция', 'Китай', 'ОАЭ', 'Стипендии', 'Экзамены', 'Визы', 'Языковые курсы', 'Поступление', 'Жизнь студента' );
	$used_cats = array_unique( array_filter( array_column( $articles, 'cat' ) ) );
	$cats      = array_values( array_intersect( $all_cats, $used_cats ) );
	foreach ( $used_cats as $c ) { // хвост: категории вне фиксированного порядка
		if ( ! in_array( $c, $cats, true ) ) {
			$cats[] = $c;
		}
	}
	$img_base = get_template_directory_uri() . '/assets/img/blog';

	ob_start();
	?>
<main class="blog-page">

	<div class="blog-crumbs-band">
		<div class="container">
			<nav class="breadcrumb reveal" aria-label="Хлебные крошки">
				<a href="/">Главная</a> <span>/</span> Блог
			</nav>
		</div>
	</div>

	<section class="blog-hero">
		<div class="container">
			<h1 class="blog-hero__title reveal" data-delay="1"><span class="blog-hero__l1">Новости и статьи про</span><br /><span class="blog-hero__l2">образование за рубежом</span></h1>
			<p class="blog-hero__lead reveal" data-delay="2">поступление, стипендии, визы, языковые курсы<br />и жизнь студентов за рубежом</p>
			<div class="blog-filter reveal" data-delay="3" role="tablist" aria-label="Категории статей">
				<button type="button" class="blog-filter__pill is-active" data-cat="*">Все</button>
				<?php foreach ( $cats as $c ) : ?>
					<button type="button" class="blog-filter__pill" data-cat="<?php echo esc_attr( $c ); ?>"><?php echo esc_html( $c ); ?></button>
				<?php endforeach; ?>
			</div>
		</div>
	</section>

	<section class="blog-list">
		<div class="container">
			<div class="blog-grid">
				<?php foreach ( $articles as $a ) : ?>
					<a class="blog-card" href="<?php echo esc_url( '/blog/' . $a['slug'] ); ?>" data-cat="<?php echo esc_attr( $a['cat'] ?? '' ); ?>">
						<div class="blog-card__img" style="background-image:url('<?php echo esc_url( $img_base . '/' . $a['slug'] . '.jpg' ); ?>')">
							<?php if ( ! empty( $a['cat'] ) ) : ?>
								<span class="blog-card__cat"><?php echo esc_html( $a['cat'] ); ?></span>
							<?php endif; ?>
						</div>
						<div class="blog-card__body">
							<div class="blog-card__date"><?php echo esc_html( goandstudy_blog_date_ru( $a['updated'] ?? '' ) ); ?></div>
							<h2 class="blog-card__title"><?php echo esc_html( $a['title'] ); ?></h2>
							<?php if ( ! empty( $a['excerpt'] ) ) : ?>
								<p class="blog-card__excerpt"><?php echo esc_html( $a['excerpt'] ); ?></p>
							<?php endif; ?>
						</div>
					</a>
				<?php endforeach; ?>
			</div>
			<div class="blog-more-wrap">
				<button type="button" class="blog-more">Загрузить еще</button>
			</div>
		</div>
	</section>

	<section class="final-cta" id="contacts">
		<div class="container">
			<div class="final-cta__bar reveal">
				<div class="final-cta__text">
					<h2 class="final-cta__title">Записывайтесь на консультацию</h2>
					<p class="final-cta__sub">и делайте первый шаг к своей мечте</p>
				</div>
				<a href="https://crm.goandstudy.com/book" target="_blank" rel="noopener noreferrer" class="final-cta__btn">Записаться на консультацию</a>
			</div>
		</div>
	</section>

</main>
	<?php
	return (string) ob_get_clean();
}

/**
 * Блок goandstudy/blog (индекс) — без wpautop.
 */
function goandstudy_register_blog_block(): void {
	register_block_type(
		'goandstudy/blog',
		array( 'render_callback' => 'goandstudy_render_blog_index' )
	);
}
add_action( 'init', 'goandstudy_register_blog_block' );

/**
 * Дата в человеческом виде: 2026-06-01 -> «1 июня 2026».
 *
 * date_i18n() не используем: он зависит от локали сайта, а нам нужен
 * стабильный русский родительный падеж независимо от настроек.
 *
 * @param string $iso Дата YYYY-MM-DD.
 * @return string Пустая строка, если дата не распознана.
 */
function goandstudy_blog_date_ru( string $iso ): string {
	if ( ! preg_match( '/^(\d{4})-(\d{2})-(\d{2})$/', $iso, $m ) ) {
		return '';
	}
	$months = array(
		1 => 'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
		'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря',
	);
	$mon = $months[ (int) $m[2] ] ?? '';
	return $mon ? ( (int) $m[3] ) . ' ' . $mon . ' ' . $m[1] : '';
}

/**
 * Запись реестра по slug.
 *
 * @param string $slug Slug статьи.
 * @return array<string, string>|null
 */
function goandstudy_blog_entry( string $slug ): ?array {
	foreach ( goandstudy_blog_registry() as $a ) {
		if ( $a['slug'] === $slug ) {
			return $a;
		}
	}
	return null;
}

/**
 * Slug текущей статьи, если мы на странице статьи блога.
 */
function goandstudy_current_article_slug(): string {
	$obj = get_queried_object();
	if ( ! $obj instanceof WP_Post || 'page-article' !== get_page_template_slug( $obj->ID ) ) {
		return '';
	}
	return $obj->post_name;
}

/**
 * Строка «Обновлено …» под заголовком статьи. Отдельный блок, а не вёрстка
 * в page-article.html: шаблон статический, а дата приходит из реестра.
 */
function goandstudy_render_article_meta(): string {
	$slug = goandstudy_current_article_slug();
	if ( '' === $slug ) {
		return '';
	}
	$a = goandstudy_blog_entry( $slug );
	if ( ! $a || empty( $a['updated'] ) ) {
		return '';
	}
	return sprintf(
		'<p class="blog-article__meta">Обновлено <time datetime="%s">%s</time></p>',
		esc_attr( $a['updated'] ),
		esc_html( goandstudy_blog_date_ru( $a['updated'] ) )
	);
}

function goandstudy_register_article_meta_block(): void {
	register_block_type(
		'goandstudy/article-meta',
		array( 'render_callback' => 'goandstudy_render_article_meta' )
	);
}
add_action( 'init', 'goandstudy_register_article_meta_block' );

/**
 * JSON-LD Article: машиночитаемые даты публикации и обновления.
 * Без него у Google нет ни одного сигнала о свежести материала.
 */
function goandstudy_article_schema(): void {
	$slug = goandstudy_current_article_slug();
	if ( '' === $slug ) {
		return;
	}
	$a = goandstudy_blog_entry( $slug );
	if ( ! $a ) {
		return;
	}
	$data = array(
		'@context'         => 'https://schema.org',
		'@type'            => 'Article',
		'headline'         => $a['title'],
		'description'      => $a['excerpt'] ?? '',
		'inLanguage'       => 'ru-RU',
		'mainEntityOfPage' => array(
			'@type' => 'WebPage',
			'@id'   => home_url( '/blog/' . $slug . '/' ),
		),
		'author'           => array( '@type' => 'Organization', 'name' => 'GoAndStudy' ),
		'publisher'        => array(
			'@type' => 'Organization',
			'name'  => 'GoAndStudy',
			'logo'  => array(
				'@type' => 'ImageObject',
				'url'   => get_theme_file_uri( 'assets/favicon/favicon-512.png' ),
			),
		),
	);
	if ( ! empty( $a['published'] ) ) {
		$data['datePublished'] = $a['published'];
	}
	if ( ! empty( $a['updated'] ) ) {
		$data['dateModified'] = $a['updated'];
	}
	echo '<script type="application/ld+json">'
		. wp_json_encode( $data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES )
		. '</script>' . "\n";

	goandstudy_faq_schema( $slug );
}
add_action( 'wp_head', 'goandstudy_article_schema', 2 );

/**
 * FAQPage для блока «Частые вопросы».
 *
 * Блок есть в большинстве статей, но в разметке его не было — поисковик и ИИ-ответы
 * разбирали вопросы как обычный текст. Размечаем только то, что реально видно
 * на странице: пары «H3 с вопросом → следующий абзац», иначе это выдуманная разметка.
 *
 * @param string $slug Слаг статьи.
 */
function goandstudy_faq_schema( string $slug ): void {
	$html = goandstudy_blog_article_html( $slug );
	if ( '' === $html ) {
		return;
	}

	// Заголовок блока вопросов. Ищем именно его начало, а не любое упоминание слова
	// «вопрос»: иначе цепляется первый раздел вроде «Почему GPA вызывает вопросы».
	// В живых статьях пишут «Частые вопросы» и «Часто задаваемые вопросы (FAQ)».
	// Требуем оба слова: «Частые» без «вопросов» ловит раздел «Частые ошибки»,
	// а одно «вопрос» — первый попавшийся заголовок вроде «Почему GPA вызывает вопросы».
	if ( ! preg_match( '/<h2[^>]*>\s*(?:Частые|Часто\s+задаваемые)[^<]*вопрос[^<]*<\/h2>(.*)$/isu', $html, $m ) ) {
		return;
	}
	$tail = $m[1];

	// Следующий H2 закрывает блок вопросов
	$next = preg_split( '/<h2[^>]*>/iu', $tail, 2 );
	$tail = $next[0];

	if ( ! preg_match_all( '/<h3[^>]*>(.*?)<\/h3>\s*(?:<!--[^>]*-->\s*)*<p>(.*?)<\/p>/isu', $tail, $pairs, PREG_SET_ORDER ) ) {
		return;
	}

	$items = array();
	foreach ( $pairs as $pair ) {
		$q = trim( wp_strip_all_tags( $pair[1] ) );
		$a = trim( wp_strip_all_tags( $pair[2] ) );
		if ( '' === $q || '' === $a ) {
			continue;
		}
		$items[] = array(
			'@type'          => 'Question',
			'name'           => $q,
			'acceptedAnswer' => array( '@type' => 'Answer', 'text' => $a ),
		);
	}
	if ( count( $items ) < 2 ) {
		return;
	}

	echo '<script type="application/ld+json">'
		. wp_json_encode(
			array(
				'@context'   => 'https://schema.org',
				'@type'      => 'FAQPage',
				'mainEntity' => $items,
			),
			JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES
		)
		. '</script>' . "\n";
}
