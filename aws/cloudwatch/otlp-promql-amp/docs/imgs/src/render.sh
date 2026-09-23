#!/usr/bin/env bash
# src/*.svg를 2배 해상도 PNG로 imgs/에 만든다. 폰트는 macOS의 Apple SD Gothic Neo를 쓴다.
set -euo pipefail
cd "$(dirname "$0")"
chrome="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
for svg in *.svg; do
  name="${svg%.svg}"
  h="$(grep -o 'viewBox="0 0 680 [0-9]*"' "$svg" | grep -o '[0-9]*"$' | tr -d '"')"
  printf '<html><body style="margin:0;background:#fff"><div style="width:680px">%s</div></body></html>' \
    "$(sed 's|@import url(style.css);|'"$(tr -d '\n' < style.css)"'|' "$svg")" > "/tmp/$name.html"
  "$chrome" --headless=new --disable-gpu --hide-scrollbars --force-device-scale-factor=2 \
    --window-size=680,"$h" --screenshot="../$name.png" "file:///tmp/$name.html" 2>/dev/null
  echo "../$name.png"
done
