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
  case spawn(cwd: String, cols: UInt16, rows: UInt16)
  case write(session: UInt32, bytes: [UInt8])
  case resize(session: UInt32, cols: UInt16, rows: UInt16)
  case close(session: UInt32)
  case loadState(directory: String)
  case createProject(name: String, path: String?)
  case createWorkspace(project: UInt64, name: String)

  private enum Key: String, CodingKey {
    case type, cwd, cols, rows, session, bytes, directory, name, path, project
  }

  public func encode(to encoder: Encoder) throws {
    var container = encoder.container(keyedBy: Key.self)
    switch self {
    case .hello:
      try container.encode("hello", forKey: .type)
    case .spawn(let cwd, let cols, let rows):
      try container.encode("spawn", forKey: .type)
      try container.encode(cwd, forKey: .cwd)
      try container.encode(cols, forKey: .cols)
      try container.encode(rows, forKey: .rows)
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
  case error(message: String)
}

public struct CoreTreeState: Decodable, Equatable, Sendable {
  public let schemaVersion: UInt32
  public let projects: [CoreProject]

  private enum CodingKeys: String, CodingKey {
    case schemaVersion = "schema_version"
    case projects
  }
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
    case type, `protocol`, session, state, message
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
