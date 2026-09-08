import json
from datetime import UTC, datetime

import boto3
import pytest
from botocore.awsrequest import AWSRequest
from botocore.stub import ANY, Stubber

from scenarios.s06_own_domain_tls_nlb import (
  Config,
  OwnHostRejected,
  api_client,
  assume_session,
  load_config,
  memory_round_trip,
  print_host_header,
)

REGION = "ap-northeast-2"
STS_URL = "https://s06-sts.example.com"
MEMORY_URL = "https://s06-memory.example.com"
MEMORY_ID = "test_memory-1234567890"
CONFIG = Config(REGION, "arn:aws:iam::123456789012:role/LabRole", MEMORY_ID, STS_URL, MEMORY_URL)


@pytest.fixture
def lab():
  return {
    "region": REGION,
    "role_arn": "role",
    "memory_id": "memory",
    "services": {
      "sts": {"own_domain_url": STS_URL, "eips": {"ap-northeast-2a": "192.0.2.1"}},
      "memory": {"own_domain_url": MEMORY_URL, "eips": {"ap-northeast-2a": "192.0.2.2"}},
    },
  }


@pytest.fixture
def session():
  return boto3.Session(
    aws_access_key_id="AKIAEXAMPLEINITIAL",
    aws_secret_access_key="initial-secret",
    region_name=REGION,
  )


def write(tmp_path, lab):
  path = tmp_path / "config.json"
  path.write_text(json.dumps(lab))
  return path


def test_config_reads_own_domain_urls(lab, tmp_path):
  config = load_config(write(tmp_path, lab))
  assert config.urls == {"sts": STS_URL, "bedrock-agentcore": MEMORY_URL}


def test_config_refuses_to_run_while_s06_is_not_deployed(lab, tmp_path):
  lab["services"]["memory"]["own_domain_url"] = None
  with pytest.raises(ValueError, match="acm_certificate_arn"):
    load_config(write(tmp_path, lab))


@pytest.mark.parametrize("url", ["http://s06-sts.example.com", "https://s06-sts.example.com:8443"])
def test_config_rejects_non_https_443_urls(lab, tmp_path, url):
  lab["services"]["sts"]["own_domain_url"] = url
  with pytest.raises(ValueError, match="https URL on port 443"):
    load_config(write(tmp_path, lab))


def test_client_targets_the_own_domain_without_a_proxy(session):
  sts = api_client(session, "sts", STS_URL, REGION)
  assert sts.meta.endpoint_url == STS_URL
  assert sts.meta.config.proxies == {}


def test_host_header_report_shows_what_aws_receives(capsys):
  request = AWSRequest(method="POST", url=f"{STS_URL}/", headers={"Host": "s06-sts.example.com"})
  print_host_header(request.prepare())
  assert capsys.readouterr().out.startswith("REQUEST host=s06-sts.example.com url=")


def test_assume_role_via_own_domain_returns_temporary_credentials(session, capsys):
  sts = api_client(session, "sts", STS_URL, REGION)
  credentials = {
    "AccessKeyId": "ASIAEXAMPLETEMPORARY",
    "SecretAccessKey": "temporary-secret",
    "SessionToken": "temporary-token",
    "Expiration": datetime(2030, 1, 1, tzinfo=UTC),
  }
  with Stubber(sts) as stubber:
    stubber.add_response(
      "assume_role",
      {"Credentials": credentials},
      {"RoleArn": CONFIG.role_arn, "RoleSessionName": ANY, "DurationSeconds": 900},
    )
    assumed = assume_session(sts, CONFIG).get_credentials().get_frozen_credentials()
  assert (assumed.access_key, assumed.token) == ("ASIAEXAMPLETEMPORARY", "temporary-token")
  assert "temporary-secret" not in capsys.readouterr().out


@pytest.mark.parametrize("code", ["SignatureDoesNotMatch", "InvalidClientTokenId", "AccessDenied"])
def test_aws_rejection_becomes_a_classified_result(session, code):
  sts = api_client(session, "sts", STS_URL, REGION)
  with Stubber(sts) as stubber:
    stubber.add_client_error("assume_role", code, "rejected", 403)
    with pytest.raises(OwnHostRejected) as rejected:
      assume_session(sts, CONFIG)
  assert (rejected.value.stage, rejected.value.code) == ("STS AssumeRole", code)


def test_memory_rejection_is_classified_and_nothing_is_left_behind(session):
  memory = api_client(session, "bedrock-agentcore", MEMORY_URL, REGION)
  with Stubber(memory) as stubber:
    stubber.add_client_error("create_event", "AccessDeniedException", "rejected", 403)
    with pytest.raises(OwnHostRejected) as rejected:
      memory_round_trip(memory, MEMORY_ID)
    stubber.assert_no_pending_responses()
  assert rejected.value.stage == "Memory CreateEvent"
