"""Edge building and target resolution heuristics."""

from akbun_agent_analysiscode.linker import build_edges, resolve_target


def test_resolves_url_target():
  names = ["order", "payment", "inventory"]
  assert resolve_target("http://payment-service:8080/payments", names) == "payment"


def test_resolves_env_var_target():
  assert resolve_target("INVENTORY_SERVICE_URL", ["order", "inventory"]) == "inventory"


def test_prefers_longest_match():
  names = ["payment", "payment-gateway"]
  assert resolve_target("http://payment-gateway:80", names) == "payment-gateway"


def test_excludes_self():
  assert resolve_target("order retry queue", ["order"], exclude="order") is None


def test_unresolved_returns_none():
  assert resolve_target("https://api.stripe.com/v1", ["order", "payment"]) is None


def test_call_edges_resolved_and_unresolved():
  services = {
    "order": {
      "outbound_calls": [
        {"target": "PAYMENT_SERVICE_URL", "kind": "http", "detail": "charge", "evidence": "clients.py:10"},
        {"target": "https://api.stripe.com", "kind": "http", "detail": "psp", "evidence": "clients.py:20"},
      ]
    },
    "payment": {},
  }
  edges = build_edges(services)
  assert edges[0]["from"] == "order"
  assert edges[0]["to"] == "payment"
  assert edges[0]["resolved"] is True
  assert edges[0]["evidence"] == "clients.py:10"
  assert edges[1]["to"] == "https://api.stripe.com"
  assert edges[1]["resolved"] is False


def test_event_edges_match_produce_and_consume():
  services = {
    "order": {"produces": ["order.completed"]},
    "notification": {"consumes": ["order.completed", "payment.captured"]},
    "payment": {"produces": ["payment.captured"]},
  }
  edges = build_edges(services)
  pairs = {(e["from"], e["to"], e["detail"]) for e in edges}
  assert ("order", "notification", "order.completed") in pairs
  assert ("payment", "notification", "payment.captured") in pairs
  assert all(e["kind"] == "event" for e in edges)
