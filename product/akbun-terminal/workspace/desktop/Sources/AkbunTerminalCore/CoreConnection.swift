import Foundation

/// One connection to the core daemon: a Unix socket, a reader thread, and the
/// two queues that thread fills.
///
/// The wire is one JSON document per line. `{"reply":…}` answers the request in
/// flight and `{"event":…}` is pushed whenever the daemon likes, so the reader
/// thread is the only place that can tell them apart. Replies carry no id; the
/// bridge sends one request at a time and the next reply is therefore its own.
///
/// The reader thread holds a strong reference to this object, which is what
/// keeps the descriptor valid until the thread has stopped reading: the
/// descriptor is closed in `deinit`, never while a read may still be using it.
final class CoreConnection: @unchecked Sendable {
  private let fd: Int32
  /// Guards everything below and wakes a waiting `request`.
  private let condition = NSCondition()
  private var replies: [CoreResponse] = []
  private var events: [CoreEvent] = []
  private var closed = false

  /// Takes ownership of a connected descriptor and starts reading it.
  init(fd: Int32) {
    self.fd = fd
    Thread.detachNewThread { [self] in readLoop() }
  }

  deinit {
    Darwin.close(fd)
  }

  /// Wakes the reader and fails every pending and later request. Safe to call
  /// more than once.
  func hangUp() {
    _ = Darwin.shutdown(fd, SHUT_RDWR)
  }

  /// Writes `line` (already newline terminated) and waits for its reply. A
  /// connection that dropped, or a daemon that stays silent past `timeout`,
  /// is an error rather than a hang; a silent one is also hung up, because a
  /// reply arriving late would be taken for the next request's.
  func request(_ line: Data, timeout: TimeInterval) throws -> CoreResponse {
    condition.lock()
    let alreadyClosed = closed
    condition.unlock()
    if alreadyClosed { throw CoreBridge.Failure.disconnected }

    do {
      try write(line)
    } catch {
      hangUp()
      throw CoreBridge.Failure.disconnected
    }

    condition.lock()
    defer { condition.unlock() }
    let deadline = Date().addingTimeInterval(timeout)
    while replies.isEmpty {
      if closed { throw CoreBridge.Failure.disconnected }
      if !condition.wait(until: deadline) {
        hangUp()
        throw CoreBridge.Failure.timedOut
      }
    }
    return replies.removeFirst()
  }

  func takeEvents(limit: Int) -> [CoreEvent] {
    condition.lock()
    defer { condition.unlock() }
    let count = min(max(limit, 0), events.count)
    let taken = Array(events.prefix(count))
    events.removeFirst(count)
    return taken
  }

  private func write(_ data: Data) throws {
    try data.withUnsafeBytes { (raw: UnsafeRawBufferPointer) in
      guard let base = raw.baseAddress else { return }
      var offset = 0
      while offset < raw.count {
        let written = Darwin.write(fd, base + offset, raw.count - offset)
        if written < 0 {
          if errno == EINTR { continue }
          throw CoreBridge.Failure.disconnected
        }
        offset += written
      }
    }
  }

  private func readLoop() {
    let decoder = JSONDecoder()
    var buffer = [UInt8](repeating: 0, count: 64 * 1024)
    var pending = Data()
    while true {
      let count = buffer.withUnsafeMutableBytes { Darwin.read(fd, $0.baseAddress, $0.count) }
      if count < 0 {
        if errno == EINTR { continue }
        break
      }
      if count == 0 { break }
      pending.append(contentsOf: buffer[0..<count])
      while let newline = pending.firstIndex(of: 0x0A) {
        let line = Data(pending[pending.startIndex..<newline])
        pending.removeSubrange(pending.startIndex...newline)
        if !line.isEmpty { handle(line, decoder: decoder) }
      }
    }
    condition.lock()
    closed = true
    condition.broadcast()
    condition.unlock()
  }

