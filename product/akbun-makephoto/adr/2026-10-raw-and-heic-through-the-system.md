# RAW and HEIC decode through macOS's image engine

## Decision

JPEG, PNG, TIFF, WebP, BMP and GIF decode with the `image` crate. HEIC and camera RAW files are converted by `/usr/bin/sips` to a temporary TIFF, which is then decoded the same way and deleted.

## Reason

macOS already decodes RAW from almost every camera and is updated for new ones with the OS. A Rust RAW decoder covers fewer cameras, and each brand's compression is a project of its own. HEIC has no pure Rust decoder at all.

The cost is a process launch per decode, around half a second for a large file. Previews are cached and thumbnails are written to disk, so it is paid once per photo. It also ties RAW to macOS, which matches the platform this ships on.
