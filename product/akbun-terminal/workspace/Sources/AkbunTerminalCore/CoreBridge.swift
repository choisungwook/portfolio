import CAkbunTerminalCore
import Foundation

/// The only place in the app that touches the C surface.
///
/// Every string the core hands over is freed here, which keeps the whole
/// ownership rule in one file instead of repeated at each call site. Nothing
/// above this type ever sees a pointer.
public final class CoreBridge {
  public enum Failure: LocalizedError {
    case cannotStart
    case protocolMismatch(core: UInt32, shell: UInt32)
    case core(String)
    case unexpected(CoreResponse)

    public var errorDescription: String? {
      switch self {
      case .cannotStart:
        "The core did not start"
      case .protocolMismatch(let core, let shell):
        "The core speaks protocol \(core) and this build speaks \(shell)"
      case .core(let message):
        message
      case .unexpected(let response):
        "Unexpected reply from the core: \(response)"
      }
    }
  }

  /// The header declares AkbunCore as an incomplete type, so it arrives in Swift
  /// as an opaque pointer and cannot be dereferenced by accident.
  private let handle: OpaquePointer
  private let encoder = JSONEncoder()
  private let decoder = JSONDecoder()

  public init() throws {
    guard let handle = akbun_core_new() else { throw Failure.cannotStart }
    self.handle = handle
  }

  deinit {
    akbun_core_free(handle)
  }

  /// Runs the handshake. Called before anything else so a version mismatch shows
  /// up at launch instead of as a terminal that quietly does nothing.
  public func handshake() throws {
    let response = try send(.hello)
    guard case .hello(let version) = response else { throw Failure.unexpected(response) }
    guard version == CoreProtocol.version else {
      throw Failure.protocolMismatch(core: version, shell: CoreProtocol.version)
    }
  }

  @discardableResult
  public func send(_ command: CoreCommand) throws -> CoreResponse {
    let json = String(decoding: try encoder.encode(CoreRequest(command)), as: UTF8.self)
    let reply: String = try json.withCString { request in
      guard let raw = akbun_core_dispatch(handle, request) else {
        throw Failure.core("the core returned no reply")
      }
      defer { akbun_core_string_free(raw) }
      return String(cString: raw)
    }
    return try decoder.decode(CoreResponse.self, from: Data(reply.utf8))
  }

  /// `send` for commands whose only interesting outcome is failure.
  public func expectOk(_ command: CoreCommand) throws {
    let response = try send(command)
    switch response {
    case .ok: return
    case .error(let message): throw Failure.core(message)
    default: throw Failure.unexpected(response)
    }
  }

  public func spawn(cwd: String, cols: UInt16, rows: UInt16, workspace: UInt64?) throws -> UInt32 {
    let response = try send(.spawn(cwd: cwd, cols: cols, rows: rows, workspace: workspace))
    switch response {
    case .spawned(let session): return session
    case .error(let message): throw Failure.core(message)
    default: throw Failure.unexpected(response)
    }
  }

  public func state(_ command: CoreCommand) throws -> CoreTreeState {
    let response = try send(command)
    switch response {
    case .state(let state): return state
    case .error(let message): throw Failure.core(message)
    default: throw Failure.unexpected(response)
    }
  }

  public func entries(in directory: String) throws -> [CoreEntry] {
    let response = try send(.readDirectory(path: directory))
    switch response {
    case .entries(let entries): return entries
    case .error(let message): throw Failure.core(message)
    default: throw Failure.unexpected(response)
    }
  }

  /// What git makes of a folder. Never throws: a browser that cannot colour a
  /// row still has to draw it, so every failure reads as "nothing to colour".
  public func gitStatus(in directory: String) -> CoreGitStatus {
    guard case .git(let status) = try? send(.gitStatus(path: directory)) else {
      return .none
    }
    return status
  }

