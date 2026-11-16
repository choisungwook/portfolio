import AkbunTerminalCore
import AppKit

/// Checks GitHub Releases for a newer build and, on confirmation, downloads the
/// dmg and swaps the .app bundle in place.
///
/// Builds are unsigned, so no framework updater applies: Squirrel refuses an
/// unsigned bundle. Swapping by hand works because a file the app downloaded
/// itself carries no quarantine attribute, so Gatekeeper does not inspect the
/// replacement.
///
/// The version arithmetic, the asset naming and the swap script live in
/// AkbunTerminalCore so they can be tested without an app bundle. What is left
/// here is the network and the process work.
enum Updater {
  /// Every product in this repository releases from here, so one page of the
  /// default 30 can be filled by other products and hide this one's newest tag,
  /// which would read as "no updates". 100 is the API maximum.
  private static let releasesAPI = URL(
    string: "https://api.github.com/repos/choisungwook/portfolio/releases?per_page=100")!

  /// Neither request can be left without a deadline. A stalled check would hang
  /// with no way back, and a stalled download would hang with the install already
  /// under way. The download deadline is set for a large dmg on a slow link.
  private static let checkTimeout: TimeInterval = 15
  private static let downloadTimeout: TimeInterval = 10 * 60

  #if arch(arm64)
    static let arch = "arm64"
  #else
    static let arch = "x86_64"
  #endif

  /// True only for a packaged build. Under `swift run` the bundle to replace
  /// would be the toolchain's, so those builds only get the release page.
  static var canInstallInPlace: Bool {
    Bundle.main.bundleURL.pathExtension == "app"
  }

  struct Result: Sendable {
    let current: String
    let latest: String?
    let releaseURL: URL?
    let dmgURL: URL?

    var hasUpdate: Bool {
      guard let latest else { return false }
      return Release.compare(latest, current) > 0
    }
  }

  enum Failure: LocalizedError {
    case badStatus(Int)

    var errorDescription: String? {
      switch self {
      case .badStatus(let code): "GitHub returned status \(code)"
      }
    }
  }

  static func check(currentVersion: String) async throws -> Result {
    var request = URLRequest(url: releasesAPI, timeoutInterval: checkTimeout)
    request.setValue("application/vnd.github+json", forHTTPHeaderField: "Accept")

    let (data, response) = try await URLSession.shared.data(for: request)
    let status = (response as? HTTPURLResponse)?.statusCode ?? 0
    guard status == 200 else { throw Failure.badStatus(status) }

    let releases = try JSONDecoder().decode([ReleaseJSON].self, from: data)
    // The repository holds every product's releases, so the first tag carrying
    // this product's prefix is the newest build of this product.
    guard let release = releases.first(where: { Release.version(fromTag: $0.tag_name) != nil }),
      let latest = Release.version(fromTag: release.tag_name)
    else {
      return Result(current: currentVersion, latest: nil, releaseURL: nil, dmgURL: nil)
    }

    let dmgName = Release.pickDmg(assetNames: release.assets.map(\.name), arch: arch)
    return Result(
      current: currentVersion,
      latest: latest,
      releaseURL: URL(string: release.html_url),
      dmgURL: release.assets.first { $0.name == dmgName }
        .flatMap { URL(string: $0.browser_download_url) }
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

  /// Downloads the dmg into a fresh temp directory and returns its path.
  /// Cleanup point one: a failed download takes its directory with it.
  static func downloadDmg(from url: URL) async throws -> URL {
    let directory = URL(fileURLWithPath: NSTemporaryDirectory())
      .appendingPathComponent(Release.tempPrefix + UUID().uuidString)
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

  /// Writes the swap script and starts it detached. The caller must quit right
  /// after, because the script waits for this pid to disappear.
  static func spawnSwap(appBundle: URL, dmg: URL) throws {
    let script = dmg.deletingLastPathComponent().appendingPathComponent("swap.sh")
    try UpdateScript.source.write(to: script, atomically: true, encoding: .utf8)
    try FileManager.default.setAttributes(
      [.posixPermissions: 0o755], ofItemAtPath: script.path)

    let process = Foundation.Process()
    process.executableURL = URL(fileURLWithPath: "/bin/bash")
    process.arguments = [
      script.path, appBundle.path, dmg.path,
      String(ProcessInfo.processInfo.processIdentifier),
    ]
    try process.run()
  }

  /// Cleanup point three: removes temp directories left by an attempt that was
  /// killed before its own cleanup ran. Called at launch so dmgs do not pile up.
  static func cleanupTempDirs() {
    let manager = FileManager.default
    let temp = URL(fileURLWithPath: NSTemporaryDirectory())
    let names = (try? manager.contentsOfDirectory(atPath: temp.path)) ?? []
    for name in names where name.hasPrefix(Release.tempPrefix) {
      try? manager.removeItem(at: temp.appendingPathComponent(name))
    }
  }
}
