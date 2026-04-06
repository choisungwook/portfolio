<?php get_header(); ?>

<main class="main-layout main-layout--single" role="main">
    <div class="content">
        <div class="error-404">
            <h1>404</h1>
            <p><?php esc_html_e( 'The page you are looking for could not be found.', 'akbun' ); ?></p>
            <div class="page-home-link">
                <a href="<?php echo esc_url( home_url( '/' ) ); ?>">&larr; <?php esc_html_e( 'Back to Home', 'akbun' ); ?></a>
            </div>
        </div>
    </div>
</main>

<?php get_footer(); ?>