  public func text(ofFile path: String) throws -> String {
    let response = try send(.readFile(path: path))
    switch response {
    case .file(let text): return text
    case .error(let message): throw Failure.core(message)
    default: throw Failure.unexpected(response)
    }
  }

  public func markdown(_ source: String) throws -> [CoreBlock] {
    let response = try send(.renderMarkdown(text: source))
    switch response {
    case .markdown(let blocks): return blocks
    case .error(let message): throw Failure.core(message)
    default: throw Failure.unexpected(response)
    }
  }

  /// The file's text as coloured tokens. Never throws for a language nothing
  /// recognises: the core answers plain lines, because a file the highlighter
  /// does not know still has to be readable.
  public func highlight(path: String, text: String) throws -> CoreHighlighted {
    let response = try send(.highlight(path: path, text: text))
    switch response {
    case .highlighted(let highlighted): return highlighted
    case .error(let message): throw Failure.core(message)
    default: throw Failure.unexpected(response)
    }
  }

  public func themes() throws -> [CoreTheme] {
    let response = try send(.themes)
    switch response {
    case .themes(let themes): return themes
    case .error(let message): throw Failure.core(message)
    default: throw Failure.unexpected(response)
    }
  }

  /// Every menu command with the key it currently runs on.
  public func shortcuts() throws -> [CoreShortcut] {
    let response = try send(.shortcuts)
    switch response {
    case .shortcuts(let shortcuts): return shortcuts
    case .error(let message): throw Failure.core(message)
    default: throw Failure.unexpected(response)
    }
  }

  /// Puts a key on a command, or restores its default when `key` is empty. The
  /// core refuses a key another command already has, and that refusal is the
  /// message the settings window shows.
  public func setShortcut(command: String, key: String) throws {
    let response = try send(.setShortcut(command: command, key: key))
    switch response {
    case .state: return
    case .error(let message): throw Failure.core(message)
    default: throw Failure.unexpected(response)
    }
  }

  public func resetShortcuts() throws {
    let response = try send(.resetShortcuts)
    switch response {
    case .state: return
    case .error(let message): throw Failure.core(message)
    default: throw Failure.unexpected(response)
    }
  }

  /// The files under `root` that `query` means, best first. Never throws: a
  /// palette with nothing in it is the honest answer to a folder that cannot be
  /// walked, and an alert over a list somebody is typing into is not.
  public func findFiles(root: String, query: String, limit: Int? = nil) -> [CoreMatch] {
    guard case .matches(let matches) = try? send(.findFiles(root: root, query: query, limit: limit))
    else { return [] }
    return matches
  }

  /// The workspaces whose agent status moved since the last call. An empty
  /// answer is the normal one, so this is cheap to ask often.
  public func detect() throws -> [CoreWorkspaceState] {
    let response = try send(.detect)
    switch response {
    case .statuses(let statuses): return statuses
    case .error(let message): throw Failure.core(message)
    default: throw Failure.unexpected(response)
    }
  }

  /// The URL under a click, or nothing when the core will not open what is
  /// there. The rule is the core's, so a view swap does not take it along.
  public func url(inLine line: String, column: Int) -> String? {
    guard case .url(let url) = try? send(.urlAt(line: line, column: column)) else { return nil }
    return url
  }

  /// Everything the core has queued since the last call.
  ///
  /// Draining on demand is what keeps drawing on one thread: the core never calls
  /// back, so events surface wherever the caller chose to ask, which for the
  /// shell is the main run loop. The limit stops a noisy session from holding the
  /// loop for a whole frame.
  public func drainEvents(limit: Int = 512) -> [CoreEvent] {
    var events: [CoreEvent] = []
    while events.count < limit {
      guard let raw = akbun_core_poll_event(handle) else { break }
      defer { akbun_core_string_free(raw) }
      guard let event = try? decoder.decode(CoreEvent.self, from: Data(String(cString: raw).utf8))
      else { continue }
      events.append(event)
    }
    return events
  }
}
