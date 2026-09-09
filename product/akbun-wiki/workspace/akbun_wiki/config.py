"""Settings read from environment variables.

Every path is derived from WIKI_DATA_DIR so one directory holds the raw
mirror, the graphify output, and the SQLite index.
"""
import os
from dataclasses import dataclass
from pathlib import Path

from .errors import ConfigError

READER_TOKEN_PATTERN = 64


@dataclass(frozen=True)
class Config:
  """Resolved settings for one process."""

  data_dir: Path
  reader_url: str
  reader_token: str
  graphify_command: str
  graphify_backend: str | None

  @property
  def raw_dir(self) -> Path:
    """Directory of one markdown file per reader document."""
    return self.data_dir / "raw"

  @property
  def graphify_out(self) -> Path:
    """Directory graphify writes graph.json and wiki/ into."""
    return self.raw_dir / "graphify-out"

  @property
  def wiki_dir(self) -> Path:
    """Directory of generated wiki articles."""
    return self.graphify_out / "wiki"

  @property
  def database(self) -> Path:
    """SQLite file for sync state, API keys, and the article index."""
    return self.data_dir / "wiki.db"


def load_config(env: dict[str, str] | None = None) -> Config:
  """Build a Config from the environment.

  Args:
    env: mapping to read instead of os.environ, used by tests.

  Returns:
    Config with the data directory created.

  Raises:
    ConfigError: when READER_URL or READER_TOKEN is missing or malformed.
  """
  values = os.environ if env is None else env
  reader_url = values.get("READER_URL", "").rstrip("/")
  reader_token = values.get("READER_TOKEN", "")
  validate_reader_settings(reader_url, reader_token)
  config = Config(
    data_dir=Path(values.get("WIKI_DATA_DIR", "data")).resolve(),
    reader_url=reader_url,
    reader_token=reader_token,
    graphify_command=values.get("GRAPHIFY_COMMAND", "graphify"),
    graphify_backend=values.get("GRAPHIFY_BACKEND") or None,
  )
  config.data_dir.mkdir(parents=True, exist_ok=True)
  return config


def validate_reader_settings(reader_url: str, reader_token: str) -> None:
  """Reject settings that would send the token somewhere unintended."""
  local = reader_url.startswith("http://127.0.0.1")
  if not (reader_url.startswith("https://") or local):
    raise ConfigError("READER_URL must be an https origin (http://127.0.0.1 is allowed for local tests)")
  if len(reader_token) != READER_TOKEN_PATTERN or not all(c in "0123456789abcdef" for c in reader_token):
    raise ConfigError("READER_TOKEN must be the 64 hex characters shown once by the reader settings page")


def local_config(data_dir: Path, reader_url: str = "http://127.0.0.1:1") -> Config:
  """Config for tests and one-off scripts that never call the reader."""
  data_dir.mkdir(parents=True, exist_ok=True)
  return Config(data_dir=data_dir, reader_url=reader_url, reader_token="0" * READER_TOKEN_PATTERN,
                graphify_command="graphify", graphify_backend=None)
