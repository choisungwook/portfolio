import Foundation

/// Which shell sessions belong to which workspace, and which one is on screen.
///
/// Sessions themselves live in the core; this is the arrangement around them,
/// which is why it is a value type with no window in sight. Keeping it here
/// rather than inside the window controller is what lets the rule that decides
/// the next active tab after a close be tested without opening one.
public struct TerminalTabs: Equatable, Sendable {
  public struct Tab: Equatable, Sendable {
    public let session: UInt32
    public let title: String

    public init(session: UInt32, title: String) {
      self.session = session
      self.title = title
    }
  }

  private var byWorkspace: [UInt64: [Tab]] = [:]
  private var active: [UInt64: UInt32] = [:]

  public init() {}

  public func tabs(in workspace: UInt64) -> [Tab] {
    byWorkspace[workspace] ?? []
  }

  public func activeSession(in workspace: UInt64) -> UInt32? {
    active[workspace]
  }

  public func workspace(of session: UInt32) -> UInt64? {
    byWorkspace.first { $0.value.contains { $0.session == session } }?.key
  }

  /// Every open session, for the shutdown path.
  public var allSessions: [UInt32] {
    byWorkspace.values.flatMap { $0 }.map(\.session)
  }

  /// Adds a tab and makes it the active one, because a tab nobody asked to see
  /// is not what the button that created it meant.
  public mutating func add(session: UInt32, to workspace: UInt64) {
    let title = "Shell \(tabs(in: workspace).count + 1)"
    byWorkspace[workspace, default: []].append(Tab(session: session, title: title))
    active[workspace] = session
  }

  public mutating func select(session: UInt32, in workspace: UInt64) {
    guard tabs(in: workspace).contains(where: { $0.session == session }) else { return }
    active[workspace] = session
  }

  /// Removes a tab. Closing the one on screen shows whatever slides into its
  /// place, and the new last tab when it was the rightmost one, so the strip
  /// does not jump somewhere else while tabs are being closed in a row.
  public mutating func close(session: UInt32) {
    guard let workspace = workspace(of: session) else { return }
    var tabs = self.tabs(in: workspace)
    guard let index = tabs.firstIndex(where: { $0.session == session }) else { return }
    tabs.remove(at: index)
    byWorkspace[workspace] = tabs

    guard active[workspace] == session else { return }
    if tabs.isEmpty {
      active[workspace] = nil
    } else {
      active[workspace] = tabs[min(index, tabs.count - 1)].session
    }
  }
}
