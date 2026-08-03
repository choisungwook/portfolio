"""ask: one-shot debugging question against the learned knowledge."""

from pathlib import Path
from typing import Callable

from ..backends.base import AgentBackend
from ..config import AgentConfig, service_paths
from ..errors import KnowledgeError
from ..knowledge import KnowledgeStore, graph_context
from ..prompts import build_ask_prompt, build_debug_system_prompt


def run_ask(
  config: AgentConfig,
  backend: AgentBackend,
  question: str,
  log_path: Path | None = None,
  echo: Callable[[str], None] = print,
) -> int:
  """Answer one question, optionally grounded in an attached log file."""
  store = KnowledgeStore(config.knowledge_dir)
  graph = store.load_graph()
  if not graph.get("services"):
    echo("no knowledge yet: run 'akbun-agent-k8s learn' first")
    return 1

  log_text = read_log(log_path) if log_path else None
  run = backend.run(
    build_ask_prompt(question, log_text, log_path.name if log_path else ""),
    workdir=config.knowledge_dir,
    system_prompt=build_debug_system_prompt(graph_context(graph)),
    readable_dirs=service_paths(config),
  )
  echo(run.text)
  return 0


def read_log(path: Path) -> str:
  """Read an attached log file, failing with a user-facing error."""
  try:
    return path.read_text(encoding="utf-8", errors="replace")
  except OSError as exc:
    raise KnowledgeError(f"cannot read log file {path}: {exc}") from exc
