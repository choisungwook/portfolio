"""Run graphify over the raw mirror and index the wiki it writes.

graphify is an external command: extraction of markdown needs an LLM
backend that graphify picks from the API key in the environment, or from
GRAPHIFY_BACKEND. The wiki lands in <raw>/graphify-out/wiki/.
"""
import subprocess
from pathlib import Path
from typing import Callable

from .config import Config
from .errors import BuildError
from .index_store import Article, IndexStore, now

Runner = Callable[[list[str]], subprocess.CompletedProcess]


def default_runner(command: list[str]) -> subprocess.CompletedProcess:
  """Run a command, capturing output for error reporting."""
  return subprocess.run(command, capture_output=True, text=True, check=False)


def extract_command(config: Config) -> list[str]:
  """graphify extract over the raw directory."""
  command = [config.graphify_command, "extract", str(config.raw_dir)]
  if config.graphify_backend:
    command += ["--backend", config.graphify_backend]
  return command


def export_command(config: Config) -> list[str]:
  """graphify export wiki next to the graph it just wrote."""
  return [config.graphify_command, "export", "wiki", "--graph", str(config.graphify_out / "graph.json")]


def run_or_raise(run: Runner, command: list[str]) -> None:
  """Run one graphify step and turn a non-zero exit into BuildError."""
  try:
    result = run(command)
  except FileNotFoundError as error:
    raise BuildError(f"{command[0]} not found; install graphify with uv tool install graphifyy") from error
  if result.returncode != 0:
    raise BuildError(f"{' '.join(command[:3])} failed: {result.stderr.strip()[-2000:]}")


def article_title(path: Path) -> str:
  """First H1 of a markdown file, or the file stem."""
  for line in path.read_text(encoding="utf-8").splitlines():
    if line.startswith("# "):
      return line[2:].strip()
  return path.stem


def read_articles(wiki_dir: Path) -> list[Article]:
  """Load every markdown file of the generated wiki."""
  if not wiki_dir.is_dir():
    raise BuildError(f"graphify wrote no wiki at {wiki_dir}")
  stamp = now()
  return [Article(slug=path.stem, title=article_title(path), body=path.read_text(encoding="utf-8"), updated_at=stamp)
          for path in sorted(wiki_dir.glob("*.md"))]


def build_wiki(config: Config, store: IndexStore, run: Runner = default_runner) -> int:
  """Extract, export, and index. Returns the number of indexed articles."""
  config.raw_dir.mkdir(parents=True, exist_ok=True)
  run_or_raise(run, extract_command(config))
  run_or_raise(run, export_command(config))
  articles = read_articles(config.wiki_dir)
  store.replace_articles(articles)
  store.set_state("built_at", now())
  store.set_state("article_count", str(len(articles)))
  return len(articles)
