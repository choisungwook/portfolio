import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any


@dataclass(frozen=True)
class NetworkKnowledge:
  devices: dict[str, Any]
  context: dict[str, Any]
  examples: dict[str, Any]
  topology: dict[str, Any]
  templates: dict[str, Any]

  @classmethod
  def load(cls, data_dir: Path) -> "NetworkKnowledge":
    return cls(
      devices=_read_json(data_dir / "devices.json"),
      context=_read_json(data_dir / "network_context.json"),
      examples=_read_json(data_dir / "ai_examples.json"),
      topology=_read_json(data_dir / "topology.json"),
      templates=_read_json(data_dir / "templates.json"),
    )


def _read_json(path: Path) -> dict[str, Any]:
  with path.open(encoding="utf-8") as f:
    return json.load(f)
