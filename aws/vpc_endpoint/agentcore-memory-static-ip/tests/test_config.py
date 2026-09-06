import json

import pytest

from scenarios.s01_public_dns_sts import choose_addresses, load_config


@pytest.fixture
def lab():
  return {
    "region": "ap-northeast-2",
    "role_arn": "role",
    "memory_id": "memory",
    "services": {
      "sts": {"eips": {"ap-northeast-2a": "192.0.2.1"}},
      "memory": {"eips": {"ap-northeast-2a": "192.0.2.2"}},
    },
  }


def test_config_rejects_wrong_region(lab, tmp_path):
  lab["region"] = "us-east-1"
  path = tmp_path / "config.json"
  path.write_text(json.dumps(lab))
  with pytest.raises(ValueError, match="ap-northeast-2"):
    load_config(path)


@pytest.mark.parametrize("value", ["192.0.2.0/24", "192.0.2.1; echo unsafe", "::1", ""])
def test_config_rejects_non_ipv4_addresses(lab, tmp_path, value):
  lab["services"]["sts"]["eips"]["ap-northeast-2a"] = value
  path = tmp_path / "config.json"
  path.write_text(json.dumps(lab))
  with pytest.raises(ValueError):
    load_config(path)


def test_config_reads_terraform_output_instead_of_ambient_settings(lab, tmp_path, monkeypatch):
  path = tmp_path / "config.json"
  path.write_text(json.dumps(lab))
  monkeypatch.setenv("STS_NLB_IP", "198.51.100.1")
  config = load_config(path)
  assert config.hosts == {
    "sts.ap-northeast-2.amazonaws.com": "192.0.2.1",
    "bedrock-agentcore.ap-northeast-2.amazonaws.com": "192.0.2.2",
  }
  assert (config.role_arn, config.memory_id) == ("role", "memory")


def test_az_selection_keeps_service_addresses_separate():
  config = {
    "services": {
      "sts": {"eips": {"ap-northeast-2a": "192.0.2.1", "ap-northeast-2c": "192.0.2.3"}},
      "memory": {"eips": {"ap-northeast-2a": "192.0.2.2", "ap-northeast-2c": "192.0.2.4"}},
    }
  }
  assert choose_addresses(config, "ap-northeast-2c") == {
    "sts": "192.0.2.3",
    "memory": "192.0.2.4",
  }
  with pytest.raises(ValueError, match="Choose a deployed AZ"):
    choose_addresses(config, "ap-northeast-2d")
