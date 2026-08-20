import Foundation

/// What is open in each workspace, and which one is on screen.
///
/// A tab is either a shell or a markdown document. They share one strip because
/// a document was a second pane under the terminal before, which halved the only
/// area worth reading in and left both halves too short; a document that takes
/// the whole area when it is looked at and none of it when it is not is what the
/// window is actually for.
///
/// Sessions themselves live in the core; this is the arrangement around them,
/// which is why it is a value type with no window in sight. Keeping it here
/// rather than inside the window controller is what lets the rule that decides
/// the next active tab after a close be tested without opening one.
public struct TerminalTabs: Equatable, Sendable {
  /// What a tab holds. The session id and the document path are the identity of
  /// the tab, so nothing else has to be looked up to know what to draw.
  public enum Content: Hashable, Sendable {
    case shell(session: UInt32)
    case document(path: String)
  }

  public struct Tab: Equatable, Sendable {
    public let content: Content
    public let title: String

    public init(content: Content, title: String) {
      self.content = content
      self.title = title
    }

    public var session: UInt32? {
      guard case .shell(let session) = content else { return nil }
      return session
    }

    public var documentPath: String? {
      guard case .document(let path) = content else { return nil }
      return path
    }
  }

  private var byWorkspace: [UInt64: [Tab]] = [:]
  private var activeByWorkspace: [UInt64: Content] = [:]

  public init() {}

  public func tabs(in workspace: UInt64) -> [Tab] {
    byWorkspace[workspace] ?? []
  }

  public func active(in workspace: UInt64) -> Content? {
    activeByWorkspace[workspace]
  }

  public func activeSession(in workspace: UInt64) -> UInt32? {
    guard case .shell(let session) = activeByWorkspace[workspace] else { return nil }
    return session
  }

  /// A session is unique across the window, so it can be traced back to its
  /// workspace. A document cannot: two workspaces may hold the same path, and
  /// the first match would be the wrong tab as often as the right one. Anything
  /// that acts on a document is given the workspace it is looking at instead.
  public func workspace(of session: UInt32) -> UInt64? {
    byWorkspace.first { $0.value.contains { $0.session == session } }?.key
  }

  /// Every open session, for the shutdown path. Documents are not here because
  /// nothing has to be told they are closing.
  public var allSessions: [UInt32] {
    byWorkspace.values.flatMap { $0 }.compactMap(\.session)
  }

  /// Adds a tab and makes it the active one, because a tab nobody asked to see
  /// is not what the button that created it meant.
  public mutating func add(session: UInt32, to workspace: UInt64) {
    let shells = tabs(in: workspace).filter { $0.session != nil }.count
    append(Tab(content: .shell(session: session), title: "Shell \(shells + 1)"), to: workspace)
  }

  /// Opens a document, or moves to it when this workspace already has it open.
  /// A second tab on the same file would be two views of one buffer, and one of
  /// them would be showing text the other had already replaced.
  public mutating func add(document path: String, title: String, to workspace: UInt64) {
    let content = Content.document(path: path)
    guard !tabs(in: workspace).contains(where: { $0.content == content }) else {
      activeByWorkspace[workspace] = content
      return
    }
    append(Tab(content: content, title: title), to: workspace)
  }

  public mutating func select(_ content: Content, in workspace: UInt64) {
    guard tabs(in: workspace).contains(where: { $0.content == content }) else { return }
    activeByWorkspace[workspace] = content
  }

  /// Removes a tab. Closing the one on screen shows whatever slides into its
  /// place, and the new last tab when it was the rightmost one, so the strip
  /// does not jump somewhere else while tabs are being closed in a row.
  public mutating func close(_ content: Content, in workspace: UInt64) {
    var tabs = self.tabs(in: workspace)
    guard let index = tabs.firstIndex(where: { $0.content == content }) else { return }
    tabs.remove(at: index)
    byWorkspace[workspace] = tabs

    guard activeByWorkspace[workspace] == content else { return }
    if tabs.isEmpty {
      activeByWorkspace[workspace] = nil
    } else {
      activeByWorkspace[workspace] = tabs[min(index, tabs.count - 1)].content
    }
  }

  /// Forgets a whole workspace and answers with the sessions that were open in
  /// it, which the caller still has to end. Deleting a workspace is the one way
  /// tabs go without anyone closing them, and tabs left behind would be a strip
  /// of shells belonging to a row that is no longer in the tree.
  @discardableResult
  public mutating func removeWorkspace(_ workspace: UInt64) -> [UInt32] {
    let sessions = tabs(in: workspace).compactMap(\.session)
    byWorkspace.removeValue(forKey: workspace)
    activeByWorkspace.removeValue(forKey: workspace)
    return sessions
  }

  private mutating func append(_ tab: Tab, to workspace: UInt64) {
    byWorkspace[workspace, default: []].append(tab)
    activeByWorkspace[workspace] = tab.content
  }
}
