"""File-based knowledge store: one JSON graph plus one markdown doc per service."""

import json
from pathlib import Path

from .errors import KnowledgeError

GRAPH_FILE = "graph.json"
SERVICES_DIR = "services"
GRAPH_VERSION = 1


def empty_graph() -> dict:
  """Return a new graph document with no services."""
  return {"version": GRAPH_VERSION, "learned_at": None, "services": {}, "edges": []}


class KnowledgeStore:
  """Reads and writes the knowledge directory for one MSA project."""

  def __init__(self, root: Path):
    self.root = root

  def graph_path(self) -> Path:
    """Location of the graph file inside the knowledge directory."""
    return self.root / GRAPH_FILE

  def load_graph(self) -> dict:
    """Load graph.json, or an empty graph when nothing was learned yet."""
    path = self.graph_path()
    if not path.is_file():
      return empty_graph()
    try:
      return json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
      raise KnowledgeError(f"corrupt graph file {path}: {exc}") from exc

  def save_graph(self, graph: dict) -> None:
    """Write the graph document, creating the knowledge directory if needed."""
    self.root.mkdir(parents=True, exist_ok=True)
    text = json.dumps(graph, indent=2, ensure_ascii=False)
    self.graph_path().write_text(text + "\n", encoding="utf-8")

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
