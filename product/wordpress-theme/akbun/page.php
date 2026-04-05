<?php get_header(); ?>

<main class="main-layout main-layout--single" role="main">
    <div class="content">
        <div class="page-home-link">
            <a href="<?php echo esc_url( home_url( '/' ) ); ?>">&larr; <?php esc_html_e( 'Home', 'akbun' ); ?></a>
        </div>

        <?php while ( have_posts() ) : the_post(); ?>
            <article <?php post_class( 'post-full' ); ?>>
                <header class="post-header">
                    <h1 class="post-title"><?php the_title(); ?></h1>
                </header>

                <div class="post-body">
                    <?php the_content(); ?>
                </div>
            </article>

            <?php
            if ( comments_open() || get_comments_number() ) :
                comments_template();
            endif;
            ?>
        <?php endwhile; ?>
    </div>
</main>

<?php get_footer(); ?>
