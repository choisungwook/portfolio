import AppKit

/// The browsers installed on this machine.
///
/// Asking the system which applications can handle an https URL is what "the
/// installed browsers" means here; there is no list to keep and nothing to
/// configure. The answer only changes when an app is installed, so it is taken
/// once at launch rather than every time a menu opens.
struct Browsers {
  struct Browser {
    let name: String
    let url: URL
  }

  let all: [Browser]

  static let none = Browsers(all: [])

  /// Everything that offers to open a web page, in name order. The default
  /// browser is not singled out, because opening without naming an app is
  /// already the first item in the menu that uses this.
  static func installed() -> Browsers {
    guard let probe = URL(string: "https://example.com") else { return .none }
    let found = NSWorkspace.shared.urlsForApplications(toOpen: probe)
      .map { url in
        Browser(name: FileManager.default.displayName(atPath: url.path), url: url)
      }
      .sorted { $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending }
    return Browsers(all: found)
  }

  /// Hands the URL to a named browser, or to whatever the system would use when
  /// `browser` is nil. The caller has already had the core approve the URL.
  static func open(_ url: URL, in browser: Browser?) {
    guard let browser else {
      NSWorkspace.shared.open(url)
      return
    }
    NSWorkspace.shared.open(
      [url], withApplicationAt: browser.url, configuration: NSWorkspace.OpenConfiguration())
  }
}
