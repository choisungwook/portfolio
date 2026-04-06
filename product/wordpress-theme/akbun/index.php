<?php get_header(); ?>

<main class="main-layout" role="main">
    <?php get_sidebar(); ?>

    <div class="content">
        <?php if ( is_home() && ! is_paged() ) : ?>
        <div class="home-posts-intro">
            <h2 class="home-posts-title"><?php bloginfo( 'name' ); ?></h2>
            <?php
            $desc = get_theme_mod( 'akbun_blog_description', '' );
            if ( $desc ) :
            ?>
                <p class="home-posts-description"><?php echo esc_html( $desc ); ?></p>
            <?php endif; ?>
        </div>
        <?php endif; ?>

        <?php if ( have_posts() ) : ?>
            <?php while ( have_posts() ) : the_post(); ?>
                <?php get_template_part( 'template-parts/content', 'list' ); ?>
            <?php endwhile; ?>

            <?php the_posts_pagination( array(
                'mid_size'  => 2,
                'prev_text' => '&laquo;',
                'next_text' => '&raquo;',
            ) ); ?>
        <?php else : ?>
            <div class="list-empty">
                <p><?php esc_html_e( 'No posts found.', 'akbun' ); ?></p>
            </div>
        <?php endif; ?>
    </div>
</main>

<?php get_footer(); ?>
