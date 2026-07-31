import Foundation

/// Release arithmetic, kept away from URLSession so it can be tested directly.

public let releaseTagPrefix = "akbun-mactaskbar-v"

/// Compares two "0.2.0" strings. Positive when `a` is newer.
public func compareVersion(_ a: String, _ b: String) -> Int {
  let left = a.split(separator: ".").map { Int($0) ?? 0 }
  let right = b.split(separator: ".").map { Int($0) ?? 0 }
  for index in 0..<3 {
    let l = index < left.count ? left[index] : 0
    let r = index < right.count ? right[index] : 0
    if l != r { return l - r }
  }
  return 0
}

public func version(fromTag tag: String) -> String? {
  guard tag.hasPrefix(releaseTagPrefix) else { return nil }
  return String(tag.dropFirst(releaseTagPrefix.count))
}

/// The release carries one dmg per architecture, named with the architecture it
/// was built for. No match means no update is offered, which is the right
/// outcome: installing the wrong slice would leave an app that cannot launch.
public func pickDmg(assetNames: [String], arch: String) -> String? {
  assetNames.first { $0.hasSuffix(".dmg") && $0.contains("-\(arch)") }
}
