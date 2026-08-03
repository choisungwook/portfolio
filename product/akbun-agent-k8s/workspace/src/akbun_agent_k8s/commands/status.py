"""status: show what is registered, what was learned, and when."""

from typing import Callable

from ..config import AgentConfig
from ..knowledge import KnowledgeStore


def run_status(config: AgentConfig, echo: Callable[[str], None] = print) -> int:
  """Print config and knowledge freshness without calling any backend."""
  store = KnowledgeStore(config.knowledge_dir)
  graph = store.load_graph()
  learned = graph.get("services", {})

  echo(f"config: {config.config_path}")
  echo(f"provider: {config.provider}" + (f" (model {config.model})" if config.model else ""))
  echo(f"knowledge: {config.knowledge_dir}")
  echo(f"learned_at: {graph.get('learned_at') or 'never'}")
  echo(f"edges: {len(graph.get('edges', []))}")
  echo("services:")
  for service in config.services:
    state = "learned" if service.name in learned else "not learned"
    missing = "" if service.path.is_dir() else " [path missing]"
    echo(f"- {service.name}: {state}{missing} ({service.path})")
  return 0
