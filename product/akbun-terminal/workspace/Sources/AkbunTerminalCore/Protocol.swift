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
  case renameProject(project: UInt64, name: String)
  case deleteProject(project: UInt64)
  case renameWorkspace(workspace: UInt64, name: String)
  case deleteWorkspace(workspace: UInt64)
  case readDirectory(path: String)
  case gitStatus(path: String)
  case readFile(path: String)
  case writeFile(path: String, text: String)
  case renderMarkdown(text: String)
  case highlight(path: String, text: String)
  case themes
  case setTheme(name: String)
  case shortcuts
  /// An empty `key` restores that command's default. A key another command
  /// already has is refused by the core rather than shared between the two.
  case setShortcut(command: String, key: String)
  case resetShortcuts
  case findFiles(root: String, query: String, limit: Int?)
  case loadRules(directory: String)
  case detect
  case clearStatus(workspace: UInt64)
  case urlAt(line: String, column: Int)

  private enum Key: String, CodingKey {
    case type, cwd, cols, rows, session, bytes, directory, name, path, project, text
    case workspace, line, column, command, key, root, query, limit
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
    case .renameProject(let project, let name):
      try container.encode("rename_project", forKey: .type)
      try container.encode(project, forKey: .project)
      try container.encode(name, forKey: .name)
    case .deleteProject(let project):
      try container.encode("delete_project", forKey: .type)
      try container.encode(project, forKey: .project)
    case .renameWorkspace(let workspace, let name):
      try container.encode("rename_workspace", forKey: .type)
      try container.encode(workspace, forKey: .workspace)
      try container.encode(name, forKey: .name)
    case .deleteWorkspace(let workspace):
      try container.encode("delete_workspace", forKey: .type)
      try container.encode(workspace, forKey: .workspace)
    case .readDirectory(let path):
      try container.encode("read_directory", forKey: .type)
      try container.encode(path, forKey: .path)
    case .gitStatus(let path):
      try container.encode("git_status", forKey: .type)
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
    case .highlight(let path, let text):
      try container.encode("highlight", forKey: .type)
      try container.encode(path, forKey: .path)
      try container.encode(text, forKey: .text)
    case .themes:
      try container.encode("themes", forKey: .type)
    case .setTheme(let name):
      try container.encode("set_theme", forKey: .type)
      try container.encode(name, forKey: .name)
    case .shortcuts:
      try container.encode("shortcuts", forKey: .type)
    case .setShortcut(let command, let key):
      try container.encode("set_shortcut", forKey: .type)
      try container.encode(command, forKey: .command)
      try container.encode(key, forKey: .key)
    case .resetShortcuts:
      try container.encode("reset_shortcuts", forKey: .type)
    case .findFiles(let root, let query, let limit):
      try container.encode("find_files", forKey: .type)
      try container.encode(root, forKey: .root)
      try container.encode(query, forKey: .query)
      try container.encodeIfPresent(limit, forKey: .limit)
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
  case git(CoreGitStatus)
  case file(text: String)
  case markdown([CoreBlock])
  case highlighted(CoreHighlighted)
  case themes([CoreTheme])
  case shortcuts([CoreShortcut])
  case matches([CoreMatch])
  case statuses([CoreWorkspaceState])
  case url(String?)
  case error(message: String)
}

/// One menu command and the keystroke that runs it.
///
/// The list is the core's, so the menu bar and the settings window are drawn
/// from one table rather than two that have to agree.
public struct CoreShortcut: Decodable, Equatable, Sendable {
  public let command: String
  public let title: String
  /// Which menu the command belongs under, so the settings window groups its
  /// rows the way the menu bar does.
  public let menu: String
  public let key: String
  /// What the key was before anyone changed it, for the restore button.
  public let defaultKey: String

  public init(command: String, title: String, menu: String, key: String, defaultKey: String) {
    self.command = command
    self.title = title
    self.menu = menu
    self.key = key
    self.defaultKey = defaultKey
  }

  private enum CodingKeys: String, CodingKey {
    case command, title, menu, key
    case defaultKey = "default_key"
  }
}

/// One file the palette found, and where the typed characters landed in it.
public struct CoreMatch: Decodable, Equatable, Sendable {
  /// Absolute, because opening it is what happens next.
  public let path: String
  /// The path with the project folder taken off the front. What is shown, and
  /// what `positions` indexes into.
  public let relative: String
  public let score: Int
  /// Character offsets into `relative`, so the shell can mark them.
  public let positions: [Int]

