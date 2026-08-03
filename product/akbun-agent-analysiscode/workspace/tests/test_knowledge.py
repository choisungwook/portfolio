"""Knowledge store round trips and context rendering."""

import pytest

from akbun_agent_analysiscode.errors import KnowledgeError
from akbun_agent_analysiscode.knowledge import KnowledgeStore, empty_graph, graph_context


def full_graph() -> dict:
  """A graph exercising every table: services, apis, calls, topics, edges."""
  graph = empty_graph()
  graph["learned_at"] = "2026-08-03T09:00:00+00:00"
  graph["services"]["order"] = {
    "path": "/src/order",
    "language": "python",
    "summary": "takes orders",
    "apis": [{"method": "POST", "path": "/orders", "description": "create"}],
    "outbound_calls": [
      {"target": "PAYMENT_SERVICE_URL", "kind": "http", "detail": "charge", "evidence": "clients.py:12"}
    ],
    "produces": ["order.completed"],
    "consumes": [],
  }
  graph["services"]["payment"] = {
    "path": "/src/payment",
    "language": "javascript",
    "summary": "charges cards",
    "apis": [],
    "outbound_calls": [],
    "produces": [],
    "consumes": ["order.completed"],
  }
  graph["edges"] = [
    {"from": "order", "to": "payment", "kind": "http", "detail": "charge",
     "evidence": "clients.py:12", "resolved": True}
  ]
  return graph


def test_load_missing_db_is_empty(tmp_path):
  store = KnowledgeStore(tmp_path / "kb")
  graph = store.load_graph()
  assert graph["services"] == {}
  assert graph["edges"] == []
  assert graph["learned_at"] is None


def test_save_and_load_roundtrip(tmp_path):
  store = KnowledgeStore(tmp_path / "kb")
  graph = full_graph()
  store.save_graph(graph)
  assert store.load_graph() == graph
  assert store.db_path().is_file()


def test_save_replaces_previous_graph(tmp_path):
  store = KnowledgeStore(tmp_path / "kb")
  store.save_graph(full_graph())

  smaller = empty_graph()
  smaller["services"]["inventory"] = {
    "path": "", "language": "python", "summary": "stock",
    "apis": [], "outbound_calls": [], "produces": [], "consumes": [],
  }
  store.save_graph(smaller)

  loaded = store.load_graph()
  assert set(loaded["services"]) == {"inventory"}
  assert loaded["edges"] == []


def test_corrupt_db_raises(tmp_path):
  root = tmp_path / "kb"
  root.mkdir()
  (root / "knowledge.db").write_text("this is not a sqlite file", encoding="utf-8")
  with pytest.raises(KnowledgeError, match="cannot read"):
    KnowledgeStore(root).load_graph()


def test_write_service_doc(tmp_path):
  store = KnowledgeStore(tmp_path / "kb")
  path = store.write_service_doc("order", "# order\n\nDoc body")
  assert path == tmp_path / "kb" / "services" / "order.md"
  assert path.read_text(encoding="utf-8") == "# order\n\nDoc body\n"


def test_graph_context_lists_services_apis_and_edges():
  graph = empty_graph()
  graph["services"] = {
    "order": {
      "language": "python",
      "path": "/src/order",
      "summary": "takes orders",
      "apis": [{"method": "POST", "path": "/orders", "description": "create"}],
    }
  }
  graph["edges"] = [
    {"from": "order", "to": "payment", "kind": "http", "detail": "charge",
     "evidence": "clients.py:10", "resolved": True},
    {"from": "order", "to": "stripe", "kind": "http", "detail": "psp",
     "evidence": "", "resolved": False},
  ]
  context = graph_context(graph)
  assert "order (python, source: /src/order): takes orders" in context
  assert "POST /orders" in context
  assert "order -> payment [http] charge (evidence: clients.py:10)" in context
  assert "[unresolved target]" in context
