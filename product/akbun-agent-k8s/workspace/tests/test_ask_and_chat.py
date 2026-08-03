"""The ask and chat commands with a fake backend."""

from conftest import FakeBackend

from akbun_agent_k8s.backends.base import AgentRun
from akbun_agent_k8s.commands.ask import run_ask
from akbun_agent_k8s.commands.chat import run_chat
from akbun_agent_k8s.knowledge import KnowledgeStore, empty_graph


def learn_fixture(config):
  """Pretend a learn run happened so ask/chat have knowledge to read."""
  graph = empty_graph()
  graph["services"] = {"order": {"summary": "takes orders"}, "payment": {"summary": "charges"}}
  graph["edges"] = [
    {"from": "order", "to": "payment", "kind": "http", "detail": "charge",
     "evidence": "clients.py:12", "resolved": True}
  ]
  KnowledgeStore(config.knowledge_dir).save_graph(graph)


def test_ask_without_knowledge_fails(two_service_config):
  backend = FakeBackend(["unused"])
  lines = []
  assert run_ask(two_service_config, backend, "why?", echo=lines.append) == 1
  assert backend.calls == []
  assert any("learn" in line for line in lines)


def test_ask_sends_context_and_log(two_service_config, tmp_path):
  learn_fixture(two_service_config)
  log = tmp_path / "err.log"
  log.write_text("ReadTimeout calling payment", encoding="utf-8")
  backend = FakeBackend(["payment looks slow"])
  lines = []
  assert run_ask(two_service_config, backend, "why 500?", log_path=log, echo=lines.append) == 0

  call = backend.calls[0]
  assert "order -> payment" in call["system_prompt"]
  assert "ReadTimeout calling payment" in call["prompt"]
  assert call["workdir"] == two_service_config.knowledge_dir
  assert call["readable_dirs"] == tuple(s.path for s in two_service_config.services)
  assert lines[-1] == "payment looks slow"


def test_chat_resumes_native_sessions(two_service_config):
  learn_fixture(two_service_config)
  backend = FakeBackend([AgentRun(text="first", session_id="s1"), AgentRun(text="second", session_id="s1")])
  script = iter(["orders fail", "why?", "exit"])
  assert run_chat(two_service_config, backend, input_fn=lambda _p: next(script), echo=lambda _l: None) == 0

  first, second = backend.calls
  assert first["resume_id"] is None
  assert first["prompt"] == "orders fail"
  assert second["resume_id"] == "s1"
  assert second["prompt"] == "why?"


def test_chat_replays_transcript_without_resume(two_service_config):
  learn_fixture(two_service_config)
  backend = FakeBackend(["first answer", "second answer"])
  script = iter(["orders fail", "why?", "quit"])
  assert run_chat(two_service_config, backend, input_fn=lambda _p: next(script), echo=lambda _l: None) == 0

  second = backend.calls[1]
  assert second["resume_id"] is None
  assert "orders fail" in second["prompt"]
  assert "first answer" in second["prompt"]
  assert "why?" in second["prompt"]


def test_chat_attaches_log_to_next_message(two_service_config, tmp_path):
  learn_fixture(two_service_config)
  log = tmp_path / "err.log"
  log.write_text("ConnectionRefused to payment:8080", encoding="utf-8")
  backend = FakeBackend(["looked at it"])
  script = iter([f"/log {log}", "what happened?", "exit"])
  assert run_chat(two_service_config, backend, input_fn=lambda _p: next(script), echo=lambda _l: None) == 0

  call = backend.calls[0]
  assert "what happened?" in call["prompt"]
  assert "ConnectionRefused to payment:8080" in call["prompt"]
