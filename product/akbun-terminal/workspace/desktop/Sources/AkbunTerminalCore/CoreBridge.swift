import Foundation

/// The app's client of the core daemon, and the only place that talks to its
/// socket.
///
/// The daemon owns the shells, so closing the app does not end them by itself.
/// Every call stays synchronous (the shell calls it from the main thread and
/// expects an answer back), and what the daemon pushes between answers is
/// queued here until the caller asks for it with `drainEvents`.
public final class CoreBridge {
  public enum Failure: LocalizedError {
    case cannotStart
    case protocolMismatch(core: UInt32, shell: UInt32)
    case core(String)
    case unexpected(CoreResponse)
    case disconnected
    case timedOut

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
      case .disconnected:
        "The connection to the core was lost"
      case .timedOut:
        "The core did not answer in time"
      }
    }
  }

  /// Long enough for the slowest honest command (a project-wide text search, a
  /// git log of a big repository), short enough that a wedged daemon does not
  /// freeze the window forever.
  private static let replyTimeout: TimeInterval = 30

  private let socketPath: String
  private let daemon: String
  private let environment: [String: String]
  private var connection: CoreConnection
  /// The product version the daemon is expected to report. `nil` skips the
  /// comparison, which is what tests and an unbundled run (no version to read)
  /// want. Set before `handshake`.
  public var expectedVersion: String?
  /// Requests go one at a time: a reply carries no id, so it belongs to
  /// whichever request is outstanding.
  private let requestLock = NSLock()
  private let encoder = JSONEncoder()

  /// Connects to the daemon at the default socket, starting the bundled one when
  /// nothing answers.
  public convenience init() throws {
    try self.init(
      socketPath: CoreDaemon.defaultSocketPath(),
      daemon: CoreDaemon.defaultBinaryPath(),
      environment: [:]
    )
  }

  /// For tests, which bring their own daemon on a private socket. `environment`
  /// is added to what the daemon inherits, so a test can point it at a temp data
  /// directory without touching the test process's own environment.
  public init(socketPath: String, daemon: String, environment: [String: String] = [:]) throws {
    self.socketPath = socketPath
    self.daemon = daemon
    self.environment = environment
    self.connection = try CoreDaemon.connectStarting(
      socketPath: socketPath, daemon: daemon, environment: environment)
  }

  /// Closes the socket only. The daemon and its shells are meant to outlive this
  /// object; ending a shell is an explicit `close` command.
  deinit {
    connection.hangUp()
  }

  /// Runs the handshake. Called before anything else so a version mismatch shows
  /// up at launch instead of as a terminal that quietly does nothing.
  ///
  /// A daemon left running by the previous version of the app is the usual
  /// mismatch. It is asked to shut down and the bundled one takes its place, so
  /// an update is not stuck behind it.
  public func handshake() throws {
    requestLock.lock()
    defer { requestLock.unlock() }

    guard let first = try hello() else { return }
    // Best effort: a daemon too old to understand the command cannot be asked,
    // and the wait below then reports the original mismatch.
    _ = try? exchange(.shutdown)
    connection.hangUp()
    guard CoreDaemon.waitUntilGone(socketPath: socketPath) else { throw first.failure }
    connection = try CoreDaemon.connectStarting(
      socketPath: socketPath, daemon: daemon, environment: environment)
    if let still = try hello() {
      // The protocol check is what guards correctness, so a product version that
      // still differs after one relaunch is tolerated rather than fatal.
      if case .productVersion = still { return }
      throw still.failure
    }
  }

  /// `nil` when the daemon speaks this build's protocol and, if a version is
  /// expected, reports that version.
  private func hello() throws -> Mismatch? {
    let response = try exchange(.hello)
    switch response {
    case .hello(let version, let product):
      if version != CoreProtocol.version { return .protocolVersion(version) }
      // A daemon that reports no version is older than the field, not different.
      if let expected = expectedVersion, let product, product != expected {
        return .productVersion(core: product, shell: expected)
      }
      return nil
    case .error(let message):
      // A daemon on another protocol may refuse the envelope instead of
      // answering the handshake.
      return .refused(message)
    default:
      throw Failure.unexpected(response)
    }
  }

  private enum Mismatch {
    case protocolVersion(UInt32)
    case productVersion(core: String, shell: String)
    case refused(String)

    var failure: Failure {
      switch self {
      case .protocolVersion(let version):
        .protocolMismatch(core: version, shell: CoreProtocol.version)
      case .productVersion(let core, let shell):
        .core("The core is version \(core) and this app is version \(shell)")
      case .refused(let message):
        .core(message)
      }
    }
  }

  @discardableResult
  public func send(_ command: CoreCommand) throws -> CoreResponse {
    requestLock.lock()
    defer { requestLock.unlock() }
    return try exchange(command)
  }

  /// One request and its reply. The caller holds `requestLock`.
  private func exchange(_ command: CoreCommand) throws -> CoreResponse {
    var line = try encoder.encode(CoreRequest(command))
    line.append(0x0A)
    return try connection.request(line, timeout: Self.replyTimeout)
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
    // Owned, so a crashed or force-quit app leaves no shells behind.
    let response = try send(
      .spawn(cwd: cwd, cols: cols, rows: rows, workspace: workspace, owned: true))
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

  /// Recent history for the Git panel. Like status, absence is ordinary: an
  /// empty project or a machine without git still leaves the rest of the app
  /// usable.
  public func gitLog(in directory: String) -> CoreGitLog {
    guard case .gitLog(let log) = try? send(.gitLog(path: directory)) else {
      return .none
    }
    return log
  }

  /// What one commit did, or nothing when the core will not answer for that
  /// hash. Like the log, absence is ordinary rather than an error: a row can be
  /// clicked while the repository is being rewritten underneath it.
  public func gitShow(in directory: String, hash: String) -> CoreGitCommitDetail? {
    guard case .gitDetail(let detail) = try? send(.gitShow(path: directory, hash: hash)) else {
      return nil
    }
    return detail
  }

  /// What is waiting in the index, the working tree and the stash. Never
  /// throws; a folder outside a repository has nothing waiting.
  public func gitWorking(in directory: String) -> CoreGitWorking {
    guard case .gitWorking(let working) = try? send(.gitWorking(path: directory)) else {
      return .none
    }
    return working
  }

  public func text(ofFile path: String) throws -> String {
    let response = try send(.readFile(path: path))
    switch response {
    case .file(let text): return text
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

  /// The lines under `root` holding `query`. Never throws, for the same reason
  /// `findFiles` does not: this runs on every keystroke in a search field.
  public func searchText(root: String, query: String, limit: Int? = nil) -> [CoreHit] {
    guard case .hits(let hits) = try? send(.searchText(root: root, query: query, limit: limit))
    else { return [] }
    return hits
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

  /// Everything the core has pushed since the last call.
  ///
  /// Draining on demand is what keeps drawing on one thread: a background thread
  /// reads the socket, but events surface wherever the caller chose to ask, which
  /// for the shell is the main run loop. The limit stops a noisy session from
  /// holding the loop for a whole frame. Event types this build does not know,
  /// such as the daemon's `state` broadcast, never reach the queue.
  public func drainEvents(limit: Int = 512) -> [CoreEvent] {
    connection.takeEvents(limit: limit)
  }
}
