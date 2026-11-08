# Scrolling capture by row hashes over repeated region grabs

## Decision

Scrolling capture draws its own region selection, grabs that region with `screencapture -R` about five times a second while the user scrolls, and joins the frames in the core crate by comparing row hashes. Rows that stay put in both frames are treated as a sticky header or footer. The user scrolls; the app never scrolls for them.

## Reason

`screencapture -i` returns only an image, not the rectangle that was picked, and every frame after the first needs that rectangle, so the selection had to move into the app. A transparent overlay window covering the main display is the same pattern freeze screen already uses.

Comparing rows by hash is enough because a scroll moves whole device pixels and the same text renders to the same bytes, which the TextEdit trial confirmed: twelve frames scrolled by 50 to 160 points each lined up at exactly twice those amounts on a retina display. Image registration with tolerances would cost a dependency and still need the same handling for fixed bars. Two allowances keep it from being brittle: flat rows are ignored because they match at any shift, and 95% of the remaining rows are enough so a caret or a hover highlight does not drop the frame.

Fixed bars are the case that breaks a naive overlap search, since a sticky header sits at the same place in every frame. Taking rows equal at the same position as fixed and leaving them out of the search handles it with no setting.

Scrolling automatically would mean posting synthetic scroll events, which needs the Accessibility permission on top of Screen Recording and fights the user's own hand on the trackpad. Letting the user scroll keeps the permission list as it was and works in any app.

The stitched image is capped at 32768 pixels so a capture left running cannot grow memory without bound.
