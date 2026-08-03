"""Backend registry: map a provider name to an agent runner."""

from ..errors import ConfigError
from .base import AgentBackend

PROVIDERS = ("claude", "codex")


def get_backend(provider: str, model: str | None = None) -> AgentBackend:
  """Instantiate the backend for a provider name from config or --provider."""
  if provider == "claude":
    from .claude_backend import ClaudeBackend

    return ClaudeBackend(model=model)
  if provider == "codex":
    from .codex_backend import CodexBackend

    return CodexBackend(model=model)
  raise ConfigError(f"unknown provider '{provider}', expected one of {', '.join(PROVIDERS)}")
