<?php
/**
 * Akbun Theme Functions
 *
 * @package Akbun
 * @since 1.0.0
 */

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

define( 'AKBUN_VERSION', '1.0.0' );

/**
 * Theme setup
 */
function akbun_setup() {
    add_theme_support( 'title-tag' );
    add_theme_support( 'post-thumbnails' );
    add_theme_support( 'html5', array(
        'search-form',
        'comment-form',
        'comment-list',
        'gallery',
        'caption',
        'style',
        'script',
    ) );
    add_theme_support( 'automatic-feed-links' );
    add_theme_support( 'customize-selective-refresh-widgets' );
    add_theme_support( 'align-wide' );

    register_nav_menus( array(
        'primary' => __( 'Primary Menu', 'akbun' ),
    ) );
}
add_action( 'after_setup_theme', 'akbun_setup' );

/**
 * Register sidebar
 */
function akbun_widgets_init() {
    register_sidebar( array(
        'name'          => __( 'Sidebar', 'akbun' ),
        'id'            => 'sidebar-1',
        'before_widget' => '<div class="sidebar-section widget %2$s" id="%1$s">',
        'after_widget'  => '</div>',
        'before_title'  => '<h3 class="sidebar-title">',
        'after_title'   => '</h3>',
    ) );
}
add_action( 'widgets_init', 'akbun_widgets_init' );

/**
 * Enqueue styles and scripts — performance-optimized
 */
function akbun_scripts() {
    // Main stylesheet
    wp_enqueue_style(
        'akbun-style',
        get_stylesheet_uri(),
        array(),
        AKBUN_VERSION
    );

    // Noto Sans KR from Google Fonts (preconnect in header)
    wp_enqueue_style(
        'akbun-google-fonts',
        'https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;600;700;800&display=swap',
        array(),
        null
    );

    // Prism.js syntax highlighting — only on single posts
    if ( is_singular( 'post' ) ) {
        wp_enqueue_style(
            'akbun-prism',
            get_template_directory_uri() . '/assets/css/prism.css',
            array(),
            AKBUN_VERSION
        );
        wp_enqueue_script(
            'akbun-prism',
            get_template_directory_uri() . '/assets/js/prism.js',
            array(),
            AKBUN_VERSION,
            true
        );
        wp_enqueue_script(
            'akbun-toc',
            get_template_directory_uri() . '/assets/js/toc.js',
            array(),
            AKBUN_VERSION,
            true
        );
    }

    // Comment reply script
    if ( is_singular() && comments_open() && get_option( 'thread_comments' ) ) {
        wp_enqueue_script( 'comment-reply' );
    }
}
add_action( 'wp_enqueue_scripts', 'akbun_scripts' );

/**
 * Preconnect to Google Fonts for performance
 */
function akbun_resource_hints( $urls, $relation_type ) {
    if ( 'preconnect' === $relation_type ) {
        $urls[] = array(
            'href' => 'https://fonts.googleapis.com',
            'crossorigin' => 'anonymous',
        );
        $urls[] = array(
            'href' => 'https://fonts.gstatic.com',
            'crossorigin' => 'anonymous',
        );
    }
    return $urls;
}
add_filter( 'wp_resource_hints', 'akbun_resource_hints', 10, 2 );

/**
 * Customizer: AdSense settings
 */
function akbun_customize_register( $wp_customize ) {
    $wp_customize->add_section( 'akbun_adsense', array(
        'title'    => __( 'Google AdSense', 'akbun' ),
        'priority' => 120,
    ) );

    // AdSense client ID
    $wp_customize->add_setting( 'akbun_adsense_client', array(
        'default'           => '',
        'sanitize_callback' => 'sanitize_text_field',
    ) );
    $wp_customize->add_control( 'akbun_adsense_client', array(
        'label'       => __( 'AdSense Publisher ID', 'akbun' ),
        'description' => __( 'e.g. ca-pub-1234567890', 'akbun' ),
        'section'     => 'akbun_adsense',
        'type'        => 'text',
    ) );

    // Header ad slot
    $wp_customize->add_setting( 'akbun_adsense_header_slot', array(
        'default'           => '',
        'sanitize_callback' => 'sanitize_text_field',
    ) );
    $wp_customize->add_control( 'akbun_adsense_header_slot', array(
        'label'   => __( 'Header Ad Slot ID', 'akbun' ),
        'section' => 'akbun_adsense',
        'type'    => 'text',
    ) );

    // Post top ad slot
    $wp_customize->add_setting( 'akbun_adsense_post_top_slot', array(
        'default'           => '',
        'sanitize_callback' => 'sanitize_text_field',
    ) );
    $wp_customize->add_control( 'akbun_adsense_post_top_slot', array(
        'label'   => __( 'Post Top Ad Slot ID', 'akbun' ),
        'section' => 'akbun_adsense',
        'type'    => 'text',
    ) );

    // Post bottom ad slot
    $wp_customize->add_setting( 'akbun_adsense_post_bottom_slot', array(
        'default'           => '',
        'sanitize_callback' => 'sanitize_text_field',
    ) );
    $wp_customize->add_control( 'akbun_adsense_post_bottom_slot', array(
        'label'   => __( 'Post Bottom Ad Slot ID', 'akbun' ),
        'section' => 'akbun_adsense',
        'type'    => 'text',
    ) );

    // Sidebar ad slot
    $wp_customize->add_setting( 'akbun_adsense_sidebar_slot', array(
        'default'           => '',
        'sanitize_callback' => 'sanitize_text_field',
    ) );
    $wp_customize->add_control( 'akbun_adsense_sidebar_slot', array(
        'label'   => __( 'Sidebar Ad Slot ID', 'akbun' ),
        'section' => 'akbun_adsense',
        'type'    => 'text',
    ) );

    // In-article auto ads toggle
    $wp_customize->add_setting( 'akbun_adsense_auto_ads', array(
        'default'           => false,
        'sanitize_callback' => 'akbun_sanitize_checkbox',
    ) );
    $wp_customize->add_control( 'akbun_adsense_auto_ads', array(
        'label'   => __( 'Enable Auto Ads', 'akbun' ),
        'section' => 'akbun_adsense',
        'type'    => 'checkbox',
    ) );

    // Blog description
    $wp_customize->add_setting( 'akbun_blog_description', array(
        'default'           => '',
        'sanitize_callback' => 'sanitize_text_field',
    ) );
    $wp_customize->add_control( 'akbun_blog_description', array(
        'label'   => __( 'Blog Description (Homepage)', 'akbun' ),
        'section' => 'title_tagline',
        'type'    => 'text',
    ) );
}
add_action( 'customize_register', 'akbun_customize_register' );

