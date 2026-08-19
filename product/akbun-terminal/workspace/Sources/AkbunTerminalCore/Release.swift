import Foundation

/// Version arithmetic and asset naming for the self update, kept out of the
/// executable so it can be tested without an app bundle.
public enum Release {
  public static let tagPrefix = "akbun-terminal-v"

  /// Temp directory prefix for an update in progress. Shared by the download, the
  /// swap script and the launch sweep, so all three agree on what to clean up.
  public static let tempPrefix = "akbun-terminal-update-"

  /// Returns the version in a release tag, or nil for a tag of another product.
  /// This repository holds every product's releases, so filtering by prefix is
  /// the only way to find the right one.
  public static func version(fromTag tag: String) -> String? {
    guard tag.hasPrefix(tagPrefix) else { return nil }
    let version = String(tag.dropFirst(tagPrefix.count))
    return version.isEmpty ? nil : version
  }

  /// Compares dotted versions number by number. String comparison would call
  /// 0.10.0 older than 0.9.0 and stop offering updates at the tenth release.
  public static func compare(_ left: String, _ right: String) -> Int {
    let leftParts = left.split(separator: ".").map { Int($0) ?? 0 }
    let rightParts = right.split(separator: ".").map { Int($0) ?? 0 }
    for index in 0..<max(leftParts.count, rightParts.count) {
      let leftPart = index < leftParts.count ? leftParts[index] : 0
      let rightPart = index < rightParts.count ? rightParts[index] : 0
      if leftPart != rightPart { return leftPart < rightPart ? -1 : 1 }
    }
    return 0
  }

  /// Picks the dmg for this machine out of a release's assets. The bundle script
  /// puts the architecture in the name, so a future universal or intel build can
  /// land in the same release without confusing an installed copy.
  public static func pickDmg(assetNames: [String], arch: String) -> String? {
    assetNames.first { $0.hasSuffix(".dmg") && $0.contains(arch) }
      ?? assetNames.first { $0.hasSuffix(".dmg") }
  }
}
