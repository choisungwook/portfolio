from datetime import UTC, datetime
from io import BytesIO
from urllib.parse import urlsplit

import boto3
import pytest
from botocore.awsrequest import AWSResponse
from botocore.exceptions import ClientError
from botocore.stub import ANY, Stubber

from scenarios.s01_public_dns_sts import (
  Config,
  api_client,
  assume_session,
  event_payload,
  memory_round_trip,
)

REGION = "ap-northeast-2"
MEMORY_ID = "test_memory-1234567890"
EVENT_ID = "0000000001#12345678-1234-1234-1234-123456789012"
CONFIG = Config(
  REGION, "arn:aws:iam::123456789012:role/LabRole", MEMORY_ID, "192.0.2.1", "192.0.2.2"
)


@pytest.fixture
def session():
  return boto3.Session(
    aws_access_key_id="AKIAEXAMPLEINITIAL",
    aws_secret_access_key="initial-secret",
    region_name=REGION,
  )


def test_assume_role_retains_all_temporary_credentials(session, capsys):
  sts = api_client(session, "sts", REGION)
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
      {
        "RoleArn": CONFIG.role_arn,
        "RoleSessionName": ANY,
        "DurationSeconds": 900,
      },
    )
    assumed = assume_session(sts, CONFIG).get_credentials().get_frozen_credentials()
    stubber.assert_no_pending_responses()
  assert (assumed.access_key, assumed.secret_key, assumed.token) == (
    credentials["AccessKeyId"],
    credentials["SecretAccessKey"],
    credentials["SessionToken"],
  )
  assert "temporary-secret" not in capsys.readouterr().out


def test_memory_round_trip_uses_aws_models_and_cleans_up(session, monkeypatch):
  monkeypatch.setattr(
    "scenarios.s01_public_dns_sts.uuid4", lambda: type("UUID", (), {"hex": "a" * 32})()
  )
  identifiers = {
    "memoryId": MEMORY_ID,
    "actorId": "static-ip-client",
    "sessionId": f"probe-{'a' * 32}",
  }
  event = {
    **identifiers,
    "eventId": EVENT_ID,
    "eventTimestamp": datetime.now(UTC),
    "payload": event_payload(f"NLB static IP probe {'a' * 32}"),
  }
  memory = api_client(session, "bedrock-agentcore", REGION)
  with Stubber(memory) as stubber:
    stubber.add_response(
      "create_event",
      {"event": event},
      {
        **identifiers,
        "eventTimestamp": ANY,
        "clientToken": "a" * 32,
        "payload": event["payload"],
      },
    )
    stubber.add_response("get_event", {"event": event}, {**identifiers, "eventId": EVENT_ID})
    stubber.add_response(
      "delete_event", {"eventId": EVENT_ID}, {**identifiers, "eventId": EVENT_ID}
    )
    memory_round_trip(memory, MEMORY_ID)
    stubber.assert_no_pending_responses()


@pytest.mark.parametrize("failure", ["mismatch", "denied"])
def test_memory_read_failure_still_deletes_event(session, failure):
  memory = api_client(session, "bedrock-agentcore", REGION)
  event = {
    "memoryId": MEMORY_ID,
    "actorId": "static-ip-client",
    "sessionId": "test-session",
    "eventId": EVENT_ID,
    "eventTimestamp": datetime.now(UTC),
    "payload": event_payload("wrong"),
  }
  with Stubber(memory) as stubber:
    stubber.add_response("create_event", {"event": event})
    if failure == "denied":
      stubber.add_client_error("get_event", service_error_code="AccessDeniedException")
    else:
      stubber.add_response("get_event", {"event": event})
    stubber.add_response("delete_event", {"eventId": EVENT_ID})
    with pytest.raises((RuntimeError, ClientError)):
      memory_round_trip(memory, MEMORY_ID)
    stubber.assert_no_pending_responses()


class RawResponse:
  def stream(self, amt=None, decode_content=False):
    yield BytesIO(b'{"eventId":"deleted"}').read()


def test_sigv4_keeps_regional_host_and_session_token(monkeypatch):
  monkeypatch.setenv("HTTPS_PROXY", "http://127.0.0.1:1")
  session = boto3.Session(
    aws_access_key_id="ASIAEXAMPLETEMPORARY",
    aws_secret_access_key="temporary-secret",
    aws_session_token="temporary-token",
    region_name=REGION,
  )
  memory = api_client(session, "bedrock-agentcore", REGION)
  captured = []

  def intercept(request, **kwargs):
    captured.append(request)
    return AWSResponse(request.url, 200, {"content-type": "application/json"}, RawResponse())

  memory.meta.events.register("before-send.bedrock-agentcore.DeleteEvent", intercept)
  memory.delete_event(memoryId=MEMORY_ID, actorId="actor", sessionId="session", eventId=EVENT_ID)
  request = captured[0]
  assert urlsplit(request.url).netloc == "bedrock-agentcore.ap-northeast-2.amazonaws.com"
  assert b"/ap-northeast-2/bedrock-agentcore/aws4_request" in request.headers["Authorization"]
  assert b"host;" in request.headers["Authorization"]
  assert request.headers["X-Amz-Security-Token"] == b"temporary-token"
  assert memory.meta.config.proxies == {}
