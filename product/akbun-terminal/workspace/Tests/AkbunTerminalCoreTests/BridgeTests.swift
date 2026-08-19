import Testing
import Foundation
@testable import AkbunTerminalCore

/// The round trip this milestone exists to prove: Swift calls into the Rust
/// static library, a real shell runs, and its output comes back through the
/// event queue. A broken link step or a drifted header fails here.
struct BridgeTests {
  @Test func handshakeAgreesOnTheProtocolVersion() throws {
    let core = try CoreBridge()
    try core.handshake()
  }

  @Test func typingIntoASessionComesBackAsOutput() async throws {
    let core = try CoreBridge()
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
    let core = try CoreBridge()
    #expect(throws: CoreBridge.Failure.self) {
      try core.expectOk(.close(session: 404))
    }
  }

  /// The whole detection path at once: a rule file is read, a real shell writes
  /// to a real pty, the core interprets that screen and answers with a status.
  /// The pieces are unit tested in Rust; what only this can catch is them not
  /// being wired to each other across the boundary.
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

    let core = try CoreBridge()
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
        if try core.detect().contains(CoreWorkspaceState(workspace: 42, status: wanted)) {
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
    try core.expectOk(.clearStatus(workspace: 42))
  }
}
