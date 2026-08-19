#!/bin/bash
# Builds the core, the executable, and assembles both into an .app and a dmg.
#
# SwiftPM produces a bare executable. A windowed app needs a bundle: the version
# in Info.plist is what the update check compares against, so a bare binary would
# have nothing to read.
set -euo pipefail

cd "$(dirname "$0")/.."

VERSION=$(tr -d '[:space:]' < VERSION)
ARCH=$(uname -m)
NAME="akbun-terminal"
BUILD="build"
APP="$BUILD/$NAME.app"
DMG="$BUILD/$NAME-$VERSION-$ARCH.dmg"

rm -rf "$BUILD"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"

./scripts/build-core.sh
swift build -c release --disable-sandbox
cp ".build/release/$NAME" "$APP/Contents/MacOS/$NAME"

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

# arm64 refuses to run an unsigned binary at all, so an ad-hoc signature is the
# floor even for an unsigned release. It is not a Developer ID, so Gatekeeper
# still quarantines the download.
codesign --force --deep --sign - "$APP"

hdiutil create -volname "$NAME" -srcfolder "$APP" -ov -format UDZO "$DMG" >/dev/null

echo "$APP"
echo "$DMG"
