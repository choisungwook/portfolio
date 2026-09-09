"""Authentication, article routes, and the admin sync route."""
import httpx
from fastapi.testclient import TestClient

from akbun_wiki.api import create_app
from akbun_wiki.config import Config
from akbun_wiki.index_store import IndexStore
from tests.conftest import fake_graphify
from tests.test_sync import ROW, fake_reader


def make_client(config: Config, store: IndexStore, rows: list[dict]) -> tuple[TestClient, str, str]:
  """App with a fake reader and fake graphify plus one read and one admin key."""
  app = create_app(config, run=fake_graphify(config), client=fake_reader(config, rows, []))
  _, read_key = store.create_key("llm", "read")
  _, admin_key = store.create_key("cron", "admin")
  return TestClient(app), read_key, admin_key


def test_routes_require_a_valid_key(config: Config, store: IndexStore):
  client, read_key, _ = make_client(config, store, [])
  assert client.get("/health").status_code == 200
  for headers in ({}, {"authorization": "Bearer " + "f" * 64}, {"authorization": "Bearer short"}):
    response = client.get("/api/articles", headers=headers)
    assert response.status_code == 401 and response.headers["cache-control"] == "no-store"
  key_id = next(key.id for key in store.list_keys() if key.name == "llm")
  assert store.revoke_key(key_id) is True and store.revoke_key(key_id) is False
  assert client.get("/api/articles", headers={"authorization": f"Bearer {read_key}"}).status_code == 401


def test_sync_is_admin_only_and_serves_articles(config: Config, store: IndexStore):
  rows = [ROW, {**ROW, "seq": 2, "document_id": "doc-2", "id": "doc-2", "normalized_url": "https://example.com/b", "title": "Karpenter drift"}]
  client, read_key, admin_key = make_client(config, store, rows)
  read = {"authorization": f"Bearer {read_key}"}
  admin = {"authorization": f"Bearer {admin_key}"}
  assert client.post("/api/sync", headers=read).status_code == 403
  assert client.get("/api/status", headers=read).json() == {"reader_seq": 0, "synced_at": None, "built_at": None, "article_count": 0}
  synced = client.post("/api/sync", headers=admin)
  assert synced.status_code == 200 and synced.json() == {"applied": 2, "changed_files": 2, "reader_seq": 2, "articles": 3}
  assert client.post("/api/sync", headers=admin).json()["articles"] == 0
  listed = client.get("/api/articles", headers=read).json()["articles"]
  assert [a["slug"] for a in listed] == ["community-0", "community-1", "index"] and "body" not in listed[0]
  article = client.get("/api/articles/community-1", headers=read).json()
  assert article["title"] == "Karpenter drift" and article["body"].startswith("# Karpenter drift")
  assert client.get("/api/articles/missing", headers=read).status_code == 404
  found = client.get("/api/search", params={"q": "karpenter"}, headers=read).json()["results"]
  assert found[0]["slug"] == "community-1" and "[Karpenter]" in found[0]["snippet"]
  invalid = client.get("/api/search", params={"q": ""}, headers=read)
  assert invalid.status_code == 400 and invalid.headers["cache-control"] == "no-store"
  assert invalid.json() == {"error": "잘못된 요청입니다: query.q"}
  assert client.get("/api/status", headers=read).json()["article_count"] == 3


def test_sync_reports_reader_failures(config: Config, store: IndexStore):
  broken = httpx.Client(transport=httpx.MockTransport(lambda _: httpx.Response(500)))
  from akbun_wiki.reader_client import ReaderClient
  app = create_app(config, run=fake_graphify(config), client=ReaderClient(config, broken))
  _, admin_key = store.create_key("cron", "admin")
  response = TestClient(app).post("/api/sync", headers={"authorization": f"Bearer {admin_key}"})
  assert response.status_code == 502 and "500" in response.json()["error"]