function akbun_sanitize_checkbox( $checked ) {
    return ( ( isset( $checked ) && true === $checked ) ? true : false );
}

/**
 * Insert AdSense script in head (only if client ID is set)
 */
function akbun_adsense_head() {
    $client = get_theme_mod( 'akbun_adsense_client', '' );
    if ( empty( $client ) ) {
        return;
    }
    ?>
    <script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=<?php echo esc_attr( $client ); ?>" crossorigin="anonymous"></script>
    <?php
}
add_action( 'wp_head', 'akbun_adsense_head', 5 );

/**
 * Render an AdSense ad unit
 */
function akbun_render_ad( $slot_setting, $css_class = '' ) {
    $client = get_theme_mod( 'akbun_adsense_client', '' );
    $slot   = get_theme_mod( $slot_setting, '' );
    if ( empty( $client ) || empty( $slot ) ) {
        return;
    }
    ?>
    <div class="<?php echo esc_attr( $css_class ); ?>">
        <ins class="adsbygoogle"
             style="display:block"
             data-ad-client="<?php echo esc_attr( $client ); ?>"
             data-ad-slot="<?php echo esc_attr( $slot ); ?>"
             data-ad-format="auto"
             data-full-width-responsive="true"></ins>
        <script>(adsbygoogle = window.adsbygoogle || []).push({});</script>
    </div>
    <?php
}

/**
 * Performance: Remove unnecessary WordPress head items
 */
function akbun_cleanup_head() {
    remove_action( 'wp_head', 'wp_generator' );
    remove_action( 'wp_head', 'wlwmanifest_link' );
    remove_action( 'wp_head', 'rsd_link' );
    remove_action( 'wp_head', 'wp_shortlink_wp_head' );
    remove_action( 'wp_head', 'print_emoji_detection_script', 7 );
    remove_action( 'wp_print_styles', 'print_emoji_styles' );
}
add_action( 'init', 'akbun_cleanup_head' );

/**
 * Performance: Disable emojis
 */
function akbun_disable_emojis() {
    remove_action( 'wp_head', 'print_emoji_detection_script', 7 );
    remove_action( 'admin_print_scripts', 'print_emoji_detection_script' );
    remove_action( 'wp_print_styles', 'print_emoji_styles' );
    remove_action( 'admin_print_styles', 'print_emoji_styles' );
    remove_filter( 'the_content_feed', 'wp_staticize_emoji' );
    remove_filter( 'comment_text_rss', 'wp_staticize_emoji' );
    remove_filter( 'wp_mail', 'wp_staticize_emoji_for_email' );
}
add_action( 'init', 'akbun_disable_emojis' );

/**
 * Performance: Disable jQuery migrate (not needed)
 */
function akbun_dequeue_jquery_migrate( $scripts ) {
    if ( ! is_admin() && isset( $scripts->registered['jquery'] ) ) {
        $script = $scripts->registered['jquery'];
        if ( $script->deps ) {
            $script->deps = array_diff( $script->deps, array( 'jquery-migrate' ) );
        }
    }
}
add_action( 'wp_default_scripts', 'akbun_dequeue_jquery_migrate' );

/**
 * Custom excerpt length
 */
function akbun_excerpt_length( $length ) {
    return 30;
}
add_filter( 'excerpt_length', 'akbun_excerpt_length' );

/**
 * Custom excerpt more
 */
function akbun_excerpt_more( $more ) {
    return '&hellip;';
}
add_filter( 'excerpt_more', 'akbun_excerpt_more' );

/**
 * Posts per page for tag/category archives
 */
function akbun_archive_posts_per_page( $query ) {
    if ( ! is_admin() && $query->is_main_query() ) {
        if ( $query->is_category() || $query->is_tag() || $query->is_search() ) {
            $query->set( 'posts_per_page', 20 );
        }
    }
}
add_action( 'pre_get_posts', 'akbun_archive_posts_per_page' );

/**
 * Add security headers
 */
function akbun_security_headers() {
    if ( ! is_admin() ) {
        header( 'X-Content-Type-Options: nosniff' );
        header( 'X-Frame-Options: SAMEORIGIN' );
        header( 'Referrer-Policy: strict-origin-when-cross-origin' );
    }
}
add_action( 'send_headers', 'akbun_security_headers' );
