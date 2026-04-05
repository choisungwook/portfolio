<div class="post-row">
    <a class="post-row-link" href="<?php the_permalink(); ?>">
        <?php if ( is_sticky() ) : ?>
            <span class="notice-badge"><?php esc_html_e( 'Pinned', 'akbun' ); ?></span>
        <?php endif; ?>
        <span class="post-row-title"><?php the_title(); ?></span>
        <time class="post-row-date" datetime="<?php echo esc_attr( get_the_date( 'c' ) ); ?>">
            <?php echo esc_html( get_the_date( 'Y.m.d' ) ); ?>
        </time>
    </a>
</div>
