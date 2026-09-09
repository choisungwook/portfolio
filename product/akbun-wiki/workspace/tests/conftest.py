"""Shared fixtures: a config in a temp directory and a fake graphify."""
import subprocess
from pathlib import Path

import pytest

from akbun_wiki.config import Config, local_config
from akbun_wiki.index_store import IndexStore


@pytest.fixture
def config(tmp_path: Path) -> Config:
  """Config whose data directory is disposable."""
  return local_config(tmp_path / "data")


@pytest.fixture
def store(config: Config) -> IndexStore:
  """Open index bound to the temp config."""
  index = IndexStore(config.database)
  yield index
  index.close()


def fake_graphify(config: Config):
  """Runner that writes a wiki derived from the raw files instead of calling graphify."""
  calls: list[list[str]] = []

  def run(command: list[str]) -> subprocess.CompletedProcess:
    calls.append(command)
    if command[1] == "export":
      config.wiki_dir.mkdir(parents=True, exist_ok=True)
      titles = [path.read_text(encoding="utf-8").split("\n# ", 1)[1].split("\n", 1)[0] for path in sorted(config.raw_dir.glob("*.md"))]
      (config.wiki_dir / "index.md").write_text("# Index\n\n" + "\n".join(f"- {t}" for t in titles), encoding="utf-8")
      for number, title in enumerate(titles):
        (config.wiki_dir / f"community-{number}.md").write_text(f"# {title}\n\nAbout {title}.\n", encoding="utf-8")
    return subprocess.CompletedProcess(command, 0, "", "")

  run.calls = calls
  return run
