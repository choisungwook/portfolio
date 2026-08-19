import Foundation

/// The script that replaces the installed bundle, kept here so the cleanup it
/// promises can be tested.
///
/// A running app cannot overwrite itself, so the swap has to happen outside the
/// process: the app writes this script, launches it detached and quits, and the
/// script waits for the pid to disappear before touching anything.
///
/// The dmg is large and lands in a temp directory, so a leak fills the disk
/// quietly. Cleanup has three points and `UpdateScriptTests` fails if any of
/// them disappears from the source.
/// 1. The downloader removes its directory when the download fails.
/// 2. This script traps EXIT, so a failure at any later step still unmounts and
///    deletes.
/// 3. A sweep at launch clears what a kill left behind.
public enum UpdateScript {
  public static let source = """
    #!/bin/bash
    set -u
    APP="$1"; DMG="$2"; PID="$3"
    WORK=$(dirname "$DMG")
    MOUNT=""

    cleanup() {
      if [ -n "$MOUNT" ]; then
        hdiutil detach "$MOUNT" -quiet 2>/dev/null || hdiutil detach "$MOUNT" -force -quiet 2>/dev/null
        rmdir "$MOUNT" 2>/dev/null
      fi
      # This script lives inside WORK too. It is already open, so removing it is safe.
      rm -rf "$WORK"
    }
    trap cleanup EXIT

    while kill -0 "$PID" 2>/dev/null; do sleep 0.3; done

    MOUNT=$(mktemp -d) || exit 1
    hdiutil attach "$DMG" -nobrowse -quiet -mountpoint "$MOUNT" || exit 1
    NEW=$(find "$MOUNT" -maxdepth 1 -name '*.app' | head -1)
    [ -n "$NEW" ] || exit 1

    rm -rf "$APP.old"
    mv "$APP" "$APP.old" || exit 1
    if ditto "$NEW" "$APP"; then
      rm -rf "$APP.old"
    else
      rm -rf "$APP"
      mv "$APP.old" "$APP"
      exit 1
    fi

    # The download carries no quarantine attribute, but clear whatever the dmg held.
    xattr -cr "$APP"
    open "$APP"

    """
}
