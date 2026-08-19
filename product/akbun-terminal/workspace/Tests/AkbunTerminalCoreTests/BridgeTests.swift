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

    let session = try core.spawn(cwd: "", cols: 80, rows: 24)
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
}
