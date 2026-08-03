"""chat: interactive debugging session over the learned knowledge."""

from pathlib import Path
from typing import Callable

from ..backends.base import AgentBackend
from ..config import AgentConfig, service_paths
from ..knowledge import KnowledgeStore, graph_context
from ..prompts import build_debug_system_prompt, next_prompt
from .ask import read_log

EXIT_WORDS = {"exit", "quit"}
HELP_TEXT = (
  "commands: /log <path> attaches a log file to your next message,\n"
  "          exit or quit ends the session"
)


def run_chat(
  config: AgentConfig,
  backend: AgentBackend,
  input_fn: Callable[[str], str] = input,
  echo: Callable[[str], None] = print,
) -> int:
  """Run a multi-turn session; resumes natively or replays the transcript."""
  store = KnowledgeStore(config.knowledge_dir)
  graph = store.load_graph()
  if not graph.get("services"):
    echo("no knowledge yet: run 'akbun-agent-k8s learn' first")
    return 1

  system_prompt = build_debug_system_prompt(graph_context(graph))
  echo(f"debugging chat via {backend.name} over {len(graph['services'])} services")
  echo(HELP_TEXT)

  history: list[tuple[str, str]] = []
  resume_id: str | None = None
  pending_log = ""

  while True:
    try:
      line = input_fn("you> ").strip()
    except (EOFError, KeyboardInterrupt):
      break
    if not line:
      continue
    if line.lower() in EXIT_WORDS:
      break
    if line.startswith("/log "):
      pending_log = _attach_log(line[5:].strip(), echo)
      continue

    message = f"{line}\n\n{pending_log}" if pending_log else line
    pending_log = ""
    run = backend.run(
      next_prompt(history, resume_id, message),
      workdir=config.knowledge_dir,
      system_prompt=system_prompt,
      readable_dirs=service_paths(config),
      resume_id=resume_id,
    )
    resume_id = run.session_id
    history.append(("user", message))
    history.append(("assistant", run.text))
    echo(run.text)

  return 0


def _attach_log(raw_path: str, echo: Callable[[str], None]) -> str:
  """Load a log file to be appended to the next message; empty on failure."""
  path = Path(raw_path).expanduser()
  if not path.is_file():
    echo(f"log file not found: {path}")
    return ""
  echo(f"attached {path}; it will be sent with your next message")
  return f"Attached log ({path.name}):\n```\n{read_log(path)}\n```"
