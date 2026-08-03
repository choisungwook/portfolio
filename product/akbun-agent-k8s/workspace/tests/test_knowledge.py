"""Knowledge store round trips and context rendering."""

import pytest

from akbun_agent_k8s.errors import KnowledgeError
from akbun_agent_k8s.knowledge import KnowledgeStore, empty_graph, graph_context


def test_load_missing_graph_is_empty(tmp_path):
  store = KnowledgeStore(tmp_path / "kb")
  graph = store.load_graph()
  assert graph["services"] == {}
  assert graph["edges"] == []


def test_save_and_load_roundtrip(tmp_path):
  store = KnowledgeStore(tmp_path / "kb")
  graph = empty_graph()
  graph["services"]["order"] = {"summary": "takes orders"}
  store.save_graph(graph)
  assert store.load_graph() == graph


def test_corrupt_graph_raises(tmp_path):
  root = tmp_path / "kb"
  root.mkdir()
  (root / "graph.json").write_text("{oops", encoding="utf-8")
  with pytest.raises(KnowledgeError, match="corrupt"):
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
