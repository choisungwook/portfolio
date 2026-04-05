<!DOCTYPE html>
<html <?php language_attributes(); ?>>
<head>
    <meta charset="<?php bloginfo( 'charset' ); ?>">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <?php wp_head(); ?>
</head>
<body <?php body_class(); ?>>
<?php wp_body_open(); ?>

<header class="site-header">
    <div class="header-inner">
        <div class="site-title">
            <a href="<?php echo esc_url( home_url( '/' ) ); ?>"><?php bloginfo( 'name' ); ?></a>
        </div>
        <?php if ( has_nav_menu( 'primary' ) ) : ?>
        <nav class="site-nav" aria-label="<?php esc_attr_e( 'Primary Menu', 'akbun' ); ?>">
            <?php
            wp_nav_menu( array(
                'theme_location' => 'primary',
                'container'      => '',
                'depth'          => 1,
                'fallback_cb'    => false,
            ) );
            ?>
        </nav>
        <?php endif; ?>
    </div>
</header>

<?php akbun_render_ad( 'akbun_adsense_header_slot', 'adsense-header' ); ?>
