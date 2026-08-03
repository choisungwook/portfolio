"""Load and validate the akbun-agent.toml project config."""

import tomllib
from dataclasses import dataclass, field
from pathlib import Path

from .errors import ConfigError

DEFAULT_CONFIG_NAME = "akbun-agent.toml"


@dataclass
class ServiceSource:
  """A local checkout of one microservice."""

  name: str
  path: Path
  description: str = ""


@dataclass
class AgentConfig:
  """Everything the CLI needs to know about one MSA project."""

  config_path: Path
  knowledge_dir: Path
  services: list[ServiceSource] = field(default_factory=list)
  provider: str = "claude"
  model: str | None = None


def load_config(path: Path) -> AgentConfig:
  """Parse a TOML config file; relative paths resolve against its directory."""
  if not path.is_file():
    raise ConfigError(f"config file not found: {path}")
  with path.open("rb") as fh:
    try:
      raw = tomllib.load(fh)
    except tomllib.TOMLDecodeError as exc:
      raise ConfigError(f"invalid TOML in {path}: {exc}") from exc

  base = path.parent
  services = _parse_services(raw.get("services", {}), base)
  if not services:
    raise ConfigError("config has no [services.<name>] entries")

  return AgentConfig(
    config_path=path,
    knowledge_dir=(base / raw.get("knowledge_dir", "knowledge")).resolve(),
    services=services,
    provider=raw.get("provider", "claude"),
    model=raw.get("model"),
  )


def service_paths(config: AgentConfig) -> tuple[Path, ...]:
  """Paths of every registered service, for backends that grant read access."""
  return tuple(service.path for service in config.services)


def _parse_services(raw: dict, base: Path) -> list[ServiceSource]:
  """Turn the [services.*] tables into ServiceSource entries."""
  services = []
  for name, table in raw.items():
    if not isinstance(table, dict) or "path" not in table:
      raise ConfigError(f"service '{name}' has no path")
    services.append(
      ServiceSource(
        name=name,
        path=(base / table["path"]).resolve(),
        description=table.get("description", ""),
      )
    )
  return services
