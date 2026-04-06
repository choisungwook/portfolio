<?php get_header(); ?>

<main class="main-layout" role="main">
    <?php get_sidebar(); ?>

    <div class="content">
        <div class="list-header">
            <h1 class="list-title"><?php the_archive_title(); ?></h1>
            <span class="list-count"><?php
                global $wp_query;
                printf( esc_html__( '%d posts', 'akbun' ), (int) $wp_query->found_posts );
            ?></span>
        </div>

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
