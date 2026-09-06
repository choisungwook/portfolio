import os
from datetime import UTC, datetime

import boto3
import pytest
from botocore.stub import ANY, Stubber

from pki import private_umask
from run import memory_client, round_trip

MEMORY_ID = "test_memory-1234567890"
EVENT_ID = "0000000001#12345678-1234-1234-1234-123456789012"


def memory():
  session = boto3.Session(
    aws_access_key_id="AKIAEXAMPLE", aws_secret_access_key="x", region_name="ap-northeast-2"
  )
  return memory_client(session)


def event(payload):
  return {
    "memoryId": MEMORY_ID,
    "actorId": "ra-client",
    "sessionId": "s",
    "eventId": EVENT_ID,
    "eventTimestamp": datetime.now(UTC),
    "payload": payload,
  }


def test_round_trip_reads_back_and_deletes():
  client = memory()
  captured = {}

  def remember(params, **_):
    captured.update(params)

  with Stubber(client) as stub:
    stub.add_response("create_event", {"event": event([])})
    stub.add_response("get_event", {"event": event([])})
    stub.add_response(
      "delete_event",
      {"eventId": EVENT_ID},
      {"memoryId": MEMORY_ID, "actorId": "ra-client", "sessionId": ANY, "eventId": EVENT_ID},
    )
    client.meta.events.register("provide-client-params.bedrock-agentcore.CreateEvent", remember)
    with pytest.raises(RuntimeError, match="differs"):
      round_trip(client, MEMORY_ID)  # stub returns [] but we wrote a real payload → mismatch
    stub.assert_no_pending_responses()
  assert captured["payload"][0]["conversational"]["role"] == "USER"


def test_round_trip_deletes_even_when_read_fails():
  client = memory()
  with Stubber(client) as stub:
    stub.add_response("create_event", {"event": event([])})
    stub.add_client_error("get_event", service_error_code="AccessDeniedException")
    stub.add_response("delete_event", {"eventId": EVENT_ID})
    with pytest.raises(Exception, match="AccessDeniedException"):
      round_trip(client, MEMORY_ID)
    stub.assert_no_pending_responses()


def test_private_umask_is_restored():
  before = os.umask(0o022)
  os.umask(before)
  with private_umask():
    assert os.umask(0o077) == 0o077
  assert os.umask(before) == before
