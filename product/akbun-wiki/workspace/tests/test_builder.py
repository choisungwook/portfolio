"""graphify invocation and wiki indexing with a fake runner."""
import subprocess

import pytest

from akbun_wiki.builder import build_wiki, export_command, extract_command
from akbun_wiki.config import Config
from akbun_wiki.errors import BuildError
from akbun_wiki.index_store import IndexStore
from akbun_wiki.raw_store import apply_change
from akbun_wiki.reader_client import parse_change
from tests.conftest import fake_graphify
from tests.test_sync import ROW


def test_commands_target_raw_dir_and_backend(config: Config):
  assert extract_command(config) == ["graphify", "extract", str(config.raw_dir)]
  with_backend = Config(**{**config.__dict__, "graphify_backend": "claude"})
  assert extract_command(with_backend)[-2:] == ["--backend", "claude"]
  assert export_command(config) == ["graphify", "export", "wiki", "--graph", str(config.graphify_out / "graph.json")]


def test_build_indexes_articles_and_search(config: Config, store: IndexStore):
  apply_change(config.raw_dir, parse_change(ROW))
  apply_change(config.raw_dir, parse_change({**ROW, "seq": 2, "document_id": "doc-2", "id": "doc-2", "title": "Karpenter drift"}))
  run = fake_graphify(config)
  assert build_wiki(config, store, run) == 3
  assert [call[1] for call in run.calls] == ["extract", "export"]
  assert [a.slug for a in store.list_articles()] == ["community-0", "community-1", "index"]
  assert store.get_article("index").title == "Index"
  assert [slug for slug, _, _ in store.search("karpenter")] == ["community-1", "index"]
  assert store.search('"') == []
  assert store.get_state("article_count") == "3"


def test_build_reports_graphify_failures(config: Config, store: IndexStore):
  def failing(command):
    return subprocess.CompletedProcess(command, 1, "", "no API key configured")
  with pytest.raises(BuildError, match="no API key"):
    build_wiki(config, store, failing)

  def missing(command):
    raise FileNotFoundError(command[0])
  with pytest.raises(BuildError, match="install graphify"):
    build_wiki(config, store, missing)

  def silent(command):
    return subprocess.CompletedProcess(command, 0, "", "")
  with pytest.raises(BuildError, match="wrote no wiki"):
    build_wiki(config, store, silent)
