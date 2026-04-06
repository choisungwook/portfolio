<?php get_header(); ?>

<main class="main-layout main-layout--single" role="main">
    <div class="content">
        <div class="page-home-link">
            <a href="<?php echo esc_url( home_url( '/' ) ); ?>">&larr; <?php esc_html_e( 'Home', 'akbun' ); ?></a>
        </div>

        <?php while ( have_posts() ) : the_post(); ?>
            <article <?php post_class( 'post-full' ); ?>>
                <header class="post-header">
                    <?php
                    $categories = get_the_category();
                    if ( $categories ) :
                    ?>
                        <a class="post-category-link" href="<?php echo esc_url( get_category_link( $categories[0]->term_id ) ); ?>">
                            <?php echo esc_html( $categories[0]->name ); ?>
                        </a>
                    <?php endif; ?>

                    <h1 class="post-title"><?php the_title(); ?></h1>

                    <div class="post-meta">
                        <time datetime="<?php echo esc_attr( get_the_date( 'c' ) ); ?>">
                            <?php echo esc_html( get_the_date() ); ?>
                        </time>
                    </div>
                </header>

                <?php akbun_render_ad( 'akbun_adsense_post_top_slot', 'adsense-post-top' ); ?>

                <div class="post-body">
                    <?php the_content(); ?>
                </div>

                <?php akbun_render_ad( 'akbun_adsense_post_bottom_slot', 'adsense-post-bottom' ); ?>

                <?php
                $tags = get_the_tags();
                if ( $tags ) :
                ?>
                <div class="post-tags">
                    <span class="post-tags-label"><?php esc_html_e( 'Tags', 'akbun' ); ?></span>
                    <?php foreach ( $tags as $tag ) : ?>
                        <a href="<?php echo esc_url( get_tag_link( $tag->term_id ) ); ?>"><?php echo esc_html( $tag->name ); ?></a>
                    <?php endforeach; ?>
                </div>
                <?php endif; ?>

                <!-- Post Navigation -->
                <?php
                $prev = get_previous_post();
                $next = get_next_post();
                if ( $prev || $next ) :
                ?>
                <nav class="post-navigation">
                    <div class="nav-previous">
                        <?php if ( $prev ) : ?>
                            <span class="nav-label"><?php esc_html_e( 'Previous', 'akbun' ); ?></span>
                            <a href="<?php echo esc_url( get_permalink( $prev ) ); ?>"><?php echo esc_html( get_the_title( $prev ) ); ?></a>
                        <?php endif; ?>
                    </div>
                    <div class="nav-next">
                        <?php if ( $next ) : ?>
                            <span class="nav-label"><?php esc_html_e( 'Next', 'akbun' ); ?></span>
                            <a href="<?php echo esc_url( get_permalink( $next ) ); ?>"><?php echo esc_html( get_the_title( $next ) ); ?></a>
                        <?php endif; ?>
                    </div>
                </nav>
                <?php endif; ?>
            </article>

            <?php
            if ( comments_open() || get_comments_number() ) :
                comments_template();
            endif;
            ?>
        <?php endwhile; ?>
    </div>
</main>

<!-- Floating ToC -->
<nav class="floating-toc" aria-label="Table of Contents">
    <div class="floating-toc-header">TOC</div>
    <ul class="floating-toc-list"></ul>
</nav>

<?php get_footer(); ?>
