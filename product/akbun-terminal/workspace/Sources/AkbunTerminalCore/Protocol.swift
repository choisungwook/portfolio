import Foundation

/// The Swift half of the protocol in core/crates/core/src/protocol.rs.
///
/// The two halves are not compiled together, so the wire names are the contract.
/// `ProtocolTests` pins the encoded shape here and a Rust test pins it there; a
/// rename on either side has to fail one of them.
public enum CoreProtocol {
  /// Must match `PROTOCOL_VERSION` on the Rust side. A mismatch is reported by
  /// the core as an error rather than parsed as something else.
  public static let version: UInt32 = 1
}

public enum CoreCommand: Encodable {
  case hello
  case spawn(cwd: String, cols: UInt16, rows: UInt16, workspace: UInt64?)
  case write(session: UInt32, bytes: [UInt8])
  case resize(session: UInt32, cols: UInt16, rows: UInt16)
  case close(session: UInt32)
  case loadState(directory: String)
  case createProject(name: String, path: String?)
  case createWorkspace(project: UInt64, name: String)
  case readDirectory(path: String)
  case readFile(path: String)
  case writeFile(path: String, text: String)
  case renderMarkdown(text: String)
  case themes
  case setTheme(name: String)
  case loadRules(directory: String)
  case detect
  case clearStatus(workspace: UInt64)
  case urlAt(line: String, column: Int)

  private enum Key: String, CodingKey {
    case type, cwd, cols, rows, session, bytes, directory, name, path, project, text
    case workspace, line, column
  }

  public func encode(to encoder: Encoder) throws {
    var container = encoder.container(keyedBy: Key.self)
    switch self {
    case .hello:
      try container.encode("hello", forKey: .type)
    case .spawn(let cwd, let cols, let rows, let workspace):
      try container.encode("spawn", forKey: .type)
      try container.encode(cwd, forKey: .cwd)
      try container.encode(cols, forKey: .cols)
      try container.encode(rows, forKey: .rows)
      try container.encodeIfPresent(workspace, forKey: .workspace)
    case .write(let session, let bytes):
      try container.encode("write", forKey: .type)
      try container.encode(session, forKey: .session)
      try container.encode(bytes, forKey: .bytes)
    case .resize(let session, let cols, let rows):
      try container.encode("resize", forKey: .type)
      try container.encode(session, forKey: .session)
      try container.encode(cols, forKey: .cols)
      try container.encode(rows, forKey: .rows)
    case .close(let session):
      try container.encode("close", forKey: .type)
      try container.encode(session, forKey: .session)
    case .loadState(let directory):
      try container.encode("load_state", forKey: .type)
      try container.encode(directory, forKey: .directory)
    case .createProject(let name, let path):
      try container.encode("create_project", forKey: .type)
      try container.encode(name, forKey: .name)
      try container.encodeIfPresent(path, forKey: .path)
    case .createWorkspace(let project, let name):
      try container.encode("create_workspace", forKey: .type)
      try container.encode(project, forKey: .project)
      try container.encode(name, forKey: .name)
    case .readDirectory(let path):
      try container.encode("read_directory", forKey: .type)
      try container.encode(path, forKey: .path)
    case .readFile(let path):
      try container.encode("read_file", forKey: .type)
      try container.encode(path, forKey: .path)
    case .writeFile(let path, let text):
      try container.encode("write_file", forKey: .type)
      try container.encode(path, forKey: .path)
      try container.encode(text, forKey: .text)
    case .renderMarkdown(let text):
      try container.encode("render_markdown", forKey: .type)
      try container.encode(text, forKey: .text)
    case .themes:
      try container.encode("themes", forKey: .type)
    case .setTheme(let name):
      try container.encode("set_theme", forKey: .type)
      try container.encode(name, forKey: .name)
    case .loadRules(let directory):
      try container.encode("load_rules", forKey: .type)
      try container.encode(directory, forKey: .directory)
    case .detect:
      try container.encode("detect", forKey: .type)
    case .clearStatus(let workspace):
      try container.encode("clear_status", forKey: .type)
      try container.encode(workspace, forKey: .workspace)
    case .urlAt(let line, let column):
      try container.encode("url_at", forKey: .type)
      try container.encode(line, forKey: .line)
      try container.encode(column, forKey: .column)
    }
  }
}

