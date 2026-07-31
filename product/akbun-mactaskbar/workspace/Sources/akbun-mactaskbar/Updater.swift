import AppKit
import MacTaskbarCore

/// Checks GitHub Releases for a newer build and, on confirmation, downloads the
/// dmg and swaps the .app bundle in place. Releases of this repository are the
/// binary store and tags look like `akbun-mactaskbar-v{version}`.
///
/// Builds are unsigned, so no framework auto-updater applies. Swapping the
/// bundle by hand works because a file the app downloaded itself never gets the
/// quarantine attribute, so Gatekeeper does not inspect the replacement.
///
/// Disk leaks are the risk worth guarding: the dmg is large and lands in a temp
/// directory. Cleanup has three points.
/// 1. `downloadDmg` removes the directory it made when the download fails.
/// 2. The swap script traps EXIT, so a failure at any later step still unmounts
///    and deletes.
/// 3. `cleanupTempDirs` sweeps what a kill left behind, at launch.
enum Updater {
  private static let releasesAPI = URL(string: "https://api.github.com/repos/choisungwook/portfolio/releases")!
  private static let tempPrefix = "akbun-mactaskbar-update-"

  /// Neither request can be left without a deadline. A stalled connection would
  /// hang the check with no way back, and hang the download with the install
  /// already marked in progress, leaving the menu item dead until a restart.
  /// The download deadline covers the streamed body, so it is set for a large
  /// dmg on a slow link rather than a fast one.
  private static let checkTimeout: TimeInterval = 15
  private static let downloadTimeout: TimeInterval = 10 * 60

  #if arch(arm64)
    static let arch = "arm64"
  #else
    static let arch = "x86_64"
  #endif

  struct Result: Sendable {
    let current: String
    let latest: String?
    let releaseURL: URL?
    let dmgURL: URL?
    var hasUpdate: Bool {
      guard let latest else { return false }
      return compareVersion(latest, current) > 0
    }
  }

  enum Failure: LocalizedError {
    case badStatus(Int)
    case noBundleInDmg

    var errorDescription: String? {
      switch self {
      case .badStatus(let code): "GitHub returned status \(code)"
      case .noBundleInDmg: "The dmg holds no app bundle"
      }
    }
  }

  // MARK: - Check

  static func check(currentVersion: String) async throws -> Result {
    var request = URLRequest(url: releasesAPI, timeoutInterval: checkTimeout)
    request.setValue("application/vnd.github+json", forHTTPHeaderField: "Accept")

    let (data, response) = try await URLSession.shared.data(for: request)
    let status = (response as? HTTPURLResponse)?.statusCode ?? 0
    guard status == 200 else { throw Failure.badStatus(status) }

    let releases = try JSONDecoder().decode([ReleaseJSON].self, from: data)
    guard let release = releases.first(where: { version(fromTag: $0.tag_name) != nil }),
      let latest = version(fromTag: release.tag_name)
    else {
      return Result(current: currentVersion, latest: nil, releaseURL: nil, dmgURL: nil)
    }

    let dmgName = pickDmg(assetNames: release.assets.map(\.name), arch: arch)
    return Result(
      current: currentVersion,
      latest: latest,
      releaseURL: URL(string: release.html_url),
      dmgURL: release.assets.first { $0.name == dmgName }.flatMap { URL(string: $0.browser_download_url) }
    )
  }

  private struct ReleaseJSON: Decodable {
    struct Asset: Decodable {
      let name: String
      let browser_download_url: String
    }
    let tag_name: String
    let html_url: String
    let assets: [Asset]
  }

  // MARK: - Install

  /// Downloads the dmg into a fresh temp directory and returns its path.
  static func downloadDmg(from url: URL) async throws -> URL {
    let directory = URL(fileURLWithPath: NSTemporaryDirectory())
      .appendingPathComponent(tempPrefix + UUID().uuidString)
    try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)

    do {
      let request = URLRequest(url: url, timeoutInterval: downloadTimeout)
      // `download` streams to disk, so a large dmg never sits in memory.
      let (temporary, response) = try await URLSession.shared.download(for: request)
      let status = (response as? HTTPURLResponse)?.statusCode ?? 0
      guard status == 200 else { throw Failure.badStatus(status) }

      let destination = directory.appendingPathComponent(url.lastPathComponent)
      try FileManager.default.moveItem(at: temporary, to: destination)
      return destination
    } catch {
      try? FileManager.default.removeItem(at: directory)
      throw error
    }
  }

  /// Starts the swap script detached. The caller must quit right after, because
  /// the script waits for this pid to disappear before touching the bundle.
  static func spawnSwap(appBundle: URL, dmg: URL) throws {
    let script = dmg.deletingLastPathComponent().appendingPathComponent("swap.sh")
    try swapScript.write(to: script, atomically: true, encoding: .utf8)
    try FileManager.default.setAttributes([.posixPermissions: 0o755], ofItemAtPath: script.path)

    let process = Foundation.Process()
    process.executableURL = URL(fileURLWithPath: "/bin/bash")
    process.arguments = [
      script.path, appBundle.path, dmg.path, String(ProcessInfo.processInfo.processIdentifier),
    ]
    try process.run()
  }

  /// The bundle is three levels up from the executable inside Contents/MacOS.
  static func appBundleURL() -> URL {
    Bundle.main.bundleURL
  }

  /// Removes temp directories left by an attempt killed before its own cleanup
  /// ran. Called at launch so dmgs do not pile up.
  static func cleanupTempDirs() {
    let manager = FileManager.default
    let temp = URL(fileURLWithPath: NSTemporaryDirectory())
    let names = (try? manager.contentsOfDirectory(atPath: temp.path)) ?? []
    for name in names where name.hasPrefix(tempPrefix) {
      try? manager.removeItem(at: temp.appendingPathComponent(name))
    }
  }

  /// Waits for the app to quit, replaces the bundle and relaunches it. A running
  /// app cannot overwrite itself, so this has to run outside the app. A failed
  /// copy puts the previous bundle back.
  private static let swapScript = """
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
