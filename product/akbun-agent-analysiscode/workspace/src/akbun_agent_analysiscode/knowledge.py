"""SQLite-backed knowledge store plus one markdown doc per service.

The relationship graph lives in a single SQLite file so it stays queryable
and atomic as the number of services grows. The per-service docs stay plain
markdown because the debug agent reads them with its file tools. SQL never
leaks out of this module: the public API speaks the graph dict.
"""

import sqlite3
from pathlib import Path

from .errors import KnowledgeError

DB_FILE = "knowledge.db"
SERVICES_DIR = "services"
GRAPH_VERSION = 1

_SCHEMA = """
CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS services (
  name TEXT PRIMARY KEY,
  path TEXT NOT NULL DEFAULT '',
  language TEXT NOT NULL DEFAULT '',
  summary TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS apis (
  service TEXT NOT NULL,
  method TEXT NOT NULL DEFAULT '',
  path TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS outbound_calls (
  service TEXT NOT NULL,
  target TEXT NOT NULL DEFAULT '',
  kind TEXT NOT NULL DEFAULT '',
  detail TEXT NOT NULL DEFAULT '',
  evidence TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS topics (
  service TEXT NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('produces', 'consumes')),
  topic TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS edges (
  src TEXT NOT NULL,
  dst TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT '',
  detail TEXT NOT NULL DEFAULT '',
  evidence TEXT NOT NULL DEFAULT '',
  resolved INTEGER NOT NULL DEFAULT 0
);
"""

_TABLES = ("meta", "services", "apis", "outbound_calls", "topics", "edges")


def empty_graph() -> dict:
  """Return a graph document with no services."""
  return {"version": GRAPH_VERSION, "learned_at": None, "services": {}, "edges": []}


class KnowledgeStore:
  """Reads and writes the knowledge directory for one MSA project."""

  def __init__(self, root: Path):
    self.root = root

  def db_path(self) -> Path:
    """Location of the SQLite file inside the knowledge directory."""
    return self.root / DB_FILE

  def load_graph(self) -> dict:
    """Load the graph, or an empty graph when nothing was learned yet."""
    if not self.db_path().is_file():
      return empty_graph()
    conn = sqlite3.connect(self.db_path())
    try:
      return _read_graph(conn)
    except sqlite3.DatabaseError as exc:
      raise KnowledgeError(f"cannot read knowledge db {self.db_path()}: {exc}") from exc
    finally:
      conn.close()

  def save_graph(self, graph: dict) -> None:
    """Replace the stored graph with the given one in a single transaction."""
    self.root.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(self.db_path())
    try:
      conn.executescript(_SCHEMA)
      with conn:
        for table in _TABLES:
          conn.execute(f"DELETE FROM {table}")
        _write_graph(conn, graph)
    except sqlite3.DatabaseError as exc:
      raise KnowledgeError(f"cannot write knowledge db {self.db_path()}: {exc}") from exc
    finally:
      conn.close()

  def write_service_doc(self, name: str, markdown: str) -> Path:
    """Write the per-service markdown document and return its path."""
    docs = self.root / SERVICES_DIR
    docs.mkdir(parents=True, exist_ok=True)
    path = docs / f"{name}.md"
    path.write_text(markdown.rstrip() + "\n", encoding="utf-8")
    return path


def graph_context(graph: dict) -> str:
  """Render the graph as compact text an agent can use as debugging context."""
  lines = ["Services:"]
  for name, svc in graph.get("services", {}).items():
    summary = svc.get("summary", "").strip()
    lines.append(f"- {name} ({svc.get('language', '?')}, source: {svc.get('path', '?')}): {summary}")
    for api in svc.get("apis", []):
      lines.append(f"  api: {api.get('method', '?')} {api.get('path', '?')} - {api.get('description', '')}")
  lines.append("")
  lines.append("Edges (who calls or listens to whom):")
  for edge in graph.get("edges", []):
    mark = "" if edge.get("resolved") else " [unresolved target]"
    evidence = f" (evidence: {edge['evidence']})" if edge.get("evidence") else ""
    lines.append(
      f"- {edge.get('from', '?')} -> {edge.get('to', '?')} [{edge.get('kind', '?')}]"
      f" {edge.get('detail', '')}{evidence}{mark}"
    )
  return "\n".join(lines)


def _read_graph(conn: sqlite3.Connection) -> dict:
  """Rebuild the graph dict from the relational tables."""
  graph = empty_graph()
  meta = dict(conn.execute("SELECT key, value FROM meta"))
  graph["version"] = int(meta.get("version", GRAPH_VERSION))
  graph["learned_at"] = meta.get("learned_at")

  rows = conn.execute("SELECT name, path, language, summary FROM services ORDER BY name")
  for name, path, language, summary in rows:
    graph["services"][name] = {
      "path": path,
      "language": language,
      "summary": summary,
      "apis": [],
      "outbound_calls": [],
      "produces": [],
      "consumes": [],
    }
  rows = conn.execute("SELECT service, method, path, description FROM apis")
  for service, method, path, description in rows:
    graph["services"][service]["apis"].append(
      {"method": method, "path": path, "description": description}
    )
  rows = conn.execute("SELECT service, target, kind, detail, evidence FROM outbound_calls")
  for service, target, kind, detail, evidence in rows:
    graph["services"][service]["outbound_calls"].append(
      {"target": target, "kind": kind, "detail": detail, "evidence": evidence}
    )
  for service, direction, topic in conn.execute("SELECT service, direction, topic FROM topics"):
    graph["services"][service][direction].append(topic)
  rows = conn.execute("SELECT src, dst, kind, detail, evidence, resolved FROM edges")
  for src, dst, kind, detail, evidence, resolved in rows:
    graph["edges"].append(
      {"from": src, "to": dst, "kind": kind, "detail": detail,
       "evidence": evidence, "resolved": bool(resolved)}
    )
  return graph


def _write_graph(conn: sqlite3.Connection, graph: dict) -> None:
  """Spread the graph dict over the relational tables."""
  conn.execute("INSERT INTO meta VALUES ('version', ?)", (str(graph.get("version", GRAPH_VERSION)),))
  if graph.get("learned_at"):
    conn.execute("INSERT INTO meta VALUES ('learned_at', ?)", (graph["learned_at"],))
  for name, svc in graph.get("services", {}).items():
    conn.execute(
      "INSERT INTO services VALUES (?, ?, ?, ?)",
      (name, svc.get("path", ""), svc.get("language", ""), svc.get("summary", "")),
    )
    for api in svc.get("apis", []):
      conn.execute(
        "INSERT INTO apis VALUES (?, ?, ?, ?)",
        (name, api.get("method", ""), api.get("path", ""), api.get("description", "")),
      )
    for call in svc.get("outbound_calls", []):
      conn.execute(
        "INSERT INTO outbound_calls VALUES (?, ?, ?, ?, ?)",
        (name, call.get("target", ""), call.get("kind", ""),
         call.get("detail", ""), call.get("evidence", "")),
      )
    for direction in ("produces", "consumes"):
      for topic in svc.get(direction, []):
        conn.execute("INSERT INTO topics VALUES (?, ?, ?)", (name, direction, topic))
  for edge in graph.get("edges", []):
    conn.execute(
      "INSERT INTO edges VALUES (?, ?, ?, ?, ?, ?)",
      (edge.get("from", ""), edge.get("to", ""), edge.get("kind", ""),
       edge.get("detail", ""), edge.get("evidence", ""), int(bool(edge.get("resolved")))),
    )
