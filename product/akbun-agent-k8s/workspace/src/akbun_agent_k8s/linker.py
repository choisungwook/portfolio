"""Derive service-to-service edges from what each service exposes, calls, and emits."""


def build_edges(services: dict) -> list[dict]:
  """Build the edge list from learned service data keyed by service name."""
  return _call_edges(services) + _event_edges(services)


def resolve_target(target: str, names, exclude: str | None = None) -> str | None:
  """Match a raw call target (URL, env var, hostname) to a known service name.

  Returns the longest matching name so 'payment-gateway' wins over 'payment'
  when both are registered, or None when nothing matches.
  """
  haystack = _normalize(target)
  best = None
  for name in names:
    if name == exclude:
      continue
    if _normalize(name) in haystack and (best is None or len(name) > len(best)):
      best = name
  return best


def _call_edges(services: dict) -> list[dict]:
  """One edge per outbound call, resolved to a registered service when possible."""
  edges = []
  for name, svc in services.items():
    for call in svc.get("outbound_calls", []):
      raw_target = call.get("target", "")
      resolved = resolve_target(raw_target, services.keys(), exclude=name)
      edges.append(
        {
          "from": name,
          "to": resolved or raw_target or "unknown",
          "kind": call.get("kind", "http"),
          "detail": call.get("detail", ""),
          "evidence": call.get("evidence", ""),
          "resolved": resolved is not None,
        }
      )
  return edges


def _event_edges(services: dict) -> list[dict]:
  """One edge per producer/consumer pair sharing an event or topic name."""
  edges = []
  for producer, svc in services.items():
    for topic in svc.get("produces", []):
      for consumer, other in services.items():
        if consumer != producer and topic in other.get("consumes", []):
          edges.append(
            {
              "from": producer,
              "to": consumer,
              "kind": "event",
              "detail": topic,
              "evidence": "",
              "resolved": True,
            }
          )
  return edges


def _normalize(text: str) -> str:
  """Lowercase and collapse separators so URLs, env vars, and names compare."""
  return "".join(ch if ch.isalnum() else " " for ch in text.lower())
