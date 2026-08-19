import Testing
import Foundation
@testable import AkbunTerminalCore

/// Pins the wire shape this side produces. The Rust side pins the same strings
/// in its own tests; the two are not compiled together, so a rename that is not
/// mirrored has to fail one of these.
struct ProtocolTests {
  private func json(_ command: CoreCommand) throws -> String {
    let encoder = JSONEncoder()
    encoder.outputFormatting = [.sortedKeys]
    return String(decoding: try encoder.encode(CoreRequest(command)), as: UTF8.self)
  }

  @Test func everyRequestCarriesTheProtocolVersion() throws {
    #expect(try json(.hello) == #"{"command":{"type":"hello"},"v":1}"#)
  }

  @Test func spawnNamesTheFieldsTheCoreReads() throws {
    let encoded = try json(.spawn(cwd: "/tmp", cols: 80, rows: 24))
    #expect(encoded == #"{"command":{"cols":80,"cwd":"\/tmp","rows":24,"type":"spawn"},"v":1}"#)
  }

  @Test func writeSendsBytesNotText() throws {
    let encoded = try json(.write(session: 3, bytes: [104, 105]))
    #expect(encoded == #"{"command":{"bytes":[104,105],"session":3,"type":"write"},"v":1}"#)
  }

  @Test func decodesTheResponsesTheCoreSends() throws {
    let decoder = JSONDecoder()
    #expect(
      try decoder.decode(CoreResponse.self, from: Data(#"{"type":"hello","protocol":1}"#.utf8))
        == .hello(protocol: 1))
    #expect(
      try decoder.decode(CoreResponse.self, from: Data(#"{"type":"spawned","session":7}"#.utf8))
        == .spawned(session: 7))
    #expect(try decoder.decode(CoreResponse.self, from: Data(#"{"type":"ok"}"#.utf8)) == .ok)
  }

  @Test func anUnknownResponseBecomesAnErrorRatherThanACrash() throws {
    // A newer core must not be able to take down an installed shell.
    let response = try JSONDecoder().decode(
      CoreResponse.self, from: Data(#"{"type":"tomorrow"}"#.utf8))
    #expect(response == .error(message: "unknown response type tomorrow"))
  }

  @Test func decodesOutputAndExitEvents() throws {
    let decoder = JSONDecoder()
    #expect(
      try decoder.decode(CoreEvent.self, from: Data(#"{"type":"output","session":1,"bytes":[65]}"#.utf8))
        == .output(session: 1, bytes: [65]))
    #expect(
      try decoder.decode(CoreEvent.self, from: Data(#"{"type":"exited","session":1}"#.utf8))
        == .exited(session: 1))
  }
}
