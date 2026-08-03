"""Shared test helpers: a fake backend and a small two-service config."""

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from akbun_agent_k8s.backends.base import AgentRun  # noqa: E402
from akbun_agent_k8s.config import AgentConfig, ServiceSource  # noqa: E402


class FakeBackend:
  """Records every call and replies from a canned answer list or dict."""

  name = "fake"

  def __init__(self, answers):
    self.answers = answers
    self.calls = []

  def run(self, prompt, *, workdir, system_prompt=None, readable_dirs=(), resume_id=None):
    self.calls.append(
      {
        "prompt": prompt,
        "workdir": Path(workdir),
        "system_prompt": system_prompt,
        "readable_dirs": tuple(readable_dirs),
        "resume_id": resume_id,
      }
    )
    if isinstance(self.answers, dict):
      answer = self.answers[Path(workdir).name]
    else:
      answer = self.answers[len(self.calls) - 1]
    if isinstance(answer, Exception):
      raise answer
    if isinstance(answer, AgentRun):
      return answer
    return AgentRun(text=answer)


@pytest.fixture
def two_service_config(tmp_path):
  """A config with order and payment services whose directories exist."""
  order = tmp_path / "order"
  payment = tmp_path / "payment"
  order.mkdir()
  payment.mkdir()
  return AgentConfig(
    config_path=tmp_path / "akbun-agent.toml",
    knowledge_dir=tmp_path / "knowledge",
    services=[
      ServiceSource(name="order", path=order),
      ServiceSource(name="payment", path=payment),
    ],
  )
