"""learn: extract knowledge from every registered service into the graph."""

from datetime import datetime, timezone
from typing import Callable

from ..backends.base import AgentBackend
from ..config import AgentConfig
from ..errors import BackendError, ResponseParseError
from ..knowledge import KnowledgeStore, empty_graph
from ..linker import build_edges
from ..prompts import build_learn_prompt, extract_json


def run_learn(config: AgentConfig, backend: AgentBackend, echo: Callable[[str], None] = print) -> int:
  """Learn every service, link the graph, and write the knowledge directory."""
  store = KnowledgeStore(config.knowledge_dir)
  learned: dict[str, dict] = {}
  failures = 0

  for service in config.services:
    if not service.path.is_dir():
      echo(f"[skip] {service.name}: path not found: {service.path}")
      failures += 1
      continue
    echo(f"[learn] {service.name} ({service.path}) via {backend.name}")
    try:
      data = _learn_one(backend, service.name, service.description, service.path)
    except (BackendError, ResponseParseError) as exc:
      echo(f"[fail] {service.name}: {exc}")
      failures += 1
      continue
    doc = data.pop("doc", "") or _fallback_doc(service.name, data)
    data["path"] = str(service.path)
    learned[service.name] = data
    store.write_service_doc(service.name, doc)
    echo(
      f"[done] {service.name}: {len(data.get('apis', []))} apis, "
      f"{len(data.get('outbound_calls', []))} outbound calls"
    )

  if not learned:
    echo("nothing learned: every service was skipped or failed")
    return 1

  graph = empty_graph()
  graph["services"] = learned
  graph["edges"] = build_edges(learned)
  graph["learned_at"] = datetime.now(timezone.utc).isoformat(timespec="seconds")
  store.save_graph(graph)
  echo(f"[graph] {len(learned)} services, {len(graph['edges'])} edges -> {store.graph_path()}")
  return 1 if failures else 0


def _learn_one(backend: AgentBackend, name: str, description: str, path) -> dict:
  """Run one learn prompt inside the service checkout and parse the JSON."""
  run = backend.run(build_learn_prompt(name, description), workdir=path)
  return extract_json(run.text)


def _fallback_doc(name: str, data: dict) -> str:
  """Minimal service doc when the backend returned no 'doc' field."""
  return f"# {name}\n\n{data.get('summary', 'No summary extracted.')}"