/// The envelope. Every call carries the version, which is what lets this move
/// from a function call to a socket later without a second format.
public struct CoreRequest: Encodable {
  public let v: UInt32
  public let command: CoreCommand

  public init(_ command: CoreCommand) {
    self.v = CoreProtocol.version
    self.command = command
  }
}

public enum CoreResponse: Equatable, Sendable {
  case hello(protocol: UInt32)
  case spawned(session: UInt32)
  case ok
  case state(CoreTreeState)
  case entries([CoreEntry])
  case file(text: String)
  case markdown([CoreBlock])
  case themes([CoreTheme])
  case statuses([CoreWorkspaceState])
  case url(String?)
  case error(message: String)
}

/// One workspace's judged status. Only the ones that moved are sent.
public struct CoreWorkspaceState: Decodable, Equatable, Sendable {
  public let workspace: UInt64
  public let status: CoreWorkspaceStatus

  public init(workspace: UInt64, status: CoreWorkspaceStatus) {
    self.workspace = workspace
    self.status = status
  }
}

public struct CoreTreeState: Decodable, Equatable, Sendable {
  public let schemaVersion: UInt32
  public let projects: [CoreProject]
  /// Absent while the terminal follows the system appearance.
  public let theme: String?

  private enum CodingKeys: String, CodingKey {
    case schemaVersion = "schema_version"
    case projects, theme
  }
}

/// One row of a directory. Children are never carried: the shell asks for a
/// folder's contents when it is opened, and not before.
public struct CoreEntry: Decodable, Equatable, Sendable {
  public let name: String
  public let path: String
  public let isDirectory: Bool

  private enum CodingKeys: String, CodingKey {
    case name, path
    case isDirectory = "is_directory"
  }
}

public struct CoreSpan: Decodable, Equatable, Sendable {
  public let text: String
  public let bold: Bool
  public let italic: Bool
  public let code: Bool
  public let link: String?

  public init(from decoder: Decoder) throws {
    let container = try decoder.container(keyedBy: CodingKeys.self)
    text = try container.decode(String.self, forKey: .text)
    bold = try container.decodeIfPresent(Bool.self, forKey: .bold) ?? false
    italic = try container.decodeIfPresent(Bool.self, forKey: .italic) ?? false
    code = try container.decodeIfPresent(Bool.self, forKey: .code) ?? false
    link = try container.decodeIfPresent(String.self, forKey: .link)
  }

  private enum CodingKeys: String, CodingKey {
    case text, bold, italic, code, link
  }
}

public enum CoreBlock: Decodable, Equatable, Sendable {
  case heading(level: Int, spans: [CoreSpan])
  case paragraph(spans: [CoreSpan])
  case quote(spans: [CoreSpan])
  case code(language: String?, text: String)
  case listItem(depth: Int, marker: String, spans: [CoreSpan])
  case table(header: [String], rows: [[String]])
  case rule
  /// A block from a newer core. Drawn as nothing rather than crashing the view.
  case unknown

  private enum Key: String, CodingKey {
    case type, level, spans, language, text, depth, marker, header, rows
  }

