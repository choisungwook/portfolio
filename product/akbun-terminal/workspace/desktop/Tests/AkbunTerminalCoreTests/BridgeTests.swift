import Testing
import Foundation
@testable import AkbunTerminalCore

/// A daemon of its own for one test: a short temp directory holding the socket
/// and the daemon's data, so nothing touches the real data directory and tests
/// can run side by side.
///
/// The directory is short because a Unix socket path is limited to about 104
/// bytes on macOS. The daemon binary is the release build from the Cargo
/// workspace one level above the package (scripts/build-core.sh).
private struct TestDaemon {
  let directory: String
  let socket: String

  static let binary: String = {
    // …/workspace/desktop/Tests/AkbunTerminalCoreTests/BridgeTests.swift
    var url = URL(fileURLWithPath: #filePath)
    for _ in 0..<4 { url.deleteLastPathComponent() }
    return url.appendingPathComponent("target/release/akbun-terminal-core").path
  }()

  init() throws {
    let suffix = String(UUID().uuidString.prefix(8)).lowercased()
    directory = "/tmp/akt-\(suffix)"
    socket = directory + "/core.sock"
    try FileManager.default.createDirectory(
      atPath: directory, withIntermediateDirectories: true)
  }

  func bridge() throws -> CoreBridge {
    try CoreBridge(
      socketPath: socket, daemon: Self.binary,
      environment: ["AKBUN_TERMINAL_HOME": directory])
  }

  /// Ends the daemon and removes its directory. The daemon would also exit on
  /// its own once idle, but a test should not leave one behind.
  func stop(_ core: CoreBridge) {
    _ = try? core.send(.shutdown)
    try? FileManager.default.removeItem(atPath: directory)
  }
}

/// The round trip this milestone exists to prove: Swift talks to a real daemon
/// over its socket, a real shell runs there, and its output comes back as
/// events. A drifted protocol or a missing daemon binary fails here.
struct BridgeTests {
  @Test func handshakeAgreesOnTheProtocolVersion() throws {
    let daemon = try TestDaemon()
    let core = try daemon.bridge()
    defer { daemon.stop(core) }
    try core.handshake()
  }

  @Test func typingIntoASessionComesBackAsOutput() async throws {
    let daemon = try TestDaemon()
    let core = try daemon.bridge()
    defer { daemon.stop(core) }
    try core.handshake()

    let session = try core.spawn(cwd: "", cols: 80, rows: 24, workspace: nil)
    try core.expectOk(.write(session: session, bytes: Array("echo akbun-bridge-ok\n".utf8)))

    var seen = ""
    let deadline = Date().addingTimeInterval(10)
    while Date() < deadline, !seen.contains("akbun-bridge-ok") {
      for event in core.drainEvents() {
        if case .output(_, let bytes) = event {
          seen += String(decoding: bytes, as: UTF8.self)
        }
      }
      try? await Task.sleep(for: .milliseconds(20))
    }

    #expect(seen.contains("akbun-bridge-ok"))
    try core.expectOk(.close(session: session))
  }

  @Test func commandsForAGoneSessionReportAnError() throws {
    let daemon = try TestDaemon()
    let core = try daemon.bridge()
    defer { daemon.stop(core) }
    #expect(throws: CoreBridge.Failure.self) {
      try core.expectOk(.close(session: 404))
    }
  }

  /// The whole detection path at once: a rule file is read, a real shell writes
  /// to a real pty, the core interprets that screen and answers with a status.
  /// The pieces are unit tested in Rust; what only this can catch is them not
  /// being wired to each other across the socket.
  @Test func aRuleFileTurnsShellOutputIntoAWorkspaceStatus() async throws {
    let rules = URL(fileURLWithPath: NSTemporaryDirectory())
      .appendingPathComponent("akbun-terminal-rules-\(UUID().uuidString)", isDirectory: true)
    try FileManager.default.createDirectory(at: rules, withIntermediateDirectories: true)
    defer { try? FileManager.default.removeItem(at: rules) }
    // The login shell stands in for the agent, so this needs nothing installed
    // to have a process the rule recognises.
    let rule = """
      {"name":"Test","processes":["zsh","bash","sh"],
       "asking":["Do you want to"],
       "running":["esc to interrupt"],
       "done":["? for shortcuts"]}
      """
    try rule.write(to: rules.appendingPathComponent("test.json"), atomically: true, encoding: .utf8)

    let daemon = try TestDaemon()
    let core = try daemon.bridge()
    defer { daemon.stop(core) }
    try core.handshake()
    try core.expectOk(.loadRules(directory: rules.path))
    let session = try core.spawn(cwd: "", cols: 80, rows: 24, workspace: 42)
    defer { try? core.expectOk(.close(session: session)) }

    func waitFor(_ wanted: CoreWorkspaceStatus, after keys: String) async throws -> Bool {
      try core.expectOk(.write(session: session, bytes: Array(keys.utf8)))
      let deadline = Date().addingTimeInterval(15)
      while Date() < deadline {
        // Output has to be drained or the core's queue is the only thing that
        // grows. The screen it judges is kept on the reader thread regardless.
        _ = core.drainEvents()
        // The workspace's own status and the shell's, rather than the whole
        // value: the answer also carries a list of every shell in the workspace,
        // and a test that deep-compares it fails the day a field is added to it
        // rather than the day the detection breaks.
        if try core.detect().contains(where: { state in
          state.workspace == 42 && state.status == wanted
            && state.sessions.contains(CoreSessionState(session: session, status: wanted))
        }) {
          return true
        }
        try? await Task.sleep(for: .milliseconds(100))
      }
      return false
    }

    #expect(try await waitFor(.running, after: "printf 'esc to interrupt\\n'\n"))
    // A full redraw, which is the reason the core keeps a screen rather than the
    // bytes: the running phrase above is still in the stream and has to stop
    // counting the moment it is painted over.
    #expect(try await waitFor(.completed, after: "printf '\\033[2J\\033[H? for shortcuts\\n'\n"))
    try core.expectOk(.clearStatus(workspace: 42, session: nil))
  }
}