  private func handle(_ line: Data, decoder: JSONDecoder) {
    // A line that is neither is skipped: a newer daemon may say more than this
    // build knows, and that must not take the connection down.
    guard let frame = try? decoder.decode(Frame.self, from: line) else { return }
    condition.lock()
    defer { condition.unlock() }
    if let reply = frame.reply {
      replies.append(reply)
      condition.broadcast()
    } else if let event = frame.event {
      events.append(event)
    }
  }
}

/// A line from the daemon. An event type this build does not know decodes to
/// `nil` rather than failing the line, which is how the `state` broadcast is
/// ignored until the app handles it.
private struct Frame: Decodable {
  var reply: CoreResponse?
  var event: CoreEvent?

  private enum Key: String, CodingKey { case reply, event }

  init(from decoder: Decoder) throws {
    let container = try decoder.container(keyedBy: Key.self)
    if container.contains(.reply) {
      // An unreadable reply still has to wake the request waiting for it.
      reply =
        (try? container.decode(CoreResponse.self, forKey: .reply))
        ?? .error(message: "the core sent a reply this build cannot read")
    }
    event = try? container.decode(CoreEvent.self, forKey: .event)
  }
}

/// Finding, reaching and starting the daemon.
enum CoreDaemon {
  /// `$AKBUN_TERMINAL_SOCKET`, else `core.sock` in the data directory, which is
  /// `$AKBUN_TERMINAL_HOME` or the directory the app already used for its state.
  static func defaultSocketPath() -> String {
    let environment = ProcessInfo.processInfo.environment
    if let socket = environment["AKBUN_TERMINAL_SOCKET"], !socket.isEmpty { return socket }
    let directory: String
    if let home = environment["AKBUN_TERMINAL_HOME"], !home.isEmpty {
      directory = home
    } else {
      directory = NSHomeDirectory() + "/Library/Application Support/io.akbun.terminal"
    }
    return directory + "/core.sock"
  }

  /// `$AKBUN_TERMINAL_CORE`, else the binary the bundle ships beside the app
  /// executable.
  static func defaultBinaryPath() -> String {
    if let path = ProcessInfo.processInfo.environment["AKBUN_TERMINAL_CORE"], !path.isEmpty {
      return path
    }
    let beside = Bundle.main.executableURL?.deletingLastPathComponent()
    return (beside ?? URL(fileURLWithPath: "."))
      .appendingPathComponent("akbun-terminal-core").path
  }

  /// Connects, starting the daemon when nothing answers and retrying for a few
  /// seconds while it binds its socket.
  static func connectStarting(
    socketPath: String, daemon: String, environment: [String: String]
  ) throws -> CoreConnection {
    if let fd = connectSocket(socketPath) { return CoreConnection(fd: fd) }
    try launch(daemon: daemon, socketPath: socketPath, environment: environment)
    let deadline = Date().addingTimeInterval(5)
    while Date() < deadline {
      if let fd = connectSocket(socketPath) { return CoreConnection(fd: fd) }
      usleep(50_000)
    }
    throw CoreBridge.Failure.cannotStart
  }

  /// `true` once nothing answers on the socket, which is when a replacement
  /// daemon can bind it.
  static func waitUntilGone(socketPath: String) -> Bool {
    let deadline = Date().addingTimeInterval(5)
    while Date() < deadline {
      guard let fd = connectSocket(socketPath) else { return true }
      Darwin.close(fd)
      usleep(50_000)
    }
    return false
  }