  public init(from decoder: Decoder) throws {
    let container = try decoder.container(keyedBy: Key.self)
    func spans() throws -> [CoreSpan] {
      try container.decode([CoreSpan].self, forKey: .spans)
    }
    switch try container.decode(String.self, forKey: .type) {
    case "heading":
      self = .heading(level: try container.decode(Int.self, forKey: .level), spans: try spans())
    case "paragraph":
      self = .paragraph(spans: try spans())
    case "quote":
      self = .quote(spans: try spans())
    case "code":
      self = .code(
        language: try container.decodeIfPresent(String.self, forKey: .language),
        text: try container.decode(String.self, forKey: .text))
    case "list_item":
      self = .listItem(
        depth: try container.decode(Int.self, forKey: .depth),
        marker: try container.decode(String.self, forKey: .marker),
        spans: try spans())
    case "table":
      self = .table(
        header: try container.decode([String].self, forKey: .header),
        rows: try container.decode([[String]].self, forKey: .rows))
    case "rule":
      self = .rule
    default:
      self = .unknown
    }
  }
}

public struct CoreTheme: Decodable, Equatable, Sendable {
  public let name: String
  public let background: String
  public let foreground: String
  public let cursor: String
  public let palette: [String]

  /// The name the core stores for "follow the system appearance". Must match
  /// `theme::SYSTEM` in the core, which is what refuses an unknown name.
  public static let system = "System"
}

public struct CoreProject: Decodable, Equatable, Sendable {
  public let id: UInt64
  public let name: String
  public let path: String?
  public let workspaces: [CoreWorkspace]
}

public struct CoreWorkspace: Decodable, Equatable, Sendable {
  public let id: UInt64
  public let name: String
  public let status: CoreWorkspaceStatus
}

public enum CoreWorkspaceStatus: String, Decodable, Equatable, Sendable {
  case idle
  case running
  case needsAttention = "needs_attention"
  case completed
  case failed
}

public enum CoreEvent: Equatable, Sendable {
  case output(session: UInt32, bytes: [UInt8])
  case exited(session: UInt32)
}

extension CoreResponse: Decodable {
  private enum Key: String, CodingKey {
    case type, `protocol`, session, state, message, entries, text, blocks, themes
    case statuses, url
  }

  public init(from decoder: Decoder) throws {
    let container = try decoder.container(keyedBy: Key.self)
    switch try container.decode(String.self, forKey: .type) {
    case "hello":
      self = .hello(protocol: try container.decode(UInt32.self, forKey: .protocol))
    case "spawned":
      self = .spawned(session: try container.decode(UInt32.self, forKey: .session))
    case "ok":
      self = .ok
    case "state":
      self = .state(try container.decode(CoreTreeState.self, forKey: .state))
    case "entries":
      self = .entries(try container.decode([CoreEntry].self, forKey: .entries))
    case "file":
      self = .file(text: try container.decode(String.self, forKey: .text))
    case "markdown":
      self = .markdown(try container.decode([CoreBlock].self, forKey: .blocks))
    case "themes":
      self = .themes(try container.decode([CoreTheme].self, forKey: .themes))
    case "statuses":
      self = .statuses(try container.decode([CoreWorkspaceState].self, forKey: .statuses))
    case "url":
      self = .url(try container.decodeIfPresent(String.self, forKey: .url))
    case "error":
      self = .error(message: try container.decode(String.self, forKey: .message))
    case let other:
      // A newer core answering with something this build does not know is an
      // error here rather than a crash, so an update cannot brick the shell.
      self = .error(message: "unknown response type \(other)")
    }
  }
}

extension CoreEvent: Decodable {
  private enum Key: String, CodingKey {
    case type, session, bytes
  }

  public init(from decoder: Decoder) throws {
    let container = try decoder.container(keyedBy: Key.self)
    switch try container.decode(String.self, forKey: .type) {
    case "output":
      self = .output(
        session: try container.decode(UInt32.self, forKey: .session),
        bytes: try container.decode([UInt8].self, forKey: .bytes)
      )
    case "exited":
      self = .exited(session: try container.decode(UInt32.self, forKey: .session))
    case let other:
      throw DecodingError.dataCorruptedError(
        forKey: .type, in: container, debugDescription: "unknown event type \(other)")
    }
  }
}
