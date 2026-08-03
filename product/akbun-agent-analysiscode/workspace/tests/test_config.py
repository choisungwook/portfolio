"""Config file parsing."""

from pathlib import Path

import pytest

from akbun_agent_analysiscode.config import load_config, service_paths
from akbun_agent_analysiscode.errors import ConfigError

SAMPLE = """
provider = "codex"
model = "gpt-5"
knowledge_dir = "kb"

[services.order]
path = "./order-service"
description = "takes orders"

[services.payment]
path = "./payment-service"
"""


def write(tmp_path, text):
  path = tmp_path / "akbun-agent.toml"
  path.write_text(text, encoding="utf-8")
  return path


def test_parses_services_and_resolves_paths(tmp_path):
  config = load_config(write(tmp_path, SAMPLE))
  assert [s.name for s in config.services] == ["order", "payment"]
  assert config.services[0].path == (tmp_path / "order-service").resolve()
  assert config.services[0].description == "takes orders"
  assert config.knowledge_dir == (tmp_path / "kb").resolve()
  assert config.provider == "codex"
  assert config.model == "gpt-5"
  assert service_paths(config) == tuple(s.path for s in config.services)


def test_defaults_without_optional_keys(tmp_path):
  config = load_config(write(tmp_path, '[services.a]\npath = "./a"\n'))
  assert config.provider == "claude"
  assert config.model is None
  assert config.knowledge_dir == (tmp_path / "knowledge").resolve()


def test_missing_file_raises(tmp_path):
  with pytest.raises(ConfigError, match="not found"):
    load_config(tmp_path / "nope.toml")


def test_no_services_raises(tmp_path):
  with pytest.raises(ConfigError, match="no \\[services"):
    load_config(write(tmp_path, 'provider = "claude"\n'))


def test_service_without_path_raises(tmp_path):
  with pytest.raises(ConfigError, match="has no path"):
    load_config(write(tmp_path, "[services.a]\ndescription = 'x'\n"))


def test_invalid_toml_raises(tmp_path):
  with pytest.raises(ConfigError, match="invalid TOML"):
    load_config(write(tmp_path, "provider = ["))


def test_sample_msa_fixture_parses():
  fixture = Path(__file__).resolve().parents[1] / "fixtures" / "sample-msa" / "akbun-agent.toml"
  config = load_config(fixture)
  assert {s.name for s in config.services} == {"order", "payment", "inventory", "notification"}
  for service in config.services:
    assert service.path.is_dir(), f"fixture service dir missing: {service.path}"
