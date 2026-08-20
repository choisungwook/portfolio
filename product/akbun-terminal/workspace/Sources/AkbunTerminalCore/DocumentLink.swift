import Foundation

/// Where a link inside a rendered markdown document points.
///
/// The rule is here rather than in the view because it is the whole of what a
/// command click does: a file next to this one opens in a tab, an address with
/// a scheme goes to a browser, and anything else is left alone. A view cannot
/// be asked those questions in a test; this can.
public enum DocumentLink: Equatable, Sendable {
  /// A file on disk, as an absolute path. Any file with a suffix: the window
  /// opens whatever the browser opens, so a link to a source file next to the
  /// document is no longer a link to nowhere. A target with no suffix at all is
  /// left alone, because in a rendered page that is a heading slug far more
  /// often than it is a file.
  case document(path: String)
  /// Something a browser handles.
  case external(url: URL)

  /// What is rendered rather than shown as source. Every other file opens too
  /// now; these are the ones with a second way to look at them.
  public static let markdownExtensions = ["md", "markdown", "mdown", "mkd"]

  /// Whether a path is one of those. The suffix comparison is here rather than
  /// at each call site, because three views were about to lowercase a path
  /// extension in three slightly different ways.
  public static func isMarkdown(_ path: String) -> Bool {
    markdownExtensions.contains((path as NSString).pathExtension.lowercased())
  }

  /// What may leave the app. The same two schemes the terminal's URL rule
  /// allows, and for the same reason: a document someone else wrote should not
  /// be able to hand an arbitrary scheme to whatever registered for it.
  public static let openableSchemes = ["http", "https"]

  /// Resolves `target` as written in the document at `documentPath`.
  ///
  /// Relative targets are the common case in a repository, so they are resolved
  /// against the folder of the document that carries them rather than against
  /// the project root: that is what the link meant to whoever typed it.
  public static func resolve(_ target: String, from documentPath: String) -> DocumentLink? {
    let trimmed = target.trimmingCharacters(in: .whitespacesAndNewlines)
    // A bare fragment is a jump inside the page, and there is nothing to open.
    guard !trimmed.isEmpty, !trimmed.hasPrefix("#") else { return nil }

    var path = trimmed
    if let url = URL(string: trimmed), let scheme = url.scheme?.lowercased() {
      guard scheme == "file" else {
        return openableSchemes.contains(scheme) ? .external(url: url) : nil
      }
      path = url.path
    }
    // Everything after the file name is for whoever renders the page, not for
    // the file system.
    for separator in ["#", "?"] {
      if let cut = path.range(of: separator) {
        path = String(path[path.startIndex..<cut.lowerBound])
      }
    }
    path = path.removingPercentEncoding ?? path
    // A target with nothing but a folder in it is not a file, and neither is a
    // bare name with no suffix at all: a link like that is usually a heading
    // slug in a page this app does not render.
    guard !path.isEmpty, !path.hasSuffix("/"),
      !(path as NSString).pathExtension.isEmpty
    else { return nil }

    let folder = (documentPath as NSString).deletingLastPathComponent
    let absolute =
      (path as NSString).isAbsolutePath ? path : (folder as NSString).appendingPathComponent(path)
    return .document(path: (absolute as NSString).standardizingPath)
  }
}
