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
    let encoded = try json(.spawn(cwd: "/tmp", cols: 80, rows: 24, workspace: 7))
    #expect(
      encoded
        == #"{"command":{"cols":80,"cwd":"\/tmp","rows":24,"type":"spawn","workspace":7},"v":1}"#)
  }

  @Test func spawnWithoutAWorkspaceLeavesTheFieldOut() throws {
    let encoded = try json(.spawn(cwd: "", cols: 80, rows: 24, workspace: nil))
    #expect(encoded == #"{"command":{"cols":80,"cwd":"","rows":24,"type":"spawn"},"v":1}"#)
  }

  @Test func agentAndLinkCommandsKeepTheirWireNames() throws {
    #expect(
      try json(.loadRules(directory: "/tmp/agents"))
        == #"{"command":{"directory":"\/tmp\/agents","type":"load_rules"},"v":1}"#)
    #expect(try json(.detect) == #"{"command":{"type":"detect"},"v":1}"#)
    #expect(
      try json(.clearStatus(workspace: 4))
        == #"{"command":{"type":"clear_status","workspace":4},"v":1}"#)
    #expect(
      try json(.urlAt(line: "see https://a.example", column: 6))
        == #"{"command":{"column":6,"line":"see https:\/\/a.example","type":"url_at"},"v":1}"#)
  }

  @Test func readsWhatTheCoreJudgedAndWhatItWillOpen() throws {
    let statuses = #"{"type":"statuses","statuses":[{"workspace":2,"status":"needs_attention"}]}"#
    guard case .statuses(let states) = try JSONDecoder().decode(
      CoreResponse.self, from: Data(statuses.utf8))
    else {
      Issue.record("expected statuses")
      return
    }
    #expect(states == [CoreWorkspaceState(workspace: 2, status: .needsAttention)])

    let found = try JSONDecoder().decode(
      CoreResponse.self, from: Data(#"{"type":"url","url":"https://a.example"}"#.utf8))
    #expect(found == .url("https://a.example"))
    let missing = try JSONDecoder().decode(
      CoreResponse.self, from: Data(#"{"type":"url","url":null}"#.utf8))
    #expect(missing == .url(nil))
  }

  @Test func writeSendsBytesNotText() throws {
    let encoded = try json(.write(session: 3, bytes: [104, 105]))
    #expect(encoded == #"{"command":{"bytes":[104,105],"session":3,"type":"write"},"v":1}"#)
  }

  @Test func fileAndThemeCommandsKeepTheirWireNames() throws {
    #expect(
      try json(.readDirectory(path: "/tmp"))
        == #"{"command":{"path":"\/tmp","type":"read_directory"},"v":1}"#)
    #expect(
      try json(.writeFile(path: "/tmp/a.md", text: "hi"))
        == #"{"command":{"path":"\/tmp\/a.md","text":"hi","type":"write_file"},"v":1}"#)
    #expect(try json(.themes) == #"{"command":{"type":"themes"},"v":1}"#)
    #expect(
      try json(.setTheme(name: "Nord"))
        == #"{"command":{"name":"Nord","type":"set_theme"},"v":1}"#)
  }

  @Test func readsTheBlocksTheCoreSends() throws {
    let json = """
      {"type":"markdown","blocks":[
        {"type":"heading","level":2,"spans":[{"text":"Title","bold":true,"italic":false,"code":false,"link":null}]},
        {"type":"list_item","depth":1,"marker":"[x]","spans":[{"text":"done"}]},
        {"type":"table","header":["a"],"rows":[["1"]]},
        {"type":"something_new"}]}
      """
    let response = try JSONDecoder().decode(CoreResponse.self, from: Data(json.utf8))
    guard case .markdown(let blocks) = response else {
      Issue.record("expected markdown, got \(response)")
      return
    }
    guard case .heading(let level, let spans) = blocks[0] else {
      Issue.record("expected a heading, got \(blocks[0])")
      return
    }
    #expect(level == 2)
    #expect(spans.first?.bold == true)
    guard case .listItem(let depth, let marker, let items) = blocks[1] else {
      Issue.record("expected a list item, got \(blocks[1])")
      return
    }
    // The style flags are optional on the wire, so a span without them reads.
    #expect((depth, marker, items.map(\.text), items[0].code) == (1, "[x]", ["done"], false))
    #expect(blocks[2] == .table(header: ["a"], rows: [["1"]]))
    // A block a newer core adds must draw as nothing rather than fail the file.
    #expect(blocks[3] == .unknown)
  }

  @Test func readsADirectoryListing() throws {
    let json = #"{"type":"entries","entries":[{"name":"src","path":"/p/src","is_directory":true}]}"#
    let response = try JSONDecoder().decode(CoreResponse.self, from: Data(json.utf8))
    guard case .entries(let entries) = response else {
      Issue.record("expected entries, got \(response)")
      return
    }
    #expect(entries == [CoreEntry(name: "src", path: "/p/src", isDirectory: true)])
  }

  @Test func readsAThemeAndItsColours() throws {
    let palette = Array(repeating: "\"#3b4252\"", count: 16).joined(separator: ",")
    let json = #"""
      {"type":"themes","themes":[{"name":"Nord","background":"#2e3440","foreground":"#d8dee9",
      "cursor":"#d8dee9","palette":[
      """# + palette + "]}]}"
    let response = try JSONDecoder().decode(CoreResponse.self, from: Data(json.utf8))
    guard case .themes(let themes) = response, let theme = themes.first else {
      Issue.record("expected themes, got \(response)")
      return
    }
    #expect(CoreTheme.rgb(theme.background)! == (0x2e, 0x34, 0x40))
    #expect(theme.rgbPalette?.count == 16)
    // Anything that is not #rrggbb is refused rather than drawn as black.
    #expect(CoreTheme.rgb("2e3440") == nil)
    #expect(CoreTheme.rgb("#zzzzzz") == nil)
  }

  @Test func treeCommandsKeepTheirWireNames() throws {
    #expect(
      try json(.loadState(directory: "/tmp/app"))
        == #"{"command":{"directory":"\/tmp\/app","type":"load_state"},"v":1}"#)
    #expect(
      try json(.createProject(name: "Demo", path: nil))
        == #"{"command":{"name":"Demo","type":"create_project"},"v":1}"#)
    #expect(
      try json(.createWorkspace(project: 7, name: "Server"))
        == #"{"command":{"name":"Server","project":7,"type":"create_workspace"},"v":1}"#)
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
    let state = try decoder.decode(
      CoreResponse.self,
      from: Data(
        #"{"type":"state","state":{"schema_version":1,"projects":[{"id":2,"name":"Demo","path":null,"workspaces":[{"id":3,"name":"Server","status":"needs_attention"}]}]}}"#.utf8
      )
    )
    #expect(
      state == .state(
        CoreTreeState(
          schemaVersion: 1,
          projects: [
            CoreProject(
              id: 2,
              name: "Demo",
              path: nil,
              workspaces: [CoreWorkspace(id: 3, name: "Server", status: .needsAttention)]
            )
          ],
          // Absent in the state a build without themes wrote, which still reads.
          theme: nil
        )
      )
    )
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