  public init(path: String, relative: String, score: Int, positions: [Int]) {
    self.path = path
    self.relative = relative
    self.score = score
    self.positions = positions
  }
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

/// What git makes of the files under one folder.
///
/// `repository` false is the ordinary answer for a project that is not under
/// version control, not a failure: the browser draws its names plainly and asks
/// nothing else. Directories are in `entries` too, carrying the strongest status
/// of anything beneath them, so a closed folder still says something is inside.
public struct CoreGitStatus: Decodable, Equatable, Sendable {
  public let repository: Bool
  public let entries: [CoreGitEntry]

  public init(repository: Bool, entries: [CoreGitEntry]) {
    self.repository = repository
    self.entries = entries
  }

  public static let none = CoreGitStatus(repository: false, entries: [])

  /// Ready to look a row up by its path, which is the only thing the browser
  /// does with this.
  public var byPath: [String: CoreGitEntry] {
    Dictionary(entries.map { ($0.path, $0) }, uniquingKeysWith: { first, _ in first })
  }
}

public struct CoreGitEntry: Decodable, Equatable, Sendable {
  public let path: String
  public let status: CoreFileStatus
  /// Which half of git the change is in. Absent from an older core, which is
  /// read as the working tree: that is where a change is before anything is
  /// done to it, so an unknown one is drawn as the quieter of the two.
  public let stage: CoreFileStage

  public init(path: String, status: CoreFileStatus, stage: CoreFileStage = .unstaged) {
    self.path = path
    self.status = status
    self.stage = stage
  }

  public init(from decoder: Decoder) throws {
    let container = try decoder.container(keyedBy: CodingKeys.self)
    path = try container.decode(String.self, forKey: .path)
    status = try container.decode(CoreFileStatus.self, forKey: .status)
    stage = try container.decodeIfPresent(CoreFileStage.self, forKey: .stage) ?? .unstaged
  }

  private enum CodingKeys: String, CodingKey {
    case path, status, stage
  }
}

public enum CoreFileStatus: String, Decodable, Equatable, Sendable {
  case conflicted
  case deleted
  case added
  case modified
  case renamed
  case untracked
}

/// Staged, not staged, or both at once. The pair with `CoreFileStatus` is what
/// a row in the file pane is drawn from: the status says what happened and this
/// says whether git has been told about it yet.
public enum CoreFileStage: String, Decodable, Equatable, Sendable {
  case staged
  case unstaged
  case both
}

/// One file coloured, as the core read it.
///
/// `language` absent means nothing recognised the file: the lines are still
/// there and still drawn, in one colour. The view shows the name, so a reader
/// can tell "not recognised" from "nothing to colour".
public struct CoreHighlighted: Decodable, Equatable, Sendable {
  public let language: String?
  public let lines: [[CoreToken]]

  public init(language: String?, lines: [[CoreToken]]) {
    self.language = language
    self.lines = lines
  }
}

public struct CoreToken: Decodable, Equatable, Sendable {
  public let text: String
  public let kind: CoreTokenKind

  public init(text: String, kind: CoreTokenKind) {
    self.text = text
    self.kind = kind
  }

  public init(from decoder: Decoder) throws {
    let container = try decoder.container(keyedBy: CodingKeys.self)
    text = try container.decode(String.self, forKey: .text)
    // A kind a newer core invented is drawn as ordinary text rather than
    // failing the file it arrived in.
    kind = (try? container.decode(CoreTokenKind.self, forKey: .kind)) ?? .plain
  }

  private enum CodingKeys: String, CodingKey {
    case text, kind
  }
}

public enum CoreTokenKind: String, Decodable, Equatable, Sendable {
  case plain
  case comment
  case string
  case number
  case keyword
  case type
  case constant
  case function
  case key
  case punctuation
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
  /// A fenced block whose language was mermaid. Its own case because the shell
  /// draws it as a diagram rather than as source.
  case mermaid(text: String)
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
    case "mermaid":
      self = .mermaid(text: try container.decode(String.self, forKey: .text))
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
    case statuses, url, status, language, lines, shortcuts, matches
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
    case "git":
      self = .git(try container.decode(CoreGitStatus.self, forKey: .status))
    case "file":
      self = .file(text: try container.decode(String.self, forKey: .text))
    case "markdown":
      self = .markdown(try container.decode([CoreBlock].self, forKey: .blocks))
    case "highlighted":
      self = .highlighted(
        CoreHighlighted(
          language: try container.decodeIfPresent(String.self, forKey: .language),
          lines: try container.decode([[CoreToken]].self, forKey: .lines)))
    case "themes":
      self = .themes(try container.decode([CoreTheme].self, forKey: .themes))
    case "shortcuts":
      self = .shortcuts(try container.decode([CoreShortcut].self, forKey: .shortcuts))
    case "matches":
      self = .matches(try container.decode([CoreMatch].self, forKey: .matches))
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
