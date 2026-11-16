#!/bin/bash
# Builds the daemon and the executable, and assembles them into an .app and a
# dmg, plus a tarball of the command line tools.
#
# SwiftPM produces a bare executable. A windowed app needs a bundle: the version
# in Info.plist is what the update check compares against, so a bare binary would
# have nothing to read.
set -euo pipefail

cd "$(dirname "$0")/.."

VERSION=$(tr -d '[:space:]' < ../VERSION)
ARCH=$(uname -m)
NAME="akbun-terminal"
BUILD="build"
APP="$BUILD/$NAME.app"
DMG="$BUILD/$NAME-$VERSION-$ARCH.dmg"
CLI="$BUILD/$NAME-cli-$VERSION-$ARCH.tar.gz"
CORE="../target/release"

rm -rf "$BUILD"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"

./scripts/build-core.sh
swift build -c release --disable-sandbox

# arm64 refuses to run an unsigned binary at all, so an ad-hoc signature is the
# floor even for an unsigned release. It is not a Developer ID, so Gatekeeper
# still quarantines the download.
#
# The executable is signed here rather than inside the .app because codesign
# walks up to the enclosing bundle and signs that instead, which is the thing
# that cannot be signed. See the resource bundle note below.
codesign --force --sign - ".build/release/$NAME"
cp ".build/release/$NAME" "$APP/Contents/MacOS/$NAME"
# The daemon is signed and copied the same way, and sits beside the app
# executable because that is where the app looks for it. It is not the bundle's
# main executable, but it is still Mach-O code that arm64 will not run unsigned.
codesign --force --sign - "$CORE/akbun-terminal-core"
cp "$CORE/akbun-terminal-core" "$APP/Contents/MacOS/akbun-terminal-core"
# `Bundle.module` looks for a SwiftPM resource bundle at `Bundle.main.bundleURL`
# and nowhere else, which for an .app is the bundle root. The assembly has to
# preserve that layout, and it is also why the .app is never signed as a bundle:
# codesign rejects anything beside `Contents` in the root as unsealed content.
# Contents/Resources and a symlink back to it were both tried; the first loses
# the resources at runtime and the second is rejected the same way.
for resource_bundle in .build/release/*.bundle; do
  if [ -d "$resource_bundle" ]; then
    cp -R "$resource_bundle" "$APP/"
  fi
done

cat > "$APP/Contents/Info.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleName</key><string>$NAME</string>
  <key>CFBundleDisplayName</key><string>$NAME</string>
  <key>CFBundleIdentifier</key><string>io.akbun.terminal</string>
  <key>CFBundleExecutable</key><string>$NAME</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleShortVersionString</key><string>$VERSION</string>
  <key>CFBundleVersion</key><string>$VERSION</string>
  <key>LSMinimumSystemVersion</key><string>14.0</string>
  <key>NSHighResolutionCapable</key><true/>
</dict>
</plist>
PLIST

hdiutil create -volname "$NAME" -srcfolder "$APP" -ov -format UDZO "$DMG" >/dev/null

# The same binaries for people who use the daemon without the app. The tui is
# optional so the script keeps working until that crate exists.
CLI_FILES=(akbun-terminal-core)
if [ -f "$CORE/akbun-terminal-tui" ]; then
  codesign --force --sign - "$CORE/akbun-terminal-tui"
  CLI_FILES+=(akbun-terminal-tui)
fi
tar -czf "$CLI" -C "$CORE" "${CLI_FILES[@]}"

echo "$APP"
echo "$DMG"
echo "$CLI"
