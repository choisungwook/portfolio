<aside class="sidebar" role="complementary">
    <!-- Search -->
    <div class="sidebar-section search-bar">
        <form role="search" method="get" action="<?php echo esc_url( home_url( '/' ) ); ?>">
            <input type="search" class="search-input" placeholder="<?php esc_attr_e( 'Search...', 'akbun' ); ?>" value="<?php echo get_search_query(); ?>" name="s">
            <input type="submit" class="search-submit" value="<?php esc_attr_e( 'Search', 'akbun' ); ?>">
        </form>
    </div>

    <!-- Categories -->
    <div class="sidebar-section widget_categories">
        <h3 class="sidebar-title"><?php esc_html_e( 'Categories', 'akbun' ); ?></h3>
        <ul>
            <?php
            wp_list_categories( array(
                'title_li' => '',
                'show_count' => false,
            ) );
            ?>
        </ul>
    </div>

    <!-- Tags -->
    <?php
    $tags = get_tags( array( 'number' => 30, 'orderby' => 'count', 'order' => 'DESC' ) );
    if ( $tags ) :
    ?>
    <div class="sidebar-section">
        <h3 class="sidebar-title"><?php esc_html_e( 'Tags', 'akbun' ); ?></h3>
        <div class="tag-cloud">
            <?php foreach ( $tags as $tag ) : ?>
                <a href="<?php echo esc_url( get_tag_link( $tag->term_id ) ); ?>"><?php echo esc_html( $tag->name ); ?></a>
            <?php endforeach; ?>
        </div>
    </div>
    <?php endif; ?>

    <!-- AdSense sidebar -->
    <?php akbun_render_ad( 'akbun_adsense_sidebar_slot', 'adsense-sidebar' ); ?>

    <?php if ( is_active_sidebar( 'sidebar-1' ) ) : ?>
        <?php dynamic_sidebar( 'sidebar-1' ); ?>
    <?php endif; ?>
</aside>
