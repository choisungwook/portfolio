"""Backend-neutral contract every agent runner implements."""

from dataclasses import dataclass
from pathlib import Path
from typing import Protocol


@dataclass
class AgentRun:
  """One completed backend invocation.

  session_id is set by backends with native session resume (claude); backends
  without it (codex) return None and the chat command replays the transcript.
  """

  text: str
  session_id: str | None = None


class AgentBackend(Protocol):
  """An agent that can explore files under workdir and answer a prompt."""

  name: str

  def run(
    self,
    prompt: str,
    *,
    workdir: Path,
    system_prompt: str | None = None,
    readable_dirs: tuple[Path, ...] = (),
    resume_id: str | None = None,
  ) -> AgentRun:
    """Run one prompt to completion and return the final answer text."""
    ...
