"""The learn command end to end with a fake backend."""

import json

from conftest import FakeBackend

from akbun_agent_k8s.commands.learn import run_learn
from akbun_agent_k8s.config import ServiceSource
from akbun_agent_k8s.knowledge import KnowledgeStore

ORDER_ANSWER = json.dumps(
  {
    "language": "python",
    "summary": "Takes orders and charges them.",
    "apis": [{"method": "POST", "path": "/orders", "description": "create order"}],
    "outbound_calls": [
      {"target": "PAYMENT_SERVICE_URL", "kind": "http", "detail": "charge", "evidence": "clients.py:12"}
    ],
    "produces": ["order.completed"],
    "consumes": [],
    "doc": "# order\n\nOrder intake service.",
  }
)

PAYMENT_ANSWER = json.dumps(
  {
    "language": "javascript",
    "summary": "Captures payments.",
    "apis": [{"method": "POST", "path": "/payments", "description": "capture"}],
    "outbound_calls": [],
    "produces": [],
    "consumes": [],
    "doc": "# payment\n\nPayment capture service.",
  }
)


def test_learn_writes_graph_docs_and_edges(two_service_config):
  backend = FakeBackend({"order": ORDER_ANSWER, "payment": PAYMENT_ANSWER})
  lines = []
  assert run_learn(two_service_config, backend, echo=lines.append) == 0

  graph = KnowledgeStore(two_service_config.knowledge_dir).load_graph()
  assert set(graph["services"]) == {"order", "payment"}
  assert graph["services"]["order"]["path"] == str(two_service_config.services[0].path)
  assert "doc" not in graph["services"]["order"]
  assert graph["learned_at"]

  edge = graph["edges"][0]
  assert (edge["from"], edge["to"], edge["resolved"]) == ("order", "payment", True)

  order_doc = two_service_config.knowledge_dir / "services" / "order.md"
  assert "Order intake service." in order_doc.read_text(encoding="utf-8")

  workdirs = [call["workdir"].name for call in backend.calls]
  assert workdirs == ["order", "payment"]


def test_learn_skips_missing_path_and_reports_failure(two_service_config, tmp_path):
  two_service_config.services.append(ServiceSource(name="ghost", path=tmp_path / "ghost"))
  backend = FakeBackend({"order": ORDER_ANSWER, "payment": PAYMENT_ANSWER})
  lines = []
  assert run_learn(two_service_config, backend, echo=lines.append) == 1
  assert any("ghost" in line and "[skip]" in line for line in lines)
  graph = KnowledgeStore(two_service_config.knowledge_dir).load_graph()
  assert set(graph["services"]) == {"order", "payment"}


def test_learn_survives_unparseable_answer(two_service_config):
  backend = FakeBackend({"order": "I refuse to answer in JSON.", "payment": PAYMENT_ANSWER})
  lines = []
  assert run_learn(two_service_config, backend, echo=lines.append) == 1
  assert any("[fail] order" in line for line in lines)
  graph = KnowledgeStore(two_service_config.knowledge_dir).load_graph()
  assert set(graph["services"]) == {"payment"}


def test_learn_all_failed_returns_error(two_service_config):
  backend = FakeBackend({"order": "nope", "payment": "nope"})
  assert run_learn(two_service_config, backend, echo=lambda _line: None) == 1
  assert not (two_service_config.knowledge_dir / "graph.json").exists()
