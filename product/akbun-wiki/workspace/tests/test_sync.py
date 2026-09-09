"""Change parsing, raw mirror writes, and paged sync with a fake reader."""
import json

import httpx
import pytest

from akbun_wiki.config import Config, ConfigError, load_config
from akbun_wiki.errors import ReaderError
from akbun_wiki.index_store import IndexStore
from akbun_wiki.raw_store import apply_change, raw_path, render_document
from akbun_wiki.reader_client import ReaderClient, parse_change
from akbun_wiki.sync import sync_reader

ROW = {"seq": 1, "document_id": "doc-1", "id": "doc-1", "normalized_url": "https://example.com/a", "title": "제목 \"인용\"",
       "body": "본문", "tags": ["kubernetes"], "location": "inbox", "created_at": "2026-09-09T00:00:00Z", "version": 1}


def fake_reader(config: Config, rows: list[dict], seen: list[int]) -> ReaderClient:
  """Reader client whose transport pages a fixed change list ten at a time."""
  def handle(request: httpx.Request) -> httpx.Response:
    assert request.headers["authorization"] == f"Bearer {config.reader_token}"
    after = int(request.url.params["after"])
    seen.append(after)
    page = [row for row in rows if row["seq"] > after][:10]
    nxt = page[-1]["seq"] if page else after
    return httpx.Response(200, json={"changes": page, "next": nxt, "has_more": len(page) == 10})
  return ReaderClient(config, httpx.Client(transport=httpx.MockTransport(handle)))


def test_parse_change_marks_deletions_and_rejects_bad_rows():
  change = parse_change(ROW)
  assert change.deleted is False and change.tags == ["kubernetes"]
  assert parse_change({"seq": 2, "document_id": "doc-1", "id": None}).deleted is True
  with pytest.raises(ReaderError):
    parse_change({"document_id": "x"})


def test_render_document_keeps_metadata_in_frontmatter():
  text = render_document(parse_change(ROW))
  assert text.startswith("---\ntitle: \"제목 \\\"인용\\\"\"\nurl: \"https://example.com/a\"\ntags: [\"kubernetes\"]\n")
  assert "reader_id: doc-1" in text and text.endswith("# 제목 \"인용\"\n\n본문\n")


def test_apply_change_writes_once_and_deletes(config: Config):
  change = parse_change(ROW)
  assert apply_change(config.raw_dir, change) is True
  assert apply_change(config.raw_dir, change) is False
  assert apply_change(config.raw_dir, parse_change({**ROW, "seq": 2, "id": None})) is True
  assert not raw_path(config.raw_dir, "doc-1").exists()
  assert apply_change(config.raw_dir, parse_change({**ROW, "seq": 3, "id": None})) is False


def test_sync_pages_and_resumes_from_stored_seq(config: Config, store: IndexStore):
  rows = [{**ROW, "seq": n, "document_id": f"doc-{n}", "id": f"doc-{n}", "normalized_url": f"https://example.com/{n}"} for n in range(1, 24)]
  seen: list[int] = []
  result = sync_reader(config, store, fake_reader(config, rows, seen))
  assert (result.applied, result.changed_files, result.last_seq) == (23, 23, 23)
  assert seen == [0, 10, 20]
  assert len(list(config.raw_dir.glob("*.md"))) == 23
  rows.append({**ROW, "seq": 24, "document_id": "doc-3", "id": None})
  seen.clear()
  again = sync_reader(config, store, fake_reader(config, rows, seen))
  assert seen == [23] and again.applied == 1 and again.changed_files == 1
  assert not raw_path(config.raw_dir, "doc-3").exists()
  assert store.get_state("reader_seq") == "24"


def test_reader_errors_stop_before_state_advances(config: Config, store: IndexStore):
  client = ReaderClient(config, httpx.Client(transport=httpx.MockTransport(lambda _: httpx.Response(401, json={"error": "x"}))))
  with pytest.raises(ReaderError):
    sync_reader(config, store, client)
  assert store.get_state("reader_seq", "0") == "0"


def test_load_config_validates_reader_settings(tmp_path):
  env = {"WIKI_DATA_DIR": str(tmp_path / "d"), "READER_URL": "https://reader.example/", "READER_TOKEN": "a" * 64, "GRAPHIFY_BACKEND": ""}
  config = load_config(env)
  assert config.reader_url == "https://reader.example" and config.graphify_backend is None
  assert config.wiki_dir == tmp_path / "d" / "raw" / "graphify-out" / "wiki"
  assert load_config({**env, "READER_URL": "http://127.0.0.1:8787/"}).reader_url == "http://127.0.0.1:8787"
  for url in ("http://reader.example", "http://127.0.0.1.evil.example", "https://user:pw@reader.example",
              "https://reader.example/api", "https://reader.example/?x=1", "https://", "reader.example"):
    with pytest.raises(ConfigError):
      load_config({**env, "READER_URL": url})
  with pytest.raises(ConfigError):
    load_config({**env, "READER_TOKEN": "short"})