  /// A connected descriptor, or `nil` when nobody is listening.
  private static func connectSocket(_ path: String) -> Int32? {
    var address = sockaddr_un()
    address.sun_family = sa_family_t(AF_UNIX)
    let bytes = Array(path.utf8)
    // sun_path is 104 bytes on macOS; a longer path cannot be addressed at all.
    guard bytes.count < MemoryLayout.size(ofValue: address.sun_path) else { return nil }
    withUnsafeMutableBytes(of: &address.sun_path) { raw in
      raw.copyBytes(from: bytes)
    }

    let fd = socket(AF_UNIX, SOCK_STREAM, 0)
    guard fd >= 0 else { return nil }
    // A write to a daemon that went away must be an error, not a fatal SIGPIPE.
    var on: Int32 = 1
    _ = setsockopt(fd, SOL_SOCKET, SO_NOSIGPIPE, &on, socklen_t(MemoryLayout<Int32>.size))

    let result = withUnsafePointer(to: &address) { pointer in
      pointer.withMemoryRebound(to: sockaddr.self, capacity: 1) {
        Darwin.connect(fd, $0, socklen_t(MemoryLayout<sockaddr_un>.size))
      }
    }
    guard result == 0 else {
      Darwin.close(fd)
      return nil
    }
    return fd
  }

  /// POSIX_SPAWN_SETSID from <spawn.h>, spelled out so that a macro Swift does
  /// not import cannot break the build.
  private static let setsidFlag: Int16 = 0x0400

  /// Starts `akbun-terminal-core serve --socket <path>` so that it outlives the app.
  ///
  /// posix_spawn with a new session rather than `Process`: the daemon must keep
  /// its shells when the app quits or its terminal closes, and a child left in
  /// the app's session and process group would receive the signals sent to
  /// either. stdin goes to /dev/null. The daemon only logs with eprintln, so
  /// stdout and stderr are appended to `core.log` beside the socket; otherwise a
  /// failed start would leave no trace. The pid is only
  /// reaped (from a detached thread, so a daemon that exits first leaves no
  /// zombie); the app never waits for it to end and never signals it.
  private static func launch(
    daemon: String, socketPath: String, environment: [String: String]
  ) throws {
    var actions: posix_spawn_file_actions_t?
    posix_spawn_file_actions_init(&actions)
    defer { posix_spawn_file_actions_destroy(&actions) }
    posix_spawn_file_actions_addopen(&actions, 0, "/dev/null", O_RDONLY, 0)
    // The daemon binds its socket in this directory, but it may not exist yet on
    // a first run. A log that cannot be had falls back to /dev/null rather than
    // stopping the daemon from starting.
    let directory = (socketPath as NSString).deletingLastPathComponent
    let logPath: String
    do {
      try FileManager.default.createDirectory(
        atPath: directory, withIntermediateDirectories: true,
        attributes: [.posixPermissions: 0o700])
      logPath = directory + "/core.log"
    } catch {
      logPath = "/dev/null"
    }
    posix_spawn_file_actions_addopen(&actions, 1, logPath, O_WRONLY | O_CREAT | O_APPEND, 0o600)
    posix_spawn_file_actions_addopen(&actions, 2, logPath, O_WRONLY | O_CREAT | O_APPEND, 0o600)

    var attributes: posix_spawnattr_t?
    posix_spawnattr_init(&attributes)
    defer { posix_spawnattr_destroy(&attributes) }
    posix_spawnattr_setflags(&attributes, setsidFlag)

    var env = ProcessInfo.processInfo.environment
    for (key, value) in environment { env[key] = value }
    let arguments = [daemon, "serve", "--socket", socketPath]
    var argv: [UnsafeMutablePointer<CChar>?] = arguments.map { strdup($0) }
    argv.append(nil)
    var envp: [UnsafeMutablePointer<CChar>?] = env.map { strdup("\($0.key)=\($0.value)") }
    envp.append(nil)
    defer {
      for pointer in argv { free(pointer) }
      for pointer in envp { free(pointer) }
    }

    var pid: pid_t = 0
    let result = posix_spawn(&pid, daemon, &actions, &attributes, argv, envp)
    guard result == 0 else {
      throw CoreBridge.Failure.core(
        "could not start the core at \(daemon): \(String(cString: strerror(result)))")
    }
    let child = pid
    Thread.detachNewThread {
      var status: Int32 = 0
      _ = waitpid(child, &status, 0)
    }
  }
}
