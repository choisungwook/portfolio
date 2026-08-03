"""OpenAI backend that shells out to the codex CLI, reusing its OAuth login."""

import subprocess
import tempfile
from pathlib import Path

from ..errors import BackendError
from .base import AgentRun

RESULT_FILE = "last-message.md"


class CodexBackend:
  """Runs prompts through 'codex exec' in a read-only sandbox.

  codex exec has no session resume we can target reliably, so session_id is
  always None and the chat command replays the transcript each turn.
  """

  name = "codex"

  def __init__(self, model: str | None = None):
    self.model = model

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
    del readable_dirs, resume_id  # read-only sandbox can read outside workdir
    full_prompt = f"{system_prompt}\n\n{prompt}" if system_prompt else prompt
    with tempfile.TemporaryDirectory(prefix="akbun-agent-codex-") as tmp:
      out_path = Path(tmp) / RESULT_FILE
      proc = _run_codex(self._command(workdir, out_path, full_prompt))
      if proc.returncode != 0:
        raise BackendError(
          f"codex exec failed ({proc.returncode}): {proc.stderr.strip()[-2000:]}"
        )
      text = out_path.read_text(encoding="utf-8").strip() if out_path.is_file() else ""
    if not text:
      text = proc.stdout.strip()
    if not text:
      raise BackendError("codex backend returned no text")
    return AgentRun(text=text, session_id=None)

  def _command(self, workdir: Path, out_path: Path, prompt: str) -> list[str]:
    """Assemble the codex exec invocation."""
    cmd = [
      "codex",
      "exec",
      "--sandbox",
      "read-only",
      "--cd",
      str(workdir),
      "--skip-git-repo-check",
      "--output-last-message",
      str(out_path),
    ]
    if self.model:
      cmd += ["--model", self.model]
    cmd.append(prompt)
    return cmd


def _run_codex(cmd: list[str]) -> subprocess.CompletedProcess:
  """Invoke the codex CLI, translating a missing binary into a clear error."""
  try:
    return subprocess.run(cmd, capture_output=True, text=True)
  except FileNotFoundError as exc:
    raise BackendError(
      "codex CLI not found; install it and authenticate with 'codex login'"
    ) from exc
