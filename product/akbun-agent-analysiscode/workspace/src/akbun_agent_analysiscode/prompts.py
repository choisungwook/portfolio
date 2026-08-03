"""Prompt builders and response parsing shared by every backend."""

import json

from .errors import ResponseParseError

LEARN_SCHEMA = """{
  "language": "main implementation language",
  "summary": "2-3 sentences: what this service does and owns",
  "apis": [
    {"method": "HTTP method or RPC", "path": "route or procedure", "description": "one line"}
  ],
  "outbound_calls": [
    {"target": "URL, env var name, or service name being called",
     "kind": "http | grpc | db | queue",
     "detail": "when and why the call happens",
     "evidence": "relative/file/path.py:line"}
  ],
  "produces": ["event or topic names this service publishes"],
  "consumes": ["event or topic names this service subscribes to"],
  "doc": "markdown for a debugging engineer: responsibilities, key files, config, failure modes"
}"""


def build_learn_prompt(service_name: str, description: str = "") -> str:
  """Prompt one backend run to extract knowledge from the service in cwd."""
  about = f" The operator describes it as: {description}." if description else ""
  return (
    f"You are analyzing the source code of a microservice named '{service_name}'.{about}\n"
    "Explore the codebase in the current working directory: entry points, route or\n"
    "handler definitions, HTTP/gRPC clients, queue producers and consumers, and the\n"
    "environment variables that point at other services.\n\n"
    "Reply with ONLY one JSON object following this schema, no prose around it:\n\n"
    f"{LEARN_SCHEMA}\n\n"
    "Rules: every outbound_calls entry needs an evidence file:line you actually read.\n"
    "Use [] for lists with nothing to report. Keep 'doc' under half a page."
  )


def build_debug_system_prompt(context: str) -> str:
  """System prompt that carries the learned graph into a debugging session."""
  return (
    "You are a debugging assistant for a microservice system. The knowledge below\n"
    "was extracted from the services' source code. Use it to reason about failure\n"
    "propagation between services. When you need more detail, read the source files\n"
    "at the evidence paths and the per-service docs under services/ in the current\n"
    "directory.\n\n"
    "Answer with: 1) the most likely cause first, 2) the call/event path that\n"
    "explains the symptom, 3) evidence as file:line, 4) what to check next.\n\n"
    f"=== LEARNED KNOWLEDGE ===\n{context}"
  )


def build_ask_prompt(question: str, log_text: str | None = None, log_name: str = "") -> str:
  """One-shot debugging question, optionally with an attached log excerpt."""
  if not log_text:
    return question
  return (
    f"{question}\n\n"
    f"Attached log ({log_name}):\n"
    f"```\n{log_text}\n```"
  )


def build_transcript_prompt(history: list[tuple[str, str]], message: str) -> str:
  """Replay a chat transcript for backends without native session resume."""
  lines = ["This is an ongoing debugging conversation. Transcript so far:", ""]
  for role, text in history:
    lines.append(f"[{role}]")
    lines.append(text)
    lines.append("")
  lines.append("[user]")
  lines.append(message)
  lines.append("")
  lines.append("Continue the conversation: answer the last user message.")
  return "\n".join(lines)


def next_prompt(history: list[tuple[str, str]], resume_id: str | None, message: str) -> str:
  """Pick the per-turn prompt: plain when the backend resumes, replay otherwise."""
  if history and resume_id is None:
    return build_transcript_prompt(history, message)
  return message


def extract_json(text: str) -> dict:
  """Pull the first JSON object out of an agent response."""
  candidate = _fenced_block(text) or _outer_braces(text)
  if candidate is None:
    raise ResponseParseError("backend response contains no JSON object")
  try:
    data = json.loads(candidate)
  except json.JSONDecodeError as exc:
    raise ResponseParseError(f"backend response has invalid JSON: {exc}") from exc
  if not isinstance(data, dict):
    raise ResponseParseError("backend response JSON is not an object")
  return data


def _fenced_block(text: str) -> str | None:
  """Content of the first ```json ... ``` or ``` ... ``` fence, if any."""
  marker = "```"
  start = text.find(marker)
  if start == -1:
    return None
  body_start = text.find("\n", start)
  end = text.find(marker, body_start)
  if body_start == -1 or end == -1:
    return None
  return text[body_start + 1 : end].strip()


def _outer_braces(text: str) -> str | None:
  """Substring from the first '{' to the matching last '}', if any."""
  start = text.find("{")
  end = text.rfind("}")
  if start == -1 or end == -1 or end <= start:
    return None
  return text[start : end + 1]
