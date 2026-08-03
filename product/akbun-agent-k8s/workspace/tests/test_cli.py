"""CLI argument surface and error mapping."""

import pytest

from akbun_agent_k8s.backends import get_backend
from akbun_agent_k8s.cli import build_parser, main
from akbun_agent_k8s.errors import ConfigError


def test_status_runs_against_sample_config(tmp_path, capsys):
  config = tmp_path / "akbun-agent.toml"
  config.write_text('[services.order]\npath = "./order"\n', encoding="utf-8")
  (tmp_path / "order").mkdir()
  assert main(["--config", str(config), "status"]) == 0
  out = capsys.readouterr().out
  assert "order: not learned" in out
  assert "learned_at: never" in out


def test_missing_config_maps_to_exit_1(tmp_path, capsys):
  assert main(["--config", str(tmp_path / "nope.toml"), "status"]) == 1
  assert "error:" in capsys.readouterr().err


def test_parser_requires_subcommand():
  with pytest.raises(SystemExit):
    build_parser().parse_args([])


def test_unknown_provider_raises():
  with pytest.raises(ConfigError, match="unknown provider"):
    get_backend("gemini")


def test_known_providers_construct_without_sdk():
  assert get_backend("claude").name == "claude"
  assert get_backend("codex", model="gpt-5").model == "gpt-5"
