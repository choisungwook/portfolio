<?php
if ( post_password_required() ) {
    return;
}
?>

<section class="comments-section" id="comments">
    <?php if ( have_comments() ) : ?>
        <h2 class="comments-title">
            <?php
            printf(
                esc_html( _n( 'Comment (%d)', 'Comments (%d)', get_comments_number(), 'akbun' ) ),
                (int) get_comments_number()
            );
            ?>
        </h2>

        <ol class="comment-list">
            <?php
            wp_list_comments( array(
                'style'       => 'ol',
                'short_ping'  => true,
                'avatar_size' => 0,
            ) );
            ?>
        </ol>

        <?php the_comments_navigation(); ?>
    <?php endif; ?>

    <?php
    comment_form( array(
        'title_reply'        => __( 'Leave a Comment', 'akbun' ),
        'title_reply_to'     => __( 'Reply to %s', 'akbun' ),
        'cancel_reply_link'  => __( 'Cancel', 'akbun' ),
        'label_submit'       => __( 'Submit', 'akbun' ),
    ) );
    ?>
</section>
