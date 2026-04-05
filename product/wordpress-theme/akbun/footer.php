    <footer class="site-footer">
        <div class="footer-inner">
            &copy; <?php echo esc_html( date( 'Y' ) ); ?>
            <a href="<?php echo esc_url( home_url( '/' ) ); ?>"><?php bloginfo( 'name' ); ?></a>
            &middot; Powered by <a href="https://wordpress.org" target="_blank" rel="noopener">WordPress</a>
        </div>
    </footer>

    <?php wp_footer(); ?>
</body>
</html>
