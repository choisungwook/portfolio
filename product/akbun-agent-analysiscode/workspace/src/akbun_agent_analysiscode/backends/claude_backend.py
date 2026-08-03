"""Claude backend on the Claude Agent SDK.

Auth is ANTHROPIC_API_KEY; Anthropic does not allow claude.ai subscription login
for apps built on the Agent SDK. The pip package bundles the Claude Code binary,
so no separate npm install is needed.
"""

import asyncio
from pathlib import Path

from ..errors import BackendError
from .base import AgentRun

READ_ONLY_TOOLS = ["Read", "Glob", "Grep"]


class ClaudeBackend:
  """Runs prompts through the Claude Agent SDK with read-only file tools.

  allowed_tools auto-approves the read-only tools and permission_mode
  "dontAsk" denies everything else without prompting, so a run can never
  hang on a permission prompt and can never write or execute anything.
  """

  name = "claude"

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
    sdk = _load_sdk()
    options = sdk.ClaudeAgentOptions(
      cwd=str(workdir),
      add_dirs=[str(d) for d in readable_dirs],
      allowed_tools=READ_ONLY_TOOLS,
      permission_mode="dontAsk",
      setting_sources=[],
      system_prompt=system_prompt,
      model=self.model,
      resume=resume_id,
    )
    return asyncio.run(_collect(sdk, prompt, options))


def _load_sdk():
  """Import claude_agent_sdk lazily so other providers work without it."""
  try:
    import claude_agent_sdk
  except ImportError as exc:
    raise BackendError(
      "claude-agent-sdk is not installed; run 'uv sync' in workspace/"
    ) from exc
  return claude_agent_sdk


async def _collect(sdk, prompt: str, options) -> AgentRun:
  """Drain the SDK message stream and keep the final result text."""
  chunks: list[str] = []
  session_id = None
  async for message in sdk.query(prompt=prompt, options=options):
    if isinstance(message, sdk.AssistantMessage):
      for block in message.content:
        if isinstance(block, sdk.TextBlock):
          chunks.append(block.text)
    elif isinstance(message, sdk.ResultMessage):
      session_id = message.session_id
      if message.subtype == "success" and message.result:
        return AgentRun(text=message.result, session_id=session_id)
      if message.subtype != "success":
        raise BackendError(f"claude backend stopped: {message.subtype}")
  if not chunks:
    raise BackendError("claude backend returned no text")
  return AgentRun(text="".join(chunks), session_id=session_id)
